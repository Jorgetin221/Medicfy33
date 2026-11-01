import type { Metadata } from "next";
import { RevocarExpedienteCompartidoView } from "./revocar-view";

// PR-EXP-06 — página pública (sin sesión) del paciente para quitar
// accesos. Mismo reparto que /expediente-compartido/autorizar/[token]:
// fuera de (app), noindex, flujo interactivo del lado cliente.
export const metadata: Metadata = {
  title: "Administrar expediente compartido — Medicfy BETA",
  robots: { index: false, follow: false },
};

export default async function RevocarExpedienteCompartidoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RevocarExpedienteCompartidoView token={token} />;
}
