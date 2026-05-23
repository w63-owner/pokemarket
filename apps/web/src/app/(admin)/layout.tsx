import type { Metadata } from "next";
import { AdminGuard } from "@/components/layout/admin-guard";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <div className="flex min-h-[calc(100dvh-4rem)]">
        <AdminSidebar />
        <div className="flex-1 overflow-y-auto p-4 md:p-8">{children}</div>
      </div>
    </AdminGuard>
  );
}
