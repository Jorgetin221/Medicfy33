"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, LoadingState } from "@/components/ui/states";
import { useT } from "@/lib/i18n/context";

// El rail (app-nav.tsx) ya solo muestra "Administración" a quien
// tiene rol ADMIN en el JWT, pero eso es una comodidad de UI, no la
// autorización real: igual que en admin/verificacion/page.tsx, esta
// pantalla no filtra por rol en el cliente. Quien no sea ADMIN llega
// aquí, ve enlaces, y el backend responde 403 en cuanto los usa
// (AdminGuard) — la fuente de autorización es siempre el servidor.
//
// M13-RN-001: el admin nunca ve contenido clínico. Esta pantalla y
// todo lo que cuelga de ella (cola de verificación, y lo que falta:
// usuarios, métricas, break-glass) opera solo con metadatos.
export default function AdminIndexPage() {
  const t = useT();
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.replace("/login");
    }
  }, [authLoading, accessToken, router]);

  if (authLoading || !accessToken) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <LoadingState />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-900">{t("admin.titulo")}</h1>
        <p className="text-base text-gray-500">{t("admin.subtitulo")}</p>
      </div>

      <Link href="/admin/verificacion" className="block">
        <Card className="transition-colors hover:bg-gray-50">
          <h2 className="text-lg font-medium text-gray-900">{t("admin.colaTitulo")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("admin.colaDescripcion")}</p>
        </Card>
      </Link>

      <Link href="/admin/usuarios" className="block">
        <Card className="transition-colors hover:bg-gray-50">
          <h2 className="text-lg font-medium text-gray-900">{t("admin.usuariosTitulo")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("admin.usuariosDescripcion")}</p>
        </Card>
      </Link>

      <Link href="/admin/metricas" className="block">
        <Card className="transition-colors hover:bg-gray-50">
          <h2 className="text-lg font-medium text-gray-900">{t("admin.metricasTitulo")}</h2>
          <p className="mt-1 text-sm text-gray-500">{t("admin.metricasDescripcion")}</p>
        </Card>
      </Link>

      <Card className="opacity-60">
        <h2 className="text-lg font-medium text-gray-900">{t("admin.breakGlassTitulo")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("admin.breakGlassDescripcion")}</p>
      </Card>
    </main>
  );
}
