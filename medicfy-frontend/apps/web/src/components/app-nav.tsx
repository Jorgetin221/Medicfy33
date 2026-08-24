"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const LINKS = [
  { href: "/agenda", label: "Agenda" },
  { href: "/citas/nueva", label: "Nueva cita" },
  { href: "/pacientes/nuevo", label: "Nuevo paciente" },
  { href: "/disponibilidad", label: "Disponibilidad" },
  { href: "/perfil", label: "Perfil" },
];

// Barra de navegación persistente para todas las pantallas autenticadas
// (dentro de app/(app)/layout.tsx). Antes de esto, cada pantalla se
// alcanzaba solo escribiendo la ruta a mano — no había forma de
// navegar entre ellas desde la interfaz.
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { accessToken, isLoading, logout } = useAuth();

  if (isLoading || !accessToken) {
    return null;
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="border-b border-gray-300 bg-white">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
        <Link href="/agenda" className="font-brand text-lg text-brand-900">
          Medicfy
        </Link>
        <ul className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {LINKS.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-md px-3 text-base font-medium ${
                    isActive ? "bg-brand-100 text-brand-900" : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={handleLogout}
          className="ml-auto flex min-h-11 items-center rounded-md px-3 text-base font-medium text-gray-700 hover:bg-gray-100"
        >
          Cerrar sesión
        </button>
      </nav>
    </header>
  );
}
