import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { InactivityWarningBanner } from "@/components/inactivity-warning-banner";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppNav />
      {/* pt-14: altura del encabezado móvil fijo de AppNav, que bajo `md`
          sustituye al rail lateral. En `md` el rail vuelve al flujo y no hay
          nada fijo arriba que compensar.

          `overflow-x-clip` y no `-hidden`: `overflow-x: hidden` obliga al
          navegador a calcular `overflow-y: auto`, y eso convierte este div en
          contenedor de scroll — lo que rompe `position: sticky` en todo lo que
          haya dentro. Las Zonas 1 y 3 de DOC-06 declaran `sticky` desde que se
          escribieron y ninguna se fijaba nunca: se iban con el scroll de la
          página. `clip` recorta igual el desbordamiento horizontal sin crear
          contenedor de scroll. */}
      <div className="min-h-screen flex-1 overflow-x-clip bg-gray-100 pt-14 md:pt-0">
        <InactivityWarningBanner />
        {children}
      </div>
    </div>
  );
}
