import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState as loadMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";

const port = Number(process.env.CONNECTOR_PORT ?? process.env.PORT ?? 8080);
const appUrl = process.env.WHATSORDER_APP_URL?.replace(/\/$/, "");
const sharedSecret = process.env.WHATSORDER_CONNECTOR_SECRET;
const dataDir = path.resolve(process.env.CONNECTOR_DATA_DIR ?? "/data/sessions");
const maxBodyBytes = 4 * 1024 * 1024;
const maxAudioBytes = 2_500_000;
const signatureToleranceMs = 5 * 60 * 1000;
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const baileysLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL ?? "warn" });
const sessions = new Map();

if (!appUrl || !sharedSecret) {
  throw new Error("WHATSORDER_APP_URL and WHATSORDER_CONNECTOR_SECRET are required");
}

await mkdir(dataDir, { recursive: true, mode: 0o700 });
await chmod(dataDir, 0o700);

function signatureFor(body, timestamp, target = "") {
  return createHmac("sha256", sharedSecret)
    .update(`${timestamp}.${target}.${body}`)
    .digest("hex");
}

function validSignature(body, headers, target) {
  const timestamp = headers["x-whatsorder-timestamp"];
  const signature = headers["x-whatsorder-signature"];
  if (
    typeof timestamp !== "string" ||
    typeof signature !== "string" ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > signatureToleranceMs
  ) {
    return false;
  }
  const expected = signatureFor(body, timestamp, target);
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

async function postEvent(event) {
  const body = JSON.stringify(event);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const timestamp = String(Date.now());
    try {
      const response = await fetch(`${appUrl}/api/whatsapp-web/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-whatsorder-timestamp": timestamp,
          "x-whatsorder-signature": signatureFor(
            body,
            timestamp,
            "POST:/api/whatsapp-web/events"
          )
        },
        body,
        signal: AbortSignal.timeout(20_000)
      });
      if (response.ok) return true;
      logger.warn({ attempt, status: response.status, type: event.type }, "event callback rejected");
    } catch (error) {
      logger.warn({ attempt, error: error?.message, type: event.type }, "event callback failed");
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  return false;
}

function sessionDirectory(sessionId) {
  if (!sessionIdPattern.test(sessionId)) throw new Error("Invalid session id");
  return path.join(dataDir, sessionId);
}

async function writeMetadata(sessionId, restaurantId) {
  const directory = sessionDirectory(sessionId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    path.join(directory, "whatsorder-session.json"),
    JSON.stringify({ sessionId, restaurantId }),
    { mode: 0o600 }
  );
}

function disconnectCode(lastDisconnect) {
  return Number(lastDisconnect?.error?.output?.statusCode ?? 0);
}

function messageText(message) {
  return (
    message.message?.conversation ??
    message.message?.extendedTextMessage?.text ??
    ""
  ).trim();
}

function messageTimestamp(message) {
  const value = message.messageTimestamp;
  return typeof value === "number" ? String(value) : value?.toString?.() ?? undefined;
}

async function handleIncoming(session, envelope) {
  if (!envelope.key?.id || envelope.key.fromMe) return;
  const jid = envelope.key.remoteJid ?? "";
  if (!jid.endsWith("@s.whatsapp.net")) return;
  const from = jid.split("@")[0]?.replace(/\D/g, "");
  if (!from) return;

  const text = messageText(envelope);
  const audioMessage = envelope.message?.audioMessage;
  if (!text && !audioMessage) return;

  const event = {
    type: "message",
    restaurantId: session.restaurantId,
    sessionId: session.sessionId,
    message: {
      id: envelope.key.id,
      from,
      profileName: envelope.pushName?.slice(0, 120),
      type: audioMessage ? "audio" : "text",
      body: text,
      timestamp: messageTimestamp(envelope)
    }
  };

  if (audioMessage) {
    try {
      const bytes = await downloadMediaMessage(
        envelope,
        "buffer",
        {},
        {
          logger: baileysLogger,
          reuploadRequest: session.socket.updateMediaMessage
        }
      );
      if (bytes.length <= maxAudioBytes) {
        event.message.audioBase64 = bytes.toString("base64");
        event.message.audioMime = audioMessage.mimetype ?? "audio/ogg";
      } else {
        event.message.body = "[voice message too large to transcribe]";
      }
    } catch (error) {
      logger.warn({ error: error?.message, sessionId: session.sessionId }, "audio download failed");
      event.message.body = "[voice message unavailable]";
    }
  }

  await postEvent(event);
}

async function startSession(sessionId, restaurantId) {
  const existing = sessions.get(sessionId);
  if (existing) {
    if (existing.restaurantId !== restaurantId) throw new Error("Session tenant mismatch");
    return existing;
  }

  await writeMetadata(sessionId, restaurantId);
  const directory = sessionDirectory(sessionId);
  const { state, saveCreds } = await loadMultiFileAuthState(directory);
  const { version } = await fetchLatestBaileysVersion();
  const session = { sessionId, restaurantId, socket: null, closing: false };
  const socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
    },
    browser: Browsers.ubuntu("WhatsOrder"),
    logger: baileysLogger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false
  });
  session.socket = socket;
  sessions.set(sessionId, session);

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages.slice(0, 20)) {
      await handleIncoming(session, message);
    }
  });
  socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      await postEvent({ type: "qr", restaurantId, sessionId, qr });
    }
    if (connection === "open") {
      const phone = socket.user?.id?.split(":")[0]?.replace(/\D/g, "");
      await postEvent({
        type: "connected",
        restaurantId,
        sessionId,
        phone,
        displayName: socket.user?.name
      });
    }
    if (connection === "close") {
      sessions.delete(sessionId);
      const code = disconnectCode(lastDisconnect);
      const loggedOut = code === DisconnectReason.loggedOut || session.closing;
      await postEvent({
        type: "disconnected",
        restaurantId,
        sessionId,
        reason: loggedOut ? "Disconnected by user" : `Connection closed (${code || "unknown"})`
      });
      if (code === DisconnectReason.loggedOut && !session.closing) {
        await rm(sessionDirectory(sessionId), { recursive: true, force: true });
      }
      if (!loggedOut) {
        setTimeout(() => {
          startSession(sessionId, restaurantId).catch((error) =>
            logger.error({ error: error?.message, sessionId }, "session reconnect failed")
          );
        }, 2_000);
      }
    }
  });

  return session;
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBodyBytes) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    return json(response, 200, { ok: true, sessions: sessions.size });
  }

  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    return json(response, error.message === "BODY_TOO_LARGE" ? 413 : 400, { ok: false });
  }
  if (!validSignature(body, request.headers, `${request.method}:${request.url}`)) {
    return json(response, 401, { ok: false, error: "Invalid signature" });
  }

  const match = request.url?.match(/^\/sessions\/([^/]+)(\/connect|\/messages)?$/);
  if (!match || !sessionIdPattern.test(match[1])) {
    return json(response, 404, { ok: false, error: "Unknown route" });
  }
  const sessionId = match[1];
  let payload;
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return json(response, 400, { ok: false, error: "Invalid JSON" });
  }

  try {
    if (request.method === "POST" && match[2] === "/connect") {
      if (typeof payload.restaurantId !== "string") throw new Error("Missing restaurant id");
      await startSession(sessionId, payload.restaurantId);
      return json(response, 202, { ok: true, status: "connecting" });
    }

    const session = sessions.get(sessionId);
    if (!session) return json(response, 409, { ok: false, error: "Session is not connected" });

    if (request.method === "POST" && match[2] === "/messages") {
      const to = String(payload.to ?? "").replace(/\D/g, "");
      const text = String(payload.body ?? "").trim().slice(0, 4096);
      if (!to || !text) throw new Error("Recipient and message are required");
      await session.socket.sendMessage(`${to}@s.whatsapp.net`, { text });
      return json(response, 200, { ok: true, id: payload.clientMessageId ?? null });
    }

    if (request.method === "DELETE" && !match[2]) {
      if (payload.restaurantId !== session.restaurantId) throw new Error("Session tenant mismatch");
      session.closing = true;
      await session.socket.logout().catch(() => session.socket.end(undefined));
      sessions.delete(sessionId);
      await rm(sessionDirectory(sessionId), { recursive: true, force: true });
      return json(response, 200, { ok: true });
    }
  } catch (error) {
    logger.warn({ error: error?.message, sessionId }, "request failed");
    return json(response, 400, { ok: false, error: error?.message ?? "Request failed" });
  }

  return json(response, 404, { ok: false, error: "Unknown route" });
});

async function restoreSessions() {
  const entries = await readdir(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !sessionIdPattern.test(entry.name)) continue;
    try {
      const metadata = JSON.parse(
        await readFile(path.join(dataDir, entry.name, "whatsorder-session.json"), "utf8")
      );
      if (metadata.sessionId === entry.name && typeof metadata.restaurantId === "string") {
        await startSession(entry.name, metadata.restaurantId);
      }
    } catch (error) {
      logger.warn({ error: error?.message, sessionId: entry.name }, "session restore skipped");
    }
  }
}

await restoreSessions();
server.listen(port, "0.0.0.0", () => {
  logger.info({ port, dataDir }, "WhatsOrder WhatsApp Web connector listening");
});

async function shutdown() {
  server.close();
  for (const session of sessions.values()) {
    session.closing = true;
    session.socket.end(undefined);
  }
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
