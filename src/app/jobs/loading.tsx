export default function JobsLoading() {
  return <main className="min-h-screen bg-stone-50 p-6"><div className="mx-auto max-w-6xl animate-pulse"><div className="h-12 w-64 rounded bg-stone-200" /><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div className="h-64 rounded-2xl bg-white" key={index} />)}</div></div></main>;
}
