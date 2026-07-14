import { InviteCompletion } from "@/app/auth/invite/InviteCompletion";

export default async function RestaurantInvitePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return <InviteCompletion initialError={query.error} />;
}
