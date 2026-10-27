"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import {
  availabilityRuleCreateSchema,
  availabilityExceptionCreateSchema,
  practiceLocationSchema,
  doctorServiceSchema,
  minutesToTimeOfDay,
  type AvailabilityRuleCreateInput,
  type AvailabilityExceptionCreateInput,
  type PracticeLocationInput,
  type DoctorServiceInput,
} from "@medicfy/contracts";
import { apiFetch, expectArray } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { FieldWrapper, TextInput, SelectInput } from "@/components/ui/field";
import { DateInput } from "@/components/ui/date-input";
import { Card, LoadingState, EmptyState, ErrorState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";
import { useZodResolver } from "@/lib/i18n/validation";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { translateKeyed } from "@/lib/i18n/keyed";

// Índice 0 = domingo, igual que Date.getDay() y que el `weekday` del
// servidor.
const WEEKDAY_LABEL_KEYS: MessageKey[] = [
  "disponibilidad.dias.domingo",
  "disponibilidad.dias.lunes",
  "disponibilidad.dias.martes",
  "disponibilidad.dias.miercoles",
  "disponibilidad.dias.jueves",
  "disponibilidad.dias.viernes",
  "disponibilidad.dias.sabado",
];
const MODALITY_LABEL_KEYS: Record<string, MessageKey> = {
  IN_PERSON: "disponibilidad.modalidad.IN_PERSON",
  ONLINE: "disponibilidad.modalidad.ONLINE",
};
const SERVICE_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  FIRST_VISIT: "disponibilidad.tipoServicio.FIRST_VISIT",
  FOLLOW_UP: "disponibilidad.tipoServicio.FOLLOW_UP",
  TELECONSULTATION: "disponibilidad.tipoServicio.TELECONSULTATION",
  PROCEDURE: "disponibilidad.tipoServicio.PROCEDURE",
};

interface PracticeLocation {
  id: string;
  name: string;
  addressStreet: string | null;
  addressMunicipality: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

interface DoctorService {
  id: string;
  name: string;
  serviceType: "FIRST_VISIT" | "FOLLOW_UP" | "TELECONSULTATION" | "PROCEDURE";
  durationMinutes: number;
  priceMxn: number;
  isActive: boolean;
}

interface AvailabilityRule {
  id: string;
  modality: "IN_PERSON" | "ONLINE";
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotDurationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
}

interface AvailabilityException {
  id: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  blocksAllDay: boolean;
}

// DOC-03. M4-RN-004/006 (traslapes rechazados, bloqueos que afectan
// citas) ya viven en el backend — esta pantalla es el CRUD encima.
export default function DisponibilidadPage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <LoadingState />
      </main>
    );
  }

  return <DisponibilidadContent accessToken={accessToken} />;
}

