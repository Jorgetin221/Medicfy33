import { openDB, type IDBPDatabase } from "idb";

// CLAUDE.md §5: "Prohibido localStorage/sessionStorage para datos
// clínicos. El borrador de nota se guarda en IndexedDB cifrado." Esto
// es la red de seguridad para cuando PATCH .../note falla (sin
// conexión) — mientras hay red, el servidor sigue siendo la fuente
// primaria (ver use-encounter-draft.ts). Cifrado con AES-GCM vía
// Web Crypto: la llave vive como CryptoKey no-extraíble en su propio
// almacén de IndexedDB (nunca sale como bytes a JS), así que el
// contenido en disco no es texto plano ni ante otro proceso local con
// acceso al perfil del navegador. idb (Jake Archibald, ~1.2kb, cero
// dependencias) evita la clase de bugs típica de la API nativa de
// IndexedDB basada en callbacks/eventos para algo donde perder una
// nota clínica es "el peor bug posible en este producto" (CLAUDE.md §5).
const DB_NAME = "medicfy-offline";
const DB_VERSION = 1;
const KEY_RECORD_ID = "draft-encryption-key";

interface DraftRecord {
  encounterId: string;
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
  updatedAt: string;
}

function isSupported(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window && "crypto" in window && "subtle" in window.crypto;
}

async function openDatabase(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("keys");
      db.createObjectStore("drafts", { keyPath: "encounterId" });
    },
  });
}

async function getOrCreateDeviceKey(db: IDBPDatabase): Promise<CryptoKey> {
  const existing = (await db.get("keys", KEY_RECORD_ID)) as CryptoKey | undefined;
  if (existing) return existing;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await db.put("keys", key, KEY_RECORD_ID);
  return key;
}

// Nunca lanza — una falla de almacenamiento local no debe tumbar la
// pantalla de consulta; el borrador sigue vivo en memoria de React de
// todos modos (ver use-encounter-draft.ts). Devuelve si se pudo
// guardar, para que el indicador de guardado pueda distinguir "sin
// conexión pero respaldado" de "sin conexión y sin respaldo" (más
// grave: hay que avisarle al médico que no cierre la pestaña).
export async function saveDraftLocally(encounterId: string, draft: Record<string, unknown>): Promise<boolean> {
  if (!isSupported()) return false;
  try {
    const db = await openDatabase();
    const key = await getOrCreateDeviceKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(draft));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    const record: DraftRecord = { encounterId, iv, ciphertext, updatedAt: new Date().toISOString() };
    await db.put("drafts", record);
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadDraftLocally(encounterId: string): Promise<Record<string, unknown> | null> {
  if (!isSupported()) return null;
  try {
    const db = await openDatabase();
    const record = (await db.get("drafts", encounterId)) as DraftRecord | undefined;
    if (!record) {
      db.close();
      return null;
    }
    const key = await getOrCreateDeviceKey(db);
    // record.iv vuelve de IndexedDB ya como Uint8Array real (clonado
    // por el navegador), pero lib.dom.d.ts no puede probarlo desde el
    // tipo declarado — re-envolver garantiza un ArrayBuffer concreto,
    // no solo el tipo correcto.
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(record.iv) }, key, record.ciphertext);
    db.close();
    return JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Se llama tras un autoguardado exitoso al servidor — el respaldo
// local ya cumplió su propósito (evitar pérdida mientras no había
// red) y no debe quedar reproduciéndose indefinidamente en cada
// dispositivo donde el médico abrió esta consulta.
export async function clearDraftLocally(encounterId: string): Promise<void> {
  if (!isSupported()) return;
  try {
    const db = await openDatabase();
    await db.delete("drafts", encounterId);
    db.close();
  } catch {
    // Sin red y sin este borrador: no hay nada que limpiar que importe.
  }
}
