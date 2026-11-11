export function isAdminPosPathname(pathname: string) {
  return (
    pathname === "/admin/orders/new" ||
    /^\/admin\/orders\/[^/]+\/add-items$/.test(pathname)
  );
}
