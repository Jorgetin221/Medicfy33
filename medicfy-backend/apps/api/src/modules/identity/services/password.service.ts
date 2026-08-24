import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

// spec §4.3: "Argon2id". Strength/length policy itself lives in
// @medicfy/contracts (isStrongPassword) and is enforced at the DTO
// layer before this service ever sees a password.
@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, { type: argon2.argon2id });
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    return argon2.verify(hash, plainPassword);
  }
}
