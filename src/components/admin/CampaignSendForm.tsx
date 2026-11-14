"use client";

// Campaign send form: pick a poster, see the channel options (only the free
// in-window one is live), confirm. Results come from the same send pipeline
// as Poster Studio.

import { useActionState, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { sendCampaignAction, type SendPosterState } from "@/app/admin/marketing/actions";

export type CampaignPosterOption = {
  id: string;
  label: string;
  previewUrl: string | null;
  format: string;
};

export type CampaignChannelOption = {
  id: string;
  label: string;
  available: boolean;
  note: string;
};

const ASPECT: Record<string, string> = {
  story: "aspect-[9/16]",
  portrait: "aspect-[4/5]",
  square: "aspect-square"
};

export function CampaignSendForm({
  posters,
  segment,
  reachable,
  channels,
  blockedReason,
  initialPosterId
}: {
  posters: CampaignPosterOption[];
  segment: string;
  reachable: number;
  channels: CampaignChannelOption[];
  blockedReason: string | null;
  initialPosterId: string | null;
}) {
  const [posterId, setPosterId] = useState(initialPosterId ?? posters[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<SendPosterState, FormData>(sendCampaignAction, {});

  if (posters.length === 0) {
    return (
      <p className="rounded-lg bg-stone-100 p-4 text-sm text-stone-600">
        Make a poster in Marketing first, then come back to send it to this segment.
      </p>
    );
  }

  const disabledReason =
    blockedReason ?? (reachable === 0 ? "Nobody in this segment can be reached right now." : null);

  return (
    <form action={action} className="space-y-5" onSubmit={() => setConfirming(false)}>
      <input name="segment" type="hidden" value={segment} />
      <input name="posterId" type="hidden" value={posterId} />

      <fieldset>
        <legend className="text-sm font-black uppercase tracking-wide text-stone-500">Poster</legend>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {posters.map((poster) => (
            <button
              aria-pressed={posterId === poster.id}
              className={`focus-ring overflow-hidden rounded-lg border-2 text-left ${
                posterId === poster.id ? "border-leaf" : "border-stone-200 hover:border-stone-300"
              }`}
              key={poster.id}
              onClick={() => setPosterId(poster.id)}
              type="button"
            >
              {poster.previewUrl ? (
                /* Short-lived signed URLs; the image optimizer would only re-proxy them. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img alt={poster.label} className={`${ASPECT[poster.format] ?? ASPECT.story} w-full object-cover`} src={poster.previewUrl} />
              ) : (
                <div className={`${ASPECT[poster.format] ?? ASPECT.story} w-full bg-stone-100`} />
              )}
              <span className="block truncate px-2 py-1 text-[11px] font-bold capitalize text-stone-500">{poster.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-black uppercase tracking-wide text-stone-500">How to send</legend>
        <div className="mt-3 space-y-2">
          {channels.map((channel) => (
            <label
              className={`flex items-start gap-3 rounded-lg border p-3 ${
                channel.available ? "border-stone-200" : "border-dashed border-stone-200 opacity-60"
              }`}
              key={channel.id}
            >
              <input
                className="mt-1"
                defaultChecked={channel.id === "service_window"}
                disabled={!channel.available}
                name="channel"
                type="radio"
                value={channel.id}
              />
              <span>
                <span className="block text-sm font-black">{channel.label}</span>
                <span className="mt-0.5 block text-xs text-stone-500">{channel.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {confirming ? (
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-leaf px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          disabled={pending || Boolean(disabledReason)}
          type="submit"
        >
          {pending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
          Confirm: send to up to {reachable} customer{reachable === 1 ? "" : "s"}
        </button>
      ) : (
        <button
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-leaf px-5 py-3 text-sm font-black text-leaf hover:bg-mint disabled:cursor-not-allowed disabled:opacity-50"
          disabled={Boolean(disabledReason) || !posterId}
          onClick={() => setConfirming(true)}
          title={disabledReason ?? undefined}
          type="button"
        >
          <Send size={16} />
          Send to {reachable} reachable customer{reachable === 1 ? "" : "s"} — free
        </button>
      )}
      {disabledReason ? <p className="text-sm font-semibold text-stone-500">{disabledReason}</p> : null}

      {state.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{state.error}</p>
      ) : null}
      {state.sentAt || (state.error && (state.sentCount || state.skippedCount || state.pendingCount)) ? (
        <div className="rounded-lg bg-mint p-3 text-sm text-leaf">
          <p className="font-semibold">
            Sent {state.sentCount ?? 0} · Failed {state.failedCount ?? 0} · Skipped {state.skippedCount ?? 0}
            {state.pendingCount ? ` · Not reached ${state.pendingCount}` : ""}
          </p>
          {state.pendingCount ? (
            <p className="mt-1 text-xs text-stone-600">Send again to finish — nobody gets the poster twice.</p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
