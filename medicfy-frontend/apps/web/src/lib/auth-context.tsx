"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, setAuthRefreshHandlers } from "./api-client";
import { tokenPrimaryRole } from "./jwt-claims";

interface AuthState {
  accessToken: string | null;
  isLoading: boolean;
  login: (accessToken: string) => void;
  logout: () => Promise<void>;
  inactivityWarning: boolean;
  extendSession: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

// M1-RN-007/M1-CA-006 (spec): sesión de médico (y cualquier rol de
// staff clínico — el criterio es "pantalla con datos clínicos en
// consultorio compartido", no solo DOCTOR literal) expira a los 30
// min de inactividad, con aviso a los 28; paciente sobrevive 7 días
// sin aviso (CA-006 solo lo pide para médico).
const DOCTOR_INACTIVITY_LIMIT_MS = 30 * 60_000;
const DOCTOR_WARNING_LEAD_MS = 2 * 60_000;
const PATIENT_INACTIVITY_LIMIT_MS = 7 * 24 * 60 * 60_000;
const CHECK_INTERVAL_MS = 15_000;

// Un timestamp de "última actividad" no es el token ni dato clínico —
// es lo único de la sesión que se permite persistir fuera de memoria
// (CLAUDE.md §5 prohíbe localStorage solo para lo que sí lo es), y
// necesita sobrevivir un F5 o cerrar/abrir la pestaña para que la
// inactividad se mida en el tiempo real transcurrido, no desde que se
// montó React la última vez.
const ACTIVITY_STORAGE_KEY = "medicfy:lastActivityAt";
const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart"] as const;

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    return raw ? Number(raw) : Date.now();
  } catch {
    return Date.now();
  }
}

function writeLastActivity(ts: number): void {
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(ts));
  } catch {
    // Modo privado u otro bloqueo de storage: el cierre por
    // inactividad no sobrevive un reload en esa pestaña, pero nada
    // más depende de este valor.
  }
}

// Sprint 5c. The access token lives only in React state — never
// localStorage/sessionStorage (CLAUDE.md §5 prohibits both for
// anything touching a clinical session, and a bearer token for this
// API is exactly that). Surviving a page reload works through the
// httpOnly refresh cookie instead: on mount, silently try
// POST /auth/refresh: it does nothing if there's no valid cookie
// (real login is still required), and hands back a fresh access
// token if there is.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inactivityWarning, setInactivityWarning] = useState(false);

  useEffect(() => {
    apiFetch<{ accessToken: string }>("/auth/refresh", { method: "POST" })
      .then((res) => setAccessToken(res.accessToken))
      .catch(() => setAccessToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  // api-client.ts no es un componente de React — no puede leer ni
  // escribir este estado directamente. Se registra una sola vez: si
  // cualquier apiFetch/apiUpload/apiFetchBlob recibe un 401 por token
  // vencido (TTL 15 min), refresca en silencio y actualiza este
  // estado; si el refresh token también expiró, limpia la sesión y
  // cada pantalla redirige sola a /login (mismo guard que ya usan
  // todas cuando accessToken es null).
  useEffect(() => {
    setAuthRefreshHandlers({
      onTokenRefreshed: (token) => setAccessToken(token),
      onSessionExpired: () => setAccessToken(null),
    });
    return () => setAuthRefreshHandlers({ onTokenRefreshed: () => {}, onSessionExpired: () => {} });
  }, []);

  const login = (token: string): void => {
    writeLastActivity(Date.now());
    setAccessToken(token);
  };

  const logout = useCallback(async (): Promise<void> => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    setAccessToken(null);
    setInactivityWarning(false);
  }, []);

  const markActive = useCallback(() => {
    writeLastActivity(Date.now());
    setInactivityWarning(false);
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setInactivityWarning(false);
      return;
    }
    const isPatient = tokenPrimaryRole(accessToken) === "PATIENT";
    const limitMs = isPatient ? PATIENT_INACTIVITY_LIMIT_MS : DOCTOR_INACTIVITY_LIMIT_MS;

    // Una pestaña reabierta (o un F5) después de que el límite ya se
    // cumplió mientras estaba cerrada/inactiva cierra la sesión de
    // inmediato, sin esperar al primer tick del intervalo.
    if (Date.now() - readLastActivity() >= limitMs) {
      logout();
      return;
    }

    markActive();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    const interval = setInterval(() => {
      const idleMs = Date.now() - readLastActivity();
      if (idleMs >= limitMs) {
        logout();
      } else if (!isPatient && idleMs >= limitMs - DOCTOR_WARNING_LEAD_MS) {
        setInactivityWarning(true);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, markActive));
      clearInterval(interval);
    };
  }, [accessToken, logout, markActive]);

  return (
    <AuthContext.Provider value={{ accessToken, isLoading, login, logout, inactivityWarning, extendSession: markActive }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
