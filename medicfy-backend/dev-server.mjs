import http from 'node:http';
import url from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const PORT = 3001;

// Base Mock Data
const doctorUser = {
  id: "user-doctor-1",
  email: "doctor@medicfy.dev",
  primaryRole: "DOCTOR",
  status: "ACTIVE",
  emailVerifiedAt: new Date().toISOString(),
  doctor: {
    id: "doc-1",
    userId: "user-doctor-1",
    slug: "jorge-tinoco",
    legalFirstName: "Jorge",
    legalLastName: "Tinoco",
    professionalLicense: "12345678",
    specialtyLicense: null,
    specialtyLicenseExpiresAt: null,
    primarySpecialtyId: "spec-gen",
    displayName: "Dr. Jorge Tinoco",
    photoUrl: null,
    biography: null,
    yearsExperience: null,
    languages: [],
    university: null,
    professionalPhone: null,
    professionalEmail: null,
    letterheadPhrase: null,
    logoUrl: null,
    signatureImageUrl: null,
    verificationStatus: "VERIFIED",
    verificationNotes: null,
    acceptsTeleconsultation: true,
    acceptsNewPatients: true,
    minBookingNoticeMinutes: 120,
    maxBookingWindowDays: 90
  }
};

const adminUser = {
  id: "user-admin-1",
  email: "admin@medicfy.dev",
  primaryRole: "ADMIN",
  status: "ACTIVE",
  emailVerifiedAt: new Date().toISOString()
};

// Médicos que se registran vía POST /auth/register/doctor durante esta
// sesión del mock — se pierden al reiniciar el proceso, igual que el
// resto del estado en memoria de este archivo.
let registeredDoctors = [
  // Demo para /admin/verificacion: uno reciente y uno con más de 24h
  // hábiles esperando, para poder ver la alerta de M13-CA-003 en el
  // mock sin tener que registrar un médico nuevo a mano.
  {
    id: "demo-doc-1",
    email: "nueva.doctora@medicfy.dev",
    primaryRole: "DOCTOR",
    status: "ACTIVE",
    emailVerifiedAt: null,
    doctor: {
      id: "doc-demo-1",
      userId: "demo-doc-1",
      slug: "demo-doctora",
      legalFirstName: "Valeria",
      legalLastName: "Campos Ruiz",
      professionalLicense: "9988776",
      specialtyLicense: null,
      specialtyLicenseExpiresAt: null,
      primarySpecialtyId: null,
      displayName: "Dra. Valeria Campos Ruiz",
      photoUrl: null,
      biography: null,
      yearsExperience: null,
      languages: [],
      university: null,
      professionalPhone: null,
      professionalEmail: null,
      letterheadPhrase: null,
      logoUrl: null,
      signatureImageUrl: null,
      verificationStatus: "SUBMITTED",
      verificationNotes: null,
      acceptsTeleconsultation: false,
      acceptsNewPatients: false,
      minBookingNoticeMinutes: 120,
      maxBookingWindowDays: 90,
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    }
  },
  {
    id: "demo-doc-2",
    email: "rezagado@medicfy.dev",
    primaryRole: "DOCTOR",
    status: "ACTIVE",
    emailVerifiedAt: null,
    doctor: {
      id: "doc-demo-2",
      userId: "demo-doc-2",
      slug: "demo-rezagado",
      legalFirstName: "Ricardo",
      legalLastName: "Salcido Peña",
      professionalLicense: "1122334",
      specialtyLicense: null,
      specialtyLicenseExpiresAt: null,
      primarySpecialtyId: null,
      displayName: "Dr. Ricardo Salcido Peña",
      photoUrl: null,
      biography: null,
      yearsExperience: null,
      languages: [],
      university: null,
      professionalPhone: null,
      professionalEmail: null,
      letterheadPhrase: null,
      logoUrl: null,
      signatureImageUrl: null,
      verificationStatus: "SUBMITTED",
      verificationNotes: null,
      acceptsTeleconsultation: false,
      acceptsNewPatients: false,
      minBookingNoticeMinutes: 120,
      maxBookingWindowDays: 90,
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    }
  }
];

function allUsers() {
  return [doctorUser, adminUser, ...registeredDoctors];
}

// Antes, /auth/login siempre devolvía el mismo token fijo sin
// importar el email — no había forma de "ser" un usuario distinto al
// doctor de siempre. Estos tokens no son JWT reales (sin firma), solo
// tienen la misma FORMA (header.payload.firma) para que
// tokenPrimaryRole()/tokenSubject() del frontend (que decodifican esa
// forma) puedan leer el rol real de quien inició sesión.
function base64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeMockToken(user) {
  return `mock.${base64url({ sub: user.id, primaryRole: user.primaryRole })}.sig`;
}

function parseMockToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json).sub || null;
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// Resuelve quién hace la llamada a partir del Authorization: Bearer
// — si el token no corresponde a nadie (o no vino ninguno), cae al
// doctor de siempre, para no romper llamadas ya existentes que no
// mandan accessToken.
function getCurrentUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = parseMockToken(token);
  return allUsers().find(u => u.id === userId) || doctorUser;
}

let patients = [
  {
    id: "pat-1",
    medicfyId: "MED-0001",
    firstName: "Ana Sofía",
    lastNamePaternal: "García",
    lastNameMaternal: "López",
    birthDate: "1992-06-15",
    sexAtBirth: "F",
    bloodType: "O+",
    phoneE164: "+523311223344",
    email: "ana.garcia@example.com",
    emergencyContactName: "Roberto García",
    emergencyContactPhone: "+523322334455",
    emergencyContactRelation: "Padre",
    guardians: []
  },
  {
    id: "pat-2",
    medicfyId: "MED-0002",
    firstName: "Carlos Alberto",
    lastNamePaternal: "Hernández",
    lastNameMaternal: "Ruiz",
    birthDate: "1985-11-20",
    sexAtBirth: "M",
    bloodType: "A+",
    phoneE164: "+523355667788",
    email: "carlos.h@example.com",
    emergencyContactName: "Laura Hernández",
    emergencyContactPhone: "+523366778899",
    emergencyContactRelation: "Esposa",
    guardians: []
  },
  {
    id: "pat-3",
    medicfyId: "MED-0003",
    firstName: "Mariana",
    lastNamePaternal: "Torres",
    lastNameMaternal: "Vega",
    birthDate: "2001-03-10",
    sexAtBirth: "F",
    bloodType: "B+",
    phoneE164: "+523399887766",
    email: "mariana.t@example.com",
    emergencyContactName: "Elena Vega",
    emergencyContactPhone: "+523388776655",
    emergencyContactRelation: "Madre",
    guardians: []
  }
];

const today = new Date();
const todayYMD = today.toISOString().split('T')[0];

let appointments = [
  {
    id: "apt-1",
    patientId: "pat-1",
    doctorId: "doc-1",
    startsAt: `${todayYMD}T15:00:00.000Z`,
    endsAt: `${todayYMD}T15:30:00.000Z`,
    status: "CONFIRMED",
    completedWithoutNoteReason: null,
    patient: {
      id: "pat-1",
      firstName: "Ana Sofía",
      lastNamePaternal: "García",
      lastNameMaternal: "López",
      medicfyId: "MED-0001",
      birthDate: "1992-06-15",
      sexAtBirth: "F"
    },
    service: { id: "srv-1", name: "Consulta General", durationMinutes: 30 },
    encounter: { id: "enc-1", status: "DRAFT", encounterType: "FOLLOW_UP" }
  },
  {
    id: "apt-2",
    patientId: "pat-2",
    doctorId: "doc-1",
    startsAt: `${todayYMD}T16:30:00.000Z`,
    endsAt: `${todayYMD}T17:15:00.000Z`,
    status: "SCHEDULED",
    completedWithoutNoteReason: null,
    patient: {
      id: "pat-2",
      firstName: "Carlos Alberto",
      lastNamePaternal: "Hernández",
      lastNameMaternal: "Ruiz",
      medicfyId: "MED-0002",
      birthDate: "1985-11-20",
      sexAtBirth: "M"
    },
    service: { id: "srv-3", name: "Primera Vez", durationMinutes: 45 },
    encounter: null
  },
  {
    id: "apt-3",
    patientId: "pat-3",
    doctorId: "doc-1",
    startsAt: `${todayYMD}T18:00:00.000Z`,
    endsAt: `${todayYMD}T18:20:00.000Z`,
    status: "CONFIRMED",
    completedWithoutNoteReason: null,
    patient: {
      id: "pat-3",
      firstName: "Mariana",
      lastNamePaternal: "Torres",
      lastNameMaternal: "Vega",
      medicfyId: "MED-0003",
      birthDate: "2001-03-10",
      sexAtBirth: "F"
    },
    service: { id: "srv-2", name: "Consulta de Seguimiento", durationMinutes: 20 },
    encounter: null
  }
];

let encounters = {
  "enc-1": {
    id: "enc-1",
    patientId: "pat-1",
    encounterType: "FOLLOW_UP",
    status: "DRAFT",
    startedAt: new Date().toISOString(),
    signedAt: null,
    draftContent: {
      chiefComplaint: "Seguimiento de control arterial",
      currentIllness: "Paciente refiere sentirse bien, sin cefaleas ni mareos en los últimos días.",
      vitals: { systolic: 120, diastolic: 80, heartRate: 72, respiratoryRate: 16, temperature: 36.5, weightKg: 65, heightCm: 165 },
      assessment: "Hipertensión arterial controlada.",
      plan: "Continuar esquema actual. Próxima cita en 3 meses."
    },
    notes: [],
    diagnoses: [
      { id: "diag-1", icd10Code: "I10", codeAbsentReason: null, description: "Hipertensión esencial (primaria)", diagnosisType: "PRINCIPAL", certainty: "CONFIRMED" }
    ]
  }
};

const allergies = {
  "pat-1": [
    { id: "alg-1", patientId: "pat-1", substance: "Penicilina", allergyType: "DRUG", reaction: "Urticaria y broncoespasmo", severity: "CRITICAL", ageOfOnset: "12", status: "ACTIVE", certainty: "CONFIRMED", source: "DIRECT_OBSERVATION", lastReviewedAt: new Date().toISOString() }
  ],
  "pat-2": [],
  "pat-3": [
    { id: "alg-2", patientId: "pat-3", substance: "Aspirina", allergyType: "DRUG", reaction: "Eritema facial", severity: "MODERATE", ageOfOnset: "18", status: "ACTIVE", certainty: "CONFIRMED", source: "PATIENT_REPORT", lastReviewedAt: new Date().toISOString() }
  ]
};

const medications = {
  "pat-1": [
    { id: "med-1", patientId: "pat-1", genericName: "Losartán", brandName: "Cozaar", dose: "50 mg", route: "Oral", frequency: "Cada 24 horas", startedAt: "2025-01-01", suspendedAt: null, reason: "Control hipertensión", status: "ACTIVE", prescriber: "Dr. Jorge Tinoco", source: "INTERNAL" }
  ],
  "pat-2": [],
  "pat-3": []
};

const historyItems = {
  "pat-1": [
    { id: "hist-1", patientId: "pat-1", category: "PATOLOGICOS", subcategory: "HIPERTENSION", description: "Diagnosticada hace 2 años", ageAtOnset: 32, status: "ACTIVE", familyMember: null, isNegated: false },
    { id: "hist-2", patientId: "pat-1", category: "HEREDOFAMILIARES", subcategory: "DIABETES", description: "Madre con DM2", ageAtOnset: null, status: "ACTIVE", familyMember: "Madre", isNegated: false }
  ],
  "pat-2": [],
  "pat-3": []
};

