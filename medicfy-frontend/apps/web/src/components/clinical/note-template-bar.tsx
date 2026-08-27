"use client";

import { useEffect, useState } from "react";
import type { NoteTemplateCreateInput } from "@medicfy/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { TextInput, FieldWrapper } from "@/components/ui/field";

export interface NoteTemplate {
  id: string;
  label: string;
  content: string;
  shortcutKey: string | null;
}

// CLAUDE.md §6: "plantillas insertables por atajo de teclado". El
// contenido SIEMPRE lo escribe el médico (nunca texto clínico
// precargado por Medicfy — CLAUDE.md §7): esta barra solo guarda y
// reinserta lo que el propio médico ya redactó en algún campo.
export function NoteTemplateBar({
  accessToken,
  onInsert,
  pendingContent,
}: {
  accessToken: string;
  onInsert: (content: string) => void;
  pendingContent: string;
}) {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [shortcutKey, setShortcutKey] = useState("");
  const [error, setError] = useState<unknown>(null);

  function load() {
    apiFetch<NoteTemplate[]>("/note-templates", { accessToken })
      .then(setTemplates)
      .catch(() => {});
  }

  useEffect(load, [accessToken]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey || !/^[1-9]$/.test(e.key)) return;
      const template = templates.find((t) => t.shortcutKey === e.key);
      if (template) {
        e.preventDefault();
        onInsert(template.content);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [templates, onInsert]);

  async function saveAsTemplate() {
    if (!label.trim() || !pendingContent.trim()) return;
    setError(null);
    try {
      const body: NoteTemplateCreateInput = { label: label.trim(), content: pendingContent.trim(), ...(shortcutKey ? { shortcutKey } : {}) };
      await apiFetch("/note-templates", { method: "POST", accessToken, body });
      setLabel("");
      setShortcutKey("");
      setIsCreating(false);
      load();
    } catch (err) {
      setError(err);
    }
  }

  async function removeTemplate(id: string) {
    await apiFetch(`/note-templates/${id}`, { method: "DELETE", accessToken }).catch(() => {});
    load();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-gray-300 p-2">
      <span className="text-sm font-medium text-gray-500">Plantillas:</span>
      {templates.length === 0 && !isCreating && <span className="text-sm text-gray-500">Ninguna todavía — escribe algo y guárdalo como plantilla.</span>}
      {templates.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-gray-300 pl-3 pr-1 text-sm">
          <button type="button" onClick={() => onInsert(t.content)} className="min-h-11 py-1 font-medium text-gray-700 hover:text-brand-700">
            {t.label}
            {t.shortcutKey && <span className="ml-1 text-gray-500">Alt+{t.shortcutKey}</span>}
          </button>
          <button
            type="button"
            onClick={() => removeTemplate(t.id)}
            aria-label={`Eliminar plantilla ${t.label}`}
            className="flex min-h-11 min-w-11 items-center justify-center text-gray-500 hover:text-danger-600"
          >
            ✕
          </button>
        </span>
      ))}
      {isCreating ? (
        <div className="flex w-full flex-col gap-2">
          {/* P4 §2.5 (#14): el texto que se congela como plantilla es el
              valor CRUDO del campo activo — escrito frente a un paciente
              concreto. La vista previa + el aviso obligan a verlo antes
              de guardarlo, porque una plantilla con datos de un paciente
              se reinsertará en expedientes de OTROS pacientes y esas
              notas se firman y se vuelven inmutables. */}
          <div className="w-full rounded-md border border-warn-600 bg-warn-50 p-2">
            <p className="text-sm font-medium text-gray-700">Esto es exactamente lo que se guardará como plantilla:</p>
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">{pendingContent.trim()}</pre>
            <p className="mt-1 text-sm text-gray-600">
              Revisa que no contenga datos del paciente actual (nombre, edad, teléfono, hallazgos específicos). Una plantilla se
              reutiliza en expedientes de otros pacientes.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
          <FieldWrapper label="Nombre" htmlFor="template-label">
            <TextInput id="template-label" value={label} onChange={(e) => setLabel(e.target.value)} className="w-40" />
          </FieldWrapper>
          <FieldWrapper label="Atajo Alt+ (1-9, opcional)" htmlFor="template-shortcut">
            <TextInput
              id="template-shortcut"
              maxLength={1}
              value={shortcutKey}
              onChange={(e) => setShortcutKey(e.target.value.replace(/[^1-9]/g, ""))}
              className="w-16"
            />
          </FieldWrapper>
          <Button type="button" onClick={saveAsTemplate} disabled={!label.trim() || !pendingContent.trim()} className="min-h-11 px-3 text-sm">
            Guardar
          </Button>
          <Button type="button" variant="secondary" onClick={() => setIsCreating(false)} className="min-h-11 px-3 text-sm">
            Cancelar
          </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setIsCreating(true)} disabled={!pendingContent.trim()} className="min-h-11 px-3 text-sm">
          + Guardar campo actual como plantilla
        </Button>
      )}
      {error ? (
        <p role="alert" className="w-full text-sm text-danger-600">
          {error instanceof ApiError ? error.message : "No se pudo guardar la plantilla."}
        </p>
      ) : null}
    </div>
  );
}
