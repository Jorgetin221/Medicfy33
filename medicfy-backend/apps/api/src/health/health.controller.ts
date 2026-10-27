import { Controller, Get } from "@nestjs/common";

// O-15 / M-19: sin REDIS_URL los recordatorios de cita se omiten en
// silencio (el resto del sistema funciona igual). El chequeo de salud
// lo dice, para que se note antes de que un paciente no reciba su
// recordatorio. No incluye nada sensible ni hace llamadas externas.
@Controller("health")
export class HealthController {
  @Get()
  check(): { status: "ok"; reminders: "enabled" | "degraded" } {
    return { status: "ok", reminders: process.env.REDIS_URL ? "enabled" : "degraded" };
  }
}
