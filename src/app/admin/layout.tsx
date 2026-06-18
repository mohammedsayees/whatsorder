import { AdminShell } from "@/components/admin/AdminShell";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRestaurantAdmin();
  return <AdminShell session={session}>{children}</AdminShell>;
}
