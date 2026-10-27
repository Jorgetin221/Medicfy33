import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ClinicalEncounterService } from "./clinical-encounter.service";

const SWEEP_INTERVAL_MS = 5 * 60_000;

// M8-RN-003, pedido explícito del usuario (2026-10-27): un borrador
// abandonado (72 h sin firmar) ya no tiene cómo completar su cita con
// nota firmada, así que esta cita se quedaba IN_PROGRESS para
// siempre si nadie volvía a abrir ese borrador. Mismo patrón que
// AppointmentSweepService (scheduling): intervalo de 5 min, sin
// @nestjs/schedule ni Redis — cada escritura es compare-and-set, así
// que dos instancias del API corriendo el mismo barrido no pisan
// nada. No arranca en pruebas (NODE_ENV=test): las pruebas invocan
// closeAbandonedEncounters() directamente.
@Injectable()
export class EncounterSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EncounterSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly encounters: ClinicalEncounterService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const closed = await this.encounters.closeAbandonedEncounters();
      if (closed > 0) {
        this.logger.log(`Barrido de borradores abandonados: ${closed} cita(s) cerrada(s) sin nota.`);
      }
    } catch (error) {
      this.logger.error(`Barrido de borradores abandonados falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
