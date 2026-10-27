"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Modal } from "./modal";
import { Button } from "./button";
import { FieldWrapper, Textarea } from "./field";
import { useT } from "@/lib/i18n/context";

// M-26 (auditoría 2026-10-21): window.confirm y window.prompt no se
// traducen, no validan, no respetan el foco ni el estilo y algunos
// navegadores los bloquean. Este diálogo se usa igual —como promesa—
// pero dentro de la aplicación:
//   const { confirm, askReason, dialog } = useConfirmDialog();
//   if (!(await confirm({ title, body }))) return;
//   const reason = await askReason({ title, label }); // null = canceló
// y `dialog` se pinta una vez en el árbol del componente.

// Mismo rango que exige el backend para motivos de cancelación.
export const REASON_MIN_LENGTH = 15;
export const REASON_MAX_LENGTH = 500;

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}

interface ReasonOptions extends ConfirmOptions {
  label: string;
  minLength?: number;
}

type Pending =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "reason"; options: ReasonOptions; resolve: (value: string | null) => void };

export function useConfirmDialog() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: "confirm", options, resolve })),
    []
  );
  const askReason = useCallback(
    (options: ReasonOptions) => new Promise<string | null>((resolve) => setPending({ kind: "reason", options, resolve })),
    []
  );

  const dialog = pending ? (
    <ConfirmDialog
      pending={pending}
      onDone={() => {
        setPending(null);
      }}
    />
  ) : null;

  return { confirm, askReason, dialog };
}

function ConfirmDialog({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const settled = useRef(false);
  const { options } = pending;
  const minLength = pending.kind === "reason" ? (pending.options.minLength ?? REASON_MIN_LENGTH) : 0;
  const trimmed = reason.trim();
  const reasonValid = pending.kind !== "reason" || (trimmed.length >= minLength && trimmed.length <= REASON_MAX_LENGTH);

  function settle(accepted: boolean) {
    if (settled.current) return;
    settled.current = true;
    if (pending.kind === "confirm") pending.resolve(accepted);
    else pending.resolve(accepted ? trimmed : null);
    onDone();
  }

  return (
    <Modal open size="dialog" title={options.title} onClose={() => settle(false)}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (reasonValid) settle(true);
        }}
      >
        {options.body ? <div className="text-base text-gray-700">{options.body}</div> : null}
        {pending.kind === "reason" ? (
          <FieldWrapper label={pending.options.label} htmlFor="confirm-dialog-reason">
            <Textarea
              id="confirm-dialog-reason"
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <p className="mt-1 text-sm text-gray-500">{t("ui.confirmacion.longitudMotivo", { min: minLength, max: REASON_MAX_LENGTH, n: trimmed.length })}</p>
          </FieldWrapper>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => settle(false)}>
            {t("ui.confirmacion.cancelar")}
          </Button>
          <Button type="submit" variant={options.destructive ? "danger" : "primary"} disabled={!reasonValid}>
            {options.confirmLabel ?? t("ui.confirmacion.confirmar")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
