"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";
import { INTL_LOCALE } from "@/lib/i18n/config";
import { toIsoDateKey } from "@/lib/i18n/format";
import {
  addDays,
  addMonths,
  clampIso,
  formatTyped,
  isWithin,
  maskTyped,
  monthMatrix,
  parseIso,
  parseTyped,
  toIso,
  weekdayOf,
  type SegmentOrder,
} from "@/lib/calendar-date";

// Selector de fecha propio, en lugar del <input type="date"> nativo:
// el calendario del navegador no se puede estilizar, cambia de
// aspecto entre Chrome/Safari/Firefox y obliga a pasar mes por mes
// para llegar a una fecha de nacimiento. Aquí:
//   - se puede TECLEAR la fecha (dd/mm/aaaa, con diagonales automáticas),
//   - o elegirla en un calendario estilo Apple, con selector de
//     mes/año en ruedas para saltar décadas de un gesto,
//   - y todo funciona sin ratón (CLAUDE.md §6): Alt+↓ / ↓ abre, flechas
//     mueven el día, RePág/AvPág cambian de mes, Enter elige, Esc cierra.
// El valor que entra y sale es siempre ISO "YYYY-MM-DD" (o "" si está
// vacío o incompleto), igual que el input nativo — los formularios no
// cambian de contrato.

// `| undefined` explícito en los opcionales: exactOptionalPropertyTypes
// está activo y los formularios pasan valores condicionales (min={x || undefined}).
export interface DateInputProps {
  id?: string | undefined;
  name?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  min?: string | undefined;
  max?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  error?: boolean | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
}

type Mode = "days" | "months";

interface ViewMonth {
  year: number;
  month: number;
}

interface PopoverPosition {
  top: number;
  left: number;
}

const POPOVER_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
const DEFAULT_YEARS_BACK = 120;
const DEFAULT_YEARS_AHEAD = 10;

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function setRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T }).current = value;
}

