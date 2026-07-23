"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  connectWhatsAppWebAction,
  disconnectWhatsAppWebAction,
  saveWhatsAppChatbotSettingsAction,
  type WhatsAppChatbotSettingsState,
  type WhatsAppConnectionState
} from "@/app/admin/integrations/whatsapp/actions";
import type { WhatsAppChatbotSettings } from "@/lib/whatsapp-ai";
import type { WhatsAppIntegration } from "@/lib/whatsapp-integration";

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="focus-ring rounded-xl bg-leaf px-5 py-3 text-sm font-black text-white disabled:opacity-50"
      disabled={pending}
      type="submit"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function WhatsAppIntegrationPanel({
  integration,
  settings,
  qrDataUrl,
  connectorConfigured
}: {
  integration: WhatsAppIntegration | null;
  settings: WhatsAppChatbotSettings;
  qrDataUrl: string | null;
  connectorConfigured: boolean;
}) {
  const router = useRouter();
  const [connectState, connectAction] = useActionState<
    WhatsAppConnectionState,
    FormData
  >(connectWhatsAppWebAction, {});
  const [disconnectState, disconnectAction] = useActionState<
    WhatsAppConnectionState,
    FormData
  >(disconnectWhatsAppWebAction, {});
  const [settingsState, settingsAction] = useActionState<
    WhatsAppChatbotSettingsState,
    FormData
  >(saveWhatsAppChatbotSettingsAction, {});

  const refreshing = ["connecting", "qr_ready"].includes(
    integration?.status ?? ""
  );
  useEffect(() => {
    if (!refreshing) return;
    const timer = window.setInterval(() => router.refresh(), 3500);
    return () => window.clearInterval(timer);
  }, [refreshing, router]);

  useEffect(() => {
    if (connectState.updatedAt || disconnectState.updatedAt) router.refresh();
  }, [connectState.updatedAt, disconnectState.updatedAt, router]);

  const active = integration?.status === "active";
  const error = connectState.error || disconnectState.error || integration?.last_error;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-leaf">
              Quick Connect
            </p>
            <h2 className="mt-1 text-xl font-black text-ink">WhatsApp Web</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-500">
              Link the restaurant&apos;s existing WhatsApp number by scanning a QR code.
              The phone must remain signed in and periodically connected to the internet.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${
              active
                ? "bg-emerald-100 text-emerald-700"
                : integration?.status === "error"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-stone-100 text-stone-600"
            }`}
          >
            {active
              ? `Active${integration.phone_number ? ` · +${integration.phone_number}` : ""}`
              : (integration?.status ?? "Not connected").replace("_", " ")}
          </span>
        </div>

        {!connectorConfigured ? (
          <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            The persistent connector is not configured. Add its URL and shared secret
            before starting a connection.
          </p>
        ) : null}

        {qrDataUrl ? (
          <div className="mt-6 grid items-center gap-5 rounded-2xl bg-stone-50 p-5 sm:grid-cols-[220px,1fr]">
            {/* The QR is generated server-side from a short-lived connector payload. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="QR code for linking WhatsApp"
              className="h-[220px] w-[220px] rounded-xl bg-white p-2"
              src={qrDataUrl}
            />
            <div>
              <h3 className="font-black text-ink">Scan this from the restaurant phone</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-stone-600">
                <li>Open WhatsApp and go to Linked devices.</li>
                <li>Choose Link a device.</li>
                <li>Scan this QR code within one minute.</li>
              </ol>
              <p className="mt-3 text-xs font-semibold text-stone-400">
                This page refreshes automatically while connecting.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          {!active ? (
            <form action={connectAction}>
              <SubmitButton>
                {integration?.status === "qr_ready" ? "Generate a new QR" : "Connect WhatsApp"}
              </SubmitButton>
            </form>
          ) : (
            <form action={disconnectAction}>
              <SubmitButton>Disconnect</SubmitButton>
            </form>
          )}
        </div>

        <p className="mt-5 text-xs leading-5 text-stone-400">
          Quick Connect uses a linked WhatsApp Web session rather than Meta&apos;s official
          Cloud API. WhatsApp may require re-linking or restrict unsupported automation.
        </p>
      </section>

      <form
        action={settingsAction}
        className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-xl font-black text-ink">AI receptionist</h2>
        <p className="mt-1 text-sm leading-6 text-stone-500">
          Answers only from the live menu and restaurant settings. Ordering always
          continues through the structured WhatsOrder menu.
        </p>

        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-stone-200 p-4">
          <input
            className="mt-1"
            defaultChecked={settings.enabled}
            name="enabled"
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-black">Enable automatic AI replies</span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              A manual staff reply pauses the AI for the configured period.
            </span>
          </span>
        </label>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-bold">
            <input defaultChecked={settings.answer_text} name="answer_text" type="checkbox" />
            Answer text messages
          </label>
          <label className="flex items-center gap-2 text-sm font-bold">
            <input defaultChecked={settings.answer_audio} name="answer_audio" type="checkbox" />
            Understand voice messages
          </label>
          <label className="block">
            <span className="text-sm font-bold">Reply language</span>
            <select
              className="focus-ring mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5"
              defaultValue={settings.language_mode}
              name="language_mode"
            >
              <option value="customer">Match the customer</option>
              <option value="english">English</option>
              <option value="arabic">Arabic</option>
              <option value="malayalam">Malayalam</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold">Tone</span>
            <select
              className="focus-ring mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5"
              defaultValue={settings.tone}
              name="tone"
            >
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
              <option value="formal">Formal</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-bold">Optional welcome message</span>
            <textarea
              className="focus-ring mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5"
              defaultValue={settings.welcome_message ?? ""}
              maxLength={1000}
              name="welcome_message"
              placeholder="Leave blank to generate a welcome with the live menu link."
              rows={3}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-bold">Human handoff message</span>
            <textarea
              className="focus-ring mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5"
              defaultValue={settings.handoff_message}
              maxLength={1000}
              name="handoff_message"
              rows={3}
              required
            />
          </label>
          <label className="block sm:max-w-xs">
            <span className="text-sm font-bold">Pause after staff reply (minutes)</span>
            <input
              className="focus-ring mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5"
              defaultValue={settings.human_pause_minutes}
              max={10080}
              min={15}
              name="human_pause_minutes"
              type="number"
              required
            />
          </label>
        </div>

        {settingsState.error ? (
          <p className="mt-4 text-sm font-bold text-rose-600">{settingsState.error}</p>
        ) : null}
        {settingsState.savedAt ? (
          <p className="mt-4 text-sm font-bold text-leaf">Chatbot settings saved.</p>
        ) : null}
        <div className="mt-5">
          <SubmitButton>Save chatbot settings</SubmitButton>
        </div>
      </form>
    </div>
  );
}

