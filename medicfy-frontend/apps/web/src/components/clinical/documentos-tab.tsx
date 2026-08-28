"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchBlob, apiUpload } from "@/lib/api-client";
import { blobToDataUrl } from "@/lib/blob-to-data-url";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { FieldWrapper, SelectInput, TextInput } from "@/components/ui/field";
import { PdfViewer } from "@/components/clinical/pdf-viewer";

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

const CATEGORY_LABEL: Record<AttachmentCategory, string> = {
  LAB_RESULT: "Resultado de laboratorio",
  IMAGING: "Estudio de imagen",
  EXTERNAL_DOCUMENT: "Documento externo",
  PHOTO: "Fotografía clínica",
  OTHER: "Otro",
};

// Mismo trío que ya acepta el resto de la app (perfil, resultados de
// laboratorio) — upload-validation.util.ts (backend) es la autoridad
// real; esto es solo el filtro nativo del selector de archivo.
const DOCUMENT_ACCEPT = "application/pdf,image/jpeg,image/png";
const DOCUMENT_FORMAT_HINT = "PDF, JPG o PNG · máx. 10 MB";

const MX_TIME_ZONE = "America/Mexico_City";
function formatMxDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone: MX_TIME_ZONE, dateStyle: "long" }).format(new Date(iso));
}

// Fase 5 · Prompt 41 — "Documentos con acceso controlado": el visor
// SIEMPRE pasa por una URL firmada de vida corta que se pide cada vez
// (nunca se guarda ni se reusa) y SIEMPRE muestra el documento embebido
// — nunca ofrece descargarlo, a diferencia del visor de resultados de
// laboratorio (tab-ordenes.tsx), que sí lo permite.
export function DocumentosTab({ patientId, accessToken }: { patientId: string; accessToken: string }) {
  const [documents, setDocuments] = useState<ClinicalAttachmentRecord[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [category, setCategory] = useState<AttachmentCategory>("EXTERNAL_DOCUMENT");
  const [studyDate, setStudyDate] = useState("");
  const [description, setDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ pdfData: ArrayBuffer | null; imageUrl: string | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = useCallback(() => {
    apiFetch<ClinicalAttachmentRecord[]>(`/records/patients/${patientId}/documents`, { accessToken })
      .then(setDocuments)
      .catch(setError);
  }, [patientId, accessToken]);

  useEffect(loadDocuments, [loadDocuments]);

  async function uploadDocument(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      const params = new URLSearchParams({ category });
      if (studyDate) params.set("studyDate", studyDate);
      if (description.trim()) params.set("description", description.trim());
      await apiUpload(`/records/patients/${patientId}/documents?${params.toString()}`, file, { accessToken });
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
    <Panel open={preview !== null} onClose={() => setPreview(null)} title="Documento" wide>
      {preview?.pdfData ? (
        <PdfViewer data={preview.pdfData} />
      ) : preview?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL, no Next Image loader aplica
        <img src={preview.imageUrl} alt="Documento clínico" className="max-w-full" />
      ) : null}
    </Panel>
  );

  const uploadForm = (
    <Card>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Subir documento</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FieldWrapper label="Categoría" htmlFor="doc-category">
          <SelectInput
            id="doc-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
          >
            {(Object.keys(CATEGORY_LABEL) as AttachmentCategory[]).map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABEL[value]}
              </option>
            ))}
          </SelectInput>
        </FieldWrapper>
        <FieldWrapper label="Fecha del estudio (opcional)" htmlFor="doc-study-date">
          <TextInput id="doc-study-date" type="date" value={studyDate} onChange={(e) => setStudyDate(e.target.value)} />
        </FieldWrapper>
        <FieldWrapper label="Descripción (opcional)" htmlFor="doc-description">
          <TextInput id="doc-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </FieldWrapper>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadDocument(file);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="secondary" isLoading={isUploading} onClick={() => fileInputRef.current?.click()} className="min-h-11 px-3 text-sm">
          Elegir archivo
        </Button>
        <span className="text-sm text-gray-500">{DOCUMENT_FORMAT_HINT}</span>
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
        <LoadingState label="Cargando documentos…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {uploadForm}
      {error ? <ErrorState error={error} /> : null}
      {documents.length === 0 ? (
        <EmptyState title="Sin documentos" description="Sube un estudio, imagen o documento externo del paciente." />
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-2">
              <div>
                <p className="text-base text-gray-900">
                  {CATEGORY_LABEL[doc.category]}
                  {doc.studyDate ? ` · estudio del ${formatMxDate(doc.studyDate)}` : ""}
                </p>
                <p className="text-sm text-gray-500">
                  {doc.fileName} · subido {formatMxDate(doc.uploadedAt)}
                  {doc.description ? ` · "${doc.description}"` : ""}
                </p>
              </div>
              <Button type="button" variant="secondary" isLoading={viewingId === doc.id} onClick={() => void viewDocument(doc.id)} className="min-h-11 px-3 text-sm">
                Ver documento
              </Button>
            </li>
          ))}
        </ul>
      )}
      {previewPanel}
    </div>
  );
}
