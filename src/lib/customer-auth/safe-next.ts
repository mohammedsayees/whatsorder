// lib/customer-auth/safe-next.ts
//
// Redirect target for /api/customer/link. Only a café path (/r/<slug>, with an
// optional sub-path of slug-safe segments) is accepted. A looser "starts with
// a single slash" check lets "/\evil.example" through, which URL parsing
// turns into https://evil.example/.

const CAFE_PATH = /^\/r\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/i;

export function safeCustomerLinkNext(next: string | null | undefined): string {
  if (next && CAFE_PATH.test(next)) {
    return next;
  }
  return "/";
}
