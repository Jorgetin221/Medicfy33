"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerPatientSchema, emailVerifySchema, type RegisterPatientInput, type EmailVerifyInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";

const PANEL_COPY = {
  panelTitle: "Tu expediente y tus citas, en un solo lugar",
  panelBody: "Agenda con tu médico, revisa lo que comparte contigo, y controla quién ve tu información.",
};

// M5-RN-009 (spec §7, v2.3): registro de paciente con cuenta propia —
// hoy solo creaba el `user`; ahora también crea la fila `patients`
// (mismos campos mínimos que M5-RN-008 ya pedía). Exige mayoría de
// edad (registerPatientSchema.superRefine); un menor sigue dado de
// alta por un adulto vía el flujo del médico.
export default function RegistroPacientePage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [userId, setUserId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // Sin defaultValues.consents: son casillas sin marcar por
  // naturaleza (HTML ya las inicia en false) — declarar aquí
  // `false` chocaría con el tipo `true` literal que exige
  // registerPatientSchema para las dos obligatorias.
  const form = useForm<RegisterPatientInput>({ resolver: zodResolver(registerPatientSchema) });

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
    return <VerifyEmailStep userId={userId} onVerified={() => setStep("done")} />;
  }

  if (step === "done") {
    return (
      <AuthLayout {...PANEL_COPY}>
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="font-heading text-3xl text-brand-900">Cuenta creada</h1>
          <Aviso variant="exito" title="Correo verificado">
            Ya puedes iniciar sesión y agendar con tu médico.
          </Aviso>
          <Button onClick={() => router.push("/login")} className="mt-2 w-full">
            Ir a iniciar sesión
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout {...PANEL_COPY}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-heading text-3xl text-brand-900">Crea tu cuenta</h1>
          <p className="mt-2 text-base text-gray-500">Regístrate como paciente para agendar y ver tu información.</p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <FieldWrapper label="Correo electrónico" htmlFor="email" error={form.formState.errors.email?.message}>
            <TextInput id="email" type="email" autoComplete="email" error={!!form.formState.errors.email} {...form.register("email")} />
          </FieldWrapper>

          <FieldWrapper label="Contraseña" htmlFor="password" error={form.formState.errors.password?.message} hint="Mínimo 12 caracteres.">
            <TextInput
              id="password"
              type="password"
              autoComplete="new-password"
              error={!!form.formState.errors.password}
              {...form.register("password")}
            />
          </FieldWrapper>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label="Nombre(s)" htmlFor="firstName" error={form.formState.errors.firstName?.message}>
              <TextInput id="firstName" error={!!form.formState.errors.firstName} {...form.register("firstName")} />
            </FieldWrapper>
            <FieldWrapper label="Apellido paterno" htmlFor="lastNamePaternal" error={form.formState.errors.lastNamePaternal?.message}>
              <TextInput id="lastNamePaternal" error={!!form.formState.errors.lastNamePaternal} {...form.register("lastNamePaternal")} />
            </FieldWrapper>
          </div>

          <FieldWrapper label="Apellido materno (opcional)" htmlFor="lastNameMaternal" error={form.formState.errors.lastNameMaternal?.message}>
            <TextInput id="lastNameMaternal" error={!!form.formState.errors.lastNameMaternal} {...form.register("lastNameMaternal")} />
          </FieldWrapper>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper
              label="Fecha de nacimiento"
              htmlFor="birthDate"
              error={form.formState.errors.birthDate?.message}
              hint="Debes ser mayor de edad para registrarte por tu cuenta."
            >
              <TextInput id="birthDate" type="date" error={!!form.formState.errors.birthDate} {...form.register("birthDate")} />
            </FieldWrapper>
            <FieldWrapper label="Sexo al nacer" htmlFor="sexAtBirth" error={form.formState.errors.sexAtBirth?.message}>
              <SelectInput id="sexAtBirth" error={!!form.formState.errors.sexAtBirth} {...form.register("sexAtBirth")}>
                <option value="">Selecciona…</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
              </SelectInput>
            </FieldWrapper>
          </div>

          <FieldWrapper label="Teléfono" htmlFor="phone" error={form.formState.errors.phone?.message} hint="10 dígitos.">
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
              Acepto el aviso de privacidad.
            </label>
            {form.formState.errors.consents?.privacyNotice ? (
              <p className="text-sm text-danger-600">{form.formState.errors.consents.privacyNotice.message}</p>
            ) : null}
            <label className="flex items-start gap-3 text-base text-gray-900">
              <input type="checkbox" className="mt-1 h-5 w-5" {...form.register("consents.sensitiveData")} />
              Acepto el tratamiento de mis datos sensibles de salud.
            </label>
            {form.formState.errors.consents?.sensitiveData ? (
              <p className="text-sm text-danger-600">{form.formState.errors.consents.sensitiveData.message}</p>
            ) : null}
            <label className="flex items-start gap-3 text-base text-gray-900">
              <input type="checkbox" className="mt-1 h-5 w-5" {...form.register("consents.digitalPrescriptionChannel")} />
              Acepto recibir recetas y órdenes por medios digitales (opcional).
            </label>
          </div>

          {submitError ? <ErrorState error={submitError} /> : null}

          <Button type="submit" isLoading={form.formState.isSubmitting} className="mt-1 w-full">
            Crear cuenta
          </Button>
        </form>

        <p className="text-center text-base text-gray-700">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-brand-700 underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function VerifyEmailStep({ userId, onVerified }: { userId: string; onVerified: () => void }) {
  const [error, setError] = useState<unknown>(null);
  const form = useForm<Omit<EmailVerifyInput, "userId">>({
    resolver: zodResolver(emailVerifySchema.omit({ userId: true })),
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
          <h1 className="font-heading text-3xl text-brand-900">Verifica tu correo</h1>
          <p className="mt-2 text-base text-gray-500">Te enviamos un código de 6 dígitos.</p>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <FieldWrapper label="Código" htmlFor="code" error={form.formState.errors.code?.message}>
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
            Verificar
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
