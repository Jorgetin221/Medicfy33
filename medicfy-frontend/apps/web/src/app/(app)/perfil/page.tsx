"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import QRCode from "qrcode";
import {
  practiceLocationSchema,
  doctorProfileUpdateSchema,
  doctorLegalFieldsUpdateSchema,
  assistantInviteSchema,
  containsContactInfo,
  type PracticeLocationInput,
} from "@medicfy/contracts";
import { apiFetch, apiUpload, apiFetchBlob, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useDoctorProfile, type DoctorProfile, type DoctorVerificationStatus } from "@/lib/use-doctor-profile";
import { useSpecialties } from "@/lib/use-specialties";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, Textarea } from "@/components/ui/field";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { FileUpload } from "@/components/ui/file-upload";
import { useI18n, useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";
import { formatDateMedium } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { translateKeyed } from "@/lib/i18n/keyed";

interface PracticeLocation extends PracticeLocationInput {
  id: string;
}

interface DoctorDocument {
  id: string;
  docType: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  uploadedAt: string;
}

const DOC_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  CEDULA_PROFESIONAL: "perfil.documentos.CEDULA_PROFESIONAL",
  CEDULA_ESPECIALIDAD: "perfil.documentos.CEDULA_ESPECIALIDAD",
  INE: "perfil.documentos.INE",
  CV: "perfil.documentos.CV",
  CERTIFICADO_CONSEJO: "perfil.documentos.CERTIFICADO_CONSEJO",
  COMPROBANTE_DOMICILIO: "perfil.documentos.COMPROBANTE_DOMICILIO",
};
const REVIEW_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  PENDING: "perfil.revision.PENDING",
  APPROVED: "perfil.revision.APPROVED",
  REJECTED: "perfil.revision.REJECTED",
};

// Perfil (PRF-01/VRF, Parte B §5). Mismo guard de auth que
// agenda/disponibilidad.
export default function PerfilPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

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

  return <PerfilContent accessToken={accessToken} />;
}

function PerfilContent({ accessToken }: { accessToken: string }) {
  const t = useT();
  const { doctor, isLoading, error, reload } = useDoctorProfile(accessToken);
  const { specialties } = useSpecialties();
  const [locations, setLocations] = useState<PracticeLocation[] | null>(null);
  const [locationsError, setLocationsError] = useState<unknown>(null);

  const loadLocations = useCallback(async () => {
    setLocationsError(null);
    try {
      setLocations(expectArray<PracticeLocation>(await apiFetch<unknown>("/doctors/me/locations", { accessToken })));
    } catch (err) {
      setLocationsError(err);
    }
  }, [accessToken]);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  if (isLoading || !doctor) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        {error ? <ErrorState error={error} /> : <LoadingState />}
      </main>
    );
  }

  const specialtyName = specialties.find((s) => s.id === doctor.primarySpecialtyId)?.nameEs ?? null;
  const primaryLocation = locations?.find((l) => l.isPrimary) ?? locations?.[0] ?? null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl text-brand-900">{t("perfil.titulo")}</h1>
          <p className="text-base text-gray-500">{t("perfil.subtitulo")}</p>
        </div>
        {/* M5-RN-007: el slug se genera al registrarse — siempre existe. */}
        <Link href={`/dr/${doctor.slug}`} className="mt-1 shrink-0 text-sm font-medium text-brand-700 underline">
          {t("perfil.verPublico")}
        </Link>
      </div>

      <HeroSection doctor={doctor} specialtyName={specialtyName} />
      <VerificationSection doctor={doctor} accessToken={accessToken} />
      <MfaSection accessToken={accessToken} />
      <LockedFieldsSection doctor={doctor} specialtyName={specialtyName} />
      <SpecialtyLicenseSection doctor={doctor} accessToken={accessToken} onSaved={reload} />
      <ProfessionalInfoSection doctor={doctor} accessToken={accessToken} onSaved={reload} />
      <LocationsSection accessToken={accessToken} locations={locations} error={locationsError} onReload={loadLocations} />
      <ContactSection doctor={doctor} accessToken={accessToken} onSaved={reload} />
      <BrandingSection doctor={doctor} accessToken={accessToken} onSaved={reload} specialtyName={specialtyName} primaryLocation={primaryLocation} />
      <AssistantsSection accessToken={accessToken} />
    </main>
  );
}

