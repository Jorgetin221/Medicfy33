import type { Doctor } from "@prisma/client";
import type { FileStoragePort } from "../../modules/doctors/services/file-storage.port";
import { omitUndefined } from "../omit-undefined";
import type { DocumentLetterhead } from "./clinical-document-layout";

// Membrete de receta/orden a partir del perfil del médico (Perfil →
// Marca). Archivo aparte de clinical-document-layout.ts porque aquel lo
// importa también el mock local, que no tiene Prisma ni FileStoragePort.
//
// Un logo que no se puede leer no bloquea la emisión del documento:
// se omite y el membrete queda solo en texto.
export async function loadDoctorLetterhead(
  doctor: Pick<Doctor, "logoUrl" | "letterheadPhrase" | "professionalPhone" | "professionalEmail">,
  fileStorage: Pick<FileStoragePort, "retrieve">
): Promise<DocumentLetterhead> {
  let logoImage: Buffer | undefined;
  if (doctor.logoUrl) {
    logoImage = await fileStorage
      .retrieve(doctor.logoUrl)
      .then((asset) => asset.buffer)
      .catch(() => undefined);
  }
  return omitUndefined({
    logoImage,
    phrase: doctor.letterheadPhrase ?? undefined,
    phone: doctor.professionalPhone ?? undefined,
    email: doctor.professionalEmail ?? undefined,
  });
}
