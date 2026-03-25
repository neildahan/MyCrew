"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  BarChart3,
  Settings,
  CheckSquare,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Users },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
          MC
        </div>
        <span className="text-lg font-semibold">MyCrew</span>
      </div>
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 border-t p-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Your Crew</span>
            <div className="flex gap-1 mt-1">
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Yarden</span>
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Dana</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Yoav</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
