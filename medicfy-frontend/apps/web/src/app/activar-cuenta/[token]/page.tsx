import type { Metadata } from "next";
import { ActivarCuentaView } from "./activar-cuenta-view";

// Página pública (sin sesión) del enlace de activación que genera el
// médico. Fuera de (app) y sin indexar — mismo patrón que
// /expediente-compartido/autorizar/[token].
export const metadata: Metadata = {
  title: "Activar cuenta — Medicfy BETA",
  robots: { index: false, follow: false },
};

export default async function ActivarCuentaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ActivarCuentaView token={token} />;
}
