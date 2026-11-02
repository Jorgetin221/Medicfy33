import { HttpStatus } from "@nestjs/common";
import type { Prisma, RecordShareRequest, RecordShareRequestStatus } from "@prisma/client";
import { ApiException } from "../../common/api-exception";

export function requestNoLongerPending(): ApiException {
  return new ApiException("RECORD_SHARE_REQUEST_NOT_PENDING", "Esta solicitud ya no está pendiente.", HttpStatus.CONFLICT);
}

// Doble autorización: paciente y médico tratante deciden sobre la MISMA
// fila, en cualquier orden y posiblemente al mismo tiempo. Sin candado,
// cada uno podría leer "el otro aún no aprueba" y nadie crearía el
// acceso. SELECT ... FOR UPDATE serializa las dos decisiones: la segunda
// espera a que la primera confirme y lee su resultado.
export async function lockPendingRequest(
  tx: Prisma.TransactionClient,
  requestId: string,
  allowedStatuses: RecordShareRequestStatus[]
): Promise<RecordShareRequest> {
  await tx.$queryRaw`SELECT id FROM record_share_requests WHERE id = ${requestId} FOR UPDATE`;
  const request = await tx.recordShareRequest.findUnique({ where: { id: requestId } });
  if (!request || !allowedStatuses.includes(request.status) || request.expiresAt <= new Date()) {
    throw requestNoLongerPending();
  }
  return request;
}
