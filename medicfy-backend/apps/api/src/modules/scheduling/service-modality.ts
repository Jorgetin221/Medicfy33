import type { AppointmentModality, ServiceType } from "@prisma/client";

// §6.3: serviceType (DoctorService) y modality (AvailabilityRule/
// Appointment) son dos enums separados sin puente definido
// explícitamente en la spec. TELECONSULTATION es el único valor que
// implica ONLINE — la única relación consistente entre ambos enums.
// Judgment call de M4, reutilizado aquí para que M5a's appointment
// creation nunca discrepe de M4's slot computation.
export function modalityForServiceType(serviceType: ServiceType): AppointmentModality {
  return serviceType === "TELECONSULTATION" ? "ONLINE" : "IN_PERSON";
}
