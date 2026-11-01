"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingState } from "@/components/ui/states";
import { AbuseReportsView } from "./abuse-reports-view";

// PR-EXP-06 — cola de reportes de uso indebido de accesos
// compartidos. Igual que admin/verificacion: no se filtra por rol en
// el cliente — AdminGuard en el servidor es la autorización real. R4:
// solo metadatos, nunca contenido clínico.
export default function AdminExpedienteCompartidoPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) router.replace("/login");
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <LoadingState />
      </main>
    );
  }
  return <AbuseReportsView accessToken={accessToken} />;
}
