import type { nav as es } from "../es/nav";

export const nav: typeof es = {
  rail: {
    agenda: "Schedule",
    pacientes: "Patients",
    nuevoPaciente: "New patient",
    disponibilidad: "Availability",
    auditoria: "Audit log",
    publicaciones: "Posts",
    administracion: "Administration",
    perfil: "Profile",
    cerrarSesion: "Sign out",
    colapsar: "Collapse",
    expandir: "Expand",
    abrirNavegacion: "Open navigation",
    cerrarNavegacion: "Close navigation",
    colapsarBarra: "Collapse sidebar",
    expandirBarra: "Expand sidebar",
    navegacionPrincipal: "Main navigation",
    irAAgenda: "Medicfy — go to Schedule",
  },
  publico: {
    principal: "Main",
    especialistas: "Specialists",
    misCitas: "My appointments",
    miCuenta: "My account",
    miAgenda: "My schedule",
    salir: "Sign out",
    iniciarSesion: "Sign in",
    registrate: "Sign up",
    registroPaciente: "Sign up as a patient",
    registroMedico: "Sign up as a physician",
  },
  sesion: {
    avisoInactividad: "Your session will end in a few minutes due to inactivity.",
    seguirConectado: "Stay signed in",
  },
  confianza: {
    cedula: "License verified with Mexico's Ministry of Education (SEP)",
    cifrado: "Clinical data encrypted, always",
    bitacora: "Every access to a record is logged",
  },
};