function useCalendarLabels(intlLocale: string) {
  return useMemo(() => {
    const monthFormat = new Intl.DateTimeFormat(intlLocale, { month: "long", timeZone: "UTC" });
    const weekdayShort = new Intl.DateTimeFormat(intlLocale, { weekday: "short", timeZone: "UTC" });
    const weekdayLong = new Intl.DateTimeFormat(intlLocale, { weekday: "long", timeZone: "UTC" });
    const fullDate = new Intl.DateTimeFormat(intlLocale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    // 4 de enero de 1970 fue domingo: semana base para los encabezados.
    const sunday = Date.UTC(1970, 0, 4);
    const dayMs = 24 * 60 * 60 * 1000;
    return {
      months: Array.from({ length: 12 }, (_, m) => capitalize(monthFormat.format(Date.UTC(2000, m, 1)))),
      weekdays: Array.from({ length: 7 }, (_, d) => ({
        short: weekdayShort.format(sunday + d * dayMs).replace(".", "").toLocaleUpperCase(),
        long: weekdayLong.format(sunday + d * dayMs),
      })),
      fullDate: (iso: string) => {
        const date = parseIso(iso);
        return date ? fullDate.format(Date.UTC(date.year, date.month, date.day)) : iso;
      },
    };
  }, [intlLocale]);
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { id, name, value, onChange, onBlur, min, max, required, disabled, error, className, "aria-label": ariaLabel },
  forwardedRef
) {
  const { locale, t } = useI18n();
  const order: SegmentOrder = locale === "en" ? "mdy" : "dmy";
  const labels = useCalendarLabels(INTL_LOCALE[locale]);
  const popoverId = useId();
  const headingId = useId();

  const [text, setText] = useState(() => formatTyped(value, order));
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("days");
  const [view, setView] = useState<ViewMonth>({ year: 2000, month: 0 });
  const [focusedIso, setFocusedIso] = useState("");
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const shouldFocusDay = useRef(false);

  // El valor también cambia desde fuera (reset del formulario, "Hoy",
  // otro idioma): el texto se reescribe solo si ya no representa ese
  // valor — así no se pisa lo que el usuario va tecleando a medias.
  useEffect(() => {
    if (parseTyped(text, order) !== value) setText(formatTyped(value, order));
    // `text` fuera a propósito: este efecto sincroniza de fuera hacia dentro.
  }, [value, order]);

  const showView = useCallback((iso: string) => {
    const date = parseIso(iso);
    if (date) setView({ year: date.year, month: date.month });
  }, []);

  const openCalendar = useCallback(
    (focusDay: boolean) => {
      if (disabled) return;
      const start = clampIso(value || toIsoDateKey(new Date()), min, max);
      setFocusedIso(start);
      showView(start);
      setMode("days");
      setPosition(null);
      setOpen(true);
      shouldFocusDay.current = focusDay;
    },
    [disabled, value, min, max, showView]
  );

  const closeCalendar = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) inputRef.current?.focus();
  }, []);

  function commit(next: string) {
    setText(formatTyped(next, order));
    if (next !== value) onChange(next);
  }

  function selectDay(iso: string) {
    commit(iso);
    closeCalendar(true);
  }

  function handleTextChange(raw: string) {
    const masked = maskTyped(raw);
    setText(masked);
    const iso = parseTyped(masked, order);
    if (iso !== value) onChange(iso);
    if (iso && open) {
      setFocusedIso(iso);
      showView(iso);
    }
  }

  // Esc del calendario no debe cerrar además el Modal/Panel que lo
  // contiene (ambos escuchan keydown en document).
  function swallowEscape(e: ReactKeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  }

  function handleInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (open) {
        focusDayButton();
      } else {
        openCalendar(true);
      }
    } else if (e.key === "Escape" && open) {
      swallowEscape(e);
      closeCalendar(false);
    }
  }

  function focusDayButton() {
    const button = popoverRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"][data-iso]');
    button?.focus();
    shouldFocusDay.current = false;
  }

  // Espera a `position`: mientras no está colocado el calendario va con
  // visibility:hidden, y el navegador ignora focus() en algo oculto.
  useEffect(() => {
    if (open && position && mode === "days" && shouldFocusDay.current) focusDayButton();
  }, [open, position, mode, focusedIso, view]);

  // Posición fija junto al campo, en un portal: así no lo recorta el
  // overflow de un Modal/Panel. Se voltea hacia arriba si no cabe.
  const reposition = useCallback(() => {
    const anchor = wrapperRef.current?.getBoundingClientRect();
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const height = popover.offsetHeight;
    const width = popover.offsetWidth;
    let top = anchor.bottom + POPOVER_GAP_PX;
    const fitsBelow = top + height <= window.innerHeight - VIEWPORT_MARGIN_PX;
    const fitsAbove = anchor.top - POPOVER_GAP_PX - height >= VIEWPORT_MARGIN_PX;
    if (!fitsBelow && fitsAbove) top = anchor.top - POPOVER_GAP_PX - height;
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN_PX;
    const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(anchor.left, maxLeft));
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, mode, view, reposition]);

  useEffect(() => {
    if (!open) return undefined;
    function isInside(target: EventTarget | null) {
      return target instanceof Node && (wrapperRef.current?.contains(target) || popoverRef.current?.contains(target));
    }
    function handlePointerDown(e: PointerEvent) {
      if (!isInside(e.target)) closeCalendar(false);
    }
    function handleFocusIn(e: FocusEvent) {
      if (!isInside(e.target)) closeCalendar(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, closeCalendar, reposition]);

  const placeholder = t("ui.fecha.formato");

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <input
        ref={(el) => {
          inputRef.current = el;
          setRef(forwardedRef, el);
        }}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={onBlur}
        onClick={() => {
          if (!open) openCalendar(false);
        }}
        onKeyDown={handleInputKeyDown}
        className={cn(
          "min-h-[44px] w-full rounded-md border bg-white pl-3 pr-12 text-base tabular-nums text-gray-900 placeholder:text-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:opacity-50",
          error ? "border-danger-600" : "border-gray-300"
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={t("ui.fecha.abrirCalendario")}
        onClick={() => (open ? closeCalendar(true) : openCalendar(true))}
        className={cn(
          "absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md transition-colors hover:text-brand-700 disabled:opacity-50",
          open ? "text-brand-700" : "text-gray-500"
        )}
      >
        <CalendarIcon />
      </button>

      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-labelledby={headingId}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  swallowEscape(e);
                  closeCalendar(true);
                }
              }}
              style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: "hidden" }}
              className="fixed z-[60] w-[332px] rounded-lg border border-gray-100 bg-white p-3 shadow-popover motion-safe:animate-[date-popover-in_140ms_ease-out]"
            >
              <CalendarHeader
                headingId={headingId}
                label={`${labels.months[view.month]} ${view.year}`}
                mode={mode}
                onToggleMode={() => setMode((m) => (m === "days" ? "months" : "days"))}
                canGoPrev={!min || toIso(view.year, view.month, 1) > min}
                canGoNext={!max || addMonths(toIso(view.year, view.month, 1), 1) <= max}
                onPrev={() => showView(addMonths(toIso(view.year, view.month, 1), -1))}
                onNext={() => showView(addMonths(toIso(view.year, view.month, 1), 1))}
              />
              {mode === "days" ? (
                <DaysGrid
                  view={view}
                  value={value}
                  focusedIso={focusedIso}
                  min={min}
                  max={max}
                  labels={labels}
                  headingId={headingId}
                  onSelect={selectDay}
                  onMove={(next) => {
                    const clamped = clampIso(next, min, max);
                    shouldFocusDay.current = true;
                    setFocusedIso(clamped);
                    showView(clamped);
                  }}
                />
              ) : (
                <MonthYearWheels
                  view={view}
                  months={labels.months}
                  min={min}
                  max={max}
                  onChange={setView}
                  onDone={() => setMode("days")}
                />
              )}
              <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                <button
                  type="button"
                  disabled={!isWithin(toIsoDateKey(new Date()), min, max)}
                  onClick={() => selectDay(toIsoDateKey(new Date()))}
                  className="min-h-[44px] rounded-md px-3 text-base font-medium text-brand-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 disabled:text-gray-300"
                >
                  {t("ui.fecha.hoy")}
                </button>
                {mode === "months" ? (
                  <button
                    type="button"
                    onClick={() => setMode("days")}
                    className="min-h-[44px] rounded-md px-3 text-base font-semibold text-brand-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
                  >
                    {t("ui.fecha.listo")}
                  </button>
                ) : value && !required ? (
                  <button
                    type="button"
                    onClick={() => selectDay("")}
                    className="min-h-[44px] rounded-md px-3 text-base text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
                  >
                    {t("ui.fecha.borrar")}
                  </button>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
});

