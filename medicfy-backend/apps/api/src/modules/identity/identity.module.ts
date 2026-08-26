import { Module } from "@nestjs/common";
import { PasswordService } from "./services/password.service";
import { TotpService } from "./services/totp.service";
import { TokenService } from "./services/token.service";
import { CryptoService } from "./services/crypto.service";
import { ConsentService } from "./services/consent.service";
import { AuditService } from "./services/audit.service";
import { VerificationCodeService } from "./services/verification-code.service";
import { AuthService } from "./services/auth.service";
import { MfaService } from "./services/mfa.service";
import { AssistantInvitationService } from "./services/assistant-invitation.service";
import { SignatureVerificationService } from "./services/signature-verification.service";
import { NOTIFICATION_PORT } from "./services/notification.port";
import { ConsoleNotificationAdapter } from "./services/console-notification.adapter";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { DoctorVerifiedGuard } from "./guards/doctor-verified.guard";
import { AdminGuard } from "./guards/admin.guard";
import { AuthController } from "./auth.controller";
import { MeController } from "./me.controller";
import { MfaController } from "./mfa.controller";
import { ConsentsController } from "./consents.controller";
import { AssistantInvitationsController } from "./assistant-invitations.controller";

@Module({
  controllers: [AuthController, MeController, MfaController, ConsentsController, AssistantInvitationsController],
  providers: [
    PasswordService,
    TotpService,
    TokenService,
    CryptoService,
    ConsentService,
    AuditService,
    VerificationCodeService,
    AuthService,
    MfaService,
    AssistantInvitationService,
    SignatureVerificationService,
    JwtAuthGuard,
    DoctorVerifiedGuard,
    AdminGuard,
    { provide: NOTIFICATION_PORT, useClass: ConsoleNotificationAdapter },
  ],
  // TokenService is exported (in addition to the guards themselves)
  // because a NestJS guard applied by class reference in a consuming
  // module (@UseGuards(JwtAuthGuard) in DoctorsModule, for instance)
  // gets its own constructor dependencies re-resolved through that
  // consuming module's injector — exporting the guard class alone
  // isn't enough if its dependencies aren't visible too.
  exports: [
    AuthService,
    MfaService,
    AssistantInvitationService,
    SignatureVerificationService,
    ConsentService,
    AuditService,
    TokenService,
    JwtAuthGuard,
    DoctorVerifiedGuard,
    AdminGuard,
    NOTIFICATION_PORT,
  ],
})
export class IdentityModule {}
