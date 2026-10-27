import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { Secret, TOTP } from "otpauth";

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5; // -> 10 hex chars per code
const TOTP_PERIOD_SECONDS = 30;

export interface TotpEnrollment {
  secretBase32: string;
  otpauthUri: string;
  backupCodesPlain: string[];
}

// spec §4.3: "TOTP (RFC 6238) obligatorio". M1-RN-005 / flow step 3:
// mandatory enrollment with downloadable backup codes.
@Injectable()
export class TotpService {
  enroll(accountEmail: string): TotpEnrollment {
    const secret = new Secret();
    const totp = new TOTP({
      issuer: "Medicfy",
      label: accountEmail,
      algorithm: "SHA1",
      digits: 6,
      period: TOTP_PERIOD_SECONDS,
      secret,
    });

    const backupCodesPlain = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(BACKUP_CODE_BYTES).toString("hex")
    );

    return { secretBase32: secret.base32, otpauthUri: totp.toString(), backupCodesPlain };
  }

  // M-01: devuelve el paso de tiempo (contador RFC 6238) con el que
  // validó el código, o null. El llamador lo compara contra el último
  // paso aceptado para rechazar la repetición del mismo código.
  verifyStep(secretBase32: string, token: string): number | null {
    const totp = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: TOTP_PERIOD_SECONDS,
      secret: Secret.fromBase32(secretBase32),
    });
    // Allow one 30s step of clock drift in either direction.
    const delta = totp.validate({ token, window: 1 });
    if (delta === null) return null;
    return Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS) + delta;
  }

  verify(secretBase32: string, token: string): boolean {
    return this.verifyStep(secretBase32, token) !== null;
  }

  // M-01: los códigos de respaldo se guardaban como SHA-256 sin sal (40
  // bits de entropía: un volcado de la tabla los revelaba en segundos).
  // Ahora argon2id, igual que las contraseñas.
  async hashBackupCodes(plainCodes: string[]): Promise<string[]> {
    return Promise.all(plainCodes.map((code) => argon2.hash(code.toLowerCase(), { type: argon2.argon2id })));
  }

  // Devuelve el hash guardado que coincide (para consumirlo) o null.
  // Acepta también los hashes SHA-256 de cuentas enroladas antes de
  // 2026-10-22.
  async matchBackupCode(hashedCodes: string[], candidate: string): Promise<string | null> {
    const normalized = candidate.toLowerCase();
    const legacy = legacyHash(normalized);
    for (const hashed of hashedCodes) {
      if (hashed.startsWith("$argon2")) {
        if (await argon2.verify(hashed, normalized)) return hashed;
      } else if (hashed === legacy) {
        return hashed;
      }
    }
    return null;
  }
}

function legacyHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
