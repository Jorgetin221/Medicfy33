import { redirect } from "next/navigation";

// PR-EXP-02: el rail apunta aquí (igual que /pacientes apunta a su
// lista) para que resaltarse como activo también cubra las subrutas
// (/expediente-compartido/mis-solicitudes, /solicitar) — ver
// isNavLinkActive en app-nav.tsx.
export default function ExpedienteCompartidoIndexPage() {
  redirect("/expediente-compartido/mis-solicitudes");
}