function CalendarHeader({
  headingId,
  label,
  mode,
  onToggleMode,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: {
  headingId: string;
  label: string;
  mode: Mode;
  onToggleMode: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const navClass =
    "flex h-11 w-11 items-center justify-center rounded-full text-brand-700 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 disabled:text-gray-300 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between pb-1">
      <button
        type="button"
        onClick={onToggleMode}
        aria-expanded={mode === "months"}
        aria-label={`${label} — ${t("ui.fecha.elegirMesAnio")}`}
        className="flex min-h-[44px] items-center gap-1 rounded-md px-2 text-lg font-semibold text-gray-900 transition-colors hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
      >
        <span id={headingId} aria-live="polite">
          {label}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={cn("h-4 w-4 text-brand-700 transition-transform duration-200", mode === "months" && "rotate-90")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7.5 4.5 13 10l-5.5 5.5" />
        </svg>
      </button>
      {mode === "days" ? (
        <div className="flex items-center">
          <button type="button" onClick={onPrev} disabled={!canGoPrev} aria-label={t("ui.fecha.mesAnterior")} className={navClass}>
            <ChevronIcon direction="left" />
          </button>
          <button type="button" onClick={onNext} disabled={!canGoNext} aria-label={t("ui.fecha.mesSiguiente")} className={navClass}>
            <ChevronIcon direction="right" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DaysGrid({
  view,
  value,
  focusedIso,
  min,
  max,
  labels,
  headingId,
  onSelect,
  onMove,
}: {
  view: ViewMonth;
  value: string;
  focusedIso: string;
  min: string | undefined;
  max: string | undefined;
  labels: ReturnType<typeof useCalendarLabels>;
  headingId: string;
  onSelect: (iso: string) => void;
  onMove: (iso: string) => void;
}) {
  const weeks = monthMatrix(view.year, view.month);
  const today = toIsoDateKey(new Date());
  const days = weeks.flat().filter((d): d is string => d !== null);
  // Roving tabindex: un solo día tabulable — el enfocado si está en el
  // mes visible; si no, el primero elegible del mes.
  const tabbable = days.includes(focusedIso) ? focusedIso : (days.find((d) => isWithin(d, min, max)) ?? days[0]);

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const from = tabbable ?? focusedIso;
    const date = parseIso(from);
    if (!date) return;
    const weekday = weekdayOf(date.year, date.month, date.day);
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(from, -1),
      ArrowRight: () => addDays(from, 1),
      ArrowUp: () => addDays(from, -7),
      ArrowDown: () => addDays(from, 7),
      Home: () => addDays(from, -weekday),
      End: () => addDays(from, 6 - weekday),
      PageUp: () => addMonths(from, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(from, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    onMove(move());
  }

  return (
    <div role="grid" aria-labelledby={headingId} onKeyDown={handleKeyDown}>
      <div role="row" className="grid grid-cols-7">
        {labels.weekdays.map((w) => (
          <div key={w.long} role="columnheader" aria-label={w.long} className="flex h-8 items-center justify-center text-xs font-semibold tracking-wide text-gray-500">
            {w.short}
          </div>
        ))}
      </div>
      {weeks.map((week, i) => (
        <div key={i} role="row" className="grid grid-cols-7">
          {week.map((iso, j) => {
            if (!iso) return <div key={j} role="gridcell" className="h-11" />;
            const isSelected = iso === value;
            const isToday = iso === today;
            const isDisabled = !isWithin(iso, min, max);
            return (
              <div key={iso} role="gridcell" aria-selected={isSelected} className="flex h-11 items-center justify-center">
                <button
                  type="button"
                  data-iso={iso}
                  tabIndex={iso === tabbable ? 0 : -1}
                  disabled={isDisabled}
                  aria-label={labels.fullDate(iso)}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => onSelect(iso)}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full text-base tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700",
                    isSelected && "bg-brand-700 font-semibold text-white",
                    !isSelected && isToday && "font-semibold text-brand-700 hover:bg-gray-100",
                    !isSelected && !isToday && !isDisabled && "text-gray-900 hover:bg-gray-100",
                    isDisabled && "cursor-not-allowed text-gray-300"
                  )}
                >
                  {Number(iso.slice(8))}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MonthYearWheels({
  view,
  months,
  min,
  max,
  onChange,
  onDone,
}: {
  view: ViewMonth;
  months: string[];
  min: string | undefined;
  max: string | undefined;
  onChange: (view: ViewMonth) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const currentYear = Number(toIsoDateKey(new Date()).slice(0, 4));
  const firstYear = min ? Number(min.slice(0, 4)) : currentYear - DEFAULT_YEARS_BACK;
  const lastYear = max ? Number(max.slice(0, 4)) : currentYear + DEFAULT_YEARS_AHEAD;
  const years = useMemo(
    () => Array.from({ length: lastYear - firstYear + 1 }, (_, i) => ({ value: firstYear + i, label: String(firstYear + i) })),
    [firstYear, lastYear]
  );
  const monthItems = useMemo(() => months.map((label, value) => ({ value, label })), [months]);

  return (
    <div className="relative grid grid-cols-[1.4fr_1fr] gap-2 py-1">
      {/* La franja de la selección, detrás de ambas ruedas (estilo iOS). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-11 -translate-y-1/2 rounded-lg bg-gray-100" />
      <Wheel label={t("ui.fecha.mes")} items={monthItems} selected={view.month} onSelect={(month) => onChange({ ...view, month })} onDone={onDone} />
      <Wheel label={t("ui.fecha.anio")} items={years} selected={view.year} onSelect={(year) => onChange({ ...view, year })} onDone={onDone} />
    </div>
  );
}

const WHEEL_ITEM_PX = 44;
const WHEEL_VISIBLE_ITEMS = 5;
const WHEEL_SETTLE_MS = 120;

// Rueda de selección: se arrastra/desplaza y lo que queda en la franja
// central es lo elegido (scroll-snap). También responde a clic y a
// flechas — es un listbox para lectores de pantalla.
function Wheel({
  label,
  items,
  selected,
  onSelect,
  onDone,
}: {
  label: string;
  items: { value: number; label: string }[];
  selected: number;
  onSelect: (value: number) => void;
  onDone: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMounted = useRef(false);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.value === selected));
  const optionIdPrefix = useId();

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const top = selectedIndex * WHEEL_ITEM_PX;
    if (Math.abs(list.scrollTop - top) > 1) {
      list.scrollTo({ top, behavior: hasMounted.current ? "smooth" : "auto" });
    }
    hasMounted.current = true;
  }, [selectedIndex]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  function handleScroll() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const index = Math.min(items.length - 1, Math.max(0, Math.round(list.scrollTop / WHEEL_ITEM_PX)));
      const item = items[index];
      if (item && item.value !== selected) onSelect(item.value);
    }, WHEEL_SETTLE_MS);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
    if (e.key === "Enter") {
      e.preventDefault();
      onDone();
      return;
    }
    let index: number | undefined;
    if (e.key in steps) index = selectedIndex + (steps[e.key] ?? 0);
    else if (e.key === "Home") index = 0;
    else if (e.key === "End") index = items.length - 1;
    if (index === undefined) return;
    e.preventDefault();
    const item = items[Math.min(items.length - 1, Math.max(0, index))];
    if (item) onSelect(item.value);
  }

  const padding = ((WHEEL_VISIBLE_ITEMS - 1) / 2) * WHEEL_ITEM_PX;

  return (
    <div
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${optionIdPrefix}-${selectedIndex}`}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      style={{ height: WHEEL_ITEM_PX * WHEEL_VISIBLE_ITEMS, paddingTop: padding, paddingBottom: padding, scrollPaddingTop: padding }}
      className="relative snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-lg [mask-image:linear-gradient(to_bottom,transparent,black_35%,black_65%,transparent)] [scrollbar-width:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div
            key={item.value}
            id={`${optionIdPrefix}-${index}`}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(item.value)}
            style={{ height: WHEEL_ITEM_PX }}
            className={cn(
              "flex cursor-pointer snap-start items-center justify-center text-lg tabular-nums transition-colors",
              isSelected ? "font-semibold text-gray-900" : "text-gray-500"
            )}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={direction === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
