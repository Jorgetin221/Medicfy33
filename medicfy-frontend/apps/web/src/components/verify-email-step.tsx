"use client";

import { useState, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { emailVerifySchema, type EmailVerifyInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { AuthLayout } from "@/components/auth-layout";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";

type VerifyEmailValues = Omit<EmailVerifyInput, "userId">;

// Segundo paso de los registros de médico y de paciente: el código de
// 6 dígitos que llegó por correo. Cada registro solo cambia el texto
// del panel lateral (`panelCopy`).
export function VerifyEmailStep({
  userId,
  panelCopy,
  onVerified,
}: {
  userId: string;
  panelCopy: Omit<ComponentProps<typeof AuthLayout>, "children">;
  onVerified: () => void;
}) {
  const t = useT();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<VerifyEmailValues>({
    resolver: useZodResolver<VerifyEmailValues>(emailVerifySchema.omit({ userId: true })),
    defaultValues: { code: "" },
  });

  async function onSubmit(values: VerifyEmailValues) {
    setError(null);
    try {
      await apiFetch("/auth/email/verify", { method: "POST", body: { userId, ...values } });
      onVerified();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <AuthLayout {...panelCopy}>
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
