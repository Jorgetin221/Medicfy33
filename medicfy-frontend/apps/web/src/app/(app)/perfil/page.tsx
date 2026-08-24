"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  practiceLocationSchema,
  doctorProfileUpdateSchema,
  type PracticeLocationInput,
} from "@medicfy/contracts";
import { apiFetch, apiUpload, apiFetchBlob } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useDoctorProfile, type DoctorProfile, type DoctorVerificationStatus } from "@/lib/use-doctor-profile";
import { useSpecialties } from "@/lib/use-specialties";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { FileUpload } from "@/components/ui/file-upload";

interface PracticeLocation extends PracticeLocationInput {
  id: string;
}

interface DoctorDocument {
  id: string;
  docType: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  uploadedAt: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  CEDULA_PROFESIONAL: "Cédula profesional",
  CEDULA_ESPECIALIDAD: "Cédula de especialidad",
  INE: "Identificación oficial",
  CV: "Currículum",
  CERTIFICADO_CONSEJO: "Certificado de consejo",
  COMPROBANTE_DOMICILIO: "Comprobante de domicilio",
};
const REVIEW_STATUS_LABELS: Record<string, string> = { PENDING: "En revisión", APPROVED: "Aprobado", REJECTED: "Rechazado" };

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
  const { doctor, isLoading, error, reload } = useDoctorProfile(accessToken);
  const { specialties } = useSpecialties();
  const [locations, setLocations] = useState<PracticeLocation[] | null>(null);
  const [locationsError, setLocationsError] = useState<unknown>(null);

  const loadLocations = useCallback(async () => {
    setLocationsError(null);
    try {
      setLocations(await apiFetch<PracticeLocation[]>("/doctors/me/locations", { accessToken }));
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
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Mi perfil</h1>
        <p className="text-base text-gray-500">Así se identifica tu consultorio en cada documento que emitas.</p>
      </div>

      <VerificationSection doctor={doctor} accessToken={accessToken} />
      <LockedFieldsSection doctor={doctor} specialtyName={specialtyName} />
      <LocationsSection accessToken={accessToken} locations={locations} error={locationsError} onReload={loadLocations} />
      <ContactSection doctor={doctor} accessToken={accessToken} onSaved={reload} />
      <BrandingSection doctor={doctor} accessToken={accessToken} onSaved={reload} specialtyName={specialtyName} primaryLocation={primaryLocation} />
    </main>
  );
}

const VERIFICATION_COPY: Record<DoctorVerificationStatus, { variant: "info" | "exito" | "advertencia"; title: string }> = {
  DRAFT: { variant: "info", title: "Pendiente de documentos" },
  SUBMITTED: { variant: "info", title: "Pendiente de documentos" },
  IN_REVIEW: { variant: "info", title: "En revisión" },
  VERIFIED: { variant: "exito", title: "Verificado" },
  VERIFIED_SPECIALTY_UNCONFIRMED: { variant: "exito", title: "Verificado con especialidad no confirmada" },
  REJECTED: { variant: "advertencia", title: "Rechazado" },
  SUSPENDED: { variant: "advertencia", title: "Suspendido" },
};

function VerificationSection({ doctor, accessToken }: { doctor: DoctorProfile; accessToken: string }) {
  const [documents, setDocuments] = useState<DoctorDocument[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    apiFetch<DoctorDocument[]>("/doctors/me/documents", { accessToken })
      .then(setDocuments)
      .catch((err: unknown) => setError(err));
  }, [accessToken]);

  const copy = VERIFICATION_COPY[doctor.verificationStatus];

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">Estado de verificación</h2>
      <div className="mt-4">
        <Aviso variant={copy.variant} title={copy.title}>
          {doctor.verificationStatus === "SUBMITTED" || doctor.verificationStatus === "DRAFT"
            ? "Puedes configurar tu perfil y tu agenda mientras revisamos tus documentos."
            : null}
          {doctor.verificationStatus === "IN_REVIEW" ? "Puedes seguir configurando tu perfil y tu agenda." : null}
          {doctor.verificationStatus === "REJECTED" && doctor.verificationNotes ? <>Motivo: {doctor.verificationNotes}</> : null}
          {doctor.verificationStatus === "REJECTED" ? " Corrige tus datos y vuelve a cargar tus documentos; no hay límite de intentos." : null}
          {doctor.verificationStatus === "VERIFIED" ? "Puedes usar Medicfy sin restricciones." : null}
          {doctor.verificationStatus === "VERIFIED_SPECIALTY_UNCONFIRMED"
            ? "Tu cédula profesional está verificada. Tu especialidad todavía no se muestra como verificada en tu perfil."
            : null}
          {doctor.verificationStatus === "SUSPENDED" ? "Tu cuenta está suspendida. Contacta a soporte." : null}
        </Aviso>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-gray-700">Documentos cargados</p>
        {documents === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} /> : null}
        {documents && documents.length === 0 ? <EmptyState title="Sin documentos cargados" /> : null}
        {documents && documents.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between rounded-md border border-gray-300 p-3 text-base text-gray-900">
                {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                <span className="text-sm text-gray-500">{REVIEW_STATUS_LABELS[doc.reviewStatus]}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

function LockedFieldsSection({ doctor, specialtyName }: { doctor: DoctorProfile; specialtyName: string | null }) {
  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">Datos verificados</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-gray-500">Nombre legal</dt>
          <dd className="text-base text-gray-900">
            {doctor.legalFirstName} {doctor.legalLastName}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Cédula profesional</dt>
          <dd className="text-base text-gray-900">{doctor.professionalLicense}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Especialidad</dt>
          <dd className="text-base text-gray-900">{specialtyName ?? "—"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-gray-500">
        Estos campos no se pueden modificar una vez verificada la cuenta. Contacta a soporte.
      </p>
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
  const [createError, setCreateError] = useState<unknown>(null);
  const form = useForm<PracticeLocationInput>({
    resolver: zodResolver(practiceLocationSchema),
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
      <h2 className="font-heading text-xl text-brand-900">Domicilio profesional</h2>
      <p className="text-sm text-gray-500">Admite varios consultorios. Se necesita al menos uno para recibir citas.</p>

      <div className="mt-4">
        {locations === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} onRetry={onReload} /> : null}
        {locations && locations.length === 0 ? (
          <EmptyState title="Sin consultorios registrados" description="Agrega tu primer consultorio abajo." />
        ) : null}
        {locations && locations.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {locations.map((loc) => (
              <li key={loc.id} className="flex items-center justify-between gap-4 rounded-md border border-gray-300 p-3">
                <div>
                  <p className="text-base text-gray-900">
                    {loc.name}
                    {loc.isPrimary ? <span className="ml-2 text-sm font-medium text-brand-700">Principal</span> : null}
                  </p>
                  <p className="text-sm text-gray-500">
                    {[loc.addressStreet, loc.addressColonia, loc.addressMunicipality].filter(Boolean).join(", ") || "Sin dirección"}
                  </p>
                </div>
                <button type="button" onClick={() => onDelete(loc.id)} className="min-h-[44px] text-sm font-medium text-danger-600 underline">
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4 border-t border-gray-200 pt-6" noValidate>
        <FieldWrapper label="Nombre del consultorio" htmlFor="loc-name" error={form.formState.errors.name?.message}>
          <TextInput id="loc-name" error={!!form.formState.errors.name} {...form.register("name")} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label="Calle y número" htmlFor="loc-street" error={form.formState.errors.addressStreet?.message}>
            <TextInput id="loc-street" error={!!form.formState.errors.addressStreet} {...form.register("addressStreet")} />
          </FieldWrapper>
          <FieldWrapper label="Colonia" htmlFor="loc-colonia" error={form.formState.errors.addressColonia?.message}>
            <TextInput id="loc-colonia" error={!!form.formState.errors.addressColonia} {...form.register("addressColonia")} />
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FieldWrapper label="Municipio" htmlFor="loc-municipality" error={form.formState.errors.addressMunicipality?.message}>
            <TextInput id="loc-municipality" error={!!form.formState.errors.addressMunicipality} {...form.register("addressMunicipality")} />
          </FieldWrapper>
          <FieldWrapper label="Estado" htmlFor="loc-state" error={form.formState.errors.addressState?.message}>
            <TextInput id="loc-state" error={!!form.formState.errors.addressState} {...form.register("addressState")} />
          </FieldWrapper>
          <FieldWrapper label="Código postal" htmlFor="loc-postal" error={form.formState.errors.addressPostalCode?.message}>
            <TextInput id="loc-postal" error={!!form.formState.errors.addressPostalCode} {...form.register("addressPostalCode")} />
          </FieldWrapper>
        </div>
        <FieldWrapper label="Teléfono del consultorio" htmlFor="loc-phone" error={form.formState.errors.phone?.message}>
          <TextInput id="loc-phone" error={!!form.formState.errors.phone} {...form.register("phone")} />
        </FieldWrapper>
        <label className="flex items-center gap-2 text-base text-gray-900">
          <input type="checkbox" className="h-5 w-5" {...form.register("isPrimary")} />
          Es mi consultorio principal
        </label>

        {createError ? <ErrorState error={createError} /> : null}

        <Button type="submit" isLoading={form.formState.isSubmitting}>
          Agregar consultorio
        </Button>
      </form>
    </Card>
  );
}

const contactSchema = doctorProfileUpdateSchema.pick({ professionalPhone: true, professionalEmail: true });
type ContactInput = { professionalPhone?: string; professionalEmail?: string };

function ContactSection({ doctor, accessToken, onSaved }: { doctor: DoctorProfile; accessToken: string; onSaved: () => void }) {
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
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
      <h2 className="font-heading text-xl text-brand-900">Datos de contacto profesional</h2>
      <p className="text-sm text-gray-500">Distintos del correo con el que inicias sesión — estos se muestran en tus documentos.</p>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label="Teléfono" htmlFor="professionalPhone" hint="+52 y 10 dígitos." error={form.formState.errors.professionalPhone?.message}>
            <TextInput
              id="professionalPhone"
              type="tel"
              placeholder="+523312345678"
              error={!!form.formState.errors.professionalPhone}
              {...form.register("professionalPhone")}
            />
          </FieldWrapper>
          <FieldWrapper label="Correo profesional" htmlFor="professionalEmail" error={form.formState.errors.professionalEmail?.message}>
            <TextInput
              id="professionalEmail"
              type="email"
              error={!!form.formState.errors.professionalEmail}
              {...form.register("professionalEmail")}
            />
          </FieldWrapper>
        </div>
        {error ? <ErrorState error={error} /> : null}
        {saved && !error ? <Aviso variant="exito" title="Guardado" /> : null}
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
  const [error, setError] = useState<unknown>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [signatureSrc, setSignatureSrc] = useState<string | null>(null);

  const form = useForm<HeaderInput>({
    resolver: zodResolver(headerSchema),
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
      <h2 className="font-heading text-xl text-brand-900">Encabezado, logo y firma visual</h2>
      <p className="text-sm text-gray-500">Así se verá el encabezado de tus documentos. La firma es solo visual — no da validez legal.</p>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 flex flex-col gap-4" noValidate>
        <FieldWrapper
          label="Frase de encabezado (si no usas logo)"
          htmlFor="letterheadPhrase"
          error={form.formState.errors.letterheadPhrase?.message}
        >
          <TextInput id="letterheadPhrase" error={!!form.formState.errors.letterheadPhrase} {...form.register("letterheadPhrase")} />
        </FieldWrapper>
        {error ? <ErrorState error={error} /> : null}
        <Button type="submit" isLoading={form.formState.isSubmitting} className="w-fit">
          Guardar frase
        </Button>
      </form>

      <div className="mt-6 grid grid-cols-2 gap-6 border-t border-gray-200 pt-6">
        <FileUpload label="Logo" accept="image/png,image/jpeg" previewSrc={logoSrc} onUpload={uploadLogo} />
        <FileUpload label="Firma visual" accept="image/png,image/jpeg" previewSrc={signatureSrc} onUpload={uploadSignature} />
      </div>

      <div className="mt-6 border-t border-gray-200 pt-6">
        <p className="text-sm font-medium text-gray-700">Vista previa del encabezado</p>
        <div className="mt-2 flex items-center gap-4 rounded-md border border-gray-300 p-4">
          {logoSrc ? (
            <img src={logoSrc} alt="Logo" className="h-16 w-16 object-contain" />
          ) : null}
          <div>
            <p className="font-heading text-lg text-brand-900">
              {doctor.legalFirstName} {doctor.legalLastName}
            </p>
            <p className="text-sm text-gray-700">
              {specialtyName ?? "Especialidad no registrada"} · Cédula {doctor.professionalLicense}
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
            <img src={signatureSrc} alt="Firma" className="ml-auto h-12 w-24 object-contain" />
          ) : null}
        </div>
      </div>
    </Card>
  );
}
