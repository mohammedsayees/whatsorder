import type { Metadata } from "next";

import { VerifyEmailCompletion } from "@/app/auth/verify-email/VerifyEmailCompletion";

export const metadata: Metadata = { title: "Confirm your email — WhatsOrder" };

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return <VerifyEmailCompletion initialError={query.error ? String(query.error).slice(0, 200) : undefined} />;
}
