import { CheckCircle2, Circle } from "lucide-react";

import type { OnboardingProgress } from "@/lib/types";

export function OnboardingProgressCard({ progress }: { progress: OnboardingProgress }) {
  if (progress.total === 0) {
    return null;
  }

  const percent = Math.round((progress.completed / progress.total) * 100);

  return (
    <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-leaf">Getting started</p>
          <h2 className="mt-1 text-xl font-black">Your onboarding progress</h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-emerald-900">
          {progress.completed} of {progress.total}
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-emerald-100">
        <div className="h-full rounded-full bg-leaf" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {progress.tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 text-sm text-stone-700">
            {task.is_completed ? (
              <CheckCircle2 className="shrink-0 text-leaf" size={17} />
            ) : (
              <Circle className="shrink-0 text-stone-300" size={17} />
            )}
            <span className={task.is_completed ? "font-bold" : undefined}>{task.task_label}</span>
          </div>
        ))}
      </div>

      {progress.activatedAt ? (
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-bold text-emerald-800">
          Activated — your first real order was accepted successfully.
        </p>
      ) : (
        <p className="mt-4 text-sm text-stone-600">
          Activation happens automatically when you move your first real customer order to
          <strong> Accepted</strong>.
        </p>
      )}
    </section>
  );
}
