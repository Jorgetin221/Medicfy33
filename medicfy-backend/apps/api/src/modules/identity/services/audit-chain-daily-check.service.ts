import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { AuditChainVerifierService } from "./audit-chain-verifier.service";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Auditoría 2026-10-21 (M-16): la especificación pide un verificador
// DIARIO de la cadena de audit_log. Corre una vez al día y deja el
// resultado en el log de la aplicación (sin datos clínicos: solo
// estado, filas revisadas y dónde se rompió).
// PENDIENTE(jorge): falta decidir el canal de alerta ante una cadena
// ROTA (¿correo al admin?, ¿panel?). Ref: M15-RN-002.
@Injectable()
export class AuditChainDailyCheckService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditChainDailyCheckService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly verifier: AuditChainVerifierService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.run(), ONE_DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    try {
      const result = await this.verifier.verifyChain();
      if (result.status === "OK") {
        this.logger.log(`Cadena de audit_log íntegra (${result.totalChecked} filas).`);
      } else {
        this.logger.error(`Cadena de audit_log ROTA en la secuencia ${result.brokenAtSequence}: ${result.reasons.join(" ")}`);
      }
    } catch (error) {
      this.logger.error(`No se pudo verificar la cadena de audit_log: ${(error as Error).name}`);
    }
  }
}
