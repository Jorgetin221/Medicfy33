# Consentimiento — Expediente compartido autorizado por el paciente

> 🔒 **PENDIENTE REVISIÓN LEGAL (D-EXP-12).** No se inventa ningún fundamento legal aquí. Revisar con el abogado de datos de Jorge.
>
> **Este archivo es el espejo legible para humanos** del texto que de verdad usa el código: `medicfy-backend/apps/api/src/modules/record-share/record-share-consent-text.ts` (función `renderRecordShareConsent`, versión `RECORD_SHARE_CONSENT_VERSION`). El backend **nunca lee este archivo**: si se cambia el texto, hay que cambiarlo en los dos lugares a mano. Versión actual: `v1-2026-11-02` (texto definido por el usuario el 2026-11-02; reemplaza a `draft-2026-10-31`).
>
> El texto lleva datos de la solicitud: `[Nombre]` es el nombre legal del médico que solicita y `[fecha]` el vencimiento según la duración que elige el paciente (zona `America/Mexico_City`). El servidor lo completa y guarda como evidencia el SHA-256 del texto completado **más** la casilla, exactamente como lo leyó el paciente.
>
> Doble autorización: el acceso solo se crea cuando el paciente **y** su médico tratante aprueban. El vencimiento se cuenta desde que decidió el paciente (la fecha que leyó), aunque el médico apruebe después.

---

**Autorizar acceso a tu expediente**

El/la Dr(a). [Nombre] solicita ver tu expediente clínico.

Si autorizas, podrá consultar en modo solo lectura la información registrada por los médicos que te han atendido en Medicfy, incluyendo:

- Notas de consulta, diagnósticos y tratamientos
- Recetas
- Estudios de laboratorio e imagen
- Alergias y antecedentes

El acceso:

- Será únicamente para tu atención médica.
- Estará vigente hasta el [fecha].
- Quedará registrado, y podrás ver cuándo lo consultó.
- Puedes revocarlo en cualquier momento desde tu cuenta.

☐ Entiendo que el/la Dr(a). [Nombre] podrá ver la información que otros médicos registraron sobre mí y autorizo el acceso.
