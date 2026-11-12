import { isMaintenanceMode } from "@/lib/maintenance-config";

// Target of the maintenance rewrite in next.config.ts. Answers every method
// with 503 + Retry-After so browsers show the notice, server actions fail
// cleanly, and webhook senders (Meta) and crons retry later instead of
// treating the request as delivered.
export const dynamic = "force-dynamic";

const RETRY_AFTER_SECONDS = "600";

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>WhatsOrder maintenance</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f5f0;color:#1c1917;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px;box-sizing:border-box}
main{max-width:420px;text-align:center}
h1{font-size:22px;margin:0 0 8px}
p{margin:0 0 12px;color:#57534e;line-height:1.5}
</style>
</head>
<body>
<main>
<h1>Back in a few minutes</h1>
<p>WhatsOrder is being upgraded. Orders and the dashboard will be available again shortly. Please try again in a few minutes.</p>
<p dir="rtl" lang="ar">الموقع تحت الصيانة. سنعود قريباً.</p>
</main>
</body>
</html>`;

function handle(request: Request) {
  if (!isMaintenanceMode()) return new Response("Not found", { status: 404 });
  const headers = {
    "Retry-After": RETRY_AFTER_SECONDS,
    "Cache-Control": "no-store"
  };
  const wantsHtml = request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html");
  if (request.method === "HEAD") return new Response(null, { status: 503, headers });
  return wantsHtml
    ? new Response(page, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } })
    : Response.json({ error: "maintenance" }, { status: 503, headers });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
