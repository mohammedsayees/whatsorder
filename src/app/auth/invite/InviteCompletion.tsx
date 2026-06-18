"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { completeRestaurantInviteAction } from "@/app/auth/invite/actions";

export function InviteCompletion({ initialError }: { initialError?: string }) {
  const [error, setError] = useState(initialError ?? "");

  useEffect(() => {
    if (initialError) {
      return;
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);

    completeRestaurantInviteAction({
      accessToken: hash.get("access_token") ?? undefined,
      refreshToken: hash.get("refresh_token") ?? undefined,
      code: query.get("code") ?? undefined,
      tokenHash: query.get("token_hash") ?? undefined
    }).catch((inviteFailure: unknown) => {
      const message =
        inviteFailure instanceof Error
          ? inviteFailure.message
          : "The invitation could not be completed.";
      setError(message);
    });
  }, [initialError]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#173d2f] px-4 py-10">
      <section className="w-full max-w-md rounded-lg bg-white p-7 text-center shadow-2xl">
        {error ? (
          <>
            <h1 className="text-2xl font-black">Invitation could not be completed</h1>
            <p className="mt-3 text-sm leading-6 text-rose-700">{error}</p>
            <a className="mt-6 inline-flex rounded-lg bg-leaf px-5 py-3 font-black text-white" href="/admin-login">
              Go to restaurant login
            </a>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto animate-spin text-leaf" size={34} />
            <h1 className="mt-5 text-2xl font-black">Activating your restaurant account</h1>
            <p className="mt-3 text-sm text-stone-500">Please keep this page open for a moment.</p>
          </>
        )}
      </section>
    </main>
  );
}
