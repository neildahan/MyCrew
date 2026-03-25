import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastProvider } from "@/components/ui/toast";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 ml-64">
          <Topbar />
          <main className="p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
