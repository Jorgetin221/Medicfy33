import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

// Application-level encryption for hypersensitive fields at rest (MFA
// secret), per M15-RN-004. This is a symmetric key from env for now;
// KMS-backed envelope encryption with annual rotation is M15 hardening
// work (semana 13), not built yet.
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    const rawKey = process.env.MFA_SECRET_ENCRYPTION_KEY;
    if (!rawKey) {
      throw new Error("MFA_SECRET_ENCRYPTION_KEY is not set");
    }
    const key = Buffer.from(rawKey, "base64");
    if (key.length !== 32) {
      throw new Error("MFA_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes");
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv, authTag, encrypted].map((buf) => buf.toString("base64")).join(".");
  }

  decrypt(ciphertext: string): string {
    const [ivB64, authTagB64, dataB64] = ciphertext.split(".");
    if (!ivB64 || !authTagB64 || !dataB64) {
      throw new Error("Malformed ciphertext");
    }
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
}
