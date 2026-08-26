"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useSpecialties } from "@/lib/use-specialties";
import type { DoctorVerificationStatus } from "@/lib/use-doctor-profile";
import { Card, LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldWrapper, Textarea } from "@/components/ui/field";

interface AdminDoctorDocument {
  id: string;
  docType: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  fileHashSha256: string;
  uploadedAt: string;
}
interface AdminDoctorDetail {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  professionalLicense: string;
  primarySpecialtyId: string | null;
  verificationStatus: DoctorVerificationStatus;
  verificationNotes: string | null;
  documents: AdminDoctorDocument[];
}

const STATUS_LABELS: Record<DoctorVerificationStatus, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Por revisar",
  IN_REVIEW: "En revisión",
  VERIFIED: "Verificado",
  VERIFIED_SPECIALTY_UNCONFIRMED: "Verificado (especialidad sin confirmar)",
  REJECTED: "Rechazado",
  SUSPENDED: "Suspendido",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  CEDULA_PROFESIONAL: "Cédula profesional",
  CEDULA_ESPECIALIDAD: "Cédula de especialidad",
  INE: "Identificación oficial",
  CV: "Currículum",
  CERTIFICADO_CONSEJO: "Certificado de consejo",
  COMPROBANTE_DOMICILIO: "Comprobante de domicilio",
};

// ADM-02. No sirve el archivo en sí (no existe endpoint para eso hoy
// — doctors/me/documents solo lista metadata, ni siquiera para el
// propio médico) — el hash y el tipo son lo que M2-CA-003 pide
// verificar, no una vista del PDF.
export default function AdminVerificacionDetailPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();
  const params = useParams<{ doctorId: string }>();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <LoadingState />
      </main>
    );
  }

  return <VerificacionDetail accessToken={accessToken} doctorId={params.doctorId} />;
}