// Compartido por /active-diagnoses y /hoja-frontal.
function mockActiveDiagnoses(patId) {
  if (patId !== 'pat-1') return [];
  return [
    {
      icd10Code: "I10",
      description: "Hipertensión esencial (primaria)",
      diagnosisType: "PRINCIPAL",
      certainty: "CONFIRMED",
      firstRecordedAt: "2026-07-01T10:00:00.000Z",
      lastRecordedAt: new Date().toISOString(),
      timesRecorded: 2,
      lastEncounterId: "enc-1"
    }
  ];
}

const specialties = [
  { id: "spec-gen", code: "GENERAL", nameEs: "Medicina General", requiresSpecialtyLicense: false },
  { id: "spec-gin", code: "GINECOLOGIA_OBSTETRICIA", nameEs: "Ginecología y Obstetricia", requiresSpecialtyLicense: true },
  { id: "spec-ped", code: "PEDIATRIA", nameEs: "Pediatría", requiresSpecialtyLicense: true },
  { id: "spec-med", code: "MEDICINA_INTERNA", nameEs: "Medicina Interna", requiresSpecialtyLicense: true }
];

const sampleIcd10 = [
  { code: "I10", description: "Hipertensión esencial (primaria)" },
  { code: "E11.9", description: "Diabetes mellitus tipo 2 sin mención de complicación" },
  { code: "J00", description: "Rinofaringitis aguda (resfriado común)" },
  { code: "J02.9", description: "Faringitis aguda, no especificada" },
  { code: "K29.7", description: "Gastritis, no especificada" },
  { code: "M54.5", description: "Lumbago no especificado" },
  { code: "R51", description: "Cefalea" }
];

