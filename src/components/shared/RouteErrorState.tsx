"use client";

export function RouteErrorState({
  description,
  reset,
  title
}: {
  description: string;
  reset: () => void;
  title: string;
}) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 py-12">
      <section className="w-full max-w-lg rounded-lg border border-rose-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-black">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
        <button
          className="focus-ring mt-5 rounded-full bg-ink px-5 py-3 text-sm font-black text-white"
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
