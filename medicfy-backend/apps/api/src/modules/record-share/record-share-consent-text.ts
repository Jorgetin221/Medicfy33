// PR-EXP-03. 🔒 PENDIENTE REVISIÓN LEGAL (D-EXP-12) — borrador técnico,
// no un documento legal final. Mismo patrón que
// identity/legal-document-versions.ts: versión fija de código, nunca
// interpolada con datos de la solicitud (lo específico — quién
// solicita, qué alcance, qué duración — ya se muestra por separado en
// la pantalla; este texto son las REGLAS del consentimiento, que no
// cambian de una solicitud a otra, así que su hash sí puede ser
// significativo entre versiones).
//
// Espejo legible para humanos (igual que pide el prompt maestro, para
// que un abogado lo revise sin tocar código):
// docs/expediente-compartido/consentimiento-v0.md — mismo texto,
// mantenido a mano en los dos lugares. El backend SIEMPRE hashea esta
// constante, nunca lee el archivo .md en tiempo de ejecución.
export const RECORD_SHARE_CONSENT_VERSION = "draft-2026-10-31";

export const RECORD_SHARE_CONSENT_TEXT = `Autorización para compartir tu expediente médico

Al aprobar esta solicitud, autorizas a Medicfy a mostrarle a el médico o la médica que la hizo,
y únicamente a esa persona, la información de tu expediente que tú elijas en esta misma pantalla —
nunca más de lo que el médico pidió.

Por qué se te pide esto: para que ese médico pueda dar continuidad a tu atención sin que tengas que
repetir tu historial.

Qué va a ver: solo datos de salud (alergias, medicamentos, diagnósticos, y lo demás que tú decidas
incluir). Es de SOLO LECTURA — no puede escribir notas, emitir recetas ni modificar nada de tu
expediente con este acceso.

Por cuánto tiempo: el que tú elijas en esta pantalla (7, 30 o 90 días). Al vencer, el acceso se
cierra solo.

Cómo revocarlo: puedes cerrar este acceso en cualquier momento desde el enlace que te enviamos al
confirmar, sin dar ninguna razón.

Este texto resume el tratamiento de tus datos para este caso específico. Consulta el aviso de
privacidad completo de Medicfy para más detalle sobre cómo se protegen tus datos en general.`;
