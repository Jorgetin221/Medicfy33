import type { Metadata } from "next";
import { AutorizarExpedienteCompartidoView } from "./autorizar-view";

// PR-EXP-03 — página pública (sin sesión) del paciente. Fuera de
// (app): sin AppNav, sin guard de sesión — mismo patrón que
// /verificar/[token] y /dr/[slug] (00-DESCUBRIMIENTO.md Q13).
// `robots: { index: false, follow: false }` es la primera vez que el
// proyecto usa esta clave de Metadata — no había precedente que
// copiar (Q13 lo confirmó explícitamente). generateMetadata exige un
// componente de servidor (sin "use client"); el flujo interactivo
// real lo pinta AutorizarExpedienteCompartidoView del lado cliente,
// mismo reparto que /dr/[slug] con DoctorPublicProfile.
export const metadata: Metadata = {
  title: "Autorizar expediente compartido — Medicfy BETA",
  robots: { index: false, follow: false },
};

export default async function AutorizarExpedienteCompartidoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AutorizarExpedienteCompartidoView token={token} />;
}
