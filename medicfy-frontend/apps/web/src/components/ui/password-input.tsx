"use client";

import { forwardRef, useState, type InputHTMLAttributes, type SVGProps } from "react";
import { cn } from "@/lib/utils";
import { TextInput } from "./field";

function IconEye(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M9.9 5.7A10.4 10.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.2 3.9M6.3 6.8A15.7 15.7 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.9-.8" />
      <path d="M9.9 10.1a3 3 0 0 0 4.1 4" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

// Un solo componente para todos los campos de contraseña del sistema
// (login, registro, firma con reautenticación de receta/orden/nota) —
// mismo ojito, mismo comportamiento, en vez de repetir el toggle en
// cada formulario. Oculto por defecto (type="password"); el botón no
// envía el formulario (type="button").
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { error?: boolean }>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <TextInput ref={ref} type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex min-h-[44px] min-w-[44px] items-center justify-center text-gray-500 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          {visible ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
