"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { passwordForgotSchema, type PasswordForgotInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { Aviso } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";

// M-33 (auditoría 2026-10-21): POST /auth/password/forgot existía sin
// pantalla — un médico que olvidaba su contraseña quedaba fuera. La
// respuesta es la misma exista o no la cuenta (el servidor no lo revela).
export default function OlvideContrasenaPage() {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<PasswordForgotInput>({
    resolver: useZodResolver<PasswordForgotInput>(passwordForgotSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: PasswordForgotInput) {
    setError(null);
    try {
      await apiFetch("/auth/password/forgot", { method: "POST", body: values });
      setSent(true);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <AuthLayout panelTitle={t("auth.olvide.panelTitulo")} panelBody={t("auth.olvide.panelCuerpo")}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.olvide.titulo")}</h1>
          <p className="mt-2 text-base text-gray-500">{t("auth.olvide.subtitulo")}</p>
        </div>
        {sent ? (
          <Aviso variant="exito" title={t("auth.olvide.enviadoTitulo")}>
            {t("auth.olvide.enviadoCuerpo")}
          </Aviso>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
            <FieldWrapper label={t("auth.campos.correo")} htmlFor="email" error={form.formState.errors.email?.message}>
              <TextInput id="email" type="email" autoComplete="email" error={!!form.formState.errors.email} {...form.register("email")} />
            </FieldWrapper>
            {error ? <ErrorState error={error} /> : null}
            <Button type="submit" isLoading={form.formState.isSubmitting} className="w-full">
              {t("auth.olvide.enviar")}
            </Button>
          </form>
        )}
        <Link href="/login" className="text-center text-base font-medium text-brand-700 underline">
          {t("auth.olvide.volverLogin")}
        </Link>
      </div>
    </AuthLayout>
  );
}
