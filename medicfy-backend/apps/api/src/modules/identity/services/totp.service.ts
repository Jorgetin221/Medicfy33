import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { Secret, TOTP } from "otpauth";

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 5; // -> 8 base32-ish hex chars per code

export interface TotpEnrollment {
  secretBase32: string;
  otpauthUri: string;
  backupCodesPlain: string[];
  backupCodesHashed: string[];
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
      period: 30,
      secret,
    });

    const backupCodesPlain = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(BACKUP_CODE_BYTES).toString("hex")
    );

    return {
      secretBase32: secret.base32,
      otpauthUri: totp.toString(),
      backupCodesPlain,
      backupCodesHashed: backupCodesPlain.map(hashBackupCode),
    };
  }

  verify(secretBase32: string, token: string): boolean {
    const totp = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });
    // Allow one 30s step of clock drift in either direction.
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  }

  verifyBackupCode(hashedCodes: string[], candidate: string): boolean {
    const candidateHash = hashBackupCode(candidate);
    return hashedCodes.includes(candidateHash);
  }
}

function hashBackupCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
