import { SuperAdminShell } from "@/components/super-admin/SuperAdminShell";
import { requireSuperAdmin } from "@/lib/super-admin-auth";

export default async function ProtectedSuperAdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await requireSuperAdmin();
  return <SuperAdminShell session={session}>{children}</SuperAdminShell>;
}
