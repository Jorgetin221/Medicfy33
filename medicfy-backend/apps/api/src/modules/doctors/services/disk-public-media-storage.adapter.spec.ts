import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiskPublicMediaStorageAdapter, resolvePublicMediaRoot } from "./disk-public-media-storage.adapter";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("DiskPublicMediaStorageAdapter (fotos de perfil en el disco del VPS)", () => {
  const previous = { dir: process.env.PUBLIC_MEDIA_DIR, env: process.env.NODE_ENV };
  let dir = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "medicfy-media-"));
    process.env.PUBLIC_MEDIA_DIR = dir;
  });
  afterEach(async () => {
    process.env.PUBLIC_MEDIA_DIR = previous.dir;
    process.env.NODE_ENV = previous.env;
    await rm(dir, { recursive: true, force: true });
  });

  it("guarda, lee y borra en la carpeta configurada — también en producción", async () => {
    process.env.NODE_ENV = "production";
    const storage = new DiskPublicMediaStorageAdapter();
    await storage.onModuleInit();
    await storage.store({ fileKey: "doctor-photos/doc-1/a.png", buffer: PNG, contentType: "image/png" });
    expect(await readdir(join(dir, "doctor-photos", "doc-1"))).toEqual(["a.png"]);
    await expect(storage.retrieve("doctor-photos/doc-1/a.png")).resolves.toEqual({ buffer: PNG, contentType: "image/png" });
    await storage.remove("doctor-photos/doc-1/a.png");
    await expect(storage.retrieve("doctor-photos/doc-1/a.png")).rejects.toThrow(/no encontrado/i);
  });

  it("nunca escribe ni lee fuera de su carpeta", async () => {
    const storage = new DiskPublicMediaStorageAdapter();
    await expect(storage.store({ fileKey: "../../etc/passwd", buffer: PNG, contentType: "image/png" })).rejects.toThrow(/fuera de la carpeta/);
    await expect(storage.retrieve("../secreto.png")).rejects.toThrow(/fuera de la carpeta/);
  });

  it("solo sirve imágenes (otra extensión no responde)", async () => {
    const storage = new DiskPublicMediaStorageAdapter();
    await storage.store({ fileKey: "x/doc.pdf", buffer: PNG, contentType: "application/pdf" });
    await expect(storage.retrieve("x/doc.pdf")).rejects.toThrow(/no encontrado/i);
  });

  it("carpeta: la configurada, o el valor por defecto según el entorno; una ruta relativa se rechaza", () => {
    expect(resolvePublicMediaRoot({ PUBLIC_MEDIA_DIR: "/srv/media" })).toBe("/srv/media");
    expect(resolvePublicMediaRoot({ NODE_ENV: "production" })).toBe("/var/lib/medicfy/media");
    expect(resolvePublicMediaRoot({ NODE_ENV: "development" })).toMatch(/\.local-file-storage\/public-media$/);
    expect(() => resolvePublicMediaRoot({ PUBLIC_MEDIA_DIR: "media" })).toThrow(/absoluta/);
  });
});
