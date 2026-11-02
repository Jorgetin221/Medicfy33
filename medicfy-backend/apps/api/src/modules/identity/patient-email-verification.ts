// Verificación de correo del paciente con código de 6 dígitos. Hoy NO
// se envían correos reales (las notificaciones están en modo consola, y
// en producción ese adaptador lanza en vez de fingir el envío), así que
// exigir el código dejaba a los pacientes sin forma de terminar su
// registro. Desactivada por defecto, por decisión explícita del
// usuario (2026-11-02), hasta que exista un proveedor de correo real.
// Para reactivarla: PATIENT_EMAIL_VERIFICATION_ENABLED=true.
//
// Solo afecta al rol PATIENT. Médicos y demás roles siguen exigiendo el
// código como siempre.
export function isPatientEmailVerificationEnabled(): boolean {
  return process.env.PATIENT_EMAIL_VERIFICATION_ENABLED === "true";
}
