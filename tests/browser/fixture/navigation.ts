const fixtureRouter = {
  back: () => history.back(),
  forward: () => history.forward(),
  prefetch: async () => undefined,
  push: (href: string) => history.pushState(null, "", href),
  refresh: () => undefined,
  replace: (href: string) => history.replaceState(null, "", href)
};

export function useRouter() {
  return fixtureRouter;
}
