"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingState } from "@/components/ui/states";
import { TeleconsultaScreen } from "./teleconsulta-screen";

// M7 (Teleconsulta, MVP) — pantalla dedicada, abierta en pestaña
// nueva desde el botón "Iniciar teleconsulta" de DOC-06
// (consulta-screen.tsx). Mismo guard de auth que el resto de
// pantallas; la orquestación real vive en teleconsulta-screen.tsx.
export default function TeleconsultaPage() {
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

  return <TeleconsultaScreen appointmentId={params.appointmentId} accessToken={accessToken} />;
}
