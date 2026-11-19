const fixtureRouter = {
  back: () => history.back(),
  forward: () => history.forward(),
  prefetch: async () => undefined,
  push: (href: string) => history.pushState(null, "", href),
  refresh: () => {
    const counted = window as unknown as { __fixtureRefreshes?: number };
    counted.__fixtureRefreshes = (counted.__fixtureRefreshes ?? 0) + 1;
  },
  replace: (href: string) => history.replaceState(null, "", href)
};

export function useRouter() {
  return fixtureRouter;
}
