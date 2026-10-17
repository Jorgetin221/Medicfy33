"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { registerPatientSchema, type RegisterPatientInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { AuthLayout } from "@/components/auth-layout";
import { VerifyEmailStep } from "@/components/verify-email-step";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { DateInput } from "@/components/ui/date-input";
import { toIsoDateKey } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";

// Hook en vez de constante de módulo: el texto del panel depende del
// idioma, que solo se conoce ya dentro del árbol de React.
function usePanelCopy() {
  const t = useT();
  return {
    panelTitle: t("auth.registroPaciente.panelTitulo"),
    panelBody: t("auth.registroPaciente.panelCuerpo"),
  };
}

// M5-RN-009 (spec §7, v2.3): registro de paciente con cuenta propia —
// hoy solo creaba el `user`; ahora también crea la fila `patients`
// (mismos campos mínimos que M5-RN-008 ya pedía). Exige mayoría de
// edad (registerPatientSchema.superRefine); un menor sigue dado de
// alta por un adulto vía el flujo del médico.
export default function RegistroPacientePage() {
  const router = useRouter();
  const t = useT();
  const PANEL_COPY = usePanelCopy();
  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [userId, setUserId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // Sin defaultValues.consents: son casillas sin marcar por
  // naturaleza (HTML ya las inicia en false) — declarar aquí
  // `false` chocaría con el tipo `true` literal que exige
  // registerPatientSchema para las dos obligatorias.
  const form = useForm<RegisterPatientInput>({ resolver: useZodResolver<RegisterPatientInput>(registerPatientSchema) });

  async function onSubmit(values: RegisterPatientInput) {
    setSubmitError(null);
    try {
      const res = await apiFetch<{ userId: string }>("/auth/register/patient", { method: "POST", body: values });
      setUserId(res.userId);
      setStep("verify");
    } catch (error) {
      setSubmitError(error);
    }
  }

  if (step === "verify" && userId) {
    return <VerifyEmailStep userId={userId} panelCopy={PANEL_COPY} onVerified={() => setStep("done")} />;
  }

  if (step === "done") {
    return (
      <AuthLayout {...PANEL_COPY}>
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.registroMedico.listoTitulo")}</h1>
          <Aviso variant="exito" title={t("auth.registroMedico.listoAviso")}>
            {t("auth.registroPaciente.listoCuerpo")}
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
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.registroPaciente.titulo")}</h1>
          <p className="mt-2 text-base text-gray-500">{t("auth.registroPaciente.subtitulo")}</p>
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
            <FieldWrapper label={t("auth.campos.nombres")} htmlFor="firstName" error={form.formState.errors.firstName?.message}>
              <TextInput
                id="firstName"
                autoComplete="given-name"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                error={!!form.formState.errors.firstName}
                {...form.register("firstName")}
              />
            </FieldWrapper>
            <FieldWrapper label={t("auth.campos.apellidoPaterno")} htmlFor="lastNamePaternal" error={form.formState.errors.lastNamePaternal?.message}>
              <TextInput
                id="lastNamePaternal"
                autoComplete="family-name"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                error={!!form.formState.errors.lastNamePaternal}
                {...form.register("lastNamePaternal")}
              />
            </FieldWrapper>
          </div>

          <FieldWrapper label={t("auth.campos.apellidoMaterno")} htmlFor="lastNameMaternal" error={form.formState.errors.lastNameMaternal?.message}>
            <TextInput
              id="lastNameMaternal"
              autoComplete="additional-name"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              error={!!form.formState.errors.lastNameMaternal}
              {...form.register("lastNameMaternal")}
            />
          </FieldWrapper>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper
              label={t("auth.campos.fechaNacimiento")}
              htmlFor="birthDate"
              error={form.formState.errors.birthDate?.message}
              hint={t("auth.campos.pistaMayorEdad")}
            >
              <Controller
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <DateInput
                    ref={field.ref}
                    id="birthDate"
                    name={field.name}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    max={toIsoDateKey(new Date())}
                    error={!!form.formState.errors.birthDate}
                  />
                )}
              />
            </FieldWrapper>
            <FieldWrapper label={t("auth.campos.sexoAlNacer")} htmlFor="sexAtBirth" error={form.formState.errors.sexAtBirth?.message}>
              <SelectInput id="sexAtBirth" error={!!form.formState.errors.sexAtBirth} {...form.register("sexAtBirth")}>
                <option value="">{t("auth.campos.selecciona")}</option>
                <option value="F">{t("auth.campos.femenino")}</option>
                <option value="M">{t("auth.campos.masculino")}</option>
              </SelectInput>
            </FieldWrapper>
          </div>

          <FieldWrapper label={t("auth.campos.telefono")} htmlFor="phone" error={form.formState.errors.phone?.message} hint={t("auth.campos.pistaTelefono")}>
            <TextInput
              id="phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="3312345678"
              error={!!form.formState.errors.phone}
              {...form.register("phone", {
                setValueAs: (v: string) => {
                  const digits = typeof v === "string" ? v.replace(/\D/g, "") : "";
                  return digits ? `+52${digits}` : "";
                },
              })}
            />
          </FieldWrapper>

          <div className="flex flex-col gap-3 rounded-md border border-gray-300 p-4">
            <label className="flex items-start gap-3 text-base text-gray-900">
              <input type="checkbox" className="mt-1 h-5 w-5" {...form.register("consents.privacyNotice")} />
              {t("auth.registroPaciente.consentimientoPrivacidad")}
            </label>
            {form.formState.errors.consents?.privacyNotice ? (
              <p className="text-sm text-danger-600">{form.formState.errors.consents.privacyNotice.message}</p>
            ) : null}
            <label className="flex items-start gap-3 text-base text-gray-900">
              <input type="checkbox" className="mt-1 h-5 w-5" {...form.register("consents.sensitiveData")} />
              {t("auth.registroPaciente.consentimientoDatos")}
            </label>
            {form.formState.errors.consents?.sensitiveData ? (
              <p className="text-sm text-danger-600">{form.formState.errors.consents.sensitiveData.message}</p>
            ) : null}
            <label className="flex items-start gap-3 text-base text-gray-900">
              <input type="checkbox" className="mt-1 h-5 w-5" {...form.register("consents.digitalPrescriptionChannel")} />
              {t("auth.registroPaciente.consentimientoDigital")}
            </label>
          </div>

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
