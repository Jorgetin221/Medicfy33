"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { patientActivationSubmitSchema, type PatientActivationInfo, type PatientActivationSubmitInput } from "@medicfy/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";

type Step = { kind: "loading" } | { kind: "invalid" } | { kind: "form"; info: PatientActivationInfo };

const LINK_INVALID_CODE = "PATIENT_ACTIVATION_LINK_INVALID";

// El paciente solo ve su nombre de pila y su Medicfy ID para confirmar
// que el enlace es suyo — ningún dato clínico. Al activar queda con
// sesión iniciada (mismo cierre que /login) y aterriza en /mi-cuenta.
export function ActivarCuentaView({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [submitError, setSubmitError] = useState<unknown>(null);
  const form = useForm<PatientActivationSubmitInput>({
    resolver: useZodResolver<PatientActivationSubmitInput>(patientActivationSubmitSchema),
  });
  const panelCopy = { panelTitle: t("vinculacion.activar.panelTitulo"), panelBody: t("vinculacion.activar.panelCuerpo") };

  useEffect(() => {
    let cancelled = false;
    apiFetch<PatientActivationInfo>(`/patient-activation/${encodeURIComponent(token)}`)
      .then((info) => {
        if (!cancelled) setStep({ kind: "form", info });
      })
      .catch(() => {
        if (!cancelled) setStep({ kind: "invalid" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(values: PatientActivationSubmitInput) {
    setSubmitError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>(`/patient-activation/${encodeURIComponent(token)}`, {
        method: "POST",
        body: values,
      });
      login(res.accessToken);
      router.push("/mi-cuenta");
    } catch (error) {
      if (error instanceof ApiError && error.code === LINK_INVALID_CODE) {
        setStep({ kind: "invalid" });
        return;
      }
      setSubmitError(error);
    }
  }

  if (step.kind === "loading") {
    return (
      <AuthLayout {...panelCopy}>
        <LoadingState label={t("vinculacion.activar.cargando")} />
      </AuthLayout>
    );
  }

  if (step.kind === "invalid") {
    return (
      <AuthLayout {...panelCopy}>
        <div className="flex flex-col gap-4">
          <h1 className="font-heading text-3xl text-brand-900">{t("vinculacion.activar.invalidoTitulo")}</h1>
          <Aviso variant="advertencia" title={t("vinculacion.activar.invalidoCuerpo")} />
          <Link href="/" className="text-base font-medium text-brand-700 underline">
            {t("vinculacion.activar.irAlInicio")}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const { info } = step;
  const errors = form.formState.errors;

  return (
    <AuthLayout {...panelCopy}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl text-brand-900">{t("vinculacion.activar.titulo")}</h1>
          <p className="text-lg text-gray-900">{t("vinculacion.activar.saludo", { nombre: info.firstName })}</p>
          <Aviso
            variant="info"
            title={t("vinculacion.activar.confirmaIdentidad", { medicfyId: info.medicfyId, nombre: info.firstName })}
          />
          <p className="text-base text-gray-500">{t("vinculacion.activar.subtitulo")}</p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <FieldWrapper label={t("auth.campos.correo")} htmlFor="email" error={errors.email?.message}>
            <TextInput id="email" type="email" autoComplete="email" error={!!errors.email} {...form.register("email")} />
          </FieldWrapper>

          <FieldWrapper
            label={t("auth.campos.contrasena")}
            htmlFor="password"
            error={errors.password?.message}
            hint={t("auth.campos.pistaContrasena")}
          >
            <PasswordInput id="password" autoComplete="new-password" error={!!errors.password} {...form.register("password")} />
          </FieldWrapper>

          <div className="flex flex-col gap-3 rounded-md border border-gray-300 p-4">
            <label className="flex items-start gap-3 text-base text-gray-900">
              <input type="checkbox" className="mt-1 h-5 w-5" {...form.register("consents.privacyNotice")} />
              {t("auth.registroPaciente.consentimientoPrivacidad")}
            </label>
            {errors.consents?.privacyNotice ? <p className="text-sm text-danger-600">{errors.consents.privacyNotice.message}</p> : null}
            <label className="flex items-start gap-3 text-base text-gray-900">
              <input type="checkbox" className="mt-1 h-5 w-5" {...form.register("consents.sensitiveData")} />
              {t("auth.registroPaciente.consentimientoDatos")}
            </label>
            {errors.consents?.sensitiveData ? <p className="text-sm text-danger-600">{errors.consents.sensitiveData.message}</p> : null}
            <label className="flex items-start gap-3 text-base text-gray-900">
              <input type="checkbox" className="mt-1 h-5 w-5" {...form.register("consents.digitalPrescriptionChannel")} />
              {t("auth.registroPaciente.consentimientoDigital")}
            </label>
          </div>

          {submitError ? <ErrorState error={submitError} /> : null}

          <Button type="submit" isLoading={form.formState.isSubmitting} className="mt-1 w-full">
            {t("vinculacion.activar.activar")}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
