"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { redeemOwnerWhatsAppLinkAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="focus-ring w-full rounded-lg bg-leaf px-5 py-4 text-lg font-black text-white disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      {pending ? "Opening… / جارٍ الفتح…" : "Open dashboard / افتح لوحة التحكم"}
    </button>
  );
}

// Submits once on load, so the owner usually never has to tap. Scanners that
// fetch the page without running scripts never submit it.
export function AutoSubmitLoginForm({ token }: { token: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!submitted.current && formRef.current) {
      submitted.current = true;
      formRef.current.requestSubmit();
    }
  }, []);

  return (
    <form action={redeemOwnerWhatsAppLinkAction} className="mt-6" ref={formRef}>
      <input name="token" type="hidden" value={token} />
      <SubmitButton />
    </form>
  );
}
