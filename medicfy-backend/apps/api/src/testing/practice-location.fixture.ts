import type { PrismaClient } from "@prisma/client";

type PracticeLocationWriter = Pick<PrismaClient, "doctor" | "practiceLocation">;

// A-13: receta y orden ya no se emiten sin domicilio profesional
// (art. 33 RIS). Las pruebas que emiten documentos le dan al médico un
// consultorio principal con domicilio completo — sintético (R7).
export async function givePrimaryPracticeLocation(prisma: PracticeLocationWriter, userId: string): Promise<void> {
  const doctor = await prisma.doctor.findUniqueOrThrow({ where: { userId }, select: { id: true } });
  await prisma.practiceLocation.create({
    data: {
      doctorId: doctor.id,
      name: "Consultorio de prueba",
      addressStreet: "Av. Ficticia",
      addressExt: "123",
      addressColonia: "Centro",
      addressMunicipality: "Guadalajara",
      addressState: "Jalisco",
      addressPostalCode: "44100",
      isPrimary: true,
    },
  });
}
