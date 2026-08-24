// Strips keys whose value is `undefined` and changes the return type
// to match: each property becomes optional (`?:`) with `undefined`
// removed from its value type. Needed for Prisma's `data` objects in
// partial updates under `exactOptionalPropertyTypes` — using `?? null`
// instead would be a real bug here (it would overwrite an untouched
// field with null rather than leaving it alone).
export function omitUndefined<T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as { [K in keyof T]?: Exclude<T[K], undefined> };
}
