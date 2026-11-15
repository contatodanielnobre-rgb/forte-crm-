"use client";
import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ToastProvider } from "@/components/toast";
import type { SessionUser } from "@/lib/auth";
import { markNotificationsRead } from "@/app/(app)/actions";

export function AppShell({ user, companyName, notifications, unread, children }: { user: SessionUser; companyName: string; notifications: React.ComponentProps<typeof Topbar>["notifications"]; unread: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <ToastProvider>
      <Sidebar role={user.role} open={open} onClose={() => setOpen(false)} companyName={companyName} />
      <div className="lg:pl-[260px] min-h-screen flex flex-col">
        <Topbar user={user} onMenu={() => setOpen(true)} notifications={notifications} unread={unread} markRead={markNotificationsRead} />
        <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </ToastProvider>
  );
}
