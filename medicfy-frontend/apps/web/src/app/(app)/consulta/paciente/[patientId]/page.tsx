"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingState } from "@/components/ui/states";
import { PacienteConsultaScreen } from "./paciente-consulta-screen";

// Consulta sin cita — mismo guard de auth que el resto de pantallas;
// la orquestación real vive en paciente-consulta-screen.tsx.
export default function PacienteConsultaPage() {
  const router = useRouter();
  const params = useParams<{ patientId: string }>();
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

  return <PacienteConsultaScreen patientId={params.patientId} accessToken={accessToken} />;
}
