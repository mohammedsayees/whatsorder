import { AdminShell } from "@/components/admin/AdminShell";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRestaurantAdmin();
  return <AdminShell>{children}</AdminShell>;
}
