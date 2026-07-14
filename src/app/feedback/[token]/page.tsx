import Link from "next/link";
import { CheckCircle2, Clock3, Star } from "lucide-react";
import { submitFeedbackAction } from "@/app/feedback/actions";
import { feedbackTags, getFeedbackPageContext } from "@/lib/feedback";

export default async function FeedbackPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const context = await getFeedbackPageContext(token);

  if (query.submitted || context?.isSubmitted) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
        <section className="w-full max-w-lg rounded-2xl bg-white p-7 text-center shadow-xl">
          <CheckCircle2 className="mx-auto text-leaf" size={44} />
          <h1 className="mt-5 text-3xl font-black">Thank you!</h1>
          <p className="mt-3 text-stone-600">
            Your feedback has been shared with the restaurant.
          </p>
          {context ? (
            <Link
              className="mt-6 inline-flex rounded-full bg-leaf px-5 py-3 font-black text-white"
              href={`/r/${context.restaurant.slug}`}
            >
              Back to {context.restaurant.name}
            </Link>
          ) : null}
        </section>
      </main>
    );
  }

  if (!context || context.isExpired) {
    return <FeedbackUnavailable message="This feedback link is invalid or has expired." />;
  }

  if (!context.isCompleted) {
    return (
      <FeedbackUnavailable message="Feedback will be available after your order is completed." />
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 shadow-xl sm:p-8">
        <p className="text-sm font-black uppercase tracking-wide text-leaf">
          Verified completed order
        </p>
        <h1 className="mt-2 text-3xl font-black">How was your order?</h1>
        <p className="mt-2 text-stone-600">
          Share quick feedback with {context.restaurant.name}. It takes about 15 seconds.
        </p>

        {query.error ? (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {query.error}
          </p>
        ) : null}

        <form action={submitFeedbackAction.bind(null, token)} className="mt-6 space-y-6">
          <fieldset>
            <legend className="text-sm font-black">Overall rating</legend>
            <div className="mt-3 flex flex-row-reverse justify-end gap-2">
              {[5, 4, 3, 2, 1].map((rating) => (
                <label className="group cursor-pointer" key={rating}>
                  <input
                    className="peer sr-only"
                    name="rating"
                    required
                    type="radio"
                    value={rating}
                  />
                  <Star
                    className="text-stone-300 transition peer-checked:fill-amber-400 peer-checked:text-amber-400 group-hover:fill-amber-300 group-hover:text-amber-300"
                    size={38}
                  />
                  <span className="sr-only">{rating} stars</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-black">What stood out? (optional)</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {feedbackTags.map((tag) => (
                <label className="cursor-pointer" key={tag}>
                  <input className="peer sr-only" name="tags" type="checkbox" value={tag} />
                  <span className="inline-flex rounded-full border border-stone-200 px-3 py-2 text-sm font-bold text-stone-600 peer-checked:border-leaf peer-checked:bg-mint/20 peer-checked:text-leaf">
                    {tag}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-black">Comment (optional)</span>
            <textarea
              className="focus-ring mt-2 min-h-28 w-full rounded-xl border border-stone-200 px-4 py-3"
              maxLength={1000}
              name="comment"
              placeholder="Tell the restaurant what you enjoyed or what could be better."
            />
          </label>

          <label className="flex items-start gap-3 text-sm text-stone-600">
            <input className="mt-1" name="anonymous" type="checkbox" />
            Show my review as Anonymous
          </label>

          <button className="focus-ring w-full rounded-full bg-leaf px-5 py-3 font-black text-white">
            Submit feedback
          </button>
        </form>
      </section>
    </main>
  );
}

function FeedbackUnavailable({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl bg-white p-7 text-center shadow-xl">
        <Clock3 className="mx-auto text-stone-400" size={42} />
        <h1 className="mt-5 text-2xl font-black">Feedback is not available yet</h1>
        <p className="mt-3 text-stone-600">{message}</p>
      </section>
    </main>
  );
}
