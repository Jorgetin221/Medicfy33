// M4-CA-001 (spec §7 M4): "Prueba de concurrencia: 50 solicitudes
// paralelas por el mismo espacio → exactamente 1 éxito, 49
// SLOT_TAKEN." Hard gate for M5's closure (Jorge, 2026-08-14) — this
// is what actually proves appointments_no_overlap (the EXCLUDE USING
// gist constraint, prisma/migrations/20260814211044_m5a_pacientes_citas)
// works under real concurrency, not just sequential test assertions.
//
// Usage:
//   node test/k6/seed-concurrency-fixture.mjs > /tmp/k6-fixture.json
//   FIXTURE=/tmp/k6-fixture.json k6 run test/k6/double-booking.k6.js
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const fixture = JSON.parse(open(__ENV.FIXTURE || "/tmp/k6-fixture.json"));

const successes = new Counter("booking_success");
const slotTaken = new Counter("booking_slot_taken");
const unexpected = new Counter("booking_unexpected");

export const options = {
  scenarios: {
    double_booking: {
      executor: "shared-iterations",
      vus: 50,
      iterations: 50,
      maxDuration: "30s",
    },
  },
  // k6 itself fails the run (non-zero exit) if these don't hold
  // exactly — not just a check() to eyeball afterward.
  thresholds: {
    booking_success: ["count==1"],
    booking_slot_taken: ["count==49"],
    booking_unexpected: ["count==0"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";

export default function () {
  const res = http.post(
    `${BASE_URL}/appointments`,
    JSON.stringify({ patientId: fixture.patientId, serviceId: fixture.serviceId, startsAt: fixture.startsAt }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${fixture.accessToken}` } }
  );

  if (res.status === 201) {
    successes.add(1);
  } else if (res.status === 409) {
    slotTaken.add(1);
  } else {
    unexpected.add(1);
    console.error(`unexpected status ${res.status}: ${res.body}`);
  }

  check(res, { "status is 201 (booked) or 409 (SLOT_TAKEN)": (r) => r.status === 201 || r.status === 409 });
}