// Parte C del plan aprobado: cabecera con los mismos datos reales que
// ya vive el resto de la pantalla (nada nuevo se inventa) — solo se
// presentan primero, como en la página pública, para que el médico
// vea de un vistazo cómo se ve su perfil.
function HeroSection({ doctor, specialtyName }: { doctor: DoctorProfile; specialtyName: string | null }) {
  const t = useT();
  return (
    <Card>
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        {doctor.photoUrl ? (
          <img src={doctor.photoUrl} alt="" className="h-24 w-24 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gray-100 text-2xl text-gray-400" aria-hidden="true">
            {doctor.legalFirstName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <h2 className="font-heading text-xl text-brand-900">
            {doctor.displayName ?? `${doctor.legalFirstName} ${doctor.legalLastName}`}
          </h2>
          <p className="mt-1 text-base text-gray-700">{specialtyName ?? t("catalogos.especialidades.GENERAL")}</p>
          {doctor.verificationStatus === "VERIFIED" ? (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-success-600 bg-success-50 px-3 py-1 text-sm font-medium text-success-600">
              {t("perfil.medicoVerificado")}
            </span>
          ) : null}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
            {doctor.university ? (
              <div>
                <dt className="inline text-gray-500">{t("perfil.universidad")}</dt>
                <dd className="inline">{doctor.university}</dd>
              </div>
            ) : null}
            {doctor.yearsExperience !== null ? (
              <div>
                <dt className="inline text-gray-500">{t("perfil.experiencia")}</dt>
                <dd className="inline">{t("perfil.anios", { n: doctor.yearsExperience })}</dd>
              </div>
            ) : null}
            {doctor.languages.length > 0 ? (
              <div>
                <dt className="inline text-gray-500">{t("perfil.idiomas")}</dt>
                <dd className="inline">{doctor.languages.join(", ")}</dd>
              </div>
            ) : null}
            {doctor.acceptsTeleconsultation ? <div>{t("perfil.ofreceTeleconsulta")}</div> : null}
          </dl>
        </div>
      </div>
    </Card>
  );
}

const VERIFICATION_COPY: Record<DoctorVerificationStatus, { variant: "info" | "exito" | "advertencia"; titleKey: MessageKey }> = {
  DRAFT: { variant: "info", titleKey: "perfil.verificacion.DRAFT" },
  SUBMITTED: { variant: "info", titleKey: "perfil.verificacion.SUBMITTED" },
  IN_REVIEW: { variant: "info", titleKey: "perfil.verificacion.IN_REVIEW" },
  VERIFIED: { variant: "exito", titleKey: "perfil.verificacion.VERIFIED" },
  VERIFIED_SPECIALTY_UNCONFIRMED: { variant: "exito", titleKey: "perfil.verificacion.VERIFIED_SPECIALTY_UNCONFIRMED" },
  REJECTED: { variant: "advertencia", titleKey: "perfil.verificacion.REJECTED" },
  SUSPENDED: { variant: "advertencia", titleKey: "perfil.verificacion.SUSPENDED" },
};

function VerificationSection({ doctor, accessToken }: { doctor: DoctorProfile; accessToken: string }) {
  const t = useT();
  const [documents, setDocuments] = useState<DoctorDocument[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<unknown>("/doctors/me/documents", { accessToken })
      .then((data) => setDocuments(expectArray<DoctorDocument>(data)))
      .catch((err: unknown) => setError(err));
  }, [accessToken]);

  const copy = VERIFICATION_COPY[doctor.verificationStatus];

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.verificacion.titulo")}</h2>
      <div className="mt-4">
        <Aviso variant={copy.variant} title={t(copy.titleKey)}>
          {doctor.verificationStatus === "SUBMITTED" || doctor.verificationStatus === "DRAFT"
            ? t("perfil.verificacion.cuerpoPendiente")
            : null}
          {doctor.verificationStatus === "IN_REVIEW" ? t("perfil.verificacion.cuerpoEnRevision") : null}
          {doctor.verificationStatus === "REJECTED" && doctor.verificationNotes
            ? t("perfil.verificacion.motivo", { motivo: doctor.verificationNotes })
            : null}
          {doctor.verificationStatus === "REJECTED" ? t("perfil.verificacion.cuerpoRechazado") : null}
          {doctor.verificationStatus === "VERIFIED" ? t("perfil.verificacion.cuerpoVerificado") : null}
          {doctor.verificationStatus === "VERIFIED_SPECIALTY_UNCONFIRMED"
            ? t("perfil.verificacion.cuerpoEspecialidadNoConfirmada")
            : null}
          {doctor.verificationStatus === "SUSPENDED" ? t("perfil.verificacion.cuerpoSuspendido") : null}
        </Aviso>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-gray-700">{t("perfil.verificacion.documentosCargados")}</p>
        {documents === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} /> : null}
        {documents && documents.length === 0 ? <EmptyState title={t("perfil.verificacion.sinDocumentos")} /> : null}
        {documents && documents.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between rounded-md border border-gray-300 p-3 text-base text-gray-900">
                {translateKeyed(t, DOC_TYPE_LABEL_KEYS, doc.docType)}
                <span className="text-sm text-gray-500">{translateKeyed(t, REVIEW_STATUS_LABEL_KEYS, doc.reviewStatus)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

interface MeStatus {
  mfaEnabled: boolean;
}

interface EnrollmentStart {
  otpauthUri: string;
  backupCodes: string[];
}

// M1-RN-005/M1-CA-005: sin esta pantalla, una cuenta que llega al 4to
// login sin haber activado la verificación en dos pasos quedaba
// bloqueada sin ninguna forma de continuar — el sistema la exige pero
// nunca hubo dónde enrolarse. Usa POST /auth/mfa/enroll, ya existente
// y probado desde antes: sin `code` inicia el enrolamiento, con
// `code` lo confirma (mfa.controller.ts).
function MfaSection({ accessToken }: { accessToken: string }) {
  const t = useT();
  const [me, setMe] = useState<MeStatus | null>(null);
  const [meError, setMeError] = useState<unknown>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentStart | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const loadMe = useCallback(() => {
    setMeError(null);
    apiFetch<MeStatus>("/me", { accessToken })
      .then(setMe)
      .catch((err: unknown) => setMeError(err));
  }, [accessToken]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (!enrollment) {
      setQrDataUrl(null);
      return undefined;
    }
    let cancelled = false;
    QRCode.toDataURL(enrollment.otpauthUri).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [enrollment]);

  async function startEnrollment() {
    setActionError(null);
    setIsStarting(true);
    try {
      const result = await apiFetch<EnrollmentStart>("/auth/mfa/enroll", { method: "POST", accessToken, body: {} });
      setEnrollment(result);
      setCode("");
    } catch (err) {
      setActionError(err);
    } finally {
      setIsStarting(false);
    }
  }

  async function confirmEnrollment() {
    setActionError(null);
    setIsConfirming(true);
    try {
      await apiFetch("/auth/mfa/enroll", { method: "POST", accessToken, body: { code } });
      setEnrollment(null);
      loadMe();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsConfirming(false);
    }
  }

  async function disableMfa() {
    if (!window.confirm(t("perfil.mfa.confirmarDesactivar"))) return;
    setActionError(null);
    setIsDisabling(true);
    try {
      await apiFetch("/auth/mfa/disable", { method: "POST", accessToken, body: {} });
      loadMe();
    } catch (err) {
      setActionError(err);
    } finally {
      setIsDisabling(false);
    }
  }

  const manualSecret = enrollment ? new URL(enrollment.otpauthUri).searchParams.get("secret") : null;

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.mfa.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("perfil.mfa.explicacion")}</p>

      <div className="mt-4">
        {meError ? <ErrorState error={meError} onRetry={loadMe} /> : null}
        {!me && !meError ? <LoadingState /> : null}

        {me && me.mfaEnabled && !enrollment ? (
          <div className="flex flex-col gap-3">
            <Aviso variant="exito" title={t("perfil.mfa.activada")} />
            <Button type="button" variant="destructive" isLoading={isDisabling} onClick={() => void disableMfa()} className="w-fit">
              {t("perfil.mfa.desactivar")}
            </Button>
          </div>
        ) : null}

        {me && !me.mfaEnabled && !enrollment ? (
          <div className="flex flex-col gap-3">
            <p className="text-base text-gray-900">{t("perfil.mfa.noActivada")}</p>
            <Button type="button" isLoading={isStarting} onClick={() => void startEnrollment()} className="w-fit">
              {t("perfil.mfa.activar")}
            </Button>
          </div>
        ) : null}

        {enrollment ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-base font-medium text-gray-900">{t("perfil.mfa.paso1")}</p>
              <p className="text-sm text-gray-500">{t("perfil.mfa.paso1Ayuda")}</p>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={t("perfil.mfa.qrAlt")} className="mt-3 h-48 w-48" />
              ) : (
                <LoadingState />
              )}
              <p className="mt-2 text-sm text-gray-500">
                {t("perfil.mfa.claveManual")}<span className="font-mono text-base text-gray-900">{manualSecret}</span>
              </p>
            </div>

            <Aviso variant="advertencia" title={t("perfil.mfa.respaldoTitulo")}>
              <p className="mb-2">{t("perfil.mfa.respaldoCuerpo")}</p>
              <ul className="grid grid-cols-2 gap-1 font-mono text-base text-gray-900">
                {enrollment.backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Aviso>

            <div>
              <p className="text-base font-medium text-gray-900">{t("perfil.mfa.paso2")}</p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <FieldWrapper label={t("perfil.mfa.codigo")} htmlFor="mfa-confirm-code">
                  <TextInput
                    id="mfa-confirm-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </FieldWrapper>
                <Button type="button" isLoading={isConfirming} disabled={code.length !== 6} onClick={() => void confirmEnrollment()}>
                  Confirmar
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEnrollment(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {actionError ? (
          <div className="mt-3">
            <ErrorState error={actionError} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function LockedFieldsSection({ doctor, specialtyName }: { doctor: DoctorProfile; specialtyName: string | null }) {
  const t = useT();
  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.verificados.titulo")}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-gray-500">{t("perfil.verificados.nombreLegal")}</dt>
          <dd className="text-base text-gray-900">
            {doctor.legalFirstName} {doctor.legalLastName}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">{t("perfil.verificados.cedula")}</dt>
          <dd className="text-base text-gray-900">{doctor.professionalLicense}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">{t("perfil.verificados.especialidad")}</dt>
          <dd className="text-base text-gray-900">{specialtyName ?? "—"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-gray-500">
        Estos campos no se pueden modificar una vez verificada la cuenta. Contacta a soporte.
      </p>
    </Card>
  );
}

// M2-RN-006: mismo estatus de inmutabilidad que legalFirstName/
// legalLastName/professionalLicense (LockedFieldsSection, arriba) —
// editable solo en DRAFT/SUBMITTED/REJECTED, revierte a DRAFT al
// guardar en SUBMITTED/REJECTED (updateLegalFields, backend). Va por
// PATCH /doctors/me igual que las demás secciones: el controller
// enruta specialtyLicense/specialtyLicenseExpiresAt al camino legal
// por nombre de campo, sin importar qué formulario los mande.
const LEGAL_FIELD_EDITABLE_STATUSES: DoctorVerificationStatus[] = ["DRAFT", "SUBMITTED", "REJECTED"];

const specialtyLicenseFormSchema = z.object({
  specialtyLicense: z.string().trim(),
  specialtyLicenseExpiresAt: z.string().trim(),
});
type SpecialtyLicenseFormValues = z.infer<typeof specialtyLicenseFormSchema>;

function SpecialtyLicenseSection({
  doctor,
  accessToken,
  onSaved,
}: {
  doctor: DoctorProfile;
  accessToken: string;
  onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const editable = LEGAL_FIELD_EDITABLE_STATUSES.includes(doctor.verificationStatus);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<SpecialtyLicenseFormValues>({
    resolver: useZodResolver<SpecialtyLicenseFormValues>(specialtyLicenseFormSchema),
    defaultValues: {
      specialtyLicense: doctor.specialtyLicense ?? "",
      specialtyLicenseExpiresAt: doctor.specialtyLicenseExpiresAt ? doctor.specialtyLicenseExpiresAt.slice(0, 10) : "",
    },
  });

  async function onSubmit(values: SpecialtyLicenseFormValues) {
    setError(null);
    setSaved(false);
    const payload = {
      specialtyLicense: values.specialtyLicense || undefined,
      specialtyLicenseExpiresAt: values.specialtyLicenseExpiresAt || undefined,
    };
    const parsed = doctorLegalFieldsUpdateSchema
      .pick({ specialtyLicense: true, specialtyLicenseExpiresAt: true })
      .safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error);
      return;
    }
    try {
      await apiFetch("/doctors/me", { method: "PATCH", body: parsed.data, accessToken });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.especialidad.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("perfil.especialidad.explicacion")}</p>

      {!editable ? (
        <div className="mt-4">
          {doctor.specialtyLicense ? (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">{t("perfil.especialidad.titulo")}</dt>
                <dd className="text-base text-gray-900">{doctor.specialtyLicense}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">{t("perfil.especialidad.vence")}</dt>
                <dd className="text-base text-gray-900">
                  {doctor.specialtyLicenseExpiresAt
                    ? formatDateMedium(locale, doctor.specialtyLicenseExpiresAt)
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-base text-gray-500">{t("perfil.especialidad.noRegistrada")}</p>
          )}
          <p className="mt-4 text-sm text-gray-500">
            {t("perfil.verificados.noEditable")}
          </p>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper
              label={t("perfil.especialidad.numero")}
              htmlFor="specialtyLicense"
              error={form.formState.errors.specialtyLicense?.message}
            >
              <TextInput
                id="specialtyLicense"
                error={!!form.formState.errors.specialtyLicense}
                {...form.register("specialtyLicense")}
              />
            </FieldWrapper>
            <FieldWrapper
              label={t("perfil.especialidad.vencimiento")}
              htmlFor="specialtyLicenseExpiresAt"
              error={form.formState.errors.specialtyLicenseExpiresAt?.message}
            >
              <TextInput
                id="specialtyLicenseExpiresAt"
                type="date"
                error={!!form.formState.errors.specialtyLicenseExpiresAt}
                {...form.register("specialtyLicenseExpiresAt")}
              />
            </FieldWrapper>
          </div>
          {error ? <ErrorState error={error} /> : null}
          {saved && !error ? <Aviso variant="exito" title={t("perfil.profesional.guardado")} /> : null}
          <Button type="submit" isLoading={form.formState.isSubmitting} className="w-fit">
            Guardar
          </Button>
        </form>
      )}
    </Card>
  );
}

// DOC-11: photoUrl viaja como URL de texto (doctorProfileUpdateSchema
// ya lo define como z.string().url(), no como un fileKey subido) — a
// diferencia de logo/firma (BrandingSection, abajo), que sí pasan por
// FileStoragePort porque esos nunca se muestran fuera de un PDF ya
// generado. Un médico verificado necesita que su foto sea una URL de
// verdad para cuando exista el directorio público (Hallazgo #4 de la
// auditoría) — enrutarla por el mismo mecanismo privado de
// logo/firma la dejaría inservible para eso.
const professionalInfoFormSchema = z.object({
  photoUrl: z.string().trim(),
  biography: z.string().trim(),
  yearsExperience: z.string().trim(),
  languages: z.string().trim(),
  university: z.string().trim(),
});
type ProfessionalInfoFormValues = z.infer<typeof professionalInfoFormSchema>;

function ProfessionalInfoSection({
  doctor,
  accessToken,
  onSaved,
}: {
  doctor: DoctorProfile;
  accessToken: string;
  onSaved: () => void;
}) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<ProfessionalInfoFormValues>({
    resolver: useZodResolver<ProfessionalInfoFormValues>(professionalInfoFormSchema),
    defaultValues: {
      photoUrl: doctor.photoUrl ?? "",
      biography: doctor.biography ?? "",
      yearsExperience: doctor.yearsExperience !== null ? String(doctor.yearsExperience) : "",
      languages: doctor.languages.join(", "),
      university: doctor.university ?? "",
    },
  });

  async function onSubmit(values: ProfessionalInfoFormValues) {
    setError(null);
    setSaved(false);

    if (values.photoUrl && !/^https?:\/\//.test(values.photoUrl)) {
      form.setError("photoUrl", { message: t("perfil.profesional.urlCompleta") });
      return;
    }
    if (values.biography && containsContactInfo(values.biography)) {
      form.setError("biography", { message: t("perfil.profesional.biografiaSinContacto") });
      return;
    }
    let yearsExperience: number | undefined;
    if (values.yearsExperience) {
      const n = Number(values.yearsExperience);
      if (!Number.isInteger(n) || n < 0 || n > 70) {
        form.setError("yearsExperience", { message: t("perfil.profesional.aniosRango") });
        return;
      }
      yearsExperience = n;
    }

    // Omitir un campo (undefined) dentro de PATCH /doctors/me lo deja
    // sin cambios — no hay forma de "borrar" biography/university una
    // vez guardados, misma limitación que ya tiene doctorProfileUpdateSchema
    // (M2-RN-001 style: .optional() significa "no lo toques", no
    // ".nullable()"). Vaciar el campo y guardar no lo borra.
    const payload = {
      photoUrl: values.photoUrl || undefined,
      biography: values.biography || undefined,
      yearsExperience,
      university: values.university || undefined,
      languages: values.languages
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    const parsed = doctorProfileUpdateSchema
      .pick({ photoUrl: true, biography: true, yearsExperience: true, university: true, languages: true })
      .safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error);
      return;
    }

    try {
      await apiFetch("/doctors/me", { method: "PATCH", body: parsed.data, accessToken });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.profesional.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("perfil.profesional.subtitulo")}</p>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4" noValidate>
        <FieldWrapper
          label={t("perfil.profesional.foto")}
          htmlFor="photoUrl"
          hint={t("perfil.profesional.fotoAyuda")}
          error={form.formState.errors.photoUrl?.message}
        >
          <TextInput id="photoUrl" type="url" placeholder="https://..." error={!!form.formState.errors.photoUrl} {...form.register("photoUrl")} />
        </FieldWrapper>
        <FieldWrapper
          label={t("perfil.profesional.biografia")}
          htmlFor="biography"
          hint={t("perfil.profesional.biografiaAyuda")}
          error={form.formState.errors.biography?.message}
        >
          <Textarea id="biography" rows={5} error={!!form.formState.errors.biography} {...form.register("biography")} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper
            label={t("perfil.profesional.aniosExperiencia")}
            htmlFor="yearsExperience"
            error={form.formState.errors.yearsExperience?.message}
          >
            <TextInput
              id="yearsExperience"
              type="number"
              min={0}
              max={70}
              error={!!form.formState.errors.yearsExperience}
              {...form.register("yearsExperience")}
            />
          </FieldWrapper>
          <FieldWrapper label={t("perfil.profesional.universidad")} htmlFor="university" error={form.formState.errors.university?.message}>
            <TextInput id="university" error={!!form.formState.errors.university} {...form.register("university")} />
          </FieldWrapper>
        </div>
        <FieldWrapper
          label={t("perfil.profesional.idiomas")}
          htmlFor="languages"
          hint={t("perfil.profesional.idiomasAyuda")}
          error={form.formState.errors.languages?.message}
        >
          <TextInput id="languages" error={!!form.formState.errors.languages} {...form.register("languages")} />
        </FieldWrapper>
        {error ? <ErrorState error={error} /> : null}
        {saved && !error ? <Aviso variant="exito" title={t("perfil.profesional.guardado")} /> : null}
        <Button type="submit" isLoading={form.formState.isSubmitting} className="w-fit">
          Guardar
        </Button>
      </form>
    </Card>
  );
}

function LocationsSection({
  accessToken,
  locations,
  error,
  onReload,
}: {
  accessToken: string;
  locations: PracticeLocation[] | null;
  error: unknown;
  onReload: () => void;
}) {
  const t = useT();
  const [createError, setCreateError] = useState<unknown>(null);
  const form = useForm<PracticeLocationInput>({
    resolver: useZodResolver<PracticeLocationInput>(practiceLocationSchema),
    defaultValues: { name: "", isPrimary: false },
  });

  async function onSubmit(values: PracticeLocationInput) {
    setCreateError(null);
    try {
      await apiFetch("/doctors/me/locations", { method: "POST", body: values, accessToken });
      form.reset({ name: "", isPrimary: false });
      onReload();
    } catch (err) {
      setCreateError(err);
    }
  }

  async function onDelete(id: string) {
    setCreateError(null);
    try {
      await apiFetch(`/doctors/me/locations/${id}`, { method: "DELETE", accessToken });
      onReload();
    } catch (err) {
      setCreateError(err);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.consultorios.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("perfil.consultorios.subtitulo")}</p>

      <div className="mt-4">
        {locations === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} onRetry={onReload} /> : null}
        {locations && locations.length === 0 ? (
          <EmptyState title={t("perfil.consultorios.sinConsultorios")} description={t("perfil.consultorios.sinConsultoriosAyuda")} />
        ) : null}
        {locations && locations.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {locations.map((loc) => (
              <li key={loc.id} className="flex items-center justify-between gap-4 rounded-md border border-gray-300 p-3">
                <div>
                  <p className="text-base text-gray-900">
                    {loc.name}
                    {loc.isPrimary ? <span className="ml-2 text-sm font-medium text-brand-700">{t("perfil.consultorios.principal")}</span> : null}
                  </p>
                  <p className="text-sm text-gray-500">
                    {[loc.addressStreet, loc.addressColonia, loc.addressMunicipality].filter(Boolean).join(", ") || t("perfil.consultorios.sinDireccion")}
                  </p>
                </div>
                <button type="button" onClick={() => onDelete(loc.id)} className="min-h-[44px] text-sm font-medium text-danger-600 underline">
                  {t("perfil.consultorios.eliminar")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4 border-t border-gray-300 pt-6" noValidate>
        <FieldWrapper label={t("perfil.consultorios.nombre")} htmlFor="loc-name" error={form.formState.errors.name?.message}>
          <TextInput id="loc-name" error={!!form.formState.errors.name} {...form.register("name")} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("perfil.consultorios.calle")} htmlFor="loc-street" error={form.formState.errors.addressStreet?.message}>
            <TextInput id="loc-street" error={!!form.formState.errors.addressStreet} {...form.register("addressStreet")} />
          </FieldWrapper>
          <FieldWrapper label={t("perfil.consultorios.colonia")} htmlFor="loc-colonia" error={form.formState.errors.addressColonia?.message}>
            <TextInput id="loc-colonia" error={!!form.formState.errors.addressColonia} {...form.register("addressColonia")} />
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FieldWrapper label={t("perfil.consultorios.municipio")} htmlFor="loc-municipality" error={form.formState.errors.addressMunicipality?.message}>
            <TextInput id="loc-municipality" error={!!form.formState.errors.addressMunicipality} {...form.register("addressMunicipality")} />
          </FieldWrapper>
          <FieldWrapper label={t("perfil.consultorios.estado")} htmlFor="loc-state" error={form.formState.errors.addressState?.message}>
            <TextInput id="loc-state" error={!!form.formState.errors.addressState} {...form.register("addressState")} />
          </FieldWrapper>
          <FieldWrapper label={t("perfil.consultorios.codigoPostal")} htmlFor="loc-postal" error={form.formState.errors.addressPostalCode?.message}>
            <TextInput id="loc-postal" error={!!form.formState.errors.addressPostalCode} {...form.register("addressPostalCode")} />
          </FieldWrapper>
        </div>
        <FieldWrapper label={t("perfil.consultorios.telefono")} htmlFor="loc-phone" error={form.formState.errors.phone?.message}>
          <TextInput id="loc-phone" error={!!form.formState.errors.phone} {...form.register("phone")} />
        </FieldWrapper>
        <label className="flex items-center gap-2 text-base text-gray-900">
          <input type="checkbox" className="h-5 w-5" {...form.register("isPrimary")} />
          {t("perfil.consultorios.esPrincipal")}
        </label>

        {createError ? <ErrorState error={createError} /> : null}

        <Button type="submit" isLoading={form.formState.isSubmitting}>
          {t("perfil.consultorios.agregar")}
        </Button>
      </form>
    </Card>
  );
}

const contactSchema = doctorProfileUpdateSchema.pick({ professionalPhone: true, professionalEmail: true });
type ContactInput = { professionalPhone?: string; professionalEmail?: string };

function ContactSection({ doctor, accessToken, onSaved }: { doctor: DoctorProfile; accessToken: string; onSaved: () => void }) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<ContactInput>({
    resolver: useZodResolver<ContactInput>(contactSchema),
    defaultValues: { professionalPhone: doctor.professionalPhone ?? "", professionalEmail: doctor.professionalEmail ?? "" },
  });

  async function onSubmit(values: ContactInput) {
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/doctors/me", { method: "PATCH", body: values, accessToken });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.contacto.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("perfil.contacto.subtitulo")}</p>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("perfil.contacto.telefono")} htmlFor="professionalPhone" hint={t("perfil.contacto.telefonoAyuda")} error={form.formState.errors.professionalPhone?.message}>
            <TextInput
              id="professionalPhone"
              type="tel"
              placeholder="+523312345678"
              error={!!form.formState.errors.professionalPhone}
              {...form.register("professionalPhone")}
            />
          </FieldWrapper>
          <FieldWrapper label={t("perfil.contacto.correo")} htmlFor="professionalEmail" error={form.formState.errors.professionalEmail?.message}>
            <TextInput
              id="professionalEmail"
              type="email"
              error={!!form.formState.errors.professionalEmail}
              {...form.register("professionalEmail")}
            />
          </FieldWrapper>
        </div>
        {error ? <ErrorState error={error} /> : null}
        {saved && !error ? <Aviso variant="exito" title={t("perfil.profesional.guardado")} /> : null}
        <Button type="submit" isLoading={form.formState.isSubmitting} className="w-fit">
          Guardar
        </Button>
      </form>
    </Card>
  );
}

const headerSchema = doctorProfileUpdateSchema.pick({ letterheadPhrase: true });
type HeaderInput = { letterheadPhrase?: string };

function BrandingSection({
  doctor,
  accessToken,
  onSaved,
  specialtyName,
  primaryLocation,
}: {
  doctor: DoctorProfile;
  accessToken: string;
  onSaved: () => void;
  specialtyName: string | null;
  primaryLocation: PracticeLocation | null;
}) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [signatureSrc, setSignatureSrc] = useState<string | null>(null);

  const form = useForm<HeaderInput>({
    resolver: useZodResolver<HeaderInput>(headerSchema),
    defaultValues: { letterheadPhrase: doctor.letterheadPhrase ?? "" },
  });

  useEffect(() => {
    if (doctor.logoUrl) {
      apiFetchBlob("/doctors/me/branding-assets/logo", { accessToken }).then((blob) => {
        if (blob) setLogoSrc(URL.createObjectURL(blob));
      });
    }
    if (doctor.signatureImageUrl) {
      apiFetchBlob("/doctors/me/branding-assets/signature", { accessToken }).then((blob) => {
        if (blob) setSignatureSrc(URL.createObjectURL(blob));
      });
    }
  }, [doctor.logoUrl, doctor.signatureImageUrl, accessToken]);

  async function onSubmit(values: HeaderInput) {
    setError(null);
    try {
      await apiFetch("/doctors/me", { method: "PATCH", body: values, accessToken });
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  async function uploadLogo(file: File) {
    await apiUpload("/doctors/me/branding-assets?kind=logo", file, { accessToken });
    setLogoSrc(URL.createObjectURL(file));
    onSaved();
  }

  async function uploadSignature(file: File) {
    await apiUpload("/doctors/me/branding-assets?kind=signature", file, { accessToken });
    setSignatureSrc(URL.createObjectURL(file));
    onSaved();
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.marca.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("perfil.marca.subtitulo")}</p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4" noValidate>
        <FieldWrapper
          label={t("perfil.marca.frase")}
          htmlFor="letterheadPhrase"
          error={form.formState.errors.letterheadPhrase?.message}
        >
          <TextInput id="letterheadPhrase" error={!!form.formState.errors.letterheadPhrase} {...form.register("letterheadPhrase")} />
        </FieldWrapper>
        {error ? <ErrorState error={error} /> : null}
        <Button type="submit" isLoading={form.formState.isSubmitting} className="w-fit">
          {t("perfil.marca.guardarFrase")}
        </Button>
      </form>

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-gray-300 pt-6">
        <FileUpload label={t("perfil.marca.logo")} accept="image/png,image/jpeg" previewSrc={logoSrc} onUpload={uploadLogo} />
        <FileUpload label={t("perfil.marca.firma")} accept="image/png,image/jpeg" previewSrc={signatureSrc} onUpload={uploadSignature} />
      </div>

      <div className="mt-6 border-t border-gray-300 pt-6">
        <p className="text-sm font-medium text-gray-700">{t("perfil.marca.vistaPrevia")}</p>
        <div className="mt-2 flex items-center gap-4 rounded-md border border-gray-300 p-4">
          {logoSrc ? (
            <img src={logoSrc} alt={t("perfil.marca.logo")} className="h-16 w-16 object-contain" />
          ) : null}
          <div>
            <p className="font-heading text-lg text-brand-900">
              {doctor.legalFirstName} {doctor.legalLastName}
            </p>
            <p className="text-sm text-gray-700">
              {specialtyName ?? t("perfil.marca.sinEspecialidad")} · {t("perfil.marca.cedulaAbreviada")} {doctor.professionalLicense}
            </p>
            {doctor.letterheadPhrase && !logoSrc ? <p className="text-sm text-gray-700">{doctor.letterheadPhrase}</p> : null}
            {primaryLocation ? (
              <p className="text-sm text-gray-500">
                {[primaryLocation.addressStreet, primaryLocation.addressMunicipality].filter(Boolean).join(", ")}
                {doctor.professionalPhone ? ` · ${doctor.professionalPhone}` : ""}
              </p>
            ) : null}
          </div>
          {signatureSrc ? (
            <img src={signatureSrc} alt={t("perfil.marca.firmaAlt")} className="ml-auto h-12 w-24 object-contain" />
          ) : null}
        </div>
      </div>
    </Card>
  );
}

interface PendingAssistantInvitation {
  id: string;
  email: string;
  expiresAt: string;
}
interface AcceptedAssistant {
  id: string;
  email: string;
  acceptedAt: string;
}
interface AssistantsList {
  pending: PendingAssistantInvitation[];
  accepted: AcceptedAssistant[];
}
type InviteFormValues = { email: string };

// DOC-16: invite()/accept() ya existían (M1-RN-008) pero no había
// dónde verlos — la auditoría de M2 los dio por "backend completo"
// sin notar que faltaba list(). GET /doctors/me/assistants es nuevo
// (ver assistant-invitation.service.ts).
function AssistantsSection({ accessToken }: { accessToken: string }) {
  const { t, locale } = useI18n();
  const [list, setList] = useState<AssistantsList | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [inviteError, setInviteError] = useState<unknown>(null);
  const [invited, setInvited] = useState<string | null>(null);

  const form = useForm<InviteFormValues>({
    resolver: useZodResolver<InviteFormValues>(assistantInviteSchema),
    defaultValues: { email: "" },
  });

  const load = useCallback(() => {
    setListError(null);
    apiFetch<AssistantsList>("/doctors/me/assistants", { accessToken })
      .then(setList)
      .catch((err: unknown) => setListError(err));
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function onInvite(values: InviteFormValues) {
    setInviteError(null);
    setInvited(null);
    try {
      await apiFetch("/doctors/me/assistants/invite", { method: "POST", body: values, accessToken });
      setInvited(values.email);
      form.reset({ email: "" });
      load();
    } catch (err) {
      setInviteError(err);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("perfil.asistentes.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("perfil.asistentes.explicacion")}</p>

      <form onSubmit={form.handleSubmit(onInvite)} className="mt-4 flex flex-wrap items-end gap-3" noValidate>
        <FieldWrapper
          label={t("perfil.asistentes.invitarPorCorreo")}
          htmlFor="assistant-email"
          hint={t("perfil.asistentes.invitarAyuda")}
          error={form.formState.errors.email?.message}
        >
          <TextInput
            id="assistant-email"
            type="email"
            className="min-w-[280px]"
            error={!!form.formState.errors.email}
            {...form.register("email")}
          />
        </FieldWrapper>
        <Button type="submit" isLoading={form.formState.isSubmitting}>
          {t("perfil.asistentes.invitar")}
        </Button>
      </form>
      {inviteError ? (
        <div className="mt-3">
          <ErrorState error={inviteError} />
        </div>
      ) : null}
      {invited && !inviteError ? (
        <div className="mt-3">
          <Aviso variant="exito" title={t("perfil.asistentes.invitacionEnviada", { correo: invited })} />
        </div>
      ) : null}

      <div className="mt-6 border-t border-gray-300 pt-6">
        {list === null && !listError ? <LoadingState /> : null}
        {listError ? <ErrorState error={listError} onRetry={load} /> : null}
        {list && list.pending.length === 0 && list.accepted.length === 0 ? (
          <EmptyState title={t("perfil.asistentes.sinAsistentes")} description={t("perfil.asistentes.sinAsistentesAyuda")} />
        ) : null}

        {list && list.accepted.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-gray-700">{t("perfil.asistentes.activos")}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {list.accepted.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-md border border-gray-300 p-3 text-base text-gray-900">
                  {a.email}
                  <span className="text-sm text-gray-500">{t("perfil.asistentes.desde", { fecha: formatDateMedium(locale, a.acceptedAt) })}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {list && list.pending.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700">{t("perfil.asistentes.pendientes")}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {list.pending.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-md border border-gray-300 p-3 text-base text-gray-900">
                  {p.email}
                  <span className="text-sm text-gray-500">{t("perfil.asistentes.expira", { fecha: formatDateMedium(locale, p.expiresAt) })}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
