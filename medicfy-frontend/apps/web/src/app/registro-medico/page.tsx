"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerDoctorSchema, emailVerifySchema, type RegisterDoctorInput, type EmailVerifyInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useSpecialties } from "@/lib/use-specialties";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/states";
import { Aviso } from "@/components/ui/alert";

const PANEL_COPY = {
  panelTitle: "Verificamos tu cédula ante la SEP antes de que recibas pacientes",
  panelBody: "Tu perfil verificado es la confianza que un directorio genérico no puede dar. Sin tarjeta de crédito para empezar.",
  // v2.4: "/" ahora es el marketplace de pacientes — el logo de esta
  // pantalla debe volver a la página de reclutamiento de médicos, no
  // ahí.
  homeHref: "/para-medicos",
};

// PUB-03. M1-RN-002: registro de médico, queda en verification_status
// = SUBMITTED tras verificar su email — la verificación de cédula es
// manual por admin (M2), no ocurre en esta pantalla.
export default function RegistroMedicoPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [userId, setUserId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const { specialties, isLoading: specialtiesLoading, error: specialtiesError } = useSpecialties();

  const form = useForm<RegisterDoctorInput>({ resolver: zodResolver(registerDoctorSchema) });

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
          <h1 className="font-heading text-3xl text-brand-900">Cuenta creada</h1>
          <Aviso variant="exito" title="Correo verificado">
            Un administrador revisará tu cédula profesional antes de que puedas recibir pacientes.
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
          <p className="mt-2 text-base text-gray-500">Regístrate como médico para empezar a usar Medicfy.</p>
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
            <FieldWrapper label="Nombre(s)" htmlFor="legalFirstName" error={form.formState.errors.legalFirstName?.message}>
              <TextInput id="legalFirstName" error={!!form.formState.errors.legalFirstName} {...form.register("legalFirstName")} />
            </FieldWrapper>
            <FieldWrapper label="Apellidos" htmlFor="legalLastName" error={form.formState.errors.legalLastName?.message}>
              <TextInput id="legalLastName" error={!!form.formState.errors.legalLastName} {...form.register("legalLastName")} />
            </FieldWrapper>
          </div>

          <FieldWrapper
            label="Cédula profesional"
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
            label="Especialidad principal"
            htmlFor="primarySpecialtyCode"
            error={form.formState.errors.primarySpecialtyCode?.message ?? (specialtiesError ? "No se pudo cargar el catálogo." : undefined)}
          >
            <SelectInput
              id="primarySpecialtyCode"
              disabled={specialtiesLoading}
              error={!!form.formState.errors.primarySpecialtyCode}
              {...form.register("primarySpecialtyCode")}
            >
              <option value="">{specialtiesLoading ? "Cargando…" : "Selecciona una especialidad"}</option>
              {specialties.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.nameEs}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>

          <FieldWrapper label="Teléfono" htmlFor="phone" error={form.formState.errors.phone?.message} hint="10 dígitos.">
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
