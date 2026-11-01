"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import {
  shareRequestCreateSchema,
  SHARE_SCOPES,
  SHARE_DURATION_DAYS_OPTIONS,
  type ShareRequestCreateInput,
} from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput, Textarea } from "@/components/ui/field";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";
import { DateInput } from "@/components/ui/date-input";
import { toIsoDateKey } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { useZodResolver } from "@/lib/i18n/validation";

// D-EXP-05: "Resumen" es el mínimo — bloqueado, nunca sale del
// formulario. Las demás opciones son las que el médico puede sumar.
const OPTIONAL_SCOPES = SHARE_SCOPES.filter((scope) => scope !== "SUMMARY");

export default function SolicitarExpedienteCompartidoPage() {
  const router = useRouter();
  const t = useT();
  const { accessToken, isLoading: authLoading } = useAuth();
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  const form = useForm<ShareRequestCreateInput>({
    resolver: useZodResolver<ShareRequestCreateInput>(shareRequestCreateSchema),
    defaultValues: { scope: ["SUMMARY"], durationDays: 30 },
    shouldUnregister: true,
  });

  async function onSubmit(values: ShareRequestCreateInput) {
    setSubmitError(null);
    setSubmitting(true);
    try {
      // D-EXP-05: "SUMMARY" se fuerza aquí, no se confía en el estado
      // del formulario — su casilla ni siquiera está registrada (es
      // puramente visual, bloqueada), y react-hook-form recalcula el
      // arreglo de un grupo de checkboxes a partir de los campos
      // REGISTRADOS cada vez que uno cambia, lo que podría perder un
      // valor que solo viviera en defaultValues.
      const body: ShareRequestCreateInput = { ...values, scope: Array.from(new Set(["SUMMARY", ...values.scope])) };
      // RE5: la respuesta es SIEMPRE este mismo mensaje genérico,
      // exista o no el paciente — no hay nada más que leer de aquí.
      await apiFetch("/record-share/requests", { method: "POST", body, accessToken });
      setSent(true);
    } catch (error) {
      setSubmitError(error);
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <LoadingState />
      </main>
    );
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-heading text-2xl text-brand-900">{t("expedienteCompartido.solicitar.confirmacion.titulo")}</h1>
        <p className="text-base text-gray-700">{t("expedienteCompartido.solicitar.subtitulo")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => router.push("/expediente-compartido/mis-solicitudes")}>
            {t("expedienteCompartido.solicitar.confirmacion.verMisSolicitudes")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              form.reset({ scope: ["SUMMARY"], durationDays: 30 });
              setSent(false);
            }}
          >
            {t("expedienteCompartido.solicitar.confirmacion.otraSolicitud")}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("expedienteCompartido.solicitar.titulo")}</h1>
        <p className="text-base text-gray-500">{t("expedienteCompartido.solicitar.subtitulo")}</p>
      </div>

      <Card>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper
              label={t("expedienteCompartido.solicitar.campos.nombres")}
              htmlFor="patient.firstName"
              error={form.formState.errors.patient?.firstName?.message}
            >
              <TextInput id="patient.firstName" error={!!form.formState.errors.patient?.firstName} {...form.register("patient.firstName")} />
            </FieldWrapper>
            <FieldWrapper
              label={t("expedienteCompartido.solicitar.campos.apellidoPaterno")}
              htmlFor="patient.lastNamePaternal"
              error={form.formState.errors.patient?.lastNamePaternal?.message}
            >
              <TextInput
                id="patient.lastNamePaternal"
                error={!!form.formState.errors.patient?.lastNamePaternal}
                {...form.register("patient.lastNamePaternal")}
              />
            </FieldWrapper>
          </div>

          <FieldWrapper
            label={t("expedienteCompartido.solicitar.campos.apellidoMaterno")}
            htmlFor="patient.lastNameMaternal"
            error={form.formState.errors.patient?.lastNameMaternal?.message}
          >
            <TextInput
              id="patient.lastNameMaternal"
              error={!!form.formState.errors.patient?.lastNameMaternal}
              {...form.register("patient.lastNameMaternal")}
            />
          </FieldWrapper>

          <FieldWrapper
            label={t("expedienteCompartido.solicitar.campos.fechaNacimiento")}
            htmlFor="patient.birthDate"
            error={form.formState.errors.patient?.birthDate?.message}
          >
            <Controller
              control={form.control}
              name="patient.birthDate"
              render={({ field }) => (
                <DateInput
                  ref={field.ref}
                  id="patient.birthDate"
                  name={field.name}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  max={toIsoDateKey(new Date())}
                  error={!!form.formState.errors.patient?.birthDate}
                />
              )}
            />
          </FieldWrapper>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper
              label={t("expedienteCompartido.solicitar.campos.telefono")}
              htmlFor="patient.phone"
              error={form.formState.errors.patient?.phone?.message}
              hint={t("expedienteCompartido.solicitar.campos.contactoAyuda")}
            >
              <TextInput id="patient.phone" type="tel" error={!!form.formState.errors.patient?.phone} {...form.register("patient.phone")} />
            </FieldWrapper>
            <FieldWrapper
              label={t("expedienteCompartido.solicitar.campos.correo")}
              htmlFor="patient.email"
              error={form.formState.errors.patient?.email?.message}
            >
              <TextInput id="patient.email" type="email" error={!!form.formState.errors.patient?.email} {...form.register("patient.email")} />
            </FieldWrapper>
          </div>

          <FieldWrapper label={t("expedienteCompartido.solicitar.campos.motivo")} htmlFor="reason" error={form.formState.errors.reason?.message} hint={t("expedienteCompartido.solicitar.campos.motivoAyuda")}>
            <Textarea id="reason" error={!!form.formState.errors.reason} {...form.register("reason")} />
          </FieldWrapper>

          {/* D-EXP-05: "SUMMARY" siempre presente en el valor del
              campo. Controller en vez de form.register() en cada
              checkbox a propósito: react-hook-form registra un grupo
              de casillas nativo recalculando el arreglo a partir de
              los campos DISPONIBLES en el DOM — con una de ellas
              disabled (la de SUMMARY, que nunca debe ser interactiva)
              eso termina excluyendo el campo entero de la validación
              (mismo comportamiento que un <input disabled> en un
              <form> HTML normal). Con Controller el arreglo lo arma
              este componente a mano, así que "SUMMARY" nunca depende
              de qué casillas registró el DOM. */}
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-gray-700">{t("expedienteCompartido.solicitar.campos.alcance")}</legend>
                <label className="flex min-h-11 items-center gap-3 text-base text-gray-900">
                  <input type="checkbox" checked disabled className="h-5 w-5" />
                  {t("expedienteCompartido.solicitar.alcanceOpciones.SUMMARY")}
                </label>
                {OPTIONAL_SCOPES.map((scope) => (
                  <label key={scope} className="flex min-h-11 items-center gap-3 text-base text-gray-900">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={field.value?.includes(scope) ?? false}
                      onChange={(event) => {
                        const current = new Set(field.value ?? []);
                        if (event.target.checked) current.add(scope);
                        else current.delete(scope);
                        current.add("SUMMARY");
                        field.onChange(Array.from(current));
                      }}
                    />
                    {t(`expedienteCompartido.solicitar.alcanceOpciones.${scope}` as MessageKey)}
                  </label>
                ))}
              </fieldset>
            )}
          />

          <FieldWrapper label={t("expedienteCompartido.solicitar.campos.duracion")} htmlFor="durationDays" error={form.formState.errors.durationDays?.message}>
            <SelectInput
              id="durationDays"
              error={!!form.formState.errors.durationDays}
              {...form.register("durationDays", { valueAsNumber: true })}
            >
              {SHARE_DURATION_DAYS_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {t(`expedienteCompartido.solicitar.duracionOpciones.${days}` as MessageKey)}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>

          {submitError ? <ErrorState error={submitError} /> : null}

          <div className="flex items-center justify-between gap-3">
            <Link href="/expediente-compartido/mis-solicitudes" className="text-base font-medium text-brand-700 underline">
              {t("expedienteCompartido.misSolicitudes.titulo")}
            </Link>
            <Button type="submit" isLoading={submitting} disabled={submitting}>
              {t("expedienteCompartido.solicitar.enviar")}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
