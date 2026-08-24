"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, setAuthRefreshHandlers } from "./api-client";

interface AuthState {
  accessToken: string | null;
  isLoading: boolean;
  login: (accessToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

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

  const login = (token: string): void => setAccessToken(token);

  const logout = async (): Promise<void> => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    setAccessToken(null);
  };

  return <AuthContext.Provider value={{ accessToken, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
