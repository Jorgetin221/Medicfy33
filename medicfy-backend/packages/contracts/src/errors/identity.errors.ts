// M1 §7 "Errores" table, plus the uniform error envelope from spec §8.
export const IDENTITY_ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_ACCOUNT_LOCKED: 423,
  AUTH_MFA_REQUIRED: 428,
  AUTH_EMAIL_NOT_VERIFIED: 403,
  AUTH_CONSENT_REQUIRED: 451,
  DOCTOR_NOT_VERIFIED: 403,
} as const;

export type IdentityErrorCode = keyof typeof IDENTITY_ERROR_CODES;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    request_id: string;
  };
}
