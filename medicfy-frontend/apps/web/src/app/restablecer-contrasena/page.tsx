"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { passwordResetSchema, type PasswordResetInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { FieldWrapper } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Aviso } from "@/components/ui/alert";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";

// M-33: destino del enlace que manda POST /auth/password/forgot. El
// token viaja en la URL solo hasta aquí; el servidor lo invalida al
// usarlo y cierra las demás sesiones.
export default function RestablecerContrasenaPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RestablecerForm />
    </Suspense>
  );
}

function RestablecerForm() {
  const t = useT();
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<PasswordResetInput>({
    resolver: useZodResolver<PasswordResetInput>(passwordResetSchema),
    defaultValues: { token, newPassword: "" },
  });

  async function onSubmit(values: PasswordResetInput) {
    setError(null);
    try {
      await apiFetch("/auth/password/reset", { method: "POST", body: values });
      setDone(true);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <AuthLayout panelTitle={t("auth.olvide.panelTitulo")} panelBody={t("auth.olvide.panelCuerpo")}>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-heading text-3xl text-brand-900">{t("auth.restablecer.titulo")}</h1>
          <p className="mt-2 text-base text-gray-500">{t("auth.restablecer.subtitulo")}</p>
        </div>
        {!token ? (
          <Aviso variant="advertencia" title={t("auth.restablecer.sinToken")} />
        ) : done ? (
          <Aviso variant="exito" title={t("auth.restablecer.listoTitulo")}>
            {t("auth.restablecer.listoCuerpo")}
          </Aviso>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
            <input type="hidden" {...form.register("token")} />
            <FieldWrapper label={t("auth.restablecer.nueva")} htmlFor="newPassword" error={form.formState.errors.newPassword?.message}>
              <PasswordInput
                id="newPassword"
                autoComplete="new-password"
                error={!!form.formState.errors.newPassword}
                {...form.register("newPassword")}
              />
            </FieldWrapper>
            {error ? <ErrorState error={error} /> : null}
            <Button type="submit" isLoading={form.formState.isSubmitting} className="w-full">
              {t("auth.restablecer.guardar")}
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