function VerificacionDetail({ accessToken, doctorId }: { accessToken: string; doctorId: string }) {
  const { specialties } = useSpecialties();
  const [doctor, setDoctor] = useState<AdminDoctorDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [specialtyConfirmed, setSpecialtyConfirmed] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);

  const load = useCallback(() => {
    setError(null);
    apiFetch<AdminDoctorDetail>(`/admin/doctors/${doctorId}`, { accessToken })
      .then(setDoctor)
      .catch((err: unknown) => setError(err));
  }, [accessToken, doctorId]);

  useEffect(() => {
    load();
  }, [load]);

  const specialty = specialties.find((s) => s.id === doctor?.primarySpecialtyId);

  async function onVerify() {
    setActionError(null);
    setResultMessage(null);
    setIsVerifying(true);
    try {
      const body = specialty?.requiresSpecialtyLicense ? { specialtyConfirmed } : {};
      const updated = await apiFetch<{ verificationStatus: DoctorVerificationStatus }>(`/admin/doctors/${doctorId}/verify`, {
        method: "POST",
        body,
        accessToken,
      });
      setResultMessage(`Estado actualizado a "${STATUS_LABELS[updated.verificationStatus]}".`);
      load();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsVerifying(false);
    }
  }

  async function onReject() {
    if (!rejectReason.trim()) return;
    setActionError(null);
    setResultMessage(null);
    setIsRejecting(true);
    try {
      await apiFetch(`/admin/doctors/${doctorId}/reject`, { method: "POST", body: { reason: rejectReason.trim() }, accessToken });
      setResultMessage("Médico rechazado.");
      setRejectReason("");
      load();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsRejecting(false);
    }
  }

  async function onSuspend() {
    if (!window.confirm("¿Suspender a este médico? Sus citas futuras pagadas se cancelarán y sus pacientes serán notificados.")) return;
    setActionError(null);
    setResultMessage(null);
    setIsSuspending(true);
    try {
      const result = await apiFetch<{ notifiedPatients: number; refundsIssued: number }>(`/admin/doctors/${doctorId}/suspend`, {
        method: "POST",
        body: {},
        accessToken,
      });
      setResultMessage(
        `Médico suspendido. ${result.notifiedPatients} paciente(s) notificado(s) de su cancelación. El reembolso todavía se procesa manualmente — Medicfy no cobra pagos reales todavía.`
      );
      load();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsSuspending(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <ErrorState error={error} onRetry={load} />
      </main>
    );
  }
  if (!doctor) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <LoadingState />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link href="/admin/verificacion" className="text-sm font-medium text-brand-700 underline">
          ← Cola de verificación
        </Link>
        <h1 className="mt-2 font-heading text-2xl text-brand-900">
          {doctor.legalFirstName} {doctor.legalLastName}
        </h1>
        <p className="text-base text-gray-500">
          Cédula {doctor.professionalLicense} · {specialty?.nameEs ?? "Medicina General"}
        </p>
      </div>

      <Card>
        <h2 className="font-heading text-xl text-brand-900">Estado actual</h2>
        <p className="mt-2 text-base font-medium text-gray-900">{STATUS_LABELS[doctor.verificationStatus]}</p>
        {doctor.verificationStatus === "REJECTED" && doctor.verificationNotes ? (
          <p className="mt-1 text-sm text-gray-500">Motivo del rechazo: {doctor.verificationNotes}</p>
        ) : null}
      </Card>

      <Card>
        <h2 className="font-heading text-xl text-brand-900">Documentos</h2>
        {doctor.documents.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Sin documentos cargados" />
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {doctor.documents.map((doc) => (
              <li key={doc.id} className="rounded-md border border-gray-300 p-3">
                <p className="text-base text-gray-900">{DOC_TYPE_LABELS[doc.docType] ?? doc.docType}</p>
                <p className="mt-1 font-mono text-sm text-gray-500">hash: {doc.fileHashSha256.slice(0, 16)}…</p>
                <p className="text-sm text-gray-500">Subido {new Date(doc.uploadedAt).toLocaleString("es-MX")}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-heading text-xl text-brand-900">Decisión</h2>

        {actionError ? (
          <div className="mt-4">
            <ErrorState error={actionError} />
          </div>
        ) : null}
        {resultMessage && !actionError ? (
          <div className="mt-4">
            <Aviso variant="exito" title={resultMessage} />
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-6">
          <div>
            {specialty?.requiresSpecialtyLicense ? (
              <label className="mb-2 flex items-center gap-2 text-base text-gray-900">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={specialtyConfirmed}
                  onChange={(e) => setSpecialtyConfirmed(e.target.checked)}
                />
                Confirmo que revisé la cédula de especialidad
              </label>
            ) : null}
            <Button type="button" isLoading={isVerifying} onClick={() => void onVerify()}>
              Aprobar
            </Button>
            {specialty?.requiresSpecialtyLicense && !specialtyConfirmed ? (
              <p className="mt-1 text-sm text-gray-500">Quedará como &quot;verificado con especialidad no confirmada&quot;.</p>
            ) : null}
          </div>

          <div className="border-t border-gray-300 pt-6">
            <FieldWrapper label="Motivo del rechazo" htmlFor="reject-reason">
              <Textarea id="reject-reason" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </FieldWrapper>
            <Button
              type="button"
              variant="danger"
              className="mt-3"
              isLoading={isRejecting}
              disabled={!rejectReason.trim()}
              onClick={() => void onReject()}
            >
              Rechazar
            </Button>
          </div>

          <div className="border-t border-gray-300 pt-6">
            <p className="mb-3 text-sm text-gray-500">
              Cancela sus citas futuras pagadas, notifica a los pacientes afectados con su derecho a reembolso, y no borra su perfil ni sus
              expedientes.
            </p>
            <Button type="button" variant="danger" isLoading={isSuspending} onClick={() => void onSuspend()}>
              Suspender
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}
