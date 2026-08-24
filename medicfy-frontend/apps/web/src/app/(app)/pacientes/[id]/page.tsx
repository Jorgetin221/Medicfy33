"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { LoadingState } from "@/components/ui/states";
import { ExpedienteScreen } from "./expediente-screen";

// Expediente del paciente. Envuelto en Suspense porque
// ExpedienteScreen usa useSearchParams (justSigned=1 tras firmar en
// /consulta) — App Router lo exige.
export default function PacienteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
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

  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-2xl p-6">
          <LoadingState />
        </main>
      }
    >
      <ExpedienteScreen patientId={params.id} accessToken={accessToken} />
    </Suspense>
  );
}
