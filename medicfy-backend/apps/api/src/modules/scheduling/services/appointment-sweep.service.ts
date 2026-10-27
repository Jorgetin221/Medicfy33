import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { AppointmentStateMachineService } from "./appointment-state-machine.service";

const SWEEP_INTERVAL_MS = 5 * 60_000;

// A-11: los barridos de la máquina de estados existían pero nadie los
// llamaba. Corren aquí cada 5 minutos, sin dependencia nueva (no hay
// @nestjs/schedule) y sin Redis: cada transición es compare-and-set en
// la base, así que dos instancias del API corriendo el mismo barrido
// no pisan nada. En pruebas no se arranca (NODE_ENV=test): las pruebas
// invocan los barridos directamente.
@Injectable()
export class AppointmentSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppointmentSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly appointments: AppointmentStateMachineService) {}

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
      const noShows = await this.appointments.markExpiredAsNoShow();
      const released = await this.appointments.releasePastPendingPayments();
      if (noShows + released > 0) {
        this.logger.log(`Barrido de citas: ${noShows} no-show, ${released} reservas sin confirmar liberadas.`);
      }
    } catch (error) {
      this.logger.error(`Barrido de citas falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
