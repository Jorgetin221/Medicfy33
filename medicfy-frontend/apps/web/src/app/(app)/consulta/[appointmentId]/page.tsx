"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingState } from "@/components/ui/states";
import { ConsultaScreen } from "./consulta-screen";

// DOC-06 — "la pantalla que decide todo" (CLAUDE.md §6). Orquestación
// real en consulta-screen.tsx; este archivo solo resuelve el param de
// ruta y aplica el guard de auth, igual que el resto de pantallas.
export default function ConsultaPage() {
  const router = useRouter();
  const params = useParams<{ appointmentId: string }>();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) router.replace("/login");
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <LoadingState />
      </main>
    );
  }

  return <ConsultaScreen appointmentId={params.appointmentId} accessToken={accessToken} />;
}
