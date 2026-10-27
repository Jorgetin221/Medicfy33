import { describe, expect, it } from "vitest";
import { describeAuditAction } from "./audit-action-label";
import { getDictionary } from "./i18n/dictionaries";
import type { TranslateFn } from "./i18n/context";

const es = getDictionary("es") as unknown as Record<string, Record<string, Record<string, string>>>;
const t: TranslateFn = (key) => {
  const [section, group, leaf] = key.split(".") as [string, string, string];
  return es[section]?.[group]?.[leaf] ?? key;
};

// Auditoría 2026-10-21, B-18.
describe("describeAuditAction", () => {
  it("turns technical codes into readable text", () => {
    expect(describeAuditAction(t, "records.substanceUses.list")).toBe("Consultó · toxicomanías");
    expect(describeAuditAction(t, "prescriptions.create")).toBe("Creó · receta");
    expect(describeAuditAction(t, "records.encounter.sign")).toBe("Firmó · nota de consulta");
  });

  it("falls back to the raw code when it does not know it", () => {
    expect(describeAuditAction(t, "algo.desconocido")).toBe("algo.desconocido");
  });
});
