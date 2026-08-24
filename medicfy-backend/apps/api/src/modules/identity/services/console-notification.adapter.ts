import { Injectable, Logger } from "@nestjs/common";
import type { NotificationPort } from "./notification.port";

// Dev-only stand-in until M12 wires a real email/WhatsApp provider.
// Fails loudly in production rather than silently pretending to
// deliver a code nobody receives.
@Injectable()
export class ConsoleNotificationAdapter implements NotificationPort {
  private readonly logger = new Logger(ConsoleNotificationAdapter.name);

  private assertNotProduction(): void {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ConsoleNotificationAdapter must not run in production — wire a real provider (M12) before deploying."
      );
    }
  }

  async sendEmailVerificationCode(to: string, code: string): Promise<void> {
    this.assertNotProduction();
    this.logger.log(`[dev-only] email verification code for ${to}: ${code}`);
  }

  async sendPhoneVerificationCode(to: string, code: string): Promise<void> {
    this.assertNotProduction();
    this.logger.log(`[dev-only] SMS verification code for ${to}: ${code}`);
  }

  async sendPasswordResetLink(to: string, resetUrl: string): Promise<void> {
    this.assertNotProduction();
    this.logger.log(`[dev-only] password reset link for ${to}: ${resetUrl}`);
  }

  async sendAssistantInvitation(to: string, inviteUrl: string): Promise<void> {
    this.assertNotProduction();
    this.logger.log(`[dev-only] assistant invitation for ${to}: ${inviteUrl}`);
  }
}
