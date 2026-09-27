import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { InactivityWarningBanner } from "@/components/inactivity-warning-banner";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppNav />
      {/* pt-14: altura del encabezado móvil fijo de AppNav, que bajo `md`
          sustituye al rail lateral. En `md` el rail vuelve al flujo y no hay
          nada fijo arriba que compensar. */}
      <div className="min-h-screen flex-1 overflow-x-hidden bg-gray-100 pt-14 md:pt-0">
        <InactivityWarningBanner />
        {children}
      </div>
    </div>
  );
}
