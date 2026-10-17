import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/config";
import { DateInput } from "./date-input";
import { addMonths, maskTyped, parseTyped } from "@/lib/calendar-date";

// Mediodía en CDMX: "hoy" = 17/10/2026 sin depender de la zona del equipo.
const NOW = new Date("2026-10-17T18:00:00.000Z");

function Harness({
  initial = "",
  onChange,
  locale = "es",
  min,
  max,
}: {
  initial?: string;
  onChange?: (value: string) => void;
  locale?: Locale;
  min?: string;
  max?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <I18nProvider initialLocale={locale}>
      <DateInput
        id="fecha"
        aria-label="Fecha"
        value={value}
        min={min}
        max={max}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
    </I18nProvider>
  );
}

function input() {
  return screen.getByLabelText("Fecha") as HTMLInputElement;
}

describe("calendar-date", () => {
  it("pone las diagonales conforme se teclea, sin atorarse al borrar", () => {
    expect(maskTyped("1")).toBe("1");
    expect(maskTyped("17")).toBe("17");
    expect(maskTyped("171")).toBe("17/1");
    expect(maskTyped("17102026")).toBe("17/10/2026");
    expect(maskTyped("17/10/20261")).toBe("17/10/2026");
  });

  it("solo acepta fechas completas y reales, en el orden de cada idioma", () => {
    expect(parseTyped("17/10/2026", "dmy")).toBe("2026-10-17");
    expect(parseTyped("10/17/2026", "mdy")).toBe("2026-10-17");
    expect(parseTyped("31/02/2026", "dmy")).toBe("");
    expect(parseTyped("17/10/20", "dmy")).toBe("");
  });

  it("al sumar meses ajusta al último día del mes destino", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("DateInput", () => {
  beforeAll(() => {
    // jsdom no implementa scrollTo en elementos (las ruedas de mes/año).
    Element.prototype.scrollTo = vi.fn();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("muestra el valor ISO como dd/mm/aaaa y el formato como placeholder", () => {
    render(<Harness initial="1992-06-05" />);
    expect(input().value).toBe("05/06/1992");
    expect(input()).toHaveAttribute("placeholder", "dd/mm/aaaa");
  });

  it("en inglés usa mm/dd/yyyy", () => {
    render(<Harness initial="1992-06-05" locale="en" />);
    expect(input().value).toBe("06/05/1992");
  });

  it("al teclear emite la fecha ISO solo cuando está completa", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "1506" } });
    expect(input().value).toBe("15/06");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: "15061992" } });
    expect(input().value).toBe("15/06/1992");
    expect(onChange).toHaveBeenLastCalledWith("1992-06-15");
  });

  it("abre el calendario en el mes del valor y elegir un día lo emite y cierra", () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-10-17" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Octubre 2026");
    fireEvent.click(screen.getByRole("button", { name: /20 de octubre de 2026/ }));
    expect(onChange).toHaveBeenLastCalledWith("2026-10-20");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(input().value).toBe("20/10/2026");
  });

  it("se usa sin ratón: ↓ abre en el día elegido, flechas mueven, Enter elige", () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-10-31" onChange={onChange} />);
    input().focus();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(document.activeElement).toHaveAccessibleName(/31 de octubre de 2026/);
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowRight" });
    // Cruza al mes siguiente y el encabezado lo sigue.
    expect(screen.getByRole("dialog")).toHaveTextContent("Noviembre 2026");
    expect(document.activeElement).toHaveAccessibleName(/1 de noviembre de 2026/);
    fireEvent.click(document.activeElement as Element);
    expect(onChange).toHaveBeenLastCalledWith("2026-11-01");
    expect(document.activeElement).toBe(input());
  });

  it("Esc cierra el calendario sin cerrar el Modal que lo contiene", () => {
    const modalEscape = vi.fn();
    document.addEventListener("keydown", modalEscape);
    render(<Harness initial="2026-10-17" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(modalEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", modalEscape);
  });

  it("respeta min/max: los días fuera de rango quedan deshabilitados", () => {
    render(<Harness initial="2026-10-17" max="2026-10-17" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    expect(screen.getByRole("button", { name: /18 de octubre de 2026/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /16 de octubre de 2026/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeDisabled();
  });

  it("el encabezado abre las ruedas de mes y año para saltar décadas", () => {
    render(<Harness initial="2026-10-17" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    fireEvent.click(screen.getByRole("button", { name: /elegir mes y año/ }));
    const years = screen.getByRole("listbox", { name: "Año" });
    act(() => {
      fireEvent.click(screen.getByRole("option", { name: "1992" }));
    });
    fireEvent.click(screen.getByRole("option", { name: "Junio" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Junio 1992");
    fireEvent.keyDown(years, { key: "Enter" });
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /15 de junio de 1992/ })).toBeInTheDocument();
  });

  it("Hoy elige la fecha de hoy en horario de CDMX", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-10-17");
  });
});
