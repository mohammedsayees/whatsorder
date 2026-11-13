// Browser push services a subscription endpoint may point at. The server
// POSTs to the stored endpoint on every order update, so accepting any HTTPS
// URL would let anyone make our server send requests to a host of their
// choosing (SSRF-style probing, or noise to a third party).
//
// Exact hosts, plus suffixes for services that shard across subdomains.

const EXACT_HOSTS = new Set([
  "fcm.googleapis.com", // Chrome, Edge (Chromium), Brave, Opera, Samsung Internet
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com" // Safari (macOS 13+, iOS 16.4+)
]);
const HOST_SUFFIXES = [
  ".notify.windows.com", // Edge / Windows (WNS)
  ".push.apple.com" // Apple regional push hosts
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string") {
    return false;
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
