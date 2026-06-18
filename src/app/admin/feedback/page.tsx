import { Check, EyeOff, Star } from "lucide-react";
import { moderateFeedbackAction } from "@/app/feedback/actions";
import { getRestaurantFeedback } from "@/lib/feedback";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export default async function AdminFeedbackPage() {
  const { restaurant } = await requireRestaurantRole([
    "restaurant_admin",
    "owner",
    "manager"
  ]);
  const feedback = await getRestaurantFeedback(restaurant.id);
  const averageRating =
    feedback.length > 0
      ? feedback.reduce((sum, review) => sum + review.rating, 0) / feedback.length
      : null;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black">Customer feedback</h1>
      <p className="mt-2 text-stone-600">
        Ratings come from completed orders. Approve comments before showing them publicly.
      </p>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-sm font-bold text-stone-500">Average rating</p>
          <p className="mt-2 text-2xl font-black">
            {averageRating === null ? "—" : averageRating.toFixed(1)}
          </p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-sm font-bold text-stone-500">Verified reviews</p>
          <p className="mt-2 text-2xl font-black">{feedback.length}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-sm font-bold text-stone-500">Awaiting moderation</p>
          <p className="mt-2 text-2xl font-black">
            {feedback.filter((review) => review.moderation_status === "pending").length}
          </p>
        </div>
      </section>

      <section className="mt-6 space-y-4">
        {feedback.map((review) => (
          <article
            className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
            key={review.id}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex text-amber-400">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Star
                        className={index < review.rating ? "fill-current" : "text-stone-200"}
                        key={index}
                        size={17}
                      />
                    ))}
                  </div>
                  <span className="rounded-full bg-mint/20 px-2 py-1 text-xs font-black text-leaf">
                    Verified completed order
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-black capitalize text-stone-600">
                    {review.moderation_status}
                  </span>
                </div>
                <p className="mt-3 font-black">{review.customer_display_name}</p>
                {review.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {review.tags.map((tag) => (
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {review.comment ? (
                  <p className="mt-3 max-w-3xl leading-7 text-stone-700">{review.comment}</p>
                ) : (
                  <p className="mt-3 text-sm text-stone-500">Rating only</p>
                )}
                <p className="mt-3 text-xs font-semibold text-stone-400">
                  {new Date(review.submitted_at).toLocaleString("en-AE")}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={moderateFeedbackAction}>
                  <input name="feedback_id" type="hidden" value={review.id} />
                  <input name="moderation_status" type="hidden" value="approved" />
                  <button className="inline-flex items-center gap-2 rounded-lg bg-leaf px-3 py-2 text-sm font-black text-white">
                    <Check size={15} />
                    Approve
                  </button>
                </form>
                <form action={moderateFeedbackAction}>
                  <input name="feedback_id" type="hidden" value={review.id} />
                  <input name="moderation_status" type="hidden" value="hidden" />
                  <button className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-black text-stone-600">
                    <EyeOff size={15} />
                    Hide
                  </button>
                </form>
              </div>
            </div>
          </article>
        ))}
        {feedback.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-300 bg-white px-5 py-14 text-center">
            <p className="font-black">No feedback yet</p>
            <p className="mt-1 text-sm text-stone-500">
              Complete an order, then use Request feedback from the Orders page.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
