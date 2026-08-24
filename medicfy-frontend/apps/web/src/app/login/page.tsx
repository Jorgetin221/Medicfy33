"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, mfaLoginVerifySchema, type LoginInput, type MfaLoginVerifyInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { Card, ErrorState } from "@/components/ui/states";

type LoginResult = { accessToken: string } | { mfaRequired: true; mfaSessionToken: string };

// PUB-04. M1-RN-004/005/006: consentimiento vigente, MFA y bloqueo
// por fuerza bruta ya viven en el backend — esta pantalla solo
// necesita ramificar en la respuesta de /auth/login.
export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [mfaSessionToken, setMfaSessionToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setSubmitError(null);
    try {
      const res = await apiFetch<LoginResult>("/auth/login", { method: "POST", body: values });
      if ("mfaRequired" in res) {
        setMfaSessionToken(res.mfaSessionToken);
        return;
      }
      login(res.accessToken);
      router.push("/agenda");
    } catch (error) {
      setSubmitError(error);
    }
  }

  if (mfaSessionToken) {
    return <MfaStep mfaSessionToken={mfaSessionToken} />;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Iniciar sesión</h1>
        <p className="text-base text-gray-500">Para médicos y asistentes.</p>
      </div>
      <Card>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FieldWrapper label="Correo electrónico" htmlFor="email" error={form.formState.errors.email?.message}>
            <TextInput id="email" type="email" error={!!form.formState.errors.email} {...form.register("email")} />
          </FieldWrapper>
          <FieldWrapper label="Contraseña" htmlFor="password" error={form.formState.errors.password?.message}>
            <TextInput id="password" type="password" error={!!form.formState.errors.password} {...form.register("password")} />
          </FieldWrapper>
          {submitError ? <ErrorState error={submitError} /> : null}
          <Button type="submit" isLoading={form.formState.isSubmitting}>
            Entrar
          </Button>
        </form>
      </Card>
    </main>
  );
}

function MfaStep({ mfaSessionToken }: { mfaSessionToken: string }) {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<unknown>(null);

  const form = useForm<MfaLoginVerifyInput>({
    resolver: zodResolver(mfaLoginVerifySchema),
    defaultValues: { mfaSessionToken, code: "" },
  });

  async function onSubmit(values: MfaLoginVerifyInput) {
    setError(null);
    try {
      const res = await apiFetch<{ accessToken: string }>("/auth/mfa/verify", { method: "POST", body: values });
      login(res.accessToken);
      router.push("/agenda");
    } catch (err) {
      setError(err);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Verificación en dos pasos</h1>
        <p className="text-base text-gray-500">Ingresa el código de tu app de autenticación.</p>
      </div>
      <Card>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <input type="hidden" {...form.register("mfaSessionToken")} />
          <FieldWrapper label="Código" htmlFor="code" error={form.formState.errors.code?.message}>
            <TextInput id="code" inputMode="numeric" maxLength={6} error={!!form.formState.errors.code} {...form.register("code")} />
          </FieldWrapper>
          {error ? <ErrorState error={error} /> : null}
          <Button type="submit" isLoading={form.formState.isSubmitting}>
            Verificar
          </Button>
        </form>
      </Card>
    </main>
  );
}
