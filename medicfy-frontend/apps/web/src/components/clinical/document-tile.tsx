"use client";

import { Modal } from "@/components/ui/modal";
import { DocumentPreview } from "@/components/clinical/document-preview";
import { useT } from "@/lib/i18n/context";

type TileStatusTone = "ok" | "pending" | "cancelled";

const STATUS_CLASS: Record<TileStatusTone, string> = {
  ok: "border-success-600 text-success-600",
  pending: "border-warn-600 text-warn-600",
  cancelled: "border-gray-500 text-gray-500",
};

// Un documento del expediente como "mini carpeta": se reconoce de un
// vistazo y se abre con un clic en el visor del sistema (DocumentViewer).
// El estado lleva TEXTO además del color (§5: el color nunca es el
// único portador de significado).
export function DocumentTile({
  title,
  subtitle,
  fileLabel,
  status,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  // Lo que se lee en la carpeta: "PDF", "JPG"...
  fileLabel: string;
  status?: { label: string; tone: TileStatusTone };
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("clinico.documento.abrir", { nombre: title })}
      className="flex min-h-11 w-full flex-col items-center gap-2 rounded-lg border border-gray-300 bg-white p-3 text-center transition-colors hover:border-brand-700 hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    >
      <FolderIcon label={fileLabel} />
      <span className="line-clamp-2 text-sm font-medium text-gray-900">{title}</span>
      {subtitle ? <span className="text-xs text-gray-500">{subtitle}</span> : null}
      {status ? (
        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status.tone]}`}>{status.label}</span>
      ) : null}
    </button>
  );
}

function FolderIcon({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 64 52" className="h-12 w-14" aria-hidden="true">
      <path d="M4 10a4 4 0 0 1 4-4h16l6 6h26a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" className="fill-brand-100 stroke-brand-700" strokeWidth="2" />
      <path d="M4 18h56" className="stroke-brand-700" strokeWidth="2" />
      <text x="32" y="38" textAnchor="middle" className="fill-brand-900" fontSize="12" fontWeight="700" fontFamily="sans-serif">
        {label}
      </text>
    </svg>
  );
}

// Visor de documento a pantalla completa, dentro del sistema.
export function DocumentViewer({
  document,
  accessToken,
  onClose,
  onDownload,
}: {
  document: { title: string; path: string; downloadName: string } | null;
  accessToken: string;
  onClose: () => void;
  onDownload?: () => void;
}) {
  const t = useT();
  return (
    <Modal open={document !== null} onClose={onClose} title={document?.title ?? t("clinico.documento.visorTitulo")}>
      {document ? (
        <div className="h-full overflow-y-auto p-4 sm:p-6">
          <DocumentPreview
            path={document.path}
            accessToken={accessToken}
            downloadName={document.downloadName}
            {...(onDownload ? { onDownload } : {})}
          />
        </div>
      ) : null}
    </Modal>
  );
}
