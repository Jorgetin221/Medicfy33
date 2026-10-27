import { describe, expect, it, vi } from "vitest";
import type { Appointment } from "@prisma/client";
import type { PrismaService } from "../../../prisma/prisma.service";
import { TeleconsultationService } from "./teleconsultation.service";
import type { VideoProviderPort, VideoRoom } from "./video-provider.port";

const ROOM: VideoRoom = { providerRef: "medicfy-apt-1", roomUrl: "https://medicfy.daily.co/medicfy-apt-1" };

function baseAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "apt-1",
    patientId: "pat-1",
    doctorId: "doc-1",
    locationId: null,
    serviceId: "srv-1",
    modality: "ONLINE",
    startsAt: new Date("2026-11-01T17:30:00.000Z"),
    endsAt: new Date("2026-11-01T18:00:00.000Z"),
    timezone: "America/Mexico_City",
    status: "IN_PROGRESS",
    createdByUserId: "user-1",
    createdVia: "DOCTOR_PANEL",
    priceMxnCents: 50000,
    paymentReference: null,
    paymentDeadlineAt: null,
    videoRoomUrl: null,
    videoProviderRef: null,
    cancellationReason: null,
    cancelledAt: null,
    cancelledByUserId: null,
    reminder24hSentAt: null,
    reminder2hSentAt: null,
    rescheduledFromId: null,
    rescheduleCount: 0,
    cancellationPolicySnapshot: {},
    completedWithoutNoteReason: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    idempotencyKey: null,
    ...overrides,
  } as Appointment;
}

function fakePort(overrides: Partial<VideoProviderPort> = {}): VideoProviderPort {
  return {
    isConfigured: () => true,
    createRoom: vi.fn(async () => ROOM),
    ...overrides,
  };
}

function fakePrisma(): PrismaService {
  return { appointment: { update: vi.fn(async () => undefined) } } as unknown as PrismaService;
}

describe("TeleconsultationService", () => {
  it("rechaza una cita presencial (no genera ningún enlace)", async () => {
    const port = fakePort();
    const service = new TeleconsultationService(fakePrisma(), port);
    await expect(service.openRoom(baseAppointment({ modality: "IN_PERSON" }))).rejects.toMatchObject({
      code: "APPOINTMENT_NOT_TELECONSULTATION",
    });
    expect(port.createRoom).not.toHaveBeenCalled();
  });

  it("rechaza una cita en línea que todavía no está en curso", async () => {
    const port = fakePort();
    const service = new TeleconsultationService(fakePrisma(), port);
    await expect(service.openRoom(baseAppointment({ status: "CONFIRMED" }))).rejects.toMatchObject({
      code: "APPOINTMENT_TRANSITION_INVALID",
    });
    expect(port.createRoom).not.toHaveBeenCalled();
  });

  it("devuelve el enlace ya guardado sin volver a llamar al proveedor (idempotente)", async () => {
    const port = fakePort();
    const service = new TeleconsultationService(fakePrisma(), port);
    const outcome = await service.openRoom(baseAppointment({ videoRoomUrl: "https://medicfy.daily.co/ya-existe" }));
    expect(outcome).toEqual({ kind: "ok", room: { url: "https://medicfy.daily.co/ya-existe" } });
    expect(port.createRoom).not.toHaveBeenCalled();
  });

  it("se degrada a NOT_CONFIGURED sin llamar al proveedor cuando faltan credenciales", async () => {
    const port = fakePort({ isConfigured: () => false });
    const service = new TeleconsultationService(fakePrisma(), port);
    const outcome = await service.openRoom(baseAppointment());
    expect(outcome).toEqual({ kind: "unavailable", reason: "NOT_CONFIGURED" });
    expect(port.createRoom).not.toHaveBeenCalled();
  });

  it("crea la sala, la persiste en la cita y devuelve el enlace", async () => {
    const port = fakePort();
    const prisma = fakePrisma();
    const service = new TeleconsultationService(prisma, port);
    const appointment = baseAppointment();
    const outcome = await service.openRoom(appointment);
    expect(outcome).toEqual({ kind: "ok", room: { url: ROOM.roomUrl } });
    expect(port.createRoom).toHaveBeenCalledWith({ appointmentId: appointment.id, expiresAt: appointment.endsAt });
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: appointment.id },
      data: { videoRoomUrl: ROOM.roomUrl, videoProviderRef: ROOM.providerRef },
    });
  });

  it("se degrada a PROVIDER_ERROR si el proveedor falla, sin propagar el error", async () => {
    const port = fakePort({ createRoom: vi.fn(async () => Promise.reject(new Error("falló la red"))) });
    const service = new TeleconsultationService(fakePrisma(), port);
    const outcome = await service.openRoom(baseAppointment());
    expect(outcome).toEqual({ kind: "unavailable", reason: "PROVIDER_ERROR" });
  });
});
