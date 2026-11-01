# Consentimiento v0 — Expediente compartido autorizado por el paciente

> 🔒 **PENDIENTE REVISIÓN LEGAL (D-EXP-12).** Borrador técnico, no un documento legal final — no se inventa ningún fundamento legal aquí. Revisar con el abogado de datos de Jorge antes de producción.
>
> **Este archivo es el espejo legible para humanos** del texto que de verdad usa el código: `medicfy-backend/apps/api/src/modules/record-share/record-share-consent-text.ts` (constante `RECORD_SHARE_CONSENT_TEXT`, versión `RECORD_SHARE_CONSENT_VERSION`). El backend hashea esa constante, **nunca lee este archivo** en tiempo de ejecución — si se cambia el texto, hay que cambiarlo en los dos lugares a mano. Versión actual: `draft-2026-10-31`.

---

## Autorización para compartir tu expediente médico

Al aprobar esta solicitud, autorizas a Medicfy a mostrarle a el médico o la médica que la hizo, y únicamente a esa persona, la información de tu expediente que tú elijas en esta misma pantalla — nunca más de lo que el médico pidió.

**Por qué se te pide esto:** para que ese médico pueda dar continuidad a tu atención sin que tengas que repetir tu historial.

**Qué va a ver:** solo datos de salud (alergias, medicamentos, diagnósticos, y lo demás que tú decidas incluir). Es de **SOLO LECTURA** — no puede escribir notas, emitir recetas ni modificar nada de tu expediente con este acceso.

**Por cuánto tiempo:** el que tú elijas en esta pantalla (7, 30 o 90 días). Al vencer, el acceso se cierra solo.

**Cómo revocarlo:** puedes cerrar este acceso en cualquier momento desde el enlace que te enviamos al confirmar, sin dar ninguna razón.

Este texto resume el tratamiento de tus datos para este caso específico. Consulta el aviso de privacidad completo de Medicfy para más detalle sobre cómo se protegen tus datos en general.

---

## Notas para la revisión legal (no son parte del texto que ve el paciente)

- El "aviso de privacidad completo" referido arriba todavía no existe como documento legal real — ver `CURRENT_PRIVACY_NOTICE_VERSION` en `legal-document-versions.ts`, también marcado como borrador pendiente.
- El enlace de revocación mencionado en el texto **todavía no existe como ruta funcional** — se construye en PR-EXP-06. El mensaje de confirmación de aprobación (PR-EXP-03) no envía ese enlace hasta que exista (ver `02-solicitud-del-medico.md`/`03-autorizacion-del-paciente.md`, decisión §3) — este texto de consentimiento sí lo menciona porque describe la REGLA (que el acceso es revocable), no el mecanismo técnico específico.
- No se garantiza aquí ningún plazo de retención de esta evidencia de consentimiento ni se cita ningún artículo de ley — eso es exactamente lo que falta por confirmar.
