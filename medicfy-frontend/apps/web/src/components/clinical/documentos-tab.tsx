"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchBlob, apiUpload, expectArray } from "@/lib/api-client";
import { blobToDataUrl } from "@/lib/blob-to-data-url";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { FileFormatNotice, useAcceptedFile } from "@/components/ui/accepted-file";
import { Panel } from "@/components/ui/panel";
import { FieldWrapper, SelectInput, TextInput } from "@/components/ui/field";
import { DateInput } from "@/components/ui/date-input";
import { PdfViewer } from "@/components/clinical/pdf-viewer";
import { useI18n } from "@/lib/i18n/context";
import { formatDateLong } from "@/lib/i18n/format";
import type { MessageKey } from "@/lib/i18n/dictionaries";

type AttachmentCategory = "LAB_RESULT" | "IMAGING" | "EXTERNAL_DOCUMENT" | "PHOTO" | "OTHER";

interface ClinicalAttachmentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  studyDate: string | null;
  description: string | null;
  uploadedAt: string;
}

const CATEGORY_LABEL_KEY: Record<AttachmentCategory, MessageKey> = {
  LAB_RESULT: "clinico.documentos.categoria.LAB_RESULT",
  IMAGING: "clinico.documentos.categoria.IMAGING",
  EXTERNAL_DOCUMENT: "clinico.documentos.categoria.EXTERNAL_DOCUMENT",
  PHOTO: "clinico.documentos.categoria.PHOTO",
  OTHER: "clinico.documentos.categoria.OTHER",
};

// Mismo trío que ya acepta el resto de la app (perfil, resultados de
// laboratorio) — upload-validation.util.ts (backend) es la autoridad
// real; esto es solo el filtro nativo del selector de archivo.
const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png";


// Fase 5 · Prompt 41 — "Documentos con acceso controlado": el visor
// SIEMPRE pasa por una URL firmada de vida corta que se pide cada vez
// (nunca se guarda ni se reusa) y SIEMPRE muestra el documento embebido
// — nunca ofrece descargarlo, a diferencia del visor de resultados de
// laboratorio (tab-ordenes.tsx), que sí lo permite.
export function DocumentosTab({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const { t, locale } = useI18n();
  const [documents, setDocuments] = useState<ClinicalAttachmentRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  // DOCUMENT_ACCEPT se valida aquí, no en el <input> (Safari, lib/file-accept.ts).
  const documentFormat = useAcceptedFile(DOCUMENT_ACCEPT);
  const [category, setCategory] = useState<AttachmentCategory>("EXTERNAL_DOCUMENT");
  const [studyDate, setStudyDate] = useState("");
  const [description, setDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ pdfData: ArrayBuffer | null; imageUrl: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = useCallback(() => {
    apiFetch<unknown>(`/records/patients/${patientId}/documents`, { accessToken })
      .then((data) => setDocuments(expectArray<ClinicalAttachmentRecord>(data)))
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(loadDocuments, [loadDocuments]);

  async function uploadDocument(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      // M-23: metadatos como campos del formulario, no en la URL.
      const fields: Record<string, string> = { category };
      if (studyDate) fields.studyDate = studyDate;
      if (description.trim()) fields.description = description.trim();
      await apiUpload(`/records/patients/${patientId}/documents`, file, { accessToken, fields });
      setStudyDate("");
      setDescription("");
      loadDocuments();
    } catch (err) {
      setError(err);
    } finally {
      setIsUploading(false);
    }
  }

  async function viewDocument(documentId: string) {
    setError(null);
    setViewingId(documentId);
    try {
      const signed = await apiFetch<{ url: string; expiresAt: string }>(
        `/records/patients/${patientId}/documents/${documentId}/signed-url`,
        { accessToken }
      );
      const blob = await apiFetchBlob(signed.url, { accessToken });
      if (!blob) return;
      if (blob.type === "application/pdf") {
        setPreview({ pdfData: await blob.arrayBuffer(), imageUrl: null });
      } else {
        setPreview({ pdfData: null, imageUrl: await blobToDataUrl(blob) });
      }
    } catch (err) {
      setError(err);
    } finally {
      setViewingId(null);
    }
  }

  const previewPanel = (
    <Panel open={preview !== null} onClose={() => setPreview(null)} title={t("clinico.documentos.documento")} wide>
      {preview?.pdfData ? (
        <PdfViewer data={preview.pdfData} />
      ) : preview?.imageUrl ? (
        <img src={preview.imageUrl} alt={t("clinico.documentos.documentoClinico")} className="max-w-full" />
      ) : null}
    </Panel>
  );

  const uploadForm = (
    <Card>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t("clinico.documentos.subirDocumento")}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FieldWrapper label={t("clinico.documentos.etiquetaCategoria")} htmlFor="doc-category">
          <SelectInput
            id="doc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
          >
            {(Object.keys(CATEGORY_LABEL_KEY) as AttachmentCategory[]).map((value) => (
              <option key={value} value={value}>
                {t(CATEGORY_LABEL_KEY[value])}
              </option>
            ))}
          </SelectInput>
        </FieldWrapper>
        <FieldWrapper label={t("clinico.documentos.fechaEstudio")} htmlFor="doc-study-date">
          <DateInput id="doc-study-date" value={studyDate} onChange={setStudyDate} />
        </FieldWrapper>
        <FieldWrapper label={t("clinico.documentos.descripcion")} htmlFor="doc-description">
          <TextInput id="doc-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FieldWrapper>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && documentFormat.check(file)) void uploadDocument(file);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="secondary" isLoading={isUploading} onClick={() => fileInputRef.current?.click()} className="min-h-11 px-3 text-sm">
          {t("clinico.documentos.elegirArchivo")}
        </Button>
        <span className="text-sm text-gray-500">{t("clinico.documentos.formatoPermitido")}</span>
      </div>
    </Card>
  );

  if (error && !documents) {
    return (
      <div className="flex flex-col gap-4">
        {uploadForm}
        <ErrorState error={error} onRetry={loadDocuments} />
        {previewPanel}
      </div>
    );
  }

  if (!documents) {
    return (
      <div className="flex flex-col gap-4">
        {uploadForm}
        <LoadingState label={t("clinico.cargando.documentos")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {uploadForm}
      <FileFormatNotice notice={documentFormat.notice} />
      {error ? <ErrorState error={error} /> : null}
      {documents.length === 0 ? (
        <EmptyState title={t("clinico.documentos.sinDocumentos")} description={t("clinico.documentos.sinDocumentosAyuda")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-2">
              <div>
                <p className="text-base text-gray-900">
                  {t(CATEGORY_LABEL_KEY[doc.category])}
                  {doc.studyDate ? t("clinico.documentos.estudioDel", { fecha: formatDateLong(locale, doc.studyDate) }) : ""}
                </p>
                <p className="text-sm text-gray-500">
                  {t("clinico.documentos.subido", { archivo: doc.fileName, fecha: formatDateLong(locale, doc.uploadedAt) })}
                  {doc.description ? ` · "${doc.description}"` : ""}
                </p>
              </div>
              <Button type="button" variant="secondary" isLoading={viewingId === doc.id} onClick={() => void viewDocument(doc.id)} className="min-h-11 px-3 text-sm">
                {t("clinico.documentos.verDocumento")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {previewPanel}
    </div>
  );
}
