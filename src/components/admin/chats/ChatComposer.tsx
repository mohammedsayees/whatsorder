"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  sendChatMessageAction,
  sendChatTemplateAction,
  type SendChatMessageState
} from "@/app/admin/chats/actions";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="focus-ring shrink-0 rounded-full bg-leaf px-5 py-2 text-sm font-black text-white disabled:opacity-50"
      disabled={pending}
      type="submit"
    >
      {pending ? "Sending…" : "Send"}
    </button>
  );
}

function TemplateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="focus-ring shrink-0 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      disabled={pending}
      type="submit"
    >
      {pending ? "Sending…" : "Send template (paid)"}
    </button>
  );
}

function ClosedWindowActions({ conversationId }: { conversationId: string }) {
  const [state, formAction] = useActionState<SendChatMessageState, FormData>(
    sendChatTemplateAction,
    {}
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-100 px-4 py-3">
        <p className="text-sm font-semibold text-stone-500">
          The 24-hour reply window has closed. Send an approved template to
          re-engage (billed per message by WhatsApp), or wait for the customer
          to message again.
        </p>
        <form action={formAction}>
          <input name="conversationId" type="hidden" value={conversationId} />
          <TemplateButton />
        </form>
      </div>
      {state.error ? (
        <p className="text-xs font-bold text-rose-600">{state.error}</p>
      ) : null}
      {state.sentAt ? (
        <p className="text-xs font-bold text-leaf">Template sent.</p>
      ) : null}
    </div>
  );
}

export function ChatComposer({
  conversationId,
  windowOpen
}: {
  conversationId: string;
  windowOpen: boolean;
}) {
  const [state, formAction] = useActionState<SendChatMessageState, FormData>(
    sendChatMessageAction,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the textarea after a successful send (sentAt changes per send).
  useEffect(() => {
    if (state.sentAt) {
      formRef.current?.reset();
    }
  }, [state.sentAt]);

  if (!windowOpen) {
    return (
      <ClosedWindowActions conversationId={conversationId} />
    );
  }

  return (
    <form action={formAction} className="space-y-2" ref={formRef}>
      <input name="conversationId" type="hidden" value={conversationId} />
      <div className="flex items-end gap-2">
        <textarea
          className="focus-ring min-h-[44px] w-full resize-y rounded-2xl border border-stone-200 px-4 py-2.5 text-sm"
          maxLength={4096}
          name="body"
          placeholder="Type a reply…"
          required
          rows={2}
        />
        <SendButton />
      </div>
      {state.error ? (
        <p className="text-xs font-bold text-rose-600">{state.error}</p>
      ) : null}
    </form>
  );
}
