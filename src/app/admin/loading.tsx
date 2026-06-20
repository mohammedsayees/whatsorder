export default function AdminLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="h-10 w-56 animate-pulse rounded-lg bg-stone-200" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-28 animate-pulse rounded-lg bg-stone-100" key={index} />
        ))}
      </div>
      <div className="mt-8 h-64 animate-pulse rounded-lg bg-stone-100" />
    </main>
  );
}
