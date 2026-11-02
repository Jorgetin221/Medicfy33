import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorPhotoService, storedPhotoFileName } from "./doctor-photo.service";
import type { PrismaService } from "../../../prisma/prisma.service";
import type { FileStoragePort } from "./file-storage.port";

const API = "http://localhost:3001";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const OLD_FILE = "11111111-2222-4333-8444-555555555555.jpg";

function build(photoUrl: string | null = null) {
  const doctor = { id: "doc-1", slug: "dra-ana", photoUrl };
  const prisma = {
    doctor: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(doctor),
      findUnique: vi.fn().mockResolvedValue(doctor),
      update: vi.fn().mockResolvedValue(doctor),
    },
  };
  const storage = {
    store: vi.fn().mockResolvedValue(undefined),
    retrieve: vi.fn().mockResolvedValue({ buffer: JPEG, contentType: "image/jpeg" }),
    remove: vi.fn().mockResolvedValue(undefined),
    getSignedDownloadUrl: vi.fn(),
  };
  const service = new DoctorPhotoService(prisma as unknown as PrismaService, storage as unknown as FileStoragePort);
  return { service, prisma, storage };
}

describe("DoctorPhotoService", () => {
  const previous = process.env.APP_BASE_URL;
  beforeEach(() => {
    process.env.APP_BASE_URL = API;
  });
  afterEach(() => {
    process.env.APP_BASE_URL = previous;
  });

  it("sube la foto, guarda la URL pública y no deja dato del médico en el nombre del archivo", async () => {
    const { service, prisma, storage } = build();
    const { photoUrl } = await service.upload({ doctorId: "doc-1", buffer: JPEG, mimeType: "image/jpeg" });
    expect(photoUrl).toMatch(new RegExp(`^${API}/doctors/dra-ana/public/photo/[0-9a-f-]{36}\\.jpg$`));
    expect(storage.store).toHaveBeenCalledWith(expect.objectContaining({ fileKey: expect.stringMatching(/^doctor-photos\/doc-1\/[0-9a-f-]{36}\.jpg$/), contentType: "image/jpeg" }));
    expect(prisma.doctor.update).toHaveBeenCalledWith({ where: { id: "doc-1" }, data: { photoUrl } });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("al reemplazar, borra la foto anterior subida", async () => {
    const { service, storage } = build(`${API}/doctors/dra-ana/public/photo/${OLD_FILE}`);
    await service.upload({ doctorId: "doc-1", buffer: PNG, mimeType: "image/png" });
    expect(storage.remove).toHaveBeenCalledWith(`doctor-photos/doc-1/${OLD_FILE}`);
  });

  it("una URL externa pegada a mano (mecanismo anterior) nunca se intenta borrar", async () => {
    const { service, storage } = build("https://cdn.example.com/yo.jpg");
    await service.upload({ doctorId: "doc-1", buffer: JPEG, mimeType: "image/jpeg" });
    await service.remove("doc-1");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("rechaza formatos no permitidos, archivos de más de 5 MB y contenido que no es la imagen declarada", async () => {
    const { service, storage } = build();
    await expect(service.upload({ doctorId: "doc-1", buffer: JPEG, mimeType: "image/gif" })).rejects.toMatchObject({ code: "PHOTO_INVALID_FORMAT" });
    await expect(service.upload({ doctorId: "doc-1", buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0xff), mimeType: "image/jpeg" })).rejects.toMatchObject({ code: "PHOTO_TOO_LARGE" });
    await expect(service.upload({ doctorId: "doc-1", buffer: Buffer.from("MZ-ejecutable"), mimeType: "image/jpeg" })).rejects.toMatchObject({ code: "FILE_CONTENT_MISMATCH" });
    expect(storage.store).not.toHaveBeenCalled();
  });

  it("quitar la foto la pone en null y borra el archivo", async () => {
    const { service, prisma, storage } = build(`${API}/doctors/dra-ana/public/photo/${OLD_FILE}`);
    await service.remove("doc-1");
    expect(prisma.doctor.update).toHaveBeenCalledWith({ where: { id: "doc-1" }, data: { photoUrl: null } });
    expect(storage.remove).toHaveBeenCalledWith(`doctor-photos/doc-1/${OLD_FILE}`);
  });

  it("el endpoint público solo sirve la foto VIGENTE y solo nombres generados por el servidor", async () => {
    const { service, storage } = build(`${API}/doctors/dra-ana/public/photo/${OLD_FILE}`);
    await expect(service.getPublicPhoto("dra-ana", OLD_FILE)).resolves.toMatchObject({ contentType: "image/jpeg" });
    expect(storage.retrieve).toHaveBeenCalledWith(`doctor-photos/doc-1/${OLD_FILE}`);

    for (const bad of ["22222222-2222-4333-8444-555555555555.jpg", "../../secrets.jpg", "foto.jpg", `${OLD_FILE}.exe`]) {
      await expect(service.getPublicPhoto("dra-ana", bad)).rejects.toMatchObject({ code: "PHOTO_NOT_FOUND" });
    }
  });

  it("storedPhotoFileName reconoce solo URLs propias", () => {
    expect(storedPhotoFileName(`${API}/doctors/x/public/photo/${OLD_FILE}`)).toBe(OLD_FILE);
    expect(storedPhotoFileName(`https://otro.com/doctors/x/public/photo/${OLD_FILE}`)).toBeNull();
    expect(storedPhotoFileName(null)).toBeNull();
  });
});
