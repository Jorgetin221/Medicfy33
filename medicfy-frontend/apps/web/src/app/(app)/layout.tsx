import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppNav />
      <div className="min-h-screen flex-1 overflow-x-hidden bg-gray-100">{children}</div>
    </div>
  );
}
