import http from 'node:http';
import url from 'node:url';

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
let registeredDoctors = [];

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
    startsAt: `${todayYMD}T09:00:00.000Z`,
    endsAt: `${todayYMD}T09:30:00.000Z`,
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
    startsAt: `${todayYMD}T10:30:00.000Z`,
    endsAt: `${todayYMD}T11:15:00.000Z`,
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
    startsAt: `${todayYMD}T12:00:00.000Z`,
    endsAt: `${todayYMD}T12:20:00.000Z`,
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

const sampleMedications = [
  { genericName: "Paracetamol", brandNames: ["Tempra"], presentations: [{ label: "Tableta 500 mg" }], atcCode: "N02BE01", controlGroup: "VI", isElectronicallyPrescribable: true },
  { genericName: "Ibuprofeno", brandNames: ["Motrin"], presentations: [{ label: "Tableta 400 mg" }], atcCode: "M01AE01", controlGroup: "VI", isElectronicallyPrescribable: true },
  { genericName: "Amoxicilina", brandNames: ["Amoxil"], presentations: [{ label: "Cápsula 500 mg" }], atcCode: "J01CA04", controlGroup: "VI", isElectronicallyPrescribable: true },
  { genericName: "Losartán", brandNames: ["Cozaar"], presentations: [{ label: "Tableta 50 mg" }], atcCode: "C09CA01", controlGroup: "VI", isElectronicallyPrescribable: true },
  { genericName: "Omeprazol", brandNames: ["Losec"], presentations: [{ label: "Cápsula 20 mg" }], atcCode: "A02BC01", controlGroup: "VI", isElectronicallyPrescribable: true }
];

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
  if (['POST', 'PATCH', 'PUT'].includes(method)) {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const rawBody = Buffer.concat(buffers).toString();
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

  if (pathname === '/doctors/me/documents' && method === 'GET') {
    return sendJson([]);
  }

  if (pathname === '/doctors/me/assistants' && method === 'GET') {
    return sendJson({ pending: [], accepted: [] });
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
            { id: "rule-1", doctorId: "doc-1", dayOfWeek: 1, startMinute: 540, endMinute: 1140 },
            { id: "rule-2", doctorId: "doc-1", dayOfWeek: 2, startMinute: 540, endMinute: 1140 },
            { id: "rule-3", doctorId: "doc-1", dayOfWeek: 3, startMinute: 540, endMinute: 1140 },
            { id: "rule-4", doctorId: "doc-1", dayOfWeek: 4, startMinute: 540, endMinute: 1140 },
            { id: "rule-5", doctorId: "doc-1", dayOfWeek: 5, startMinute: 540, endMinute: 1140 }
          ]
        : []
    );
  }

  if (pathname === '/doctors/me/availability-exceptions' && method === 'GET') {
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
          const encId = `enc-${Date.now()}`;
          encounters[encId] = {
            id: encId,
            patientId: apt.patientId,
            encounterType: "FOLLOW_UP",
            status: "DRAFT",
            startedAt: new Date().toISOString(),
            signedAt: null,
            draftContent: {},
            notes: [],
            diagnoses: []
          };
          apt.encounter = { id: encId, status: "DRAFT", encounterType: "FOLLOW_UP" };
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
    if (patId !== 'pat-1') return sendJson({ encounters: [], prescriptions: [], labOrders: [], standaloneResults: [] });
    return sendJson({
      encounters: [
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
      labOrders: [],
      standaloneResults: []
    });
  }

  if (pathname.match(/^\/records\/patients\/[^\/]+\/active-diagnoses$/)) {
    const patId = pathname.split('/')[3];
    if (patId !== 'pat-1') return sendJson([]);
    return sendJson([
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
    ]);
  }

  if (pathname.match(/^\/records\/patients\/[^\/]+\/pregnancy$/)) {
    return sendJson({ pregnancy: null });
  }

  // Consultado por el bootstrap de /consulta/[appointmentId] para
  // decidir Primera vez vs Seguimiento cuando la cita todavía no
  // tiene encounter (POST crea uno nuevo justo después).
  if (pathname.match(/^\/records\/patients\/[^\/]+\/encounters$/)) {
    const patId = pathname.split('/')[3];
    return sendJson(patId === 'pat-1' ? [{ status: "SIGNED" }] : []);
  }

  if (pathname.startsWith('/records/encounters/') && method === 'GET') {
    const encId = pathname.split('/')[3];
    return sendJson(encounters[encId] || encounters["enc-1"]);
  }

  if (pathname.startsWith('/records/encounters/') && pathname.endsWith('/note') && method === 'PATCH') {
    const encId = pathname.split('/')[3];
    if (encounters[encId]) {
      encounters[encId].draftContent = body;
    }
    return sendJson({ ok: true, draftContent: body });
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
        prognosis: null,
        createdAt: new Date().toISOString()
      });
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
    const list = registeredDoctors.map(u => ({
      id: u.doctor.id,
      legalFirstName: u.doctor.legalFirstName,
      legalLastName: u.doctor.legalLastName,
      professionalLicense: u.doctor.professionalLicense,
      primarySpecialtyId: u.doctor.primarySpecialtyId,
      verificationStatus: u.doctor.verificationStatus,
      createdAt: u.doctor.createdAt
    }));
    return sendJson(filterStatus ? list.filter(d => d.verificationStatus === filterStatus) : list);
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
    return sendJson(sampleMedications);
  }

  if (pathname === '/note-templates' && method === 'GET') {
    return sendJson([]);
  }

  if (pathname === '/specialty-field-schemas' && method === 'GET') {
    return sendJson([]);
  }

  // Fallback 200 OK
  return sendJson({ ok: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Medicfy Mock API Server running on http://localhost:${PORT}`);
});
