"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { patientCreateSchema, isMinor, type PatientCreateInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";

// El médico captura los 10 dígitos nacionales; el +52 lo agrega el
// formulario (el contrato y la base siguen en E.164, M1 "prefijo +52").
// Si pegan el número ya con lada de país (+52 / 52), no se duplica.
const MX_NATIONAL_DIGITS = 10;
function toMxE164(value: unknown): string {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  const national = digits.length === MX_NATIONAL_DIGITS + 2 && digits.startsWith("52") ? digits.slice(2) : digits;
  return national ? `+52${national}` : "";
}
const MX_PHONE_INPUT_PROPS = { type: "tel", inputMode: "numeric", autoComplete: "tel-national", placeholder: "3312345678" } as const;

// Alta mínima de paciente (M2-CA-009). Campos opcionales de la
// especificación (dirección, contacto de emergencia, tipo de sangre,
// CURP) quedan fuera de este primer corte — el picker de citas solo
// necesita nombre, contacto y, si aplica, tutor.
export default function NuevoPacientePage() {
  const router = useRouter();
  const t = useT();
  const { accessToken, isLoading: authLoading } = useAuth();
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  const form = useForm<PatientCreateInput>({
    resolver: useZodResolver<PatientCreateInput>(patientCreateSchema),
    shouldUnregister: true,
  });

  const birthDate = form.watch("birthDate");
  const minor = birthDate ? isMinor(new Date(`${birthDate}T00:00:00Z`)) : false;

  async function onSubmit(values: PatientCreateInput) {
    setSubmitError(null);
    try {
      const res = await apiFetch<{ id: string; medicfyId: string }>("/patients", { method: "POST", body: values, accessToken });
      setCreatedPatientId(res.id);
    } catch (error) {
      setSubmitError(error);
    }
  }

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <LoadingState />
      </main>
    );
  }

  if (createdPatientId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-heading text-2xl text-brand-900">{t("pacientes.alta.registrado")}</h1>
        <p className="text-base text-gray-700">{t("pacientes.alta.registradoCuerpo")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => router.push(`/citas/nueva?patientId=${createdPatientId}`)}>{t("pacientes.alta.agendarCita")}</Button>
          <Button variant="secondary" onClick={() => router.push("/agenda")}>
            {t("citaNueva.irALaAgenda")}
          </Button>
        </div>
        <Link href={`/pacientes/${createdPatientId}`} className="text-base font-medium text-brand-700 underline">
          {t("citaNueva.verPerfilPaciente")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("pacientes.alta.titulo")}</h1>
        <p className="text-base text-gray-500">{t("pacientes.alta.subtitulo")}</p>
      </div>

      <Card>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label={t("auth.campos.nombres")} htmlFor="firstName" error={form.formState.errors.firstName?.message}>
              <TextInput id="firstName" error={!!form.formState.errors.firstName} {...form.register("firstName")} />
            </FieldWrapper>
            <FieldWrapper label={t("auth.campos.apellidoPaterno")} htmlFor="lastNamePaternal" error={form.formState.errors.lastNamePaternal?.message}>
              <TextInput id="lastNamePaternal" error={!!form.formState.errors.lastNamePaternal} {...form.register("lastNamePaternal")} />
            </FieldWrapper>
          </div>
          <FieldWrapper label={t("auth.campos.apellidoMaterno")} htmlFor="lastNameMaternal" error={form.formState.errors.lastNameMaternal?.message}>
            <TextInput id="lastNameMaternal" error={!!form.formState.errors.lastNameMaternal} {...form.register("lastNameMaternal")} />
          </FieldWrapper>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label={t("auth.campos.fechaNacimiento")} htmlFor="birthDate" error={form.formState.errors.birthDate?.message}>
              <TextInput id="birthDate" type="date" error={!!form.formState.errors.birthDate} {...form.register("birthDate")} />
            </FieldWrapper>
            <FieldWrapper label={t("auth.campos.sexoAlNacer")} htmlFor="sexAtBirth" error={form.formState.errors.sexAtBirth?.message}>
              <SelectInput id="sexAtBirth" error={!!form.formState.errors.sexAtBirth} {...form.register("sexAtBirth")}>
                <option value="">{t("auth.campos.selecciona")}</option>
                <option value="F">{t("auth.campos.femenino")}</option>
                <option value="M">{t("auth.campos.masculino")}</option>
              </SelectInput>
            </FieldWrapper>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label={t("pacientes.alta.telefono")} htmlFor="phoneE164" error={form.formState.errors.phoneE164?.message} hint={t("pacientes.alta.pistaTelefono")}>
              <TextInput
                id="phoneE164"
                {...MX_PHONE_INPUT_PROPS}
                error={!!form.formState.errors.phoneE164}
                {...form.register("phoneE164", { setValueAs: toMxE164 })}
              />
            </FieldWrapper>
            <FieldWrapper label={t("pacientes.alta.correo")} htmlFor="email" error={form.formState.errors.email?.message}>
              <TextInput id="email" type="email" error={!!form.formState.errors.email} {...form.register("email")} />
            </FieldWrapper>
          </div>

          {minor ? (
            <fieldset className="flex flex-col gap-4 rounded-md border border-warn-600 p-4">
              <legend className="px-1 text-sm font-medium text-warn-600">{t("pacientes.alta.menorTitulo")}</legend>

              <div className="grid grid-cols-2 gap-4">
                <FieldWrapper
                  label={t("pacientes.alta.nombreTutor")}
                  htmlFor="guardian.guardianName"
                  error={form.formState.errors.guardian?.guardianName?.message}
                >
                  <TextInput
                    id="guardian.guardianName"
                    error={!!form.formState.errors.guardian?.guardianName}
                    {...form.register("guardian.guardianName")}
                  />
                </FieldWrapper>
                <FieldWrapper
                  label={t("pacientes.alta.relacion")}
                  htmlFor="guardian.guardianRelation"
                  error={form.formState.errors.guardian?.guardianRelation?.message}
                >
                  <SelectInput
                    id="guardian.guardianRelation"
                    error={!!form.formState.errors.guardian?.guardianRelation}
                    {...form.register("guardian.guardianRelation")}
                  >
                    <option value="">{t("auth.campos.selecciona")}</option>
                    <option value="MADRE">{t("pacientes.alta.madre")}</option>
                    <option value="PADRE">{t("pacientes.alta.padre")}</option>
                    <option value="TUTOR_LEGAL">{t("pacientes.alta.tutorLegal")}</option>
                    <option value="OTRO">{t("pacientes.alta.otro")}</option>
                  </SelectInput>
                </FieldWrapper>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FieldWrapper
                  label={t("pacientes.alta.telefonoTutor")}
                  htmlFor="guardian.guardianPhoneE164"
                  error={form.formState.errors.guardian?.guardianPhoneE164?.message}
                >
                  <TextInput
                    id="guardian.guardianPhoneE164"
                    {...MX_PHONE_INPUT_PROPS}
                    error={!!form.formState.errors.guardian?.guardianPhoneE164}
                    {...form.register("guardian.guardianPhoneE164", { setValueAs: toMxE164 })}
                  />
                </FieldWrapper>
                <FieldWrapper
                  label={t("pacientes.alta.correoTutor")}
                  htmlFor="guardian.guardianEmail"
                  error={form.formState.errors.guardian?.guardianEmail?.message}
                >
                  <TextInput
                    id="guardian.guardianEmail"
                    type="email"
                    error={!!form.formState.errors.guardian?.guardianEmail}
                    {...form.register("guardian.guardianEmail")}
                  />
                </FieldWrapper>
              </div>

              <FieldWrapper
                label={t("pacientes.alta.ineTutor")}
                htmlFor="guardian.guardianIdDocumentKey"
                error={form.formState.errors.guardian?.guardianIdDocumentKey?.message}
                hint={t("pacientes.alta.ineAyuda")}
              >
                <TextInput
                  id="guardian.guardianIdDocumentKey"
                  error={!!form.formState.errors.guardian?.guardianIdDocumentKey}
                  {...form.register("guardian.guardianIdDocumentKey")}
                />
              </FieldWrapper>
            </fieldset>
          ) : null}

          {submitError ? <ErrorState error={submitError} /> : null}

          <Button type="submit" isLoading={form.formState.isSubmitting}>
            {t("pacientes.alta.guardar")}
          </Button>
        </form>
      </Card>

      <Link href="/agenda" className="text-sm font-medium text-brand-700 underline">
        {t("pacientes.alta.volverAgenda")}
      </Link>
    </main>
  );
}
