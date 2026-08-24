// M4-CA-001 hard gate (per Jorge, M5a): seeds a verified doctor + an
// active service + a patient directly via Prisma (same migrator
// connection used for schema migrations — this is fixture seeding
// for a load test against a real running server, not a runtime
// mutation path), then prints a signed access token and the IDs the
// k6 script needs. Bypasses the email-verification/login HTTP flow
// on purpose: k6's VUs need to hit POST /appointments directly, not
// reproduce registration.
//
// Usage: node test/k6/seed-concurrency-fixture.mjs > /tmp/fixture.json
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

const accessSecret = process.env.JWT_ACCESS_SECRET;
if (!accessSecret) {
  throw new Error("JWT_ACCESS_SECRET is not set");
}

const suffix = randomUUID().slice(0, 8);

const user = await prisma.user.create({
  data: {
    email: `k6.doctor.${suffix}@example.com`,
    passwordHash: "unused-k6-fixture",
    primaryRole: "DOCTOR",
    status: "ACTIVE",
    emailVerifiedAt: new Date(),
  },
});

const specialty = await prisma.specialty.findFirstOrThrow({ where: { isActive: true } });

const doctor = await prisma.doctor.create({
  data: {
    userId: user.id,
    legalFirstName: "K6",
    legalLastName: `Fixture-${suffix}`,
    professionalLicense: `K6${suffix}`,
    primarySpecialtyId: specialty.id,
    verificationStatus: "VERIFIED",
    minBookingNoticeMinutes: 0,
  },
});

const service = await prisma.doctorService.create({
  data: {
    doctorId: doctor.id,
    serviceType: "FIRST_VISIT",
    name: "Consulta k6",
    durationMinutes: 30,
    priceMxnCents: 50000,
  },
});

const patient = await prisma.patient.create({
  data: {
    medicfyId: `MDF-K6${suffix}`.slice(0, 20),
    firstName: "Paciente",
    lastNamePaternal: "K6",
    birthDate: new Date("1990-01-01T00:00:00Z"),
    sexAtBirth: "F",
    phoneE164: "+525500000000",
    email: `k6.patient.${suffix}@example.com`,
    source: "CREATED_BY_DOCTOR",
  },
});

const accessToken = jwt.sign({ sub: user.id, primaryRole: "DOCTOR" }, accessSecret, { expiresIn: 15 * 60 });

const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

process.stdout.write(
  JSON.stringify({
    accessToken,
    doctorId: doctor.id,
    doctorUserId: user.id,
    serviceId: service.id,
    patientId: patient.id,
    startsAt,
  })
);

await prisma.$disconnect();
