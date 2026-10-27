import type { TranslateFn } from "./i18n/context";
import type { MessageKey } from "./i18n/dictionaries";

// B-18 (auditoría 2026-10-21): la bitácora mostraba códigos técnicos
// ("records.substanceUses.list"). Se traducen a "Consultó · Toxicomanías"
// a partir de las dos piezas del código: el recurso (el primer segmento
// después del módulo, o el módulo mismo) y el verbo (el último). Un
// código que no se reconozca se muestra tal cual — nunca se oculta.
const RESOURCE_KEYS: Record<string, MessageKey> = {
  accessLog: "auditoria.recurso.accessLog",
  activeDiagnoses: "auditoria.recurso.activeDiagnoses",
  allergies: "auditoria.recurso.allergies",
  antecedentesTemplate: "auditoria.recurso.history",
  diagnosis: "auditoria.recurso.activeDiagnoses",
  documents: "auditoria.recurso.documents",
  encounter: "auditoria.recurso.encounter",
  growthCurves: "auditoria.recurso.vitalsHistory",
  gyneco: "auditoria.recurso.gyneco",
  history: "auditoria.recurso.history",
  hojaFrontal: "auditoria.recurso.hojaFrontal",
  integrityCheck: "auditoria.recurso.integrityCheck",
  medications: "auditoria.recurso.medications",
  notesTimeline: "auditoria.recurso.encounter",
  pregnancy: "auditoria.recurso.pregnancy",
  substanceUses: "auditoria.recurso.substanceUses",
  timeline: "auditoria.recurso.timeline",
  vitalsHistory: "auditoria.recurso.vitalsHistory",
  prescriptions: "auditoria.recurso.prescriptions",
  lab_orders: "auditoria.recurso.labOrders",
  lab_results: "auditoria.recurso.labResults",
  lab_analytes: "auditoria.recurso.labResults",
  lab_sheet: "auditoria.recurso.labResults",
  protocols: "auditoria.recurso.protocols",
  assistant: "auditoria.recurso.assistant",
  clinical: "auditoria.recurso.record",
};

const VERB_KEYS: Record<string, MessageKey> = {
  list: "auditoria.verbo.read",
  read: "auditoria.verbo.read",
  view: "auditoria.verbo.read",
  pendingInherited: "auditoria.verbo.read",
  create: "auditoria.verbo.create",
  start: "auditoria.verbo.create",
  upload: "auditoria.verbo.upload",
  update: "auditoria.verbo.update",
  upsert: "auditoria.verbo.update",
  apply: "auditoria.verbo.update",
  enable: "auditoria.verbo.update",
  record: "auditoria.verbo.update",
  confirmInherited: "auditoria.verbo.update",
  autosave: "auditoria.verbo.autosave",
  sign: "auditoria.verbo.sign",
  correct: "auditoria.verbo.correct",
  cancel: "auditoria.verbo.cancel",
  discard: "auditoria.verbo.cancel",
  close: "auditoria.verbo.close",
  download: "auditoria.verbo.download",
  pdf: "auditoria.verbo.download",
  signedUrl: "auditoria.verbo.download",
  review: "auditoria.verbo.review",
  accept: "auditoria.verbo.review",
  confirm_handwritten_delivery: "auditoria.verbo.update",
  access: "auditoria.verbo.access",
  authorship: "auditoria.verbo.authorship",
};

export function describeAuditAction(t: TranslateFn, action: string): string {
  const parts = action.split(".");
  const module = parts[0] ?? "";
  const verbKey = VERB_KEYS[parts[parts.length - 1] ?? ""];
  const resourceKey = (module === "records" ? RESOURCE_KEYS[parts[1] ?? ""] : undefined) ?? RESOURCE_KEYS[module];
  if (!verbKey || !resourceKey) return action;
  return `${t(verbKey)} · ${t(resourceKey)}`;
}
