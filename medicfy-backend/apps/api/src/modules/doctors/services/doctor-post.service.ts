import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Doctor, DoctorPost, DoctorPostMedia } from "@prisma/client";
import type { DoctorPostCreateInput, DoctorPostUpdateInput } from "@medicfy/contracts";
import { PrismaService } from "../../../prisma/prisma.service";
import { ApiException } from "../../../common/api-exception";
import { omitUndefined } from "../../../common/omit-undefined";
import { AuditService } from "../../identity/services/audit.service";
import type { RequestMeta } from "../../identity/services/auth.service";
import { CareRelationshipService } from "../../scheduling/services/care-relationship.service";
import { FILE_STORAGE_PORT, type FileStoragePort } from "./file-storage.port";
import { extensionForMimeType } from "./local-disk-file-storage.adapter";
import { toPublicPostView, type PublicPostView } from "../doctor-post-view";

// M2B-RN-005: mismo límite de imagen que la foto de perfil de M2 (JPG/
// PNG/WebP, ≤5MB), sin la exigencia de detección de rostro. Video
// queda PENDIENTE(jorge) — ver el comentario en uploadMedia.
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_PER_POST = 10;

export class InvalidPostMediaError extends Error {}

@Injectable()
export class DoctorPostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly careRelationshipService: CareRelationshipService,
    @Inject(FILE_STORAGE_PORT) private readonly fileStorage: FileStoragePort
  ) {}

  // --- Panel privado del médico (dueño) ---

  async listOwn(doctorId: string): Promise<(DoctorPost & { media: DoctorPostMedia[] })[]> {
    return this.prisma.doctorPost.findMany({
      where: { doctorId },
      include: { media: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getOwn(doctorId: string, postId: string): Promise<DoctorPost & { media: DoctorPostMedia[] }> {
    const post = await this.prisma.doctorPost.findUnique({ where: { id: postId }, include: { media: true } });
    if (!post || post.doctorId !== doctorId) {
      throw new ApiException("POST_NOT_FOUND", "Publicación no encontrada.", HttpStatus.NOT_FOUND);
    }
    return post;
  }

  // M2B-RN-009: un médico SUSPENDED no puede crear contenido nuevo —
  // mismo bloqueo que el resto de escritura de perfil bajo M2-RN-005.
  private assertNotSuspended(doctor: Doctor): void {
    if (doctor.verificationStatus === "SUSPENDED") {
      throw new ApiException(
        "DOCTOR_SUSPENDED",
        "Tu cuenta está suspendida. No puedes crear ni publicar contenido nuevo.",
        HttpStatus.FORBIDDEN
      );
    }
  }

  async create(doctor: Doctor, input: DoctorPostCreateInput): Promise<DoctorPost> {
    this.assertNotSuspended(doctor);
    return this.prisma.doctorPost.create({
      data: {
        doctorId: doctor.id,
        title: input.title ?? null,
        body: input.body,
        category: input.category,
        visibility: input.visibility,
      },
    });
  }

  // M2B-RN-003: cambiar a PUBLISHED fija publishedAt (una sola vez —
  // republicar no la mueve); cambiar a ARCHIVED fija archivedAt. Estas
  // dos marcas de tiempo las decide el servidor, nunca el cliente.
  async update(doctor: Doctor, postId: string, input: DoctorPostUpdateInput): Promise<DoctorPost> {
    const existing = await this.getOwn(doctor.id, postId);
    if (input.status === "PUBLISHED") {
      this.assertNotSuspended(doctor);
    }

    const publishedAt = input.status === "PUBLISHED" && !existing.publishedAt ? new Date() : undefined;
    const archivedAt = input.status === "ARCHIVED" ? new Date() : undefined;

    return this.prisma.doctorPost.update({
      where: { id: postId },
      data: omitUndefined({
        title: input.title,
        body: input.body,
        category: input.category,
        visibility: input.visibility,
        status: input.status,
        publishedAt,
        archivedAt,
      }),
    });
  }

  // No es dato clínico (R1 no aplica) — DELETE real, a diferencia de
  // clinical_notes/prescriptions/lab_orders.
  async remove(doctorId: string, postId: string): Promise<void> {
    await this.getOwn(doctorId, postId);
    await this.prisma.$transaction([
      this.prisma.doctorPostMedia.deleteMany({ where: { postId } }),
      this.prisma.doctorPost.delete({ where: { id: postId } }),
    ]);
  }

  async uploadMedia(params: {
    doctorId: string;
    postId: string;
    mediaType: "PHOTO" | "VIDEO";
    buffer: Buffer;
    mimeType: string;
  }): Promise<DoctorPostMedia> {
    const post = await this.getOwn(params.doctorId, params.postId);
    if (post.media.length >= MAX_MEDIA_PER_POST) {
      throw new InvalidPostMediaError(`Máximo ${MAX_MEDIA_PER_POST} archivos por publicación.`);
    }
    // M2B-RN-005: el formato/límite de video queda PENDIENTE(jorge) —
    // se rechaza aquí en vez de aceptar un archivo que nadie validó.
    if (params.mediaType === "VIDEO") {
      throw new InvalidPostMediaError("Subir video todavía no está disponible.");
    }
    if (!ALLOWED_IMAGE_MIME_TYPES.has(params.mimeType)) {
      throw new InvalidPostMediaError("Formato no permitido. Usa JPG, PNG o WebP.");
    }
    if (params.buffer.length > MAX_MEDIA_BYTES) {
      throw new InvalidPostMediaError("El archivo supera los 5 MB permitidos.");
    }

    const fileKey = `doctor-posts/${params.doctorId}/${params.postId}/${randomUUID()}${extensionForMimeType(params.mimeType)}`;
    await this.fileStorage.store({ fileKey, buffer: params.buffer, contentType: params.mimeType });

    return this.prisma.doctorPostMedia.create({
      data: {
        postId: params.postId,
        mediaType: params.mediaType,
        fileKey,
        displayOrder: post.media.length,
      },
    });
  }

  // Sirve los bytes de un medio a su propio autor (panel privado),
  // sin importar la audiencia/estado de la publicación — mismo patrón
  // que DoctorBrandingService.getAsset.
  async getOwnMediaBytes(doctorId: string, postId: string, mediaId: string): Promise<{ buffer: Buffer; contentType: string }> {
    await this.getOwn(doctorId, postId);
    return this.retrieveMedia(postId, mediaId);
  }

  // --- Lectura pública (M2B-RN-002: visibility=PUBLIC + status=PUBLISHED) ---

  async listPublicBySlug(slug: string): Promise<PublicPostView[]> {
    const doctor = await this.prisma.doctor.findUnique({ where: { slug } });
    if (!doctor) {
      throw new ApiException("DOCTOR_NOT_FOUND", "Médico no encontrado.", HttpStatus.NOT_FOUND);
    }
    const posts = await this.prisma.doctorPost.findMany({
      where: { doctorId: doctor.id, visibility: "PUBLIC", status: "PUBLISHED" },
      include: { media: true },
      orderBy: { publishedAt: "desc" },
    });
    return posts.map((post) => toPublicPostView(post, post.media));
  }

  async getPublicMediaBytes(slug: string, postId: string, mediaId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const doctor = await this.prisma.doctor.findUnique({ where: { slug } });
    const post = doctor ? await this.prisma.doctorPost.findUnique({ where: { id: postId } }) : null;
    if (!doctor || !post || post.doctorId !== doctor.id || post.visibility !== "PUBLIC" || post.status !== "PUBLISHED") {
      throw new ApiException("POST_NOT_FOUND", "Publicación no encontrada.", HttpStatus.NOT_FOUND);
    }
    return this.retrieveMedia(postId, mediaId);
  }

  // --- "Solo mis pacientes" (M2B-RN-002) ---
  // Autorización real y completa, sin consumidor todavía: no existe
  // portal de pacientes en el frontend (ver §7 M2B del spec) — este
  // método queda listo para cuando exista.
  async listPatientsOnly(doctorId: string, callerUserId: string, meta: RequestMeta): Promise<PublicPostView[]> {
    const patient = await this.prisma.patient.findUnique({ where: { userId: callerUserId } });
    const hasRelationship = patient ? await this.careRelationshipService.hasActiveRelationship(patient.id, doctorId) : false;

    if (!hasRelationship) {
      await this.auditService.log({
        actorUserId: callerUserId,
        action: "doctor_post.patients_only.access",
        resourceType: "doctor",
        resourceId: doctorId,
        result: "DENIED",
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "no_active_care_relationship" },
      });
      throw new ApiException(
        "CARE_RELATIONSHIP_REQUIRED",
        "No tienes un vínculo activo con este médico.",
        HttpStatus.FORBIDDEN
      );
    }

    const posts = await this.prisma.doctorPost.findMany({
      where: { doctorId, visibility: "PATIENTS_ONLY", status: "PUBLISHED" },
      include: { media: true },
      orderBy: { publishedAt: "desc" },
    });
    return posts.map((post) => toPublicPostView(post, post.media));
  }

  // --- Moderación mínima (M2B-RN-008) ---

  async archiveByAdmin(postId: string, adminUserId: string, meta: RequestMeta): Promise<DoctorPost> {
    const post = await this.prisma.doctorPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new ApiException("POST_NOT_FOUND", "Publicación no encontrada.", HttpStatus.NOT_FOUND);
    }
    const archived = await this.prisma.doctorPost.update({
      where: { id: postId },
      data: { status: "ARCHIVED", archivedAt: new Date(), archivedByUserId: adminUserId },
    });
    await this.auditService.log({
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "doctor_post.archived_by_admin",
      resourceType: "doctor_post",
      resourceId: postId,
      result: "SUCCESS",
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
    return archived;
  }

  private async retrieveMedia(postId: string, mediaId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const media = await this.prisma.doctorPostMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.postId !== postId) {
      throw new ApiException("MEDIA_NOT_FOUND", "Archivo no encontrado.", HttpStatus.NOT_FOUND);
    }
    return this.fileStorage.retrieve(media.fileKey);
  }
}
