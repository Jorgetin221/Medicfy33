"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { registerDoctorSchema, emailVerifySchema, type RegisterDoctorInput, type EmailVerifyInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useSpecialties } from "@/lib/use-specialties";
import { useSpecialtyName } from "@/lib/i18n/catalog";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";

// Hook en vez de constante de módulo: el texto del panel depende del
// idioma, que solo se conoce ya dentro del árbol de React.
function usePanelCopy() {
  const t = useT();
  return {
    panelTitle: t("auth.registroMedico.panelTitulo"),
    panelBody: t("auth.registroMedico.panelCuerpo"),
    // v2.4: "/" ahora es el marketplace de pacientes — el logo de esta
    // pantalla debe volver a la página de reclutamiento de médicos, no
    // ahí.
    homeHref: "/para-medicos",
  };
}

// PUB-03. M1-RN-002: registro de médico, queda en verification_status
// = SUBMITTED tras verificar su email — la verificación de cédula es
// manual por admin (M2), no ocurre en esta pantalla.
export default function RegistroMedicoPage() {
  const router = useRouter();
  const t = useT();
  const PANEL_COPY = usePanelCopy();
  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [userId, setUserId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const { specialties, isLoading: specialtiesLoading, error: specialtiesError } = useSpecialties();
  const specialtyName = useSpecialtyName();

  const form = useForm<RegisterDoctorInput>({ resolver: useZodResolver<RegisterDoctorInput>(registerDoctorSchema) });

  async function onSubmit(values: RegisterDoctorInput) {
    setSubmitError(null);
    try {
      const res = await apiFetch<{ userId: string }>("/auth/register/doctor", { method: "POST", body: values });
      setUserId(res.userId);
      setStep("verify");
    } catch (error) {
      setSubmitError(error);
    }
  }

  if (step === "verify" && userId) {
    return <VerifyEmailStep userId={userId} onVerified={() => setStep("done")} />;
  }

  if (step === "done") {
    return (
      <AuthLayout {...PANEL_COPY}>
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.registroMedico.listoTitulo")}</h1>
          <Aviso variant="exito" title={t("auth.registroMedico.listoAviso")}>
            {t("auth.registroMedico.listoCuerpo")}
          </Aviso>
          <Button onClick={() => router.push("/login")} className="mt-2 w-full">
            {t("auth.registroMedico.irALogin")}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout {...PANEL_COPY}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.registroMedico.titulo")}</h1>
          <p className="mt-2 text-base text-gray-500">{t("auth.registroMedico.subtitulo")}</p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <FieldWrapper label={t("auth.campos.correo")} htmlFor="email" error={form.formState.errors.email?.message}>
            <TextInput id="email" type="email" autoComplete="email" error={!!form.formState.errors.email} {...form.register("email")} />
          </FieldWrapper>

          <FieldWrapper
            label={t("auth.campos.contrasena")}
            htmlFor="password"
            error={form.formState.errors.password?.message}
            hint={t("auth.campos.pistaContrasena")}
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              error={!!form.formState.errors.password}
              {...form.register("password")}
            />
          </FieldWrapper>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label={t("auth.campos.nombres")} htmlFor="legalFirstName" error={form.formState.errors.legalFirstName?.message}>
              <TextInput
                id="legalFirstName"
                autoComplete="given-name"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                error={!!form.formState.errors.legalFirstName}
                {...form.register("legalFirstName")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("auth.campos.apellidos")} htmlFor="legalLastName" error={form.formState.errors.legalLastName?.message}>
              <TextInput
                id="legalLastName"
                autoComplete="family-name"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                error={!!form.formState.errors.legalLastName}
                {...form.register("legalLastName")}
              />
            </FieldWrapper>
          </div>

          <FieldWrapper
            label={t("auth.campos.cedula")}
            htmlFor="professionalLicense"
            error={form.formState.errors.professionalLicense?.message}
          >
            <TextInput
              id="professionalLicense"
              error={!!form.formState.errors.professionalLicense}
              {...form.register("professionalLicense")}
            />
          </FieldWrapper>

          <FieldWrapper
            label={t("auth.campos.especialidad")}
            htmlFor="primarySpecialtyCode"
            error={form.formState.errors.primarySpecialtyCode?.message ?? (specialtiesError ? t("auth.campos.catalogoNoCargo") : undefined)}
          >
            <SelectInput
              id="primarySpecialtyCode"
              disabled={specialtiesLoading}
              error={!!form.formState.errors.primarySpecialtyCode}
              {...form.register("primarySpecialtyCode")}
            >
              <option value="">{specialtiesLoading ? t("common.estados.cargando") : t("auth.campos.seleccionaEspecialidad")}</option>
              {specialties.map((s) => (
                <option key={s.code} value={s.code}>
                  {specialtyName(s.code, s.nameEs)}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>

          <FieldWrapper label={t("auth.campos.telefono")} htmlFor="phone" error={form.formState.errors.phone?.message} hint={t("auth.campos.pistaTelefono")}>
            <TextInput
              id="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="3312345678"
              error={!!form.formState.errors.phone}
              {...form.register("phone", {
                // El +52 es obligatorio para el backend (E.164, spec M1)
                // pero no hace falta que el médico lo escriba — se
                // antepone aquí antes de validar/enviar.
                setValueAs: (v: string) => {
                  const digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
                  return digits ? `+52${digits}` : "";
                },
              })}
            />
          </FieldWrapper>

          {submitError ? <ErrorState error={submitError} /> : null}

          <Button type="submit" isLoading={form.formState.isSubmitting} className="mt-1 w-full">
            {t("auth.registroMedico.crearCuenta")}
          </Button>
        </form>

        <p className="text-center text-base text-gray-700">
          {t("auth.registroMedico.yaTienesCuenta")}{" "}
          <Link href="/login" className="font-medium text-brand-700 underline">
            {t("auth.registroMedico.iniciaSesion")}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function VerifyEmailStep({ userId, onVerified }: { userId: string; onVerified: () => void }) {
  const t = useT();
  const PANEL_COPY = usePanelCopy();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Omit<EmailVerifyInput, "userId">>({
    resolver: useZodResolver<Omit<EmailVerifyInput, "userId">>(emailVerifySchema.omit({ userId: true })),
    defaultValues: { code: "" },
  });

  async function onSubmit(values: Omit<EmailVerifyInput, "userId">) {
    setError(null);
    try {
      await apiFetch("/auth/email/verify", { method: "POST", body: { userId, ...values } });
      onVerified();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <AuthLayout {...PANEL_COPY}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.verificarCorreo.titulo")}</h1>
          <p className="mt-2 text-base text-gray-500">{t("auth.verificarCorreo.subtitulo")}</p>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <FieldWrapper label={t("auth.campos.codigo")} htmlFor="code" error={form.formState.errors.code?.message}>
            <TextInput
              id="code"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              error={!!form.formState.errors.code}
              {...form.register("code")}
            />
          </FieldWrapper>
          {error ? <ErrorState error={error} /> : null}
          <Button type="submit" isLoading={form.formState.isSubmitting} className="mt-1 w-full">
            {t("auth.verificarCorreo.verificar")}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
