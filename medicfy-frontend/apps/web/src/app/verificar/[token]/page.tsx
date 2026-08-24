"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Card, LoadingState, ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long", timeStyle: "short" }).format(new Date(iso));
}

interface VerificationResult {
  folio: string;
  issuedAt: string;
  status: "ISSUED" | "CANCELLED";
  doctorName?: string;
  doctorLicense?: string;
  patientNameMasked?: string;
}

// M9-RN-010/M9-CA-004: público, sin autenticación, y NUNCA contenido
// clínico — solo folio/fecha/médico/nombre de paciente enmascarado.
// Fuera de (app): sin AppNav, sin guard de sesión (CLAUDE.md/plan
// aprobado: "vista pública... fuera del route group (app)").
export default function VerificarPage() {
  const params = useParams<{ token: string }>();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch<VerificationResult>(`/verificar/${params.token}`)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  const isPrescription = result ? "doctorName" in result : false;
  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <p className="font-brand text-lg text-brand-900">Medicfy</p>
        <h1 className="font-heading text-2xl text-brand-900">Verificación de documento</h1>
      </div>

      <Card>
        {isLoading ? (
          <LoadingState label="Verificando…" />
        ) : notFound ? (
          <Aviso variant="advertencia" title="Documento no encontrado">
            Este enlace no corresponde a una receta u orden emitida por Medicfy, o el código está incompleto.
          </Aviso>
        ) : error ? (
          <ErrorState error={error} />
        ) : result ? (
          <div className="flex flex-col gap-4">
            {result.status === "CANCELLED" ? (
              <Aviso variant="critico" title="Documento cancelado">
                Este {isPrescription ? "receta" : "orden de laboratorio"} fue cancelada por el médico y ya no es válida.
              </Aviso>
            ) : (
              <Aviso variant="exito" title={`${isPrescription ? "Receta" : "Orden de laboratorio"} vigente`} />
            )}
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Folio</dt>
                <dd className="text-base font-medium text-gray-900">{result.folio}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Fecha de emisión</dt>
                <dd className="text-base text-gray-900">{formatMxDateTime(result.issuedAt)}</dd>
              </div>
              {result.doctorName && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Médico</dt>
                  <dd className="text-base text-gray-900">
                    {result.doctorName} — Céd. {result.doctorLicense}
                  </dd>
                </div>
              )}
              {result.patientNameMasked && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Paciente</dt>
                  <dd className="text-base text-gray-900">{result.patientNameMasked}</dd>
                </div>
              )}
            </dl>
            <p className="text-sm text-gray-500">
              Esta verificación confirma que el documento fue emitido por Medicfy. No muestra diagnóstico, medicamentos ni resultados por
              confidencialidad del paciente.
            </p>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
