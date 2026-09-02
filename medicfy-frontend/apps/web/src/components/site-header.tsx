"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tokenPrimaryRole } from "@/lib/jwt-claims";
import { Button } from "@/components/ui/button";

// v2.4 (spec §7, M3): header del home de descubrimiento del paciente
// y de /doctores — consciente del rol real de la sesión (nunca un
// ícono de notificaciones o buscador decorativo sin datos reales
// detrás, CLAUDE.md §7).
export function SiteHeader() {
  const router = useRouter();
  const { accessToken, isLoading, logout } = useAuth();
  const role = tokenPrimaryRole(accessToken);

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-300 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="font-brand text-xl font-bold text-brand-900">
          Medicfy
        </Link>
        <nav className="hidden items-center gap-4 sm:flex" aria-label="Principal">
          <Link href="/doctores" className="text-base font-medium text-gray-700 hover:text-brand-700">
            Especialistas
          </Link>
          {role === "PATIENT" ? (
            <Link href="/mi-cuenta" className="text-base font-medium text-gray-700 hover:text-brand-700">
              Mis citas
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {isLoading ? null : accessToken ? (
            <>
              {role === "PATIENT" ? (
                <Link href="/mi-cuenta">
                  <Button variant="secondary" className="px-3 sm:px-4">
                    Mi cuenta
                  </Button>
                </Link>
              ) : (
                <Link href="/agenda">
                  <Button variant="secondary" className="px-3 sm:px-4">
                    Mi agenda
                  </Button>
                </Link>
              )}
              <button type="button" onClick={() => void handleLogout()} className="text-sm font-medium text-gray-500 underline">
                Salir
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex min-h-[44px] items-center rounded-md px-2 text-base font-medium text-brand-700 hover:underline sm:px-3"
              >
                Iniciar sesión
              </Link>
              <Link href="/registro-paciente">
                <Button className="px-3 sm:px-4">Regístrate</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
