"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { loginSchema, mfaLoginVerifySchema, type LoginInput, type MfaLoginVerifyInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";
import { landingRouteFor } from "@/lib/role-routing";

type LoginResult = { accessToken: string } | { mfaRequired: true; mfaSessionToken: string };

// M5-RN-009 / M-31: cada rol aterriza en su pantalla (paciente →
// /mi-cuenta, admin → /admin, consultorio → /agenda). `redirectTo`
// (M5-RN-010) vuelve a donde estaba, solo si es una ruta interna (M-22).
// PUB-04. M1-RN-004/005/006: consentimiento vigente, MFA y bloqueo
// por fuerza bruta ya viven en el backend — esta pantalla solo
// necesita ramificar en la respuesta de /auth/login.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <LoadingState />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const { login } = useAuth();
  const t = useT();
  const [mfaSessionToken, setMfaSessionToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const form = useForm<LoginInput>({ resolver: useZodResolver<LoginInput>(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setSubmitError(null);
    try {
      const res = await apiFetch<LoginResult>("/auth/login", { method: "POST", body: values });
      if ("mfaRequired" in res) {
        setMfaSessionToken(res.mfaSessionToken);
        return;
      }
      login(res.accessToken);
      router.push(landingRouteFor(res.accessToken, redirectTo));
    } catch (error) {
      setSubmitError(error);
    }
  }

  if (mfaSessionToken) {
    return <MfaStep mfaSessionToken={mfaSessionToken} redirectTo={redirectTo} />;
  }

  return (
    <AuthLayout
      panelTitle={t("auth.login.panelTitulo")}
      panelBody={t("auth.login.panelCuerpo")}
    >
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.login.titulo")}</h1>
          <p className="mt-2 text-base text-gray-500">{t("auth.login.subtitulo")}</p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <FieldWrapper label={t("auth.campos.correo")} htmlFor="email" error={form.formState.errors.email?.message}>
            <TextInput id="email" type="email" autoComplete="email" error={!!form.formState.errors.email} {...form.register("email")} />
          </FieldWrapper>
          <FieldWrapper label={t("auth.campos.contrasena")} htmlFor="password" error={form.formState.errors.password?.message}>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              error={!!form.formState.errors.password}
              {...form.register("password")}
            />
          </FieldWrapper>
          {submitError ? <ErrorState error={submitError} /> : null}
          <Button type="submit" isLoading={form.formState.isSubmitting} className="mt-1 w-full">
            {t("auth.login.entrar")}
          </Button>
          {/* M-33: recuperación de contraseña. */}
          <Link href="/olvide-contrasena" className="min-h-11 self-center text-base font-medium text-brand-700 underline">
            {t("auth.olvide.enlace")}
          </Link>
        </form>

        <p className="text-center text-base text-gray-700">
          {t("auth.login.sinCuenta")}{" "}
          <Link href="/registro-paciente" className="font-medium text-brand-700 underline">
            {t("auth.login.registrateComoPaciente")}
          </Link>{" "}
          {t("auth.login.o")}{" "}
          <Link href="/registro-medico" className="font-medium text-brand-700 underline">
            {t("auth.login.comoMedico")}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

function MfaStep({ mfaSessionToken, redirectTo }: { mfaSessionToken: string; redirectTo: string | null }) {
  const router = useRouter();
  const { login } = useAuth();
  const t = useT();
  const [error, setError] = useState<unknown>(null);

  const form = useForm<MfaLoginVerifyInput>({
    resolver: useZodResolver<MfaLoginVerifyInput>(mfaLoginVerifySchema),
    defaultValues: { mfaSessionToken, code: "" },
  });

  async function onSubmit(values: MfaLoginVerifyInput) {
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>("/auth/mfa/verify", { method: "POST", body: values });
      login(res.accessToken);
      router.push(landingRouteFor(res.accessToken, redirectTo));
    } catch (err) {
      setError(err);
    }
  }

  return (
    <AuthLayout
      panelTitle={t("auth.mfa.panelTitulo")}
      panelBody={t("auth.mfa.panelCuerpo")}
    >
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.mfa.titulo")}</h1>
          <p className="mt-2 text-base text-gray-500">{t("auth.mfa.subtitulo")}</p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          <input type="hidden" {...form.register("mfaSessionToken")} />
          <FieldWrapper label={t("auth.campos.codigo")} htmlFor="code" error={form.formState.errors.code?.message}>
            {/* M-01: también acepta un código de respaldo (10 caracteres). */}
            <TextInput
              id="code"
              maxLength={10}
              autoComplete="one-time-code"
              autoFocus
              error={!!form.formState.errors.code}
              {...form.register("code")}
            />
          </FieldWrapper>
          {error ? <ErrorState error={error} /> : null}
          <Button type="submit" isLoading={form.formState.isSubmitting} className="mt-1 w-full">
            {t("auth.mfa.verificar")}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
