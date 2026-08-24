"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { patientCreateSchema, isMinor, type PatientCreateInput } from "@medicfy/contracts";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { Card, ErrorState, LoadingState } from "@/components/ui/states";

// Alta mínima de paciente (M2-CA-009). Campos opcionales de la
// especificación (dirección, contacto de emergencia, tipo de sangre,
// CURP) quedan fuera de este primer corte — el picker de citas solo
// necesita nombre, contacto y, si aplica, tutor.
export default function NuevoPacientePage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  const form = useForm<PatientCreateInput>({
    resolver: zodResolver(patientCreateSchema),
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
        <h1 className="font-heading text-2xl text-brand-900">Paciente registrado</h1>
        <p className="text-base text-gray-700">El paciente ya puede recibir citas.</p>
        <div className="flex gap-3">
          <Button onClick={() => router.push(`/citas/nueva?patientId=${createdPatientId}`)}>Agendar cita</Button>
          <Button variant="secondary" onClick={() => router.push("/agenda")}>
            Ir a la agenda
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">Nuevo paciente</h1>
        <p className="text-base text-gray-500">Datos mínimos para poder agendarle una cita.</p>
      </div>

      <Card>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
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
            <FieldWrapper label="Fecha de nacimiento" htmlFor="birthDate" error={form.formState.errors.birthDate?.message}>
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

          <div className="grid grid-cols-2 gap-4">
            <FieldWrapper label="Teléfono" htmlFor="phoneE164" error={form.formState.errors.phoneE164?.message} hint="+52 y 10 dígitos.">
              <TextInput
                id="phoneE164"
                type="tel"
                placeholder="+523312345678"
                error={!!form.formState.errors.phoneE164}
                {...form.register("phoneE164")}
              />
            </FieldWrapper>
            <FieldWrapper label="Correo electrónico" htmlFor="email" error={form.formState.errors.email?.message}>
              <TextInput id="email" type="email" error={!!form.formState.errors.email} {...form.register("email")} />
            </FieldWrapper>
          </div>

          {minor ? (
            <fieldset className="flex flex-col gap-4 rounded-md border border-warn-600 p-4">
              <legend className="px-1 text-sm font-medium text-warn-600">Paciente menor de edad — datos del tutor</legend>

              <div className="grid grid-cols-2 gap-4">
                <FieldWrapper
                  label="Nombre del tutor"
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
                  label="Relación"
                  htmlFor="guardian.guardianRelation"
                  error={form.formState.errors.guardian?.guardianRelation?.message}
                >
                  <SelectInput
                    id="guardian.guardianRelation"
                    error={!!form.formState.errors.guardian?.guardianRelation}
                    {...form.register("guardian.guardianRelation")}
                  >
                    <option value="">Selecciona…</option>
                    <option value="MADRE">Madre</option>
                    <option value="PADRE">Padre</option>
                    <option value="TUTOR_LEGAL">Tutor legal</option>
                    <option value="OTRO">Otro</option>
                  </SelectInput>
                </FieldWrapper>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FieldWrapper
                  label="Teléfono del tutor"
                  htmlFor="guardian.guardianPhoneE164"
                  error={form.formState.errors.guardian?.guardianPhoneE164?.message}
                >
                  <TextInput
                    id="guardian.guardianPhoneE164"
                    type="tel"
                    placeholder="+523312345678"
                    error={!!form.formState.errors.guardian?.guardianPhoneE164}
                    {...form.register("guardian.guardianPhoneE164")}
                  />
                </FieldWrapper>
                <FieldWrapper
                  label="Correo del tutor"
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
                label="Referencia de identificación del tutor (INE)"
                htmlFor="guardian.guardianIdDocumentKey"
                error={form.formState.errors.guardian?.guardianIdDocumentKey?.message}
                hint="No hay carga de archivo todavía — pide el documento por separado y anota aquí su referencia."
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
            Registrar paciente
          </Button>
        </form>
      </Card>

      <Link href="/agenda" className="text-sm font-medium text-brand-700 underline">
        Volver a la agenda
      </Link>
    </main>
  );
}
