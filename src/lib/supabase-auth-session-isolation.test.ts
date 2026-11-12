import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Contract: session-creating auth methods must never run on the cached clients
// from getSupabase()/getSupabaseAdmin(). auth-js keeps the session in memory
// even with persistSession: false, so later data reads on that shared client
// would carry the signed-in user's JWT into unrelated requests (cross-tenant /
// super-admin RLS leak). Use createEphemeralAuthClient() for these calls.

const srcRoot = path.resolve(__dirname, "..");
const sessionMethods =
  /\.auth\.(signInWithPassword|signInWithOtp|signInWithIdToken|signInAnonymously|signUp|verifyOtp|exchangeCodeForSession|setSession|refreshSession|signOut)\s*\(/;

const knownAuthCallers = [
  "app/admin-login/actions.ts",
  "app/super-admin/actions.ts",
  "app/admin/alerts/actions.ts",
  "app/auth/invite/actions.ts",
  "lib/auth-session-revocation.ts"
];

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return listSourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

// Resolve which factory produced the client variable a session call is made on,
// by finding the nearest preceding `const <name> = <factory>(` in the file.
function clientFactoryFor(source: string, callIndex: number, variable: string) {
  const declaration = new RegExp(`const\\s+${variable}\\s*=\\s*(?:await\\s+)?([A-Za-z0-9_]+)\\s*\\(`, "g");
  let factory: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source)) && match.index < callIndex) {
    factory = match[1];
  }
  return factory;
}

function sessionCalls(source: string) {
  const pattern = new RegExp(`([A-Za-z0-9_]+)${sessionMethods.source}`, "g");
  return [...source.matchAll(pattern)].map((match) => ({
    variable: match[1],
    method: match[2],
    index: match.index ?? 0
  }));
}

describe("server auth session isolation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const files = listSourceFiles(srcRoot).filter(
    (file) =>
      !file.includes(`${path.sep}components${path.sep}`) &&
      sessionMethods.test(readFileSync(file, "utf8"))
  );

  it("still covers every known server auth caller", () => {
    const relative = files.map((file) => path.relative(srcRoot, file).split(path.sep).join("/"));
    for (const caller of knownAuthCallers) {
      expect(relative).toContain(caller);
    }
  });

  it.each(knownAuthCallers)("%s only calls session methods on an ephemeral client", (file) => {
    const source = readFileSync(path.join(srcRoot, file), "utf8");
    const calls = sessionCalls(source);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect({ ...call, factory: clientFactoryFor(source, call.index, call.variable) }).toMatchObject({
        factory: "createEphemeralAuthClient"
      });
    }
  });

  it("no server file calls a session method on getSupabase() or getSupabaseAdmin()", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const call of sessionCalls(source)) {
        const factory = clientFactoryFor(source, call.index, call.variable);
        expect({ file: path.relative(srcRoot, file), ...call, factory }).not.toMatchObject({
          factory: expect.stringMatching(/^getSupabase(Admin)?$/)
        });
      }
      expect(source).not.toMatch(
        new RegExp(`getSupabase(?:Admin)?\\(\\)\\??${sessionMethods.source}`)
      );
    }
  });

  it("createEphemeralAuthClient builds a fresh, non-persisting client", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const { createEphemeralAuthClient, getSupabase } = await import("./supabase");
    const first = createEphemeralAuthClient();
    const second = createEphemeralAuthClient();
    expect(first).not.toBeNull();
    expect(first).not.toBe(second);
    expect(first).not.toBe(getSupabase());

    const supabaseSource = readFileSync(path.join(srcRoot, "lib/supabase.ts"), "utf8");
    const ephemeralStart = supabaseSource.indexOf("export function createEphemeralAuthClient");
    const ephemeralBody = supabaseSource.slice(
      ephemeralStart,
      supabaseSource.indexOf("\n}\n", ephemeralStart)
    );
    expect(ephemeralBody).not.toContain("getCachedClient");
    expect(ephemeralBody).toMatch(/persistSession:\s*false/);
    expect(ephemeralBody).toMatch(/autoRefreshToken:\s*false/);
    expect(ephemeralBody).toMatch(/detectSessionInUrl:\s*false/);
  });
});
