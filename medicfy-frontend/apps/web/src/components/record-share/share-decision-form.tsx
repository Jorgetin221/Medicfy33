"use client";

import { useState } from "react";
import {
  SHARE_DURATION_DAYS_OPTIONS,
  SENSITIVE_CATEGORIES,
  type RecordShareAuthorizationInfo,
  type RecordShareDecisionInput,
  type SensitiveCategory,
  type ShareScope,
} from "@medicfy/contracts";
import { Aviso } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldWrapper, SelectInput } from "@/components/ui/field";
import type { MessageKey } from "@/lib/i18n/dictionaries";

// Resumen de la solicitud y formulario de decisión del paciente.
// Compartidos por la página pública de autorización (con código) y la
// bandeja del paciente con cuenta (/mi-cuenta/notificaciones): las
// mismas opciones y el mismo texto de consentimiento en los dos caminos.

// D-EXP-05: nunca se negocia a la baja tampoco — se fuerza siempre,
// igual que en la pantalla del médico (solicitar/page.tsx).
export function withSummary(scope: ShareScope[]): ShareScope[] {
  return scope.includes("SUMMARY") ? scope : ["SUMMARY", ...scope];
}

export function RequestSummary({ info, t }: { info: RecordShareAuthorizationInfo; t: (key: MessageKey, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-gray-900">
        <strong>{info.requesterDisplayName}</strong> ({t("expedienteCompartido.autorizar.solicitud.cedula")} {info.requesterLicense}
        {info.requesterSpecialtyName ? `, ${info.requesterSpecialtyName}` : ""}) {t("expedienteCompartido.autorizar.solicitud.intro")}
      </p>
      <p className="text-sm text-gray-700">
        <strong>{t("expedienteCompartido.autorizar.solicitud.motivo")}:</strong> {info.reason}
      </p>
      <p className="text-sm text-gray-700">
        <strong>{t("expedienteCompartido.autorizar.solicitud.pideVer")}:</strong>{" "}
        {info.requestedScope.map((scope) => t(`expedienteCompartido.solicitar.alcanceOpciones.${scope}` as MessageKey)).join(" · ")}
      </p>
      <p className="text-sm text-gray-700">{t("expedienteCompartido.autorizar.solicitud.porHastaDias", { dias: info.requestedDurationDays })}</p>
    </div>
  );
}

export function DecisionForm({
  info,
  pending,
  onDecide,
  t,
}: {
  info: RecordShareAuthorizationInfo;
  pending: boolean;
  onDecide: (body: RecordShareDecisionInput) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const [approvedScope, setApprovedScope] = useState<ShareScope[]>(info.requestedScope);
  const [includedSensitiveCategories, setIncludedSensitiveCategories] = useState<SensitiveCategory[]>([]);
  const [pregnancyIncluded, setPregnancyIncluded] = useState(true);
  const durationOptions = SHARE_DURATION_DAYS_OPTIONS.filter((d) => d <= info.requestedDurationDays);
  const [durationDays, setDurationDays] = useState<number>(info.requestedDurationDays);

  function toggleScope(scope: ShareScope, checked: boolean) {
    setApprovedScope((prev) => withSummary(checked ? [...prev, scope] : prev.filter((s) => s !== scope)));
  }
  function toggleSensitive(category: SensitiveCategory, checked: boolean) {
    setIncludedSensitiveCategories((prev) => (checked ? [...prev, category] : prev.filter((c) => c !== category)));
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-heading text-lg text-brand-900">{t("expedienteCompartido.autorizar.decision.titulo")}</h2>
        <p className="text-sm text-gray-500">{t("expedienteCompartido.autorizar.decision.subtitulo")}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <label className="flex min-h-11 items-center gap-3 text-base text-gray-900">
          <input type="checkbox" checked disabled className="h-5 w-5" />
          {t("expedienteCompartido.solicitar.alcanceOpciones.SUMMARY")}
        </label>
        {info.requestedScope
          .filter((s) => s !== "SUMMARY")
          .map((scope) => (
            <label key={scope} className="flex min-h-11 items-center gap-3 text-base text-gray-900">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={approvedScope.includes(scope)}
                onChange={(e) => toggleScope(scope, e.target.checked)}
              />
              {t(`expedienteCompartido.solicitar.alcanceOpciones.${scope}` as MessageKey)}
            </label>
          ))}
      </fieldset>

      <FieldWrapper label={t("expedienteCompartido.autorizar.decision.duracion")} htmlFor="decide-duration">
        <SelectInput id="decide-duration" value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))}>
          {durationOptions.map((days) => (
            <option key={days} value={days}>
              {t(`expedienteCompartido.solicitar.duracionOpciones.${days}` as MessageKey)}
            </option>
          ))}
        </SelectInput>
      </FieldWrapper>

      <fieldset className="flex flex-col gap-2 rounded-md border border-gray-300 p-3">
        <legend className="text-sm font-medium text-gray-700">{t("expedienteCompartido.autorizar.decision.sensiblesTitulo")}</legend>
        <p className="text-sm text-gray-500">{t("expedienteCompartido.autorizar.decision.sensiblesAyuda")}</p>
        {SENSITIVE_CATEGORIES.map((category) => (
          <label key={category} className="flex min-h-11 items-center gap-3 text-base text-gray-900">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={includedSensitiveCategories.includes(category)}
              onChange={(e) => toggleSensitive(category, e.target.checked)}
            />
            {t(`expedienteCompartido.autorizar.decision.sensibles.${category}` as MessageKey)}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1 rounded-md border border-gray-300 p-3">
        <label className="flex min-h-11 items-center gap-3 text-base text-gray-900">
          <input type="checkbox" className="h-5 w-5" checked={pregnancyIncluded} onChange={(e) => setPregnancyIncluded(e.target.checked)} />
          {t("expedienteCompartido.autorizar.decision.embarazoTitulo")}
        </label>
        {!pregnancyIncluded && <Aviso variant="advertencia" title={t("expedienteCompartido.autorizar.decision.embarazoAyuda")} />}
      </div>

      <div className="rounded-md border border-gray-300 bg-gray-50 p-3">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">{t("expedienteCompartido.autorizar.decision.consentimientoTitulo")}</h3>
        <p className="whitespace-pre-line text-sm text-gray-700">{info.consentText}</p>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => onDecide({ decision: "DENIED" })}>
          {t("expedienteCompartido.autorizar.decision.rechazar")}
        </Button>
        <Button
          type="button"
          isLoading={pending}
          disabled={pending}
          onClick={() =>
            onDecide({
              decision: "APPROVED",
              approvedScope: withSummary(approvedScope),
              includedSensitiveCategories,
              pregnancyExcluded: !pregnancyIncluded,
              durationDays: durationDays as 7 | 30 | 90,
            })
          }
        >
          {t("expedienteCompartido.autorizar.decision.aprobar")}
        </Button>
      </div>
    </div>
  );
}
