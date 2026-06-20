export default function RestaurantLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <div className="h-48 animate-pulse rounded-[28px] bg-stone-200" />
      <div className="mt-6 h-14 animate-pulse rounded-2xl bg-stone-100" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-28 animate-pulse rounded-2xl bg-stone-100" key={index} />
        ))}
      </div>
    </main>
  );
}
