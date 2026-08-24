// spec §4.3: "S3 (o Cloudflare R2) con cifrado SSE-KMS y URLs
// prefirmadas de vida corta." No cloud credentials exist yet — same
// situation M1 had with email/SMS providers (M12). This port lets
// DoctorDocumentService depend on an abstraction now instead of
// blocking on real infra.
export interface FileStoragePort {
  store(params: { fileKey: string; buffer: Buffer; contentType: string }): Promise<void>;
  getSignedDownloadUrl(fileKey: string, ttlSeconds: number): Promise<string>;
  // Añadido para Perfil (Parte B §5.1): "vista previa inmediata" de
  // logo/firma necesita servir bytes de verdad, no solo un URI de
  // metadata como getSignedDownloadUrl ya hacía. En producción (S3/R2)
  // esto se reemplaza por una descarga real vía URL prefirmada; en dev
  // lee del disco local.
  retrieve(fileKey: string): Promise<{ buffer: Buffer; contentType: string }>;
}

export const FILE_STORAGE_PORT = Symbol("FILE_STORAGE_PORT");
