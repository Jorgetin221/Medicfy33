// spec M2 validation table: "Precio: 1–99,999 MXN." Whole pesos —
// storage converts to cents (CLAUDE.md §4: money is integer cents,
// never float).
export const MIN_PRICE_MXN = 1;
export const MAX_PRICE_MXN = 99_999;

export function isValidPriceMxn(priceMxn: number): boolean {
  return Number.isInteger(priceMxn) && priceMxn >= MIN_PRICE_MXN && priceMxn <= MAX_PRICE_MXN;
}
