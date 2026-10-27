"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tokenPrimaryRole } from "@/lib/jwt-claims";
import { homeRouteForRole, isAppRouteAllowed } from "@/lib/role-routing";
import { LoadingState } from "@/components/ui/states";

// M-31: envuelve el área privada; manda a cada rol a su inicio si abre
// una pantalla que no es suya.
export function RoleGate({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const role = tokenPrimaryRole(accessToken);
  const allowed = isAppRouteAllowed(role, pathname);

  useEffect(() => {
    if (!allowed) router.replace(homeRouteForRole(role));
  }, [allowed, role, router]);

  if (!allowed) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <LoadingState />
      </main>
    );
  }
  return <>{children}</>;
}