// id: UUID, igual que en el API real — prescriptionItemCreateSchema
// exige medicationCatalogId uuid; sin id la receta no se podía armar.
const sampleMedications = [
  { id: "6f1c2a10-0001-4a00-8000-000000000001", genericName: "Paracetamol", brandNames: ["Tempra"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "N02BE01", controlGroup: "VI", isElectronicallyPrescribable: true },
  { id: "6f1c2a10-0002-4a00-8000-000000000002", genericName: "Ibuprofeno", brandNames: ["Motrin"], presentations: [{ label: "Tableta 400 mg" }], atcCode: "M01AE01", controlGroup: "VI", isElectronicallyPrescribable: true },
  { id: "6f1c2a10-0003-4a00-8000-000000000003", genericName: "Amoxicilina", brandNames: ["Amoxil"], presentations: [{ label: "Cápsula 500 mg" }], atcCode: "J01CA04", controlGroup: "VI", isElectronicallyPrescribable: true },
  { id: "6f1c2a10-0004-4a00-8000-000000000004", genericName: "Losartán", brandNames: ["Cozaar"], presentations: [{ label: "Tableta 50 mg" }], atcCode: "C09CA01", controlGroup: "VI", isElectronicallyPrescribable: true },
  { id: "6f1c2a10-0005-4a00-8000-000000000005", genericName: "Omeprazol", brandNames: ["Losec"], presentations: [{ label: "Cápsula 20 mg" }], atcCode: "A02BC01", controlGroup: "VI", isElectronicallyPrescribable: true }
];

// Mismo catálogo que prisma/seed.ts (seedEstudiosFase4), compartido en
// packages/contracts/src/catalogs/lab-studies.ts: el tipo de cada
// estudio viaja en externalCode.
const labStudyCatalog = await import('./packages/contracts/src/catalogs/lab-studies.ts');
const labCatalogs = {
  TIPO_ESTUDIO: labStudyCatalog.LAB_STUDY_TYPES.map(t => ({ key: t.key, preferredTerm: t.term })),
  MOTIVO_ESTUDIO: labStudyCatalog.LAB_STUDY_MOTIVES.map(m => ({ key: m.key, preferredTerm: m.term })),
  ESTUDIO_LABORATORIO: labStudyCatalog.LAB_STUDIES.map(e => ({ key: e.key, preferredTerm: e.term, externalCode: e.tipo, synonyms: e.synonyms ?? [] }))
};

// Recetas, órdenes y resultados de laboratorio del mock. Se guardan en
// disco (ver "Persistencia del mock" más abajo).
const issuedPrescriptions = [];
const issuedLabOrders = [];
const labResults = [];

// El PDF del mock es EL MISMO diseño que el de producción: se importa
// el módulo de dibujo del API con el type-stripping de Node (>= 22.18).
// Si la versión de Node no lo soporta, la receta/orden se emite igual
// y solo la descarga del PDF responde "no disponible".
const pdfLayout = await import('./apps/api/src/common/pdf/clinical-document-layout.ts').catch((e) => {
  console.warn(`PDF de receta/orden no disponible en el mock: ${e.message}`);
  return null;
});

function ageFromBirthDate(birthDate) {
  const born = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

// Equivalente de buildLegalSnapshot() (legal-snapshot.util.ts): los
// datos legales se congelan en el documento al emitirlo (R6).
function mockLegalSnapshot(encounterId) {
  const encounter = encounters[encounterId] || encounters["enc-1"];
  const patient = patients.find(p => p.id === encounter.patientId) || patients[0];
  const doctor = doctorUser.doctor;
  return {
    encounterId: encounter.id,
    patientId: patient.id,
    doctorNameSnapshot: doctor.displayName || `${doctor.legalFirstName} ${doctor.legalLastName}`,
    doctorLicenseSnapshot: doctor.professionalLicense,
    doctorSpecialtySnapshot: specialties.find(s => s.id === doctor.primarySpecialtyId)?.nameEs,
    practiceAddressSnapshot: "Consultorio Principal · Av. Américas 1254, Guadalajara, Jal.",
    patientNameSnapshot: [patient.firstName, patient.lastNamePaternal, patient.lastNameMaternal].filter(Boolean).join(" "),
    patientAgeSnapshot: ageFromBirthDate(patient.birthDate),
    patientSexSnapshot: patient.sexAtBirth
  };
}

function nextMockFolio(prefix, list) {
  return `${prefix}-${String(list.length + 1).padStart(6, "0")}`;
}

async function storeMockPdf(id, render, input) {
  if (!pdfLayout) return;
  saveMockFile(`${id}.pdf`, await render({ ...input, letterhead: mockLetterhead() }));
}

// Mismo membrete que loadDoctorLetterhead() del API: logo y datos de
// contacto de Perfil → Marca.
function mockLetterhead() {
  const doctor = doctorUser.doctor;
  const logo = doctor.logoUrl ? readMockFile(doctor.logoUrl) : null;
  return Object.fromEntries(
    Object.entries({
      logoImage: logo ?? undefined,
      phrase: doctor.letterheadPhrase || undefined,
      phone: doctor.professionalPhone || undefined,
      email: doctor.professionalEmail || undefined,
    }).filter(([, value]) => value !== undefined)
  );
}

// ── Persistencia del mock ──
// Antes todo vivía en memoria y se perdía al reiniciar: recetas,
// órdenes, resultados subidos y pacientes nuevos "desaparecían". Se
// guardan en .mock-data/ (fuera de git; solo datos sintéticos, R7).
// Bórrala para volver al estado inicial del mock.
const MOCK_DATA_DIR = url.fileURLToPath(new URL('./.mock-data/', import.meta.url));
const MOCK_FILES_DIR = path.join(MOCK_DATA_DIR, 'files');
const MOCK_STATE_FILE = path.join(MOCK_DATA_DIR, 'state.json');
const SEED_PATIENT_IDS = new Set(patients.map(p => p.id));

function saveMockFile(name, buffer) {
  fs.mkdirSync(MOCK_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(MOCK_FILES_DIR, path.basename(name)), buffer);
}

function readMockFile(name) {
  try {
    return fs.readFileSync(path.join(MOCK_FILES_DIR, path.basename(name)));
  } catch {
    return null;
  }
}

function saveMockState() {
  fs.mkdirSync(MOCK_DATA_DIR, { recursive: true });
  fs.writeFileSync(MOCK_STATE_FILE, JSON.stringify({
    patients: patients.filter(p => !SEED_PATIENT_IDS.has(p.id)),
    encounters,
    issuedPrescriptions,
    issuedLabOrders,
    labResults,
    doctor: doctorUser.doctor,
  }, null, 2));
}

function loadMockState() {
  if (!fs.existsSync(MOCK_STATE_FILE)) return;
  try {
    const state = JSON.parse(fs.readFileSync(MOCK_STATE_FILE, 'utf8'));
    for (const patient of state.patients ?? []) {
      if (patients.some(p => p.id === patient.id)) continue;
      patients.push(patient);
      allergies[patient.id] ??= [];
      medications[patient.id] ??= [];
      historyItems[patient.id] ??= [];
    }
    Object.assign(encounters, state.encounters ?? {});
    issuedPrescriptions.push(...(state.issuedPrescriptions ?? []));
    issuedLabOrders.push(...(state.issuedLabOrders ?? []));
    labResults.push(...(state.labResults ?? []));
    if (state.doctor) Object.assign(doctorUser.doctor, state.doctor);
  } catch (e) {
    console.warn(`No se pudo leer ${MOCK_STATE_FILE}, se arranca vacío: ${e.message}`);
  }
}

loadMockState();

// Catálogo de formatos clínicos compartido con el API y el frontend
// (packages/contracts/src/validators/medical-files.ts).
const medicalFiles = await import('./packages/contracts/src/validators/medical-files.ts');

// Un solo archivo en el campo "file" (apiUpload), como el
// FileInterceptor("file") del API.
async function readUploadedFile(req, rawBuffer) {
  const form = await new Response(rawBuffer, { headers: { 'content-type': req.headers['content-type'] || '' } }).formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return null;
  return { buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type || 'application/octet-stream', fileName: file.name || '' };
}

// Consultas firmadas EN el mock (no la semilla enc-prev-1), más
// reciente primero — de aquí salen el timeline, la hoja frontal y el
// historial de notas, para que una consulta recién cerrada aparezca.
function signedMockEncounters(patientId) {
  return Object.values(encounters)
    .filter(e => e.patientId === patientId && e.status === "SIGNED")
    .sort((a, b) => (b.signedAt || '').localeCompare(a.signedAt || ''));
}

// Misma forma que PatientClinicalService.notesTimeline.
function mockNotesTimeline(patientId, filters) {
  const q = (filters.q || '').trim().toLowerCase();
  const matches = (n) => !q || [n.chiefComplaint, n.currentIllness, n.assessment, n.plan].some(f => (f || '').toLowerCase().includes(q));
  return signedMockEncounters(patientId)
    .filter(e => !filters.type || e.encounterType === filters.type)
    .filter(e => !filters.from || e.signedAt >= `${filters.from}T00:00:00.000Z`)
    .filter(e => !filters.to || e.signedAt <= `${filters.to}T23:59:59.999Z`)
    .flatMap(e => (e.notes || [])
      .filter(n => !n.isCorrectionOfNoteId)
      .map(root => ({
        encounterId: e.id,
        encounterType: e.encounterType,
        signedAt: e.signedAt,
        doctor: { legalFirstName: doctorUser.doctor.legalFirstName, legalLastName: doctorUser.doctor.legalLastName, primarySpecialty: { nameEs: "Medicina General" } },
        note: { isCorrectionOfNoteId: null, cancellation: null, ...root },
        corrections: (e.notes || []).filter(n => n.isCorrectionOfNoteId === root.id)
      })))
    .filter(t => matches(t.note) || t.corrections.some(matches));
}

function createMockEncounter(patientId, encounterType, appointmentId) {
  const id = `enc-${Date.now()}`;
  encounters[id] = {
    id,
    patientId,
    appointmentId: appointmentId ?? null,
    encounterType,
    status: "DRAFT",
    startedAt: new Date().toISOString(),
    signedAt: null,
    draftContent: {},
    notes: [],
    diagnoses: []
  };
  saveMockState();
  return encounters[id];
}

// ── Asistente clínico ("El Segundo Lector") ──
// La llamada a Claude es LA MISMA que la del API real
// (claude-model-calls.ts: prompt, contrato, idioma, reintento). Lo único
// propio del mock es armar el contexto con sus datos en memoria — con
// la misma forma que ContextAssemblerService y, como allá, sin nombre,
// CURP, contacto ni folio del paciente. Sin ANTHROPIC_API_KEY en .env
// responde NOT_CONFIGURED, igual que el API real.
const assistantCalls = await import('./apps/api/src/modules/assistant/services/claude-model-calls.ts').catch((e) => {
  console.warn(`Asistente clínico no disponible en el mock: ${e.message}`);
  return null;
});
const vitalRanges = await import('./apps/api/src/common/vital-ranges.util.ts').catch(() => null);
const vitalsCalc = await import('./apps/api/src/common/vitals-calculations.util.ts').catch(() => null);

// Mismos valores por omisión que AssistantPassOrchestratorService.
const ASSISTANT_TIMEOUT_MS = 180_000;
const ASSISTANT_SUMMARY_TIMEOUT_MS = 30_000;
const ASSISTANT_MAX_TOKENS_PER_ENCOUNTER = 60_000;
const ASSISTANT_PASSES = ["SUBJETIVO", "OBJETIVO", "ANALISIS", "CIERRE"];

// encounterId -> lecturas, más reciente primero.
const assistantReadings = new Map();
const assistantLogger = {
  warn: (message) => console.warn(`[asistente] ${message}`),
  error: (message) => console.error(`[asistente] ${message}`),
};
let claudeClient;
function getClaudeClient() {
  // Perezoso: .env se carga más abajo en este archivo.
  if (claudeClient === undefined) claudeClient = assistantCalls?.createClaudeClient() ?? null;
  return claudeClient;
}

function withoutUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function mockVitalsBlock(rawVitals, ageYears) {
  const raw = rawVitals && typeof rawVitals === 'object' ? rawVitals : {};
  const num = (key) => (typeof raw[key] === 'number' ? raw[key] : undefined);
  const ranged = {
    bpSystolic: num('bpSystolic'),
    bpDiastolic: num('bpDiastolic'),
    heartRate: num('heartRate'),
    respiratoryRate: num('respiratoryRate'),
    tempC: num('tempC'),
    spo2: num('spo2'),
  };
  const anthropometry = vitalsCalc
    ? vitalsCalc.withBodySurfaceArea(vitalsCalc.withComputedVitals({ weightKg: num('weightKg'), heightCm: num('heightCm') }))
    : {};
  const flags = vitalRanges ? vitalRanges.evaluateVitalRanges(ageYears, ranged) : { outOfRange: [], critical: [] };
  return {
    ...withoutUndefined({
      presionSistolicaMmHg: ranged.bpSystolic,
      presionDiastolicaMmHg: ranged.bpDiastolic,
      frecuenciaCardiacaLpm: ranged.heartRate,
      frecuenciaRespiratoriaRpm: ranged.respiratoryRate,
      temperaturaC: ranged.tempC,
      spo2Porcentaje: ranged.spo2,
      glucosaCapilarMgDl: num('glucoseCapMgDl'),
      llenadoCapilarSegundos: num('capillaryRefillSeconds'),
      pesoKg: num('weightKg'),
      tallaCm: num('heightCm'),
      perimetroCefalicoCm: num('headCircumferenceCm'),
      perimetroAbdominalCm: num('abdominalCircumferenceCm'),
      imc: anthropometry.bmi,
      superficieCorporalM2: anthropometry.bsaM2,
    }),
    fueraDeRango: flags.outOfRange,
    criticos: flags.critical,
  };
}

function mockAssistantContext(encounterId) {
  const encounter = encounters[encounterId] || encounters["enc-1"];
  const patient = patients.find(p => p.id === encounter.patientId) || patients[0];
  const draft = encounter.draftContent || {};
  const ageYears = ageFromBirthDate(patient.birthDate);
  const text = (key) => (typeof draft[key] === 'string' && draft[key].trim() ? draft[key] : undefined);
  const draftDiagnoses = Array.isArray(draft.diagnoses) && draft.diagnoses.length > 0 ? draft.diagnoses : encounter.diagnoses || [];
  return {
    paciente: {
      edadAnios: ageYears,
      sexo: patient.sexAtBirth,
      embarazo: null,
      tipoSangre: patient.bloodType ?? null,
      residencia: patient.addressMunicipality || patient.addressState
        ? { municipio: patient.addressMunicipality ?? null, estado: patient.addressState ?? null }
        : null,
    },
    seguridad: (allergies[patient.id] || []).filter(a => a.status === 'ACTIVE').map(a => ({ sustancia: a.substance, reaccion: a.reaction ?? null, gravedad: a.severity })),
    problemas: mockActiveDiagnoses(patient.id).map(d => ({ codigoIcd10: d.icd10Code, descripcion: d.description, fecha: d.lastRecordedAt })),
    medicacion: (medications[patient.id] || []).filter(m => m.status === 'ACTIVE').map(m => ({ nombreGenerico: m.genericName, dosis: m.dose, via: m.route, frecuencia: m.frequency })),
    antecedentes: (historyItems[patient.id] || []).map(h => ({
      categoria: h.category,
      subtipo: h.subcategory,
      estado: h.isNegated ? "NEGADO" : "PRESENTE",
      parentesco: h.familyMember ?? null,
      comentario: h.description ?? null,
    })),
    toxicomanias: [],
    ginecoObstetricos: null,
    laboratorio: [],
    signosVitalesPrevios: [],
    trayectoria: [],
    actual: withoutUndefined({
      motivoConsulta: text('chiefComplaint'),
      padecimientoActual: text('currentIllness'),
      exploracionFisica: text('physicalExam'),
      valoracion: text('assessment'),
      plan: text('plan'),
      pronostico: text('prognosis'),
      indicacionesPaciente: text('patientInstructions'),
      proximaCitaDias: typeof draft.suggestedFollowUpDays === 'number' ? draft.suggestedFollowUpDays : undefined,
    }),
    signosVitales: mockVitalsBlock(draft.vitals, ageYears),
    // El mock guarda specialtyData tal como llega del cliente: número
    // crudo por escala (el API real lo envuelve en {value, interpretation}).
    escalas: Object.entries(draft.specialtyData || {}).flatMap(([escala, entry]) => {
      const valor = typeof entry === 'number' ? entry : entry?.value;
      return typeof valor === 'number' ? [{ escala, valor, interpretacion: entry?.interpretation ?? null }] : [];
    }),
    sintomasAlarmaMarcados: [],
    diagnosticosConsulta: draftDiagnoses
      .filter(d => typeof d.description === 'string')
      .map(d => ({ codigoIcd10: d.icd10Code ?? null, descripcion: d.description, tipo: d.diagnosisType ?? "", certeza: d.certainty ?? "" })),
    banderasRojasDetectadas: [],
    documentosConsulta: {
      recetas: issuedPrescriptions
        .filter(p => p.encounterId === encounter.id && p.status !== 'CANCELLED')
        .flatMap(p => p.items.map(i => ({ medicamento: i.genericName, dosis: i.dose, via: i.route, frecuencia: i.frequency, duracion: i.duration }))),
      ordenesEstudio: issuedLabOrders
        .filter(o => o.encounterId === encounter.id && o.status !== 'CANCELLED')
        .flatMap(o => o.items.map(i => ({ estudio: i.studyName, indicacion: o.clinicalIndication }))),
    },
    encuadre: {
      especialidad: specialties.find(s => s.id === doctorUser.doctor.primarySpecialtyId)?.nameEs ?? null,
      tipoConsulta: encounter.encounterType,
    },
  };
}

// ── Atlas Anatómico 3D (port mínimo de AtlasHttpAdapter) ──
// .env de este repo, si existe: ahí van ATLAS_API_URL, ATLAS_VIEWER_URL,
// ATLAS_CLIENT_ID y ATLAS_CLIENT_SECRET (ver .env.example).
const envFile = new URL('./.env', import.meta.url);
if (fs.existsSync(envFile)) process.loadEnvFile(url.fileURLToPath(envFile));

const atlasSessionOwners = new Map();
let atlasToken = null;

function atlasConfigured() {
  return Boolean(process.env.ATLAS_API_URL && process.env.ATLAS_VIEWER_URL && process.env.ATLAS_CLIENT_ID && process.env.ATLAS_CLIENT_SECRET);
}

// El atlas exige identificadores opacos de 8+ caracteres; los del mock
// ("pat-1", "doc-1") son más cortos. El backend real manda UUIDs tal cual.
const atlasOpaqueId = (id) => `medicfy-mock-${id}`;

async function atlasCall(path, body) {
  const base = process.env.ATLAS_API_URL.replace(/\/+$/, '');
  if (!atlasToken || atlasToken.expiresAt - 30_000 < Date.now()) {
    const r = await fetch(`${base}/api/v1/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: process.env.ATLAS_CLIENT_ID, client_secret: process.env.ATLAS_CLIENT_SECRET }),
    });
    if (!r.ok) throw new Error(`atlas token ${r.status}`);
    const t = await r.json();
    atlasToken = { value: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  }
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${atlasToken.value}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error(`atlas ${path} ${r.status}`);
  return r.json();
}

async function openAtlasSession(patientId, user) {
  if (!atlasConfigured()) return { kind: 'unavailable', reason: 'NOT_CONFIGURED' };
  try {
    const link = await atlasCall('/api/v1/patient-links', { externalSystem: 'medicfy', externalPatientId: atlasOpaqueId(patientId) });
    const s = await atlasCall('/api/v1/viewer-sessions', {
      patientId: link.id,
      practitionerRef: atlasOpaqueId(user.doctor?.id ?? user.id),
      mode: 'clinician',
      permissions: ['findings:read', 'annotations:read', 'annotations:write'],
      origin: new URL(process.env.WEB_ORIGIN || 'http://localhost:3000').origin,
    });
    atlasSessionOwners.set(s.id, { patientId, userId: user.id });
    return { kind: 'ok', session: { id: s.id, launchCode: s.launchCode, launchCodeExpiresAt: s.launchCodeExpiresAt, expiresAt: s.expiresAt, mode: s.mode, viewerUrl: process.env.ATLAS_VIEWER_URL } };
  } catch (e) {
    console.warn(`atlas.create falló: ${e.message}`);
    return { kind: 'unavailable', reason: 'ATLAS_ERROR' };
  }
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS Headers
  const origin = req.headers.origin || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Read JSON body
  let body = {};
  // Crudo también: las subidas de archivo llegan como multipart/form-data,
  // no como JSON (ver readUploadedFile).
  let rawBuffer = Buffer.alloc(0);
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    rawBuffer = Buffer.concat(buffers);
    const rawBody = rawBuffer.toString();
    try {
      if (rawBody) body = JSON.parse(rawBody);
    } catch (e) {}
  }

  const sendJson = (data, statusCode = 200) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const sendError = (code, message, statusCode = 400) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code, message } }));
  };

  const sendFile = (buffer, contentType) => {
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': buffer.length });
    res.end(buffer);
  };

  const sendPdf = (documentId, notFoundCode, notFoundMessage) => {
    const pdf = readMockFile(`${documentId}.pdf`);
    if (!pdf) return sendError(notFoundCode, notFoundMessage, 404);
    return sendFile(pdf, 'application/pdf');
  };

  console.log(`[${method}] ${pathname}`);

  // Routes
  if (pathname === '/health') {
    return sendJson({ status: "ok" });
  }

  if (pathname === '/auth/login' && method === 'POST') {
    // El mock nunca valida la contraseña (nunca lo hizo) — solo usa el
    // email para decidir CON QUÉ CUENTA entras, si la reconoce.
    // Cualquier email desconocido cae al doctor de siempre, para no
    // romper flujos existentes que escriben cualquier cosa.
    const email = String(body.email || '').trim().toLowerCase();
    const user = allUsers().find(u => u.email.toLowerCase() === email) || doctorUser;
    res.setHeader('Set-Cookie', `refresh_token=${user.id}; HttpOnly; Path=/; SameSite=Lax`);
    return sendJson({ accessToken: makeMockToken(user) });
  }

  if (pathname === '/auth/refresh' && method === 'POST') {
    const user = allUsers().find(u => u.id === getCookie(req, 'refresh_token')) || doctorUser;
    res.setHeader('Set-Cookie', `refresh_token=${user.id}; HttpOnly; Path=/; SameSite=Lax`);
    return sendJson({ accessToken: makeMockToken(user) });
  }

  if (pathname === '/auth/logout' && method === 'POST') {
    res.setHeader('Set-Cookie', 'refresh_token=; HttpOnly; Path=/; Max-Age=0');
    return sendJson({ loggedOut: true });
  }

  if (pathname === '/me' && method === 'GET') {
    return sendJson(getCurrentUser(req));
  }

  if (pathname === '/doctors/me' && method === 'GET') {
    const user = getCurrentUser(req);
    return sendJson(user.doctor || doctorUser.doctor);
  }

  // Perfil: datos del médico y del membrete (frase, teléfono, correo).
  // Antes caía en el fallback y no se guardaba nada.
  if (pathname === '/doctors/me' && method === 'PATCH') {
    const doctor = getCurrentUser(req).doctor || doctorUser.doctor;
    Object.assign(doctor, body);
    saveMockState();
    return sendJson(doctor);
  }

  // Perfil → Marca: logo y firma visual. Los usan la receta y la orden
  // (membrete y firma). Misma forma que BrandingAssetsController.
  if (pathname === '/doctors/me/branding-assets' && method === 'POST') {
    const kind = parsedUrl.query.kind;
    if (kind !== 'logo' && kind !== 'signature') return sendError('VALIDATION_ERROR', 'kind inválido.', 400);
    const file = await readUploadedFile(req, rawBuffer).catch(() => null);
    if (!file || !['image/png', 'image/jpeg'].includes(file.contentType)) {
      return sendError('VALIDATION_ERROR', 'Sube una imagen PNG o JPG.', 400);
    }
    const fileKey = `branding-${kind}`;
    saveMockFile(fileKey, file.buffer);
    const doctor = getCurrentUser(req).doctor || doctorUser.doctor;
    doctor[kind === 'logo' ? 'logoUrl' : 'signatureImageUrl'] = fileKey;
    doctor[kind === 'logo' ? 'logoContentType' : 'signatureContentType'] = file.contentType;
    saveMockState();
    return sendJson(doctor, 201);
  }
  const brandingAsset = pathname.match(/^\/doctors\/me\/branding-assets\/(logo|signature)$/);
  if (brandingAsset && method === 'GET') {
    const doctor = getCurrentUser(req).doctor || doctorUser.doctor;
    const fileKey = brandingAsset[1] === 'logo' ? doctor.logoUrl : doctor.signatureImageUrl;
    const file = fileKey ? readMockFile(fileKey) : null;
    if (!file) return sendError('NOT_FOUND', 'Archivo no encontrado.', 404);
    return sendFile(file, (brandingAsset[1] === 'logo' ? doctor.logoContentType : doctor.signatureContentType) || 'image/png');
  }

  if (pathname === '/doctors/me/documents' && method === 'GET') {
    return sendJson([]);
  }

  if (pathname === '/doctors/me/assistants' && method === 'GET') {
    return sendJson({ pending: [], accepted: [] });
  }

  // M12 (notificaciones): único endpoint real de la especificación,
  // GET/PATCH /notification-preferences. M12-RN-003: no hay booleano
  // de "activado", solo elección de canal — el recordatorio
  // transaccional no se puede apagar del todo.
  if (pathname === '/notification-preferences' && method === 'GET') {
    const user = getCurrentUser(req);
    return sendJson({ channel: user.notificationChannelPreference || 'EMAIL' });
  }

  if (pathname === '/notification-preferences' && method === 'PATCH') {
    const user = getCurrentUser(req);
    if (body && (body.channel === 'EMAIL' || body.channel === 'WHATSAPP')) {
      user.notificationChannelPreference = body.channel;
    }
    return sendJson({ channel: user.notificationChannelPreference || 'EMAIL' });
  }

  // Consultorios/servicios/horario "de siempre" solo le pertenecen al
  // doctor semilla (Jorge) — un médico recién registrado todavía no
  // configuró nada de esto, así que ve listas vacías reales en vez de
  // heredar por accidente los datos de otra cuenta.
  if (pathname === '/doctors/me/locations' && method === 'GET') {
    const isSeedDoctor = getCurrentUser(req).id === doctorUser.id;
    return sendJson(
      isSeedDoctor
        ? [{ id: "loc-1", doctorId: "doc-1", name: "Consultorio Principal", address: "Av. Américas 1254, Guadalajara, Jal.", phone: "+523312345678", isPrimary: true, isActive: true }]
        : []
    );
  }

  if (pathname === '/doctors/me/services' && method === 'GET') {
    const isSeedDoctor = getCurrentUser(req).id === doctorUser.id;
    return sendJson(
      isSeedDoctor
        ? [
            { id: "srv-1", doctorId: "doc-1", name: "Consulta General", durationMinutes: 30, priceCents: 80000, isActive: true },
            { id: "srv-2", doctorId: "doc-1", name: "Consulta de Seguimiento", durationMinutes: 20, priceCents: 60000, isActive: true },
            { id: "srv-3", doctorId: "doc-1", name: "Primera Vez", durationMinutes: 45, priceCents: 100000, isActive: true }
          ]
        : []
    );
  }

  if (pathname === '/doctors/me/availability-rules' && method === 'GET') {
    const isSeedDoctor = getCurrentUser(req).id === doctorUser.id;
    return sendJson(
      isSeedDoctor
        ? [
            { id: "rule-1", doctorId: "doc-1", dayOfWeek: 1, startMinute: 540, endMinute: 1140, modality: "IN_PERSON", slotDurationMinutes: 30, isActive: true },
            { id: "rule-2", doctorId: "doc-1", dayOfWeek: 2, startMinute: 540, endMinute: 1140, modality: "IN_PERSON", slotDurationMinutes: 30, isActive: true },
            { id: "rule-3", doctorId: "doc-1", dayOfWeek: 3, startMinute: 540, endMinute: 1140, modality: "IN_PERSON", slotDurationMinutes: 30, isActive: true },
            { id: "rule-4", doctorId: "doc-1", dayOfWeek: 4, startMinute: 540, endMinute: 1140, modality: "IN_PERSON", slotDurationMinutes: 30, isActive: true },
            { id: "rule-5", doctorId: "doc-1", dayOfWeek: 5, startMinute: 540, endMinute: 1140, modality: "IN_PERSON", slotDurationMinutes: 30, isActive: true }
          ]
        : []
    );
  }

  if (pathname === '/doctors/me/availability-exceptions' && method === 'GET') {
    return sendJson([]);
  }

  if (pathname === '/doctors/me/patient-access-log' && method === 'GET') {
    return sendJson([]);
  }

  if (pathname === '/doctors/me/posts' && method === 'GET') {
    return sendJson([]);
  }

  if (pathname === '/appointments' && method === 'GET') {
    return sendJson(appointments);
  }

  if (pathname === '/appointments' && method === 'POST') {
    const newApt = {
      id: `apt-${Date.now()}`,
      patientId: body.patientId,
      doctorId: "doc-1",
      startsAt: body.startsAt,
      endsAt: body.endsAt || new Date(new Date(body.startsAt).getTime() + 30 * 60000).toISOString(),
      status: "CONFIRMED",
      completedWithoutNoteReason: null,
      patient: patients.find(p => p.id === body.patientId) || patients[0],
      service: { id: body.serviceId || "srv-1", name: "Consulta General", durationMinutes: 30 },
      encounter: null
    };
    appointments.push(newApt);
    return sendJson(newApt, 201);
  }

  if (pathname.startsWith('/appointments/') && method === 'GET') {
    const id = pathname.split('/')[2];
    const apt = appointments.find(a => a.id === id);
    if (apt) return sendJson(apt);
    return sendJson(appointments[0]);
  }

  if (pathname.match(/^\/appointments\/[^\/]+\/(start|confirm|complete|cancel)$/) && method === 'POST') {
    const parts = pathname.split('/');
    const id = parts[2];
    const action = parts[3];
    const apt = appointments.find(a => a.id === id);
    if (apt) {
      if (action === 'start') {
        apt.status = 'IN_PROGRESS';
        if (!apt.encounter) {
          const created = createMockEncounter(apt.patientId, "FOLLOW_UP", apt.id);
          apt.encounter = { id: created.id, status: "DRAFT", encounterType: "FOLLOW_UP" };
        }
      } else if (action === 'confirm') apt.status = 'CONFIRMED';
      else if (action === 'complete') apt.status = 'COMPLETED';
      else if (action === 'cancel') apt.status = 'CANCELLED';
      return sendJson(apt);
    }
    return sendJson({ ok: true });
  }

  if (pathname === '/patients' && method === 'GET') {
    const q = (parsedUrl.query.query || '').toLowerCase();
    if (q) {
      return sendJson(patients.filter(p => `${p.firstName} ${p.lastNamePaternal} ${p.lastNameMaternal || ''} ${p.medicfyId}`.toLowerCase().includes(q)));
    }
    return sendJson(patients);
  }

  if (pathname === '/patients' && method === 'POST') {
    const newPat = {
      id: `pat-${Date.now()}`,
      medicfyId: `MED-000${patients.length + 1}`,
      firstName: body.firstName,
      lastNamePaternal: body.lastNamePaternal,
      lastNameMaternal: body.lastNameMaternal || null,
      birthDate: body.birthDate,
      sexAtBirth: body.sexAtBirth,
      bloodType: body.bloodType || null,
      phoneE164: body.phoneE164 || "+523300000000",
      email: body.email || "",
      emergencyContactName: body.emergencyContactName || null,
      emergencyContactPhone: body.emergencyContactPhone || null,
      emergencyContactRelation: body.emergencyContactRelation || null,
      guardians: []
    };
    patients.push(newPat);
    allergies[newPat.id] = [];
    medications[newPat.id] = [];
    historyItems[newPat.id] = [];
    saveMockState();
    return sendJson(newPat, 201);
  }

  if (pathname === '/patients/me/doctors' && method === 'GET') {
    return sendJson([]);
  }

  if (pathname.startsWith('/patients/') && method === 'GET') {
    const id = pathname.split('/')[2];
    const pat = patients.find(p => p.id === id);
    if (pat) return sendJson(pat);
    return sendJson(patients[0]);
  }

  // Clinical records
  if (pathname.match(/^\/records\/patients\/[^\/]+\/allergies$/)) {
    const patId = pathname.split('/')[3];
    return sendJson(allergies[patId] || []);
  }

  if (pathname.match(/^\/records\/patients\/[^\/]+\/medications$/)) {
    const patId = pathname.split('/')[3];
    return sendJson(medications[patId] || []);
  }

  if (pathname.match(/^\/records\/patients\/[^\/]+\/history$/)) {
    const patId = pathname.split('/')[3];
    return sendJson(historyItems[patId] || []);
  }

  // Forma { encounters, prescriptions, labOrders, standaloneResults }
  // — NO un arreglo plano. use-patient-clinical.ts la tipa como
  // PatientTimeline y todo lo que la consume lee timeline?.encounters
  // etc.; con un arreglo plano esos campos siempre salían undefined
  // (con "?? []" no truena, pero "Últimas consultas" y "Recetas"
  // quedaban siempre vacíos aunque sí hubiera datos).
  if (pathname.match(/^\/records\/patients\/[^\/]+\/timeline$/)) {
    const patId = pathname.split('/')[3];
    // Lo emitido en esta sesión del mock, más reciente primero.
    const issuedRx = issuedPrescriptions
      .filter(p => p.patientId === patId)
      .map(p => ({
        type: "prescription",
        id: p.id,
        folio: p.folio,
        prescriptionType: "ELECTRONIC",
        signatureRoute: p.signatureRoute,
        issuedAt: p.issuedAt,
        diagnosisSnapshot: p.diagnosisSnapshot,
        qrVerificationToken: p.qrVerificationToken,
        status: p.status,
        items: p.items.map(i => ({ genericName: i.genericName, brandName: i.brandName, presentation: i.presentation, dose: i.dose, route: i.route, frequency: i.frequency, duration: i.duration, controlGroup: i.controlGroup }))
      }))
      .reverse();
    const issuedLabs = issuedLabOrders
      .filter(o => o.patientId === patId)
      .map(o => ({
        type: "lab_order",
        id: o.id,
        folio: o.folio,
        issuedAt: o.issuedAt,
        clinicalIndication: o.clinicalIndication,
        fastingRequired: o.fastingRequired,
        qrVerificationToken: o.qrVerificationToken,
        status: o.status,
        items: o.items
      }))
      .reverse();
    const standaloneResults = labResults
      .filter(r => r.patientId === patId && !r.labOrderId)
      .map(r => ({ type: "standalone_result", id: r.id, labName: r.labName, resultDate: r.resultDate, uploadedAt: r.uploadedAt, uploadedByRole: r.uploadedByRole, status: r.reviewedAt ? "REVIEWED" : "PENDING_REVIEW" }))
      .reverse();
    const sessionEncounters = Object.values(encounters)
      .filter(e => e.patientId === patId)
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
      .map(e => ({ type: "encounter", id: e.id, encounterType: e.encounterType, status: e.status, startedAt: e.startedAt, signedAt: e.signedAt, doctorId: "doc-1" }));
    if (patId !== 'pat-1') return sendJson({ encounters: sessionEncounters, prescriptions: issuedRx, labOrders: issuedLabs, standaloneResults });
    return sendJson({
      encounters: [
        ...sessionEncounters,
        {
          type: "encounter",
          id: "enc-prev-1",
          encounterType: "FIRST_VISIT",
          status: "SIGNED",
          startedAt: "2026-07-15T10:00:00.000Z",
          signedAt: "2026-07-15T10:25:00.000Z",
          doctorId: "doc-1"
        }
      ],
      prescriptions: [
        ...issuedRx,
        {
          type: "prescription",
          id: "rx-1",
          folio: "RX-0001",
          prescriptionType: "ELECTRONIC",
          signatureRoute: "ELECTRONIC",
          issuedAt: "2026-07-15T10:25:00.000Z",
          diagnosisSnapshot: "Faringitis aguda, no especificada (J02.9)",
          qrVerificationToken: "mock-qr-rx-1",
          status: "ISSUED",
          items: [
            { genericName: "Amoxicilina", brandName: "Amoxil", presentation: "Cápsula 500 mg", dose: "500 mg", route: "Oral", frequency: "Cada 8 horas", duration: "7 días", controlGroup: "VI" }
          ]
        }
      ],
      labOrders: issuedLabs,
      standaloneResults
    });
  }

  if (pathname.match(/^\/records\/patients\/[^\/]+\/active-diagnoses$/)) {
    return sendJson(mockActiveDiagnoses(pathname.split('/')[3]));
  }

  // Hoja frontal del panel de consulta (Fase 5 · Prompt 39A). Misma
  // forma que PatientClinicalService.hojaFrontal; sin esta ruta caía en
  // el fallback { ok: true } y hoja-frontal.tsx tronaba en
  // medications.filter.
  if (pathname.match(/^\/records\/patients\/[^\/]+\/hoja-frontal$/) && method === 'GET') {
    const patId = pathname.split('/')[3];
    const pat = patients.find(p => p.id === patId);
    if (!pat) return sendError('NOT_FOUND', 'Paciente no encontrado.', 404);
    const nextAppointment = appointments
      .filter(a => a.patientId === patId && ['SCHEDULED', 'CONFIRMED'].includes(a.status) && new Date(a.startsAt) >= new Date())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    return sendJson({
      patient: {
        id: pat.id,
        medicfyId: pat.medicfyId,
        firstName: pat.firstName,
        lastNamePaternal: pat.lastNamePaternal,
        lastNameMaternal: pat.lastNameMaternal ?? null,
        birthDate: pat.birthDate,
        sexAtBirth: pat.sexAtBirth,
        phoneE164: pat.phoneE164,
        email: pat.email,
        addressStreet: pat.addressStreet ?? null,
        addressExt: pat.addressExt ?? null,
        addressInt: pat.addressInt ?? null,
        addressColonia: pat.addressColonia ?? null,
        addressMunicipality: pat.addressMunicipality ?? null,
        addressState: pat.addressState ?? null,
        addressPostalCode: pat.addressPostalCode ?? null
      },
      allergies: allergies[patId] || [],
      medications: medications[patId] || [],
      activeDiagnoses: mockActiveDiagnoses(patId),
      surgeries: [],
      lastEncounter: signedMockEncounters(patId)[0]
        ? {
            id: signedMockEncounters(patId)[0].id,
            encounterType: signedMockEncounters(patId)[0].encounterType,
            signedAt: signedMockEncounters(patId)[0].signedAt,
            doctor: { legalFirstName: doctorUser.doctor.legalFirstName, legalLastName: doctorUser.doctor.legalLastName, primarySpecialty: { nameEs: "Medicina General" } }
          }
        : patId === 'pat-1'
        ? {
            id: "enc-prev-1",
            encounterType: "FIRST_VISIT",
            signedAt: "2026-07-15T10:25:00.000Z",
            doctor: { legalFirstName: doctorUser.doctor.legalFirstName, legalLastName: doctorUser.doctor.legalLastName, primarySpecialty: { nameEs: "Medicina General" } }
          }
        : null,
      nextAppointment: nextAppointment
        ? { id: nextAppointment.id, startsAt: nextAppointment.startsAt, status: nextAppointment.status, service: { name: nextAppointment.service?.name ?? "" } }
        : null
    });
  }

  // ── Catálogos de estudios de la orden de laboratorio ──
  const catalogMatch = pathname.match(/^\/catalogs\/([^\/]+)$/);
  if (catalogMatch && method === 'GET' && labCatalogs[catalogMatch[1]]) {
    return sendJson(labCatalogs[catalogMatch[1]]);
  }

  // ── Recetas (M9) — misma forma de respuesta que PrescriptionsController ──
  const rxCreate = pathname.match(/^\/prescriptions\/encounters\/([^\/]+)$/);
  if (rxCreate && method === 'POST') {
    const requested = Array.isArray(body.items) ? body.items : [];
    if (!body.diagnosisSnapshot || requested.length === 0) {
      return sendError('VALIDATION_ERROR', 'La receta necesita el diagnóstico y al menos un medicamento.', 400);
    }
    if (body.signatureRoute === 'ELECTRONIC' && !body.password) {
      return sendError('SIGNATURE_MFA_REQUIRED', 'Confirma tu contraseña para firmar.', 428);
    }
    const items = requested.map(item => {
      const med = sampleMedications.find(m => m.id === item.medicationCatalogId);
      if (!med) return null;
      return {
        medicationCatalogId: med.id,
        genericName: med.genericName,
        brandName: med.brandNames[0] ?? null,
        presentation: med.presentations[0]?.label ?? "N/A",
        dose: [item.dose, item.doseUnit].filter(Boolean).join(" "),
        route: item.route,
        frequency: item.frequency,
        duration: item.duration,
        quantity: item.quantity ?? null,
        specialInstructions: item.specialInstructions ?? null,
        indication: item.indication ?? null,
        controlGroup: med.controlGroup
      };
    });
    if (items.some(item => item === null)) {
      return sendError('PRESCRIPTION_MISSING_LEGAL_FIELD', 'Uno o más medicamentos no existen en el catálogo.', 422);
    }
    const issuedAt = new Date();
    const snapshot = mockLegalSnapshot(rxCreate[1]);
    const prescription = {
      id: randomUUID(),
      folio: nextMockFolio("RX", issuedPrescriptions),
      signatureRoute: body.signatureRoute,
      qrVerificationToken: randomUUID(),
      issuedAt: issuedAt.toISOString(),
      diagnosisSnapshot: body.diagnosisSnapshot,
      status: body.signatureRoute === 'HANDWRITTEN_AFTER_PRINT' ? 'PENDING_HANDWRITTEN_SIGNATURE' : 'ISSUED',
      items,
      ...snapshot
    };
    issuedPrescriptions.push(prescription);
    saveMockState();
    await storeMockPdf(prescription.id, pdfLayout?.renderPrescriptionPdf, {
      ...snapshot,
      folio: prescription.folio,
      issuedAt,
      signatureRoute: prescription.signatureRoute,
      signatureTimestamp: prescription.signatureRoute === 'ELECTRONIC' ? issuedAt : null,
      diagnosisSnapshot: prescription.diagnosisSnapshot,
      qrVerificationToken: prescription.qrVerificationToken,
      items: items.map(i => ({
        genericName: i.genericName,
        presentation: i.presentation,
        dose: i.dose,
        route: i.route,
        frequency: i.frequency,
        duration: i.duration,
        ...(i.brandName ? { brandName: i.brandName } : {}),
        ...(i.quantity ? { quantity: i.quantity } : {}),
        ...(i.specialInstructions ? { specialInstructions: i.specialInstructions } : {})
      })),
      ...(body.generalInstructions ? { generalInstructions: body.generalInstructions } : {})
    });
    return sendJson({
      prescription: { id: prescription.id, folio: prescription.folio, qrVerificationToken: prescription.qrVerificationToken, signatureRoute: prescription.signatureRoute },
      warnings: { therapeuticDuplicates: [], therapeuticClassDuplicates: [] },
      interactionWarnings: []
    }, 201);
  }

  const rxLast = pathname.match(/^\/prescriptions\/patients\/([^\/]+)\/last$/);
  if (rxLast && method === 'GET') {
    const last = issuedPrescriptions.filter(p => p.patientId === rxLast[1] && p.status !== 'CANCELLED').at(-1);
    if (!last) return sendJson({ prescription: null, lines: [] });
    return sendJson({
      prescription: { id: last.id, folio: last.folio, issuedAt: last.issuedAt },
      lines: last.items.map(i => ({
        medicationCatalogId: i.medicationCatalogId,
        genericName: i.genericName,
        presentation: i.presentation,
        dose: i.dose,
        doseUnit: null,
        indication: i.indication,
        route: i.route,
        frequency: i.frequency,
        duration: i.duration,
        quantity: i.quantity,
        specialInstructions: i.specialInstructions,
        origin: "HEREDADA",
        sourcePrescriptionId: last.id,
        sourceIssuedAt: last.issuedAt
      }))
    });
  }

  const rxAction = pathname.match(/^\/prescriptions\/([^\/]+)\/(pdf|cancel|confirm-handwritten-delivery)$/);
  if (rxAction) {
    const prescription = issuedPrescriptions.find(p => p.id === rxAction[1]);
    if (rxAction[2] === 'pdf' && method === 'GET') {
      return sendPdf(rxAction[1], 'PRESCRIPTION_PDF_NOT_FOUND', 'No hay un PDF disponible para esta receta.');
    }
    if (prescription && rxAction[2] === 'cancel' && method === 'POST') {
      prescription.status = 'CANCELLED';
      saveMockState();
      return sendJson({ prescriptionId: prescription.id, reason: body.reason, cancelledAt: new Date().toISOString() });
    }
    if (prescription && rxAction[2] === 'confirm-handwritten-delivery' && method === 'POST') {
      prescription.status = 'ISSUED';
      saveMockState();
      return sendJson({ prescriptionId: prescription.id, confirmedAt: new Date().toISOString() });
    }
  }

  // ── Órdenes de estudios (M10) — misma forma que LabOrdersController ──
  const labCreate = pathname.match(/^\/lab-orders\/encounters\/([^\/]+)$/);
  if (labCreate && method === 'POST') {
    const requested = Array.isArray(body.items) ? body.items : [];
    if (!body.clinicalIndication || requested.length === 0) {
      return sendError('VALIDATION_ERROR', 'La orden necesita la indicación clínica y al menos un estudio.', 400);
    }
    if (body.signatureRoute === 'ELECTRONIC' && !body.password) {
      return sendError('SIGNATURE_MFA_REQUIRED', 'Confirma tu contraseña para firmar.', 428);
    }
    // Del catálogo (studyKey) o escrito por el médico (customStudyName),
    // como labOrderItemCreateSchema; el motivo siempre de catálogo.
    const items = requested.map(item => {
      const motive = labCatalogs.MOTIVO_ESTUDIO.find(m => m.key === item.motiveKey);
      const custom = typeof item.customStudyName === 'string' ? item.customStudyName.trim() : '';
      const study = labCatalogs.ESTUDIO_LABORATORIO.find(s => s.key === item.studyKey);
      const studyName = custom.length >= 3 && !item.studyKey ? custom : study?.preferredTerm;
      return studyName && motive ? { studyName, loincCode: null, notes: item.notes ?? null } : null;
    });
    if (items.some(item => item === null)) {
      return sendError('LAB_ORDER_STUDY_NOT_IN_CATALOG', 'Uno o más estudios o motivos no existen en el catálogo.', 422);
    }
    const issuedAt = new Date();
    const snapshot = mockLegalSnapshot(labCreate[1]);
    const labOrder = {
      id: randomUUID(),
      folio: nextMockFolio("LAB", issuedLabOrders),
      signatureRoute: body.signatureRoute,
      qrVerificationToken: randomUUID(),
      issuedAt: issuedAt.toISOString(),
      clinicalIndication: body.clinicalIndication,
      fastingRequired: body.fastingRequired === true,
      status: 'ISSUED',
      items,
      ...snapshot
    };
    issuedLabOrders.push(labOrder);
    saveMockState();
    await storeMockPdf(labOrder.id, pdfLayout?.renderLabOrderPdf, {
      ...snapshot,
      folio: labOrder.folio,
      issuedAt,
      signatureRoute: labOrder.signatureRoute,
      signatureTimestamp: labOrder.signatureRoute === 'ELECTRONIC' ? issuedAt : null,
      clinicalIndication: labOrder.clinicalIndication,
      fastingRequired: labOrder.fastingRequired,
      qrVerificationToken: labOrder.qrVerificationToken,
      items: items.map(i => ({ studyName: i.studyName, ...(i.notes ? { notes: i.notes } : {}) }))
    });
    return sendJson({
      id: labOrder.id,
      folio: labOrder.folio,
      qrVerificationToken: labOrder.qrVerificationToken,
      signatureRoute: labOrder.signatureRoute,
      signatureMethod: labOrder.signatureRoute === 'ELECTRONIC' ? 'INTERNAL_SYSTEM' : null,
      signedAt: labOrder.signatureRoute === 'ELECTRONIC' ? labOrder.issuedAt : null
    }, 201);
  }

  const labAction = pathname.match(/^\/lab-orders\/([^\/]+)\/(pdf|cancel)$/);
  if (labAction) {
    const labOrder = issuedLabOrders.find(o => o.id === labAction[1]);
    if (labAction[2] === 'pdf' && method === 'GET') {
      return sendPdf(labAction[1], 'LAB_ORDER_PDF_NOT_FOUND', 'No hay un PDF disponible para esta orden.');
    }
    if (labOrder && labAction[2] === 'cancel' && method === 'POST') {
      labOrder.status = 'CANCELLED';
      saveMockState();
      return sendJson({ labOrderId: labOrder.id, reason: body.reason, cancelledAt: new Date().toISOString() });
    }
  }

  // ── Resultados de laboratorio (archivo PDF/JPG/PNG) — misma forma que
  // LabResultsController. Antes el mock descartaba el archivo subido.
  const labResultsList = pathname.match(/^\/lab-results\/patients\/([^\/]+)$/);
  if (labResultsList && method === 'GET') {
    return sendJson(
      labResults
        .filter(r => r.patientId === labResultsList[1])
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .map(({ patientId: _p, contentType: _c, ...result }) => result)
    );
  }
  if (labResultsList && method === 'POST') {
    const file = await readUploadedFile(req, rawBuffer).catch(() => null);
    if (!file) return sendError('FILE_REQUIRED', 'Debes adjuntar un archivo.', 400);
    if (file.buffer.length > medicalFiles.MEDICAL_FILE_MAX_BYTES) {
      return sendError('FILE_TOO_LARGE', 'El archivo pesa más de 50 MB.', 413);
    }
    const format = medicalFiles.resolveMedicalFileFormat(file.fileName, file.contentType);
    if (!format) {
      return sendError('LAB_RESULT_FILE_TYPE_NOT_ALLOWED', 'Formato no permitido. Se aceptan PDF, imágenes (JPG, PNG, HEIC, TIFF…), DICOM, Word, Excel, texto, HL7 y video.', 400);
    }
    const labOrderId = typeof parsedUrl.query.labOrderId === 'string' ? parsedUrl.query.labOrderId : null;
    const result = {
      id: randomUUID(),
      patientId: labResultsList[1],
      labOrderId,
      labName: null,
      resultDate: null,
      uploadedAt: new Date().toISOString(),
      uploadedByRole: "DOCTOR",
      reviewedAt: null,
      doctorComment: null,
      originalFileName: file.fileName.slice(0, 200) || null,
      contentType: format.mimeTypes[0]
    };
    saveMockFile(`result-${result.id}`, file.buffer);
    labResults.push(result);
    const order = issuedLabOrders.find(o => o.id === labOrderId);
    if (order && order.status === 'ISSUED') order.status = 'RESULTS_UPLOADED';
    saveMockState();
    const { patientId: _p, contentType: _c, ...response } = result;
    return sendJson(response, 201);
  }
  const labResultAction = pathname.match(/^\/lab-results\/patients\/([^\/]+)\/([^\/]+)\/(file|review)$/);
  if (labResultAction) {
    const result = labResults.find(r => r.id === labResultAction[2] && r.patientId === labResultAction[1]);
    if (!result) return sendError('NOT_FOUND', 'Resultado no encontrado.', 404);
    if (labResultAction[3] === 'file' && method === 'GET') {
      const file = readMockFile(`result-${result.id}`);
      return file ? sendFile(file, result.contentType) : sendError('NOT_FOUND', 'El archivo del resultado no está disponible.', 404);
    }
    if (labResultAction[3] === 'review' && method === 'POST') {
      result.reviewedAt = new Date().toISOString();
      result.doctorComment = body.doctorComment ?? null;
      saveMockState();
      const { patientId: _p, contentType: _c, ...response } = result;
      return sendJson(response);
    }
  }

  // Listas del expediente que el mock todavía no simula: vacías, pero
  // con forma de arreglo. Con el fallback { ok: true } la pantalla
  // mostraba "formato inesperado" en lugar del estado vacío.
  const notesTimelineRoute = pathname.match(/^\/records\/patients\/([^\/]+)\/notes-timeline$/);
  if (notesTimelineRoute && method === 'GET') {
    return sendJson(mockNotesTimeline(notesTimelineRoute[1], parsedUrl.query));
  }

  if (method === 'GET' && (
    pathname.match(/^\/records\/patients\/[^\/]+\/(documents|history-pending-inherited|substance-uses|vitals-history)$/) ||
    pathname.match(/^\/lab-analytes\/patients\/[^\/]+$/) ||
    pathname === '/records/antecedentes-templates' ||
    pathname.match(/^\/catalogs\/[^\/]+$/)
  )) {
    return sendJson([]);
  }

  // Misma regla que PatientClinicalService.gynecoVisibility: visible
  // para sexo al nacer F (el mock no guarda habilitación manual).
  if (pathname.match(/^\/records\/patients\/[^\/]+\/gyneco-history$/) && method === 'GET') {
    const pat = patients.find(p => p.id === pathname.split('/')[3]);
    return sendJson({ visible: pat?.sexAtBirth === 'F', history: null });
  }

  // Asistente clínico (pases y resumen objetivo) — misma forma de
  // respuesta que AssistantController. Va antes de
  // GET /records/encounters/:id, que si no se tragaba
  // GET .../assistant/passes devolviendo el encuentro.
  const assistantRoute = pathname.match(/^\/records\/encounters\/([^\/]+)\/assistant\/(passes|summary)$/);
  if (assistantRoute) {
    const encounterId = encounters[assistantRoute[1]] ? assistantRoute[1] : "enc-1";
    const isSummary = assistantRoute[2] === 'summary';
    if (method === 'GET' && !isSummary) {
      return sendJson((assistantReadings.get(encounterId) ?? []).map(({ tokens: _tokens, ...reading }) => reading));
    }
    if (method === 'POST') {
      const client = getClaudeClient();
      if (!assistantCalls || !client) return sendJson({ kind: 'unavailable', reason: 'NOT_CONFIGURED' });
      if (!isSummary && !ASSISTANT_PASSES.includes(body.pase)) return sendError('VALIDATION_ERROR', 'Pase inválido.', 400);

      const readings = assistantReadings.get(encounterId) ?? [];
      const spentTokens = readings.reduce((sum, r) => sum + r.tokens, 0);
      if (!isSummary && spentTokens >= ASSISTANT_MAX_TOKENS_PER_ENCOUNTER) {
        return sendJson({ kind: 'unavailable', reason: 'SPEND_CAP_REACHED' });
      }

      const context = mockAssistantContext(encounterId);
      const hashContexto = createHash('sha256').update(JSON.stringify(context)).digest('hex');
      const locale = String(req.headers['accept-language'] || '').trim().toLowerCase().startsWith('en') ? 'en' : 'es';
      // Cliente que se va antes de la respuesta = cancelar (ver
      // client-disconnect-signal.ts: no se usa req.on('close')).
      const disconnect = new AbortController();
      res.on('close', () => { if (!res.writableEnded) disconnect.abort(); });
      const timeout = AbortSignal.timeout(isSummary ? ASSISTANT_SUMMARY_TIMEOUT_MS : ASSISTANT_TIMEOUT_MS);
      const signal = AbortSignal.any([disconnect.signal, timeout]);
      const cancelledOrTimedOut = () => (timeout.aborted && !disconnect.signal.aborted ? { kind: 'unavailable', reason: 'TIMEOUT' } : { kind: 'cancelled' });

      if (isSummary) {
        const outcome = await assistantCalls.generateSummaryWithClaude(client, { context, hashContexto, locale, signal }, assistantLogger);
        return sendJson(outcome.kind === 'cancelled' ? cancelledOrTimedOut() : outcome);
      }

      const outcome = await assistantCalls.generateReadingWithClaude(client, { context, hashContexto, pase: body.pase, locale, signal }, assistantLogger);
      if (outcome.kind === 'cancelled') return sendJson(cancelledOrTimedOut());
      if (outcome.kind === 'unavailable') return sendJson(outcome);
      const saved = {
        id: randomUUID(),
        pase: body.pase,
        reading: outcome.result.reading,
        createdAt: new Date().toISOString(),
        tokens: outcome.result.inputTokens + outcome.result.outputTokens,
      };
      assistantReadings.set(encounterId, [saved, ...readings]);
      return sendJson({ kind: 'ok', reading: saved.reading, readingId: saved.id, createdAt: saved.createdAt });
    }
  }

  // Sin datos antropométricos en el mock: resultados-charts.tsx trata
  // el error como "sin curva".
  if (pathname.match(/^\/records\/patients\/[^\/]+\/growth-curves$/) && method === 'GET') {
    return sendError('NOT_FOUND', 'Sin curva de crecimiento.', 404);
  }

  if (pathname.match(/^\/records\/patients\/[^\/]+\/pregnancy$/)) {
    return sendJson({ pregnancy: null });
  }

  // GET: lista para decidir Primera vez vs Seguimiento y para retomar un
  // borrador sin cita. POST: crea la consulta — antes caía en el GET y
  // devolvía la lista, así que "Iniciar consulta" desde el expediente
  // (y "Ordenar estudio", que lleva ahí) terminaba en
  // /records/encounters/undefined.
  const patientEncounters = pathname.match(/^\/records\/patients\/([^\/]+)\/encounters$/);
  if (patientEncounters) {
    const patId = patientEncounters[1];
    if (method === 'POST') {
      return sendJson(createMockEncounter(patId, body.encounterType || "FIRST_VISIT", body.appointmentId), 201);
    }
    const list = Object.values(encounters)
      .filter(e => e.patientId === patId)
      .map(e => ({
        id: e.id,
        status: e.status,
        encounterType: e.encounterType,
        startedAt: e.startedAt,
        appointmentId: e.appointmentId ?? appointments.find(a => a.encounter?.id === e.id)?.id ?? null
      }));
    if (patId === 'pat-1') list.push({ id: "enc-prev-1", status: "SIGNED", encounterType: "FIRST_VISIT", startedAt: "2026-07-15T10:00:00.000Z", appointmentId: null });
    return sendJson(list);
  }

  if (pathname.startsWith('/records/encounters/') && method === 'GET') {
    const encId = pathname.split('/')[3];
    return sendJson(encounters[encId] || encounters["enc-1"]);
  }

  if (pathname.startsWith('/records/encounters/') && pathname.endsWith('/note') && method === 'PATCH') {
    const encId = pathname.split('/')[3];
    // Se MEZCLA como en ClinicalEncounterService.updateDraft: el panel
    // de resultados manda solo labResultAnalyteIds y no debe borrar la nota.
    if (encounters[encId]) {
      encounters[encId].draftContent = { ...(encounters[encId].draftContent || {}), ...body };
      saveMockState();
    }
    return sendJson({ ok: true, draftContent: encounters[encId]?.draftContent ?? body });
  }

  if (pathname.startsWith('/records/encounters/') && pathname.endsWith('/sign') && method === 'POST') {
    const encId = pathname.split('/')[3];
    if (encounters[encId]) {
      encounters[encId].status = "SIGNED";
      encounters[encId].signedAt = new Date().toISOString();
      encounters[encId].notes.push({
        id: `note-${Date.now()}`,
        chiefComplaint: body.chiefComplaint || encounters[encId].draftContent.chiefComplaint || "",
        currentIllness: body.currentIllness || encounters[encId].draftContent.currentIllness || "",
        vitals: body.vitals || encounters[encId].draftContent.vitals || {},
        physicalExam: body.physicalExam || null,
        assessment: body.assessment || encounters[encId].draftContent.assessment || "",
        plan: body.plan || encounters[encId].draftContent.plan || "",
        prognosis: body.prognosis || null,
        patientInstructions: body.patientInstructions || null,
        createdAt: new Date().toISOString()
      });
      if (Array.isArray(body.diagnoses)) {
        encounters[encId].diagnoses = body.diagnoses.map((d, i) => ({ id: `diag-${Date.now()}-${i}`, icd10Code: d.icd10Code ?? null, codeAbsentReason: d.codeAbsentReason ?? null, description: d.description, diagnosisType: d.diagnosisType, certainty: d.certainty }));
      }
      saveMockState();
    }
    return sendJson({ ok: true, signed: true });
  }

  if (pathname === '/specialties' && method === 'GET') {
    return sendJson(specialties);
  }

  // Registro de médico (M1-RN-002/M2) + cola de verificación manual
  // por admin. La cuenta se crea de inmediato en SUBMITTED — nunca se
  // bloquea el registro por la cédula, solo se valida su formato en
  // el frontend (packages/contracts/validators/cedula.ts). No hay
  // ninguna consulta real a la SEP, ni en el mock ni en la API real.
  if (pathname === '/auth/register/doctor' && method === 'POST') {
    const id = `user-doc-${Date.now()}`;
    const specialty = specialties.find(s => s.code === body.primarySpecialtyCode) || null;
    const diacritics = new RegExp('[̀-ͯ]', 'g');
    const slugBase = `${body.legalFirstName || ''}-${body.legalLastName || ''}`
      .normalize('NFD').replace(diacritics, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    const newDoctor = {
      id,
      email: String(body.email || '').trim().toLowerCase(),
      primaryRole: "DOCTOR",
      status: "ACTIVE",
      emailVerifiedAt: null,
      doctor: {
        id: `doc-${id}`,
        userId: id,
        slug: slugBase || `doctor-${id}`,
        legalFirstName: body.legalFirstName || "",
        legalLastName: body.legalLastName || "",
        professionalLicense: body.professionalLicense || "",
        specialtyLicense: null,
        specialtyLicenseExpiresAt: null,
        primarySpecialtyId: specialty ? specialty.id : null,
        displayName: `Dr. ${body.legalFirstName || ""} ${body.legalLastName || ""}`.trim(),
        photoUrl: null,
        biography: null,
        yearsExperience: null,
        languages: [],
        university: null,
        professionalPhone: body.phone || null,
        professionalEmail: null,
        letterheadPhrase: null,
        logoUrl: null,
        signatureImageUrl: null,
        verificationStatus: "SUBMITTED",
        verificationNotes: null,
        acceptsTeleconsultation: false,
        acceptsNewPatients: false,
        minBookingNoticeMinutes: 120,
        maxBookingWindowDays: 90,
        createdAt: new Date().toISOString()
      }
    };
    registeredDoctors.push(newDoctor);
    return sendJson({ userId: id }, 201);
  }

  if (pathname === '/auth/email/verify' && method === 'POST') {
    const user = allUsers().find(u => u.id === body.userId);
    if (user) user.emailVerifiedAt = new Date().toISOString();
    return sendJson({ ok: true, verified: true });
  }

  // Cola de verificación del admin (ADM-01/ADM-02) — solo cubre a los
  // médicos registrados en esta sesión del mock (registeredDoctors);
  // el doctor semilla (Jorge) ya nace VERIFIED y no aparece aquí.
  if (pathname === '/admin/doctors' && method === 'GET') {
    const filterStatus = parsedUrl.query.verification_status || '';
    // Mock de businessHoursWaiting (M13-CA-003): mismo criterio que
    // doctor-verification.service.ts (horas de reloj menos fin de
    // semana completo), duplicado aquí porque el mock no comparte
    // código con el backend real.
    const isMxWeekend = (d) => {
      const w = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'short' }).format(d);
      return w === 'Sat' || w === 'Sun';
    };
    const businessHoursSince = (startIso) => {
      let hours = 0;
      const cursor = new Date(startIso);
      const now = new Date();
      while (cursor.getTime() < now.getTime()) {
        if (!isMxWeekend(cursor)) hours += 1;
        cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
      }
      return hours;
    };
    const list = registeredDoctors.map(u => ({
      id: u.doctor.id,
      legalFirstName: u.doctor.legalFirstName,
      legalLastName: u.doctor.legalLastName,
      professionalLicense: u.doctor.professionalLicense,
      primarySpecialtyId: u.doctor.primarySpecialtyId,
      verificationStatus: u.doctor.verificationStatus,
      createdAt: u.doctor.createdAt,
      businessHoursWaiting: businessHoursSince(u.doctor.createdAt)
    }));
    return sendJson(filterStatus ? list.filter(d => d.verificationStatus === filterStatus) : list);
  }

  // M13: búsqueda de usuarios (mock) — mismos campos que
  // admin-users.service.ts, sobre los médicos/pacientes semilla de
  // este servidor de desarrollo.
  if (pathname === '/admin/users' && method === 'GET') {
    const q = String(parsedUrl.query.q || '').trim().toLowerCase();
    if (!q) return sendJson({ doctors: [], patients: [] });
    const allDoctors = [doctorUser, ...registeredDoctors].map(u => u.doctor);
    const doctors = allDoctors
      .filter(d =>
        d.legalFirstName.toLowerCase().includes(q) ||
        d.legalLastName.toLowerCase().includes(q) ||
        d.professionalLicense.toLowerCase().includes(q)
      )
      .map(d => ({
        id: d.id,
        legalFirstName: d.legalFirstName,
        legalLastName: d.legalLastName,
        professionalLicense: d.professionalLicense,
        verificationStatus: d.verificationStatus,
        subscriptionStatus: null,
        createdAt: d.createdAt || new Date().toISOString()
      }));
    const matchedPatients = patients.filter(p =>
      p.firstName.toLowerCase().includes(q) ||
      p.lastNamePaternal.toLowerCase().includes(q) ||
      (p.lastNameMaternal || '').toLowerCase().includes(q) ||
      p.medicfyId.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q)
    ).map(p => ({
      id: p.id,
      medicfyId: p.medicfyId,
      firstName: p.firstName,
      lastNamePaternal: p.lastNamePaternal,
      lastNameMaternal: p.lastNameMaternal,
      appointmentCount: appointments.filter(a => a.patientId === p.id).length,
      linkedDoctorCount: new Set(appointments.filter(a => a.patientId === p.id).map(a => a.doctorId)).size,
      createdAt: new Date().toISOString()
    }));
    return sendJson({ doctors, patients: matchedPatients });
  }

  // M13-RN-005 (mock): mismas métricas que admin-metrics.service.ts,
  // calculadas sobre los datos semilla — MRR/churn quedan null porque
  // M6 (facturación) tampoco existe en el mock.
  if (pathname === '/admin/metrics' && method === 'GET') {
    const allDoctors = [doctorUser, ...registeredDoctors].map(u => u.doctor);
    const doctorsByVerificationStatus = {};
    for (const d of allDoctors) doctorsByVerificationStatus[d.verificationStatus] = (doctorsByVerificationStatus[d.verificationStatus] || 0) + 1;
    const appointmentsByStatus = {};
    for (const a of appointments) appointmentsByStatus[a.status] = (appointmentsByStatus[a.status] || 0) + 1;
    const completed = appointmentsByStatus.COMPLETED || 0;
    const noShow = appointmentsByStatus.NO_SHOW || 0;
    const resolved = completed + noShow;
    const isMxWeekend2 = (d) => {
      const w = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', weekday: 'short' }).format(d);
      return w === 'Sat' || w === 'Sun';
    };
    const businessHoursSince2 = (startIso) => {
      let hours = 0;
      const cursor = new Date(startIso);
      const now = new Date();
      while (cursor.getTime() < now.getTime()) {
        if (!isMxWeekend2(cursor)) hours += 1;
        cursor.setTime(cursor.getTime() + 60 * 60 * 1000);
      }
      return hours;
    };
    const pendingDoctors = registeredDoctors.map(u => u.doctor).filter(d => d.verificationStatus === 'SUBMITTED' || d.verificationStatus === 'IN_REVIEW');
    const overdue = pendingDoctors.filter(d => businessHoursSince2(d.createdAt) >= 24).length;
    return sendJson({
      doctorsByVerificationStatus,
      activeDoctors30d: 1,
      appointmentsByStatus,
      noShowRate: resolved > 0 ? noShow / resolved : null,
      signedNotesCount: 0,
      prescriptionsIssuedCount: 0,
      verificationQueue: { pending: pendingDoctors.length, overdue },
      mrr: null,
      churn: null
    });
  }

  // M15-RN-002 (mock): no hay Postgres ni cadena real en el servidor
  // de desarrollo — siempre "OK" con un contador fijo, suficiente para
  // que el frontend pruebe el estado normal sin necesitar audit_log
  // real. AuditChainVerifierService (backend real) sí verifica la
  // cadena de verdad.
  if (pathname === '/admin/audit/chain-verification' && method === 'GET') {
    return sendJson({ status: 'OK', totalChecked: 0, brokenAtSequence: null, reasons: [] });
  }

  if (pathname.match(/^\/admin\/doctors\/[^\/]+$/) && method === 'GET') {
    const doctorId = pathname.split('/')[3];
    const entry = registeredDoctors.find(u => u.doctor.id === doctorId);
    if (!entry) return sendError('DOCTOR_NOT_FOUND', 'Médico no encontrado', 404);
    return sendJson({
      id: entry.doctor.id,
      legalFirstName: entry.doctor.legalFirstName,
      legalLastName: entry.doctor.legalLastName,
      professionalLicense: entry.doctor.professionalLicense,
      primarySpecialtyId: entry.doctor.primarySpecialtyId,
      verificationStatus: entry.doctor.verificationStatus,
      verificationNotes: entry.doctor.verificationNotes,
      documents: []
    });
  }

  if (pathname.match(/^\/admin\/doctors\/[^\/]+\/verify$/) && method === 'POST') {
    const doctorId = pathname.split('/')[3];
    const entry = registeredDoctors.find(u => u.doctor.id === doctorId);
    if (!entry) return sendError('DOCTOR_NOT_FOUND', 'Médico no encontrado', 404);
    const specialty = specialties.find(s => s.id === entry.doctor.primarySpecialtyId);
    const specialtyConfirmed = body.specialtyConfirmed !== false;
    entry.doctor.verificationStatus =
      specialty && specialty.requiresSpecialtyLicense && !specialtyConfirmed ? "VERIFIED_SPECIALTY_UNCONFIRMED" : "VERIFIED";
    entry.doctor.verificationNotes = null;
    return sendJson({ verificationStatus: entry.doctor.verificationStatus });
  }

  if (pathname.match(/^\/admin\/doctors\/[^\/]+\/reject$/) && method === 'POST') {
    const doctorId = pathname.split('/')[3];
    const entry = registeredDoctors.find(u => u.doctor.id === doctorId);
    if (!entry) return sendError('DOCTOR_NOT_FOUND', 'Médico no encontrado', 404);
    entry.doctor.verificationStatus = "REJECTED";
    entry.doctor.verificationNotes = body.reason || null;
    return sendJson({ ok: true });
  }

  if (pathname.match(/^\/admin\/doctors\/[^\/]+\/suspend$/) && method === 'POST') {
    const doctorId = pathname.split('/')[3];
    const entry = registeredDoctors.find(u => u.doctor.id === doctorId);
    if (!entry) return sendError('DOCTOR_NOT_FOUND', 'Médico no encontrado', 404);
    entry.doctor.verificationStatus = "SUSPENDED";
    return sendJson({ notifiedPatients: 0, refundsIssued: 0 });
  }

  // Marketplace público (M2/M3) — directorio de médicos y "mis médicos".
  if (pathname === '/doctors/public' && method === 'GET') {
    return sendJson({
      items: [
        {
          id: "doc-1",
          slug: "jorge-tinoco",
          displayName: "Dr. Jorge Tinoco",
          photoUrl: null,
          primarySpecialtyName: "Medicina General",
          university: null,
          verified: true,
          acceptsTeleconsultation: true
        }
      ]
    });
  }

  // Perfil público de un médico (M2B) — lo que abre "Ver mi perfil
  // público" desde /perfil. Sin esto, doctor.languages.length truena
  // igual que /doctors/public antes de tener esta ruta.
  if (pathname.match(/^\/doctors\/[^\/]+\/public$/) && method === 'GET') {
    const slug = pathname.split('/')[2];
    const owner = allUsers().find(u => u.doctor && u.doctor.slug === slug);
    if (!owner) return sendError('DOCTOR_NOT_FOUND', 'Médico no encontrado', 404);
    const d = owner.doctor;
    const isSeedDoctor = owner.id === doctorUser.id;
    return sendJson({
      id: d.id,
      slug: d.slug,
      displayName: d.displayName,
      photoUrl: d.photoUrl,
      biography: d.biography,
      primarySpecialtyName: specialties.find(s => s.id === d.primarySpecialtyId)?.nameEs ?? "Medicina General",
      yearsExperience: d.yearsExperience,
      languages: d.languages,
      university: d.university,
      verified: d.verificationStatus === "VERIFIED" || d.verificationStatus === "VERIFIED_SPECIALTY_UNCONFIRMED",
      acceptsNewPatients: d.acceptsNewPatients,
      acceptsTeleconsultation: d.acceptsTeleconsultation,
      isBookable: isSeedDoctor,
      practiceLocations: isSeedDoctor
        ? [
            {
              id: "loc-1",
              name: "Consultorio Principal",
              addressStreet: "Av. Américas 1254",
              addressExt: null,
              addressInt: null,
              addressColonia: null,
              addressMunicipality: "Guadalajara",
              addressState: "Jalisco",
              addressPostalCode: null,
              phone: "+523312345678",
              isPrimary: true
            }
          ]
        : []
    });
  }

  if (pathname.match(/^\/doctors\/[^\/]+\/public\/posts$/) && method === 'GET') {
    return sendJson([]);
  }

  if (pathname.match(/^\/doctors\/[^\/]+\/public\/services$/) && method === 'GET') {
    return sendJson([
      { id: "srv-1", name: "Consulta General", durationMinutes: 30 },
      { id: "srv-2", name: "Consulta de Seguimiento", durationMinutes: 20 },
      { id: "srv-3", name: "Primera Vez", durationMinutes: 45 }
    ]);
  }

  if (pathname.match(/^\/doctors\/[^\/]+\/availability$/) && method === 'GET') {
    return sendJson([]);
  }

  if (pathname === '/icd10' && method === 'GET') {
    return sendJson(sampleIcd10);
  }

  if (pathname === '/medications' && method === 'GET') {
    const q = String(parsedUrl.query.search || '').trim().toLowerCase();
    return sendJson(q
      ? sampleMedications.filter(m => [m.genericName, ...m.brandNames].some(name => name.toLowerCase().includes(q)))
      : sampleMedications);
  }

  if (pathname === '/note-templates' && method === 'GET') {
    return sendJson([]);
  }

  if (pathname === '/specialty-field-schemas' && method === 'GET') {
    return sendJson([]);
  }

  // Atlas Anatómico 3D — mismo contrato que AtlasController
  // (atlasSessionOutcomeSchema). Habla con la API REAL del atlas si
  // ATLAS_* está en .env; si no, responde "no disponible" igual que el
  // backend real sin credenciales.
  const atlasOpen = pathname.match(/^\/records\/patients\/([^/]+)\/atlas-sessions$/);
  if (atlasOpen && method === 'POST') {
    const patientId = atlasOpen[1];
    // Paso 0 de la guía (CareRelationshipGuard en el backend real): en
    // el mock, solo el médico y solo pacientes que existen.
    if (getCurrentUser(req).primaryRole !== 'DOCTOR') return sendError('CARE_RELATIONSHIP_REQUIRED', 'Solo un médico con vínculo activo puede acceder a este expediente.', 403);
    if (!patients.some(p => p.id === patientId)) return sendError('NOT_FOUND', 'Paciente no encontrado.', 404);
    return sendJson(await openAtlasSession(patientId, getCurrentUser(req)));
  }

  const atlasRevoke = pathname.match(/^\/records\/patients\/([^/]+)\/atlas-sessions\/([^/]+)\/revoke$/);
  if (atlasRevoke && method === 'POST') {
    const owner = atlasSessionOwners.get(atlasRevoke[2]);
    if (!owner || owner.patientId !== atlasRevoke[1] || owner.userId !== getCurrentUser(req).id) return sendError('NOT_FOUND', 'Sesión del atlas no encontrada.', 404);
    atlasSessionOwners.delete(atlasRevoke[2]);
    await atlasCall(`/api/v1/viewer-sessions/${encodeURIComponent(atlasRevoke[2])}/revoke`).catch(() => {});
    return sendJson({ revoked: true });
  }

  // Fallback 200 OK
  return sendJson({ ok: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Medicfy Mock API Server running on http://localhost:${PORT}`);
});