// ServicesSection necesita la lista de consultorios para su selector
// (un servicio presencial se liga a uno) — vive aquí, no dentro de
// LocationsSection, para que agregar un consultorio nuevo se refleje
// de inmediato en ese selector sin recargar la página.
function DisponibilidadContent({ accessToken }: { accessToken: string }) {
  const t = useT();
  const [locations, setLocations] = useState<PracticeLocation[] | null>(null);
  const [locationsError, setLocationsError] = useState<unknown>(null);

  const loadLocations = useCallback(async () => {
    setLocationsError(null);
    try {
      setLocations(expectArray<PracticeLocation>(await apiFetch<unknown>("/doctors/me/locations", { accessToken })));
    } catch (error) {
      setLocationsError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("disponibilidad.titulo")}</h1>
        <p className="text-base text-gray-500">{t("disponibilidad.subtitulo")}</p>
      </div>
      <LocationsSection accessToken={accessToken} locations={locations} error={locationsError} onReload={loadLocations} />
      <ServicesSection accessToken={accessToken} locations={locations ?? []} />
      <RulesSection accessToken={accessToken} />
      <ExceptionsSection accessToken={accessToken} />
    </main>
  );
}

// M2-RN-004: "se necesita >=1 consultorio activo o teleconsulta para
// recibir citas". Sin esto, un DoctorService presencial no tiene dónde
// ocurrir y /citas/nueva nunca tiene espacios que ofrecer — hasta este
// pase, el backend (POST /doctors/me/locations) existía pero ninguna
// pantalla lo llamaba.
function LocationsSection({
  accessToken,
  locations,
  error,
  onReload,
}: {
  accessToken: string;
  locations: PracticeLocation[] | null;
  error: unknown;
  onReload: () => Promise<void>;
}) {
  const t = useT();
  const [createError, setCreateError] = useState<unknown>(null);

  const form = useForm<PracticeLocationInput>({
    resolver: useZodResolver<PracticeLocationInput>(practiceLocationSchema),
    defaultValues: { isPrimary: true },
  });

  async function onSubmit(values: PracticeLocationInput) {
    setCreateError(null);
    try {
      await apiFetch("/doctors/me/locations", { method: "POST", body: values, accessToken });
      form.reset({ isPrimary: false });
      await onReload();
    } catch (err) {
      setCreateError(err);
    }
  }

  async function onDelete(id: string) {
    setCreateError(null);
    try {
      await apiFetch(`/doctors/me/locations/${id}`, { method: "DELETE", accessToken });
      await onReload();
    } catch (err) {
      setCreateError(err);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("disponibilidad.consultorios.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("disponibilidad.consultorios.subtitulo")}</p>

      <div className="mt-4">
        {locations === null && !error ? <LoadingState /> : null}
        {error ? <ErrorState error={error} onRetry={onReload} /> : null}
        {locations && locations.length === 0 ? (
          <EmptyState title={t("disponibilidad.consultorios.vacio")} description={t("disponibilidad.consultorios.vacioAyuda")} />
        ) : null}
        {locations && locations.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {locations.map((loc) => (
              <li key={loc.id} className="flex items-center justify-between gap-4 rounded-md border border-gray-300 p-3">
                <p className="text-base text-gray-900">
                  <span className="font-medium">{loc.name}</span>
                  {loc.addressMunicipality ? <span className="text-gray-500"> · {loc.addressMunicipality}</span> : null}
                  {loc.isPrimary ? <span className="ml-2 text-sm text-brand-700">{t("disponibilidad.consultorios.principal")}</span> : null}
                </p>
                <button type="button" onClick={() => onDelete(loc.id)} className="min-h-[44px] text-sm font-medium text-danger-600 underline">
                  {t("disponibilidad.consultorios.eliminar")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4 border-t border-gray-300 pt-6" noValidate>
        <FieldWrapper label={t("disponibilidad.consultorios.nombre")} htmlFor="loc-name" error={form.formState.errors.name?.message}>
          <TextInput id="loc-name" placeholder={t("disponibilidad.consultorios.nombreEjemplo")} error={!!form.formState.errors.name} {...form.register("name")} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("disponibilidad.consultorios.calle")} htmlFor="loc-street">
            <TextInput id="loc-street" {...form.register("addressStreet")} />
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.consultorios.colonia")} htmlFor="loc-colonia">
            <TextInput id="loc-colonia" {...form.register("addressColonia")} />
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.consultorios.municipio")} htmlFor="loc-municipality">
            <TextInput id="loc-municipality" {...form.register("addressMunicipality")} />
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.consultorios.telefono")} htmlFor="loc-phone">
            <TextInput id="loc-phone" type="tel" {...form.register("phone")} />
          </FieldWrapper>
        </div>
        {createError ? <ErrorState error={createError} /> : null}
        <Button type="submit" isLoading={form.formState.isSubmitting}>
          {t("disponibilidad.consultorios.agregar")}
        </Button>
      </form>
    </Card>
  );
}

// Mismo motivo que LocationsSection: POST /doctors/me/services ya
// existía en el backend (M2-RN-003), pero /citas/nueva solo podía
// LISTAR servicios — sin esta pantalla no había forma de crear el
// primero, y sin al menos uno, agendar una cita es imposible.
function ServicesSection({ accessToken, locations }: { accessToken: string; locations: PracticeLocation[] }) {
  const t = useT();
  const [services, setServices] = useState<DoctorService[] | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [createError, setCreateError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setServices(expectArray<DoctorService>(await apiFetch<unknown>("/doctors/me/services", { accessToken })));
    } catch (error) {
      setListError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const form = useForm<DoctorServiceInput>({
    resolver: useZodResolver<DoctorServiceInput>(doctorServiceSchema),
    defaultValues: { serviceType: "FIRST_VISIT", durationMinutes: 30 },
  });

  async function onSubmit(values: DoctorServiceInput) {
    setCreateError(null);
    try {
      await apiFetch("/doctors/me/services", { method: "POST", body: values, accessToken });
      form.reset({ serviceType: values.serviceType, durationMinutes: values.durationMinutes });
      await load();
    } catch (error) {
      setCreateError(error);
    }
  }

  async function onDelete(id: string) {
    setListError(null);
    try {
      await apiFetch(`/doctors/me/services/${id}`, { method: "DELETE", accessToken });
      await load();
    } catch (error) {
      setListError(error);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("disponibilidad.servicios.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("disponibilidad.servicios.subtitulo")}</p>

      <div className="mt-4">
        {services === null && !listError ? <LoadingState /> : null}
        {listError ? <ErrorState error={listError} onRetry={load} /> : null}
        {services && services.length === 0 ? (
          <EmptyState title={t("disponibilidad.servicios.vacio")} description={t("disponibilidad.servicios.vacioAyuda")} />
        ) : null}
        {services && services.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 rounded-md border border-gray-300 p-3">
                <p className="text-base text-gray-900">
                  <span className="font-medium">{s.name}</span> · {translateKeyed(t, SERVICE_TYPE_LABEL_KEYS, s.serviceType)} · {s.durationMinutes} min · $
                  {s.priceMxn} MXN
                  {!s.isActive ? <span className="ml-2 text-sm text-gray-500">{t("disponibilidad.servicios.inactivo")}</span> : null}
                </p>
                <button type="button" onClick={() => onDelete(s.id)} className="min-h-[44px] text-sm font-medium text-danger-600 underline">
                  {t("disponibilidad.consultorios.eliminar")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4 border-t border-gray-300 pt-6" noValidate>
        <FieldWrapper label={t("disponibilidad.servicios.nombre")} htmlFor="svc-name" error={form.formState.errors.name?.message}>
          <TextInput id="svc-name" placeholder={t("disponibilidad.servicios.nombreEjemplo")} error={!!form.formState.errors.name} {...form.register("name")} />
        </FieldWrapper>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("disponibilidad.servicios.tipo")} htmlFor="svc-type" error={form.formState.errors.serviceType?.message}>
            <SelectInput id="svc-type" error={!!form.formState.errors.serviceType} {...form.register("serviceType")}>
              <option value="FIRST_VISIT">{t("disponibilidad.tipoServicio.FIRST_VISIT")}</option>
              <option value="FOLLOW_UP">{t("disponibilidad.tipoServicio.FOLLOW_UP")}</option>
              <option value="TELECONSULTATION">{t("disponibilidad.tipoServicio.TELECONSULTATION")}</option>
              <option value="PROCEDURE">{t("disponibilidad.tipoServicio.PROCEDURE")}</option>
            </SelectInput>
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.servicios.consultorio")} htmlFor="svc-location">
            <SelectInput id="svc-location" {...form.register("locationId", { setValueAs: (v: string) => (v === "" ? undefined : v) })}>
              <option value="">{t("disponibilidad.servicios.sinAsignar")}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("disponibilidad.servicios.duracion")} htmlFor="svc-duration" error={form.formState.errors.durationMinutes?.message}>
            <TextInput
              id="svc-duration"
              type="number"
              min={5}
              max={240}
              error={!!form.formState.errors.durationMinutes}
              {...form.register("durationMinutes", { valueAsNumber: true })}
            />
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.servicios.precio")} htmlFor="svc-price" error={form.formState.errors.priceMxn?.message}>
            <TextInput
              id="svc-price"
              type="number"
              min={1}
              max={99999}
              error={!!form.formState.errors.priceMxn}
              {...form.register("priceMxn", { valueAsNumber: true })}
            />
          </FieldWrapper>
        </div>
        {createError ? <ErrorState error={createError} /> : null}
        <Button type="submit" isLoading={form.formState.isSubmitting}>
          {t("disponibilidad.servicios.agregar")}
        </Button>
      </form>
    </Card>
  );
}

function RulesSection({ accessToken }: { accessToken: string }) {
  const t = useT();
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [createError, setCreateError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setRules(expectArray<AvailabilityRule>(await apiFetch<unknown>("/doctors/me/availability-rules", { accessToken })));
    } catch (error) {
      setListError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const form = useForm<AvailabilityRuleCreateInput>({
    resolver: useZodResolver<AvailabilityRuleCreateInput>(availabilityRuleCreateSchema),
    defaultValues: { modality: "IN_PERSON", weekday: 1, slotDurationMinutes: 30, bufferMinutes: 0 },
  });

  async function onSubmit(values: AvailabilityRuleCreateInput) {
    setCreateError(null);
    try {
      await apiFetch("/doctors/me/availability-rules", { method: "POST", body: values, accessToken });
      form.reset({ modality: values.modality, weekday: values.weekday, slotDurationMinutes: values.slotDurationMinutes, bufferMinutes: 0 });
      await load();
    } catch (error) {
      setCreateError(error);
    }
  }

  async function onDelete(id: string) {
    setListError(null);
    try {
      await apiFetch(`/doctors/me/availability-rules/${id}`, { method: "DELETE", accessToken });
      await load();
    } catch (error) {
      setListError(error);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("disponibilidad.horario.titulo")}</h2>

      <div className="mt-4">
        {rules === null && !listError ? <LoadingState /> : null}
        {listError ? <ErrorState error={listError} onRetry={load} /> : null}
        {rules && rules.length === 0 ? (
          <EmptyState title={t("disponibilidad.horario.vacio")} description={t("disponibilidad.horario.vacioAyuda")} />
        ) : null}
        {rules && rules.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-4 rounded-md border border-gray-300 p-3">
                <p className="text-base text-gray-900">
                  <span className="font-medium">{t(WEEKDAY_LABEL_KEYS[rule.weekday] ?? "disponibilidad.dias.domingo")}</span>{" "}
                  {minutesToTimeOfDay(rule.startMinute)}–{minutesToTimeOfDay(rule.endMinute)} · {translateKeyed(t, MODALITY_LABEL_KEYS, rule.modality)}
                  {t("disponibilidad.horario.espaciosDe", { min: rule.slotDurationMinutes })}
                  {!rule.isActive ? <span className="ml-2 text-sm text-gray-500">{t("disponibilidad.horario.inactiva")}</span> : null}
                </p>
                <button type="button" onClick={() => onDelete(rule.id)} className="min-h-[44px] text-sm font-medium text-danger-600 underline">
                  {t("disponibilidad.consultorios.eliminar")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4 border-t border-gray-300 pt-6" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("disponibilidad.horario.dia")} htmlFor="weekday" error={form.formState.errors.weekday?.message}>
            <SelectInput id="weekday" error={!!form.formState.errors.weekday} {...form.register("weekday", { valueAsNumber: true })}>
              {WEEKDAY_LABEL_KEYS.map((labelKey, index) => (
                <option key={labelKey} value={index}>
                  {t(labelKey)}
                </option>
              ))}
            </SelectInput>
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.horario.modalidad")} htmlFor="modality" error={form.formState.errors.modality?.message}>
            <SelectInput id="modality" error={!!form.formState.errors.modality} {...form.register("modality")}>
              <option value="IN_PERSON">{t("disponibilidad.modalidad.IN_PERSON")}</option>
              <option value="ONLINE">{t("disponibilidad.modalidad.ONLINE")}</option>
            </SelectInput>
          </FieldWrapper>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("disponibilidad.horario.horaInicio")} htmlFor="startTime" error={form.formState.errors.startTime?.message}>
            <TextInput id="startTime" type="time" error={!!form.formState.errors.startTime} {...form.register("startTime")} />
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.horario.horaFin")} htmlFor="endTime" error={form.formState.errors.endTime?.message}>
            <TextInput id="endTime" type="time" error={!!form.formState.errors.endTime} {...form.register("endTime")} />
          </FieldWrapper>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper
            label={t("disponibilidad.horario.duracionEspacio")}
            htmlFor="slotDurationMinutes"
            error={form.formState.errors.slotDurationMinutes?.message}
          >
            <TextInput
              id="slotDurationMinutes"
              type="number"
              min={5}
              max={240}
              error={!!form.formState.errors.slotDurationMinutes}
              {...form.register("slotDurationMinutes", { valueAsNumber: true })}
            />
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.horario.buffer")} htmlFor="bufferMinutes" error={form.formState.errors.bufferMinutes?.message}>
            <TextInput
              id="bufferMinutes"
              type="number"
              min={0}
              max={60}
              error={!!form.formState.errors.bufferMinutes}
              {...form.register("bufferMinutes", { valueAsNumber: true })}
            />
          </FieldWrapper>
        </div>

        <FieldWrapper label={t("disponibilidad.horario.vigenteDesde")} htmlFor="validFrom" error={form.formState.errors.validFrom?.message}>
          <Controller
            control={form.control}
            name="validFrom"
            render={({ field }) => (
              <DateInput
                ref={field.ref}
                id="validFrom"
                name={field.name}
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={!!form.formState.errors.validFrom}
              />
            )}
          />
        </FieldWrapper>

        {createError ? <ErrorState error={createError} /> : null}

        <Button type="submit" isLoading={form.formState.isSubmitting}>
          {t("disponibilidad.agregarHorario")}
        </Button>
      </form>
    </Card>
  );
}

// Alcance deliberadamente acotado a bloqueos de día(s) completo(s)
// (blocksAllDay=true, ej. vacaciones) — el mismo patrón UTC-medianoche
// que ya usa m4.integration.spec.ts para este caso. Un bloqueo de solo
// una franja horaria (ej. "hoy 14:00-17:00") necesitaría resolver la
// hora local del consultorio a UTC, y CLAUDE.md §4 prohíbe hacer ese
// cálculo en el navegador — construirlo bien requiere que el backend
// acepte fecha+hora local sin resolver, como ya hace
// availabilityRuleCreateSchema con startTime/endTime. No construido
// esta vuelta; queda anotado como hallazgo, no como bug silencioso.
function ExceptionsSection({ accessToken }: { accessToken: string }) {
  const t = useT();
  const [exceptions, setExceptions] = useState<AvailabilityException[] | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [createError, setCreateError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setExceptions(expectArray<AvailabilityException>(await apiFetch<unknown>("/doctors/me/availability-exceptions", { accessToken })));
    } catch (error) {
      setListError(error);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const form = useForm<{ startDate: string; endDate: string; reason?: string }>({
    defaultValues: { startDate: "", endDate: "", reason: "" },
  });

  async function onSubmit(values: { startDate: string; endDate: string; reason?: string }) {
    setCreateError(null);
    try {
      const body: AvailabilityExceptionCreateInput = availabilityExceptionCreateSchema.parse({
        startAt: `${values.startDate}T00:00:00.000Z`,
        endAt: `${values.endDate}T23:59:00.000Z`,
        blocksAllDay: true,
        ...(values.reason ? { reason: values.reason } : {}),
      });
      await apiFetch("/doctors/me/availability-exceptions", { method: "POST", body, accessToken });
      form.reset({ startDate: "", endDate: "", reason: "" });
      await load();
    } catch (error) {
      setCreateError(error);
    }
  }

  async function onDelete(id: string) {
    setListError(null);
    try {
      await apiFetch(`/doctors/me/availability-exceptions/${id}`, { method: "DELETE", accessToken });
      await load();
    } catch (error) {
      setListError(error);
    }
  }

  return (
    <Card>
      <h2 className="font-heading text-xl text-brand-900">{t("disponibilidad.bloqueos.titulo")}</h2>
      <p className="text-sm text-gray-500">{t("disponibilidad.bloqueos.subtitulo")}</p>

      <div className="mt-4">
        {exceptions === null && !listError ? <LoadingState /> : null}
        {listError ? <ErrorState error={listError} onRetry={load} /> : null}
        {exceptions && exceptions.length === 0 ? (
          <EmptyState title={t("disponibilidad.bloqueos.vacio")} description={t("disponibilidad.bloqueos.vacioAyuda")} />
        ) : null}
        {exceptions && exceptions.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {exceptions.map((exception) => (
              <li key={exception.id} className="flex items-center justify-between gap-4 rounded-md border border-gray-300 p-3">
                <p className="text-base text-gray-900">
                  {exception.startAt.slice(0, 10)} – {exception.endAt.slice(0, 10)}
                  {exception.reason ? <span className="text-gray-500"> · {exception.reason}</span> : null}
                </p>
                <button
                  type="button"
                  onClick={() => onDelete(exception.id)}
                  className="min-h-[44px] text-sm font-medium text-danger-600 underline"
                >
                  {t("disponibilidad.consultorios.eliminar")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4 border-t border-gray-300 pt-6" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <FieldWrapper label={t("disponibilidad.bloqueos.desde")} htmlFor="startDate" error={form.formState.errors.startDate?.message}>
            <Controller
              control={form.control}
              name="startDate"
              rules={{ required: t("disponibilidad.bloqueos.seleccionaFecha") }}
              render={({ field }) => (
                <DateInput
                  ref={field.ref}
                  id="startDate"
                  name={field.name}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={!!form.formState.errors.startDate}
                />
              )}
            />
          </FieldWrapper>
          <FieldWrapper label={t("disponibilidad.bloqueos.hasta")} htmlFor="endDate" error={form.formState.errors.endDate?.message}>
            <Controller
              control={form.control}
              name="endDate"
              rules={{ required: t("disponibilidad.bloqueos.seleccionaFecha") }}
              render={({ field }) => (
                <DateInput
                  ref={field.ref}
                  id="endDate"
                  name={field.name}
                  min={form.watch("startDate") || undefined}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={!!form.formState.errors.endDate}
                />
              )}
            />
          </FieldWrapper>
        </div>
        <FieldWrapper label={t("disponibilidad.bloqueos.motivo")} htmlFor="reason" error={form.formState.errors.reason?.message}>
          <TextInput id="reason" placeholder={t("disponibilidad.bloqueos.motivoEjemplo")} {...form.register("reason")} />
        </FieldWrapper>

        {createError ? <ErrorState error={createError} /> : null}

        <Button type="submit" isLoading={form.formState.isSubmitting}>
          {t("disponibilidad.bloqueos.agregar")}
        </Button>
      </form>
    </Card>
  );
}
