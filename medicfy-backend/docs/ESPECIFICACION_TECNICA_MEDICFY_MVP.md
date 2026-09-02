# ESPECIFICACIÓN TÉCNICA FUNCIONAL — MEDICFY MVP v1.0

**Documento maestro de desarrollo · Fuente única de verdad**

| Campo | Valor |
|---|---|
| Versión | 1.0 (borrador para aprobación) |
| Fecha | Agosto 2026 |
| Producto | Medicfy — Plataforma de salud digital |
| Mercado inicial | Guadalajara, Jalisco, México |
| Alcance del documento | MVP v1.0 (ver §2). Fases posteriores se especifican en §12 |
| Reemplaza a | Manual Maestro, Diseño de Medicfy Completo, Funciones Medicfy, Informe de Análisis, Proceso de Generación de Pantallas (Fases 1–4), Principales cambios 6-jun-2025 |
| Estado | **v2.0 — APROBADA Y CONGELADA.** Todas las decisiones de producto, alcance y arquitectura están cerradas. Quedan 2 insumos abiertos que no bloquean el desarrollo: capital declarado (§12.5) y material clínico del fundador (§9.4) |
| Revisión | v2.4 · 1 septiembre 2026 — ver registro de cambios en §17. Anterior: v2.3 · 1 septiembre 2026; v2.2 · 1 septiembre 2026; v2.1.1 · 14 agosto 2026; v2.1 · agosto 2026; v2.0 · agosto 2026 · incorpora el addendum v1.1 y las respuestas del fundador. `ADDENDUM_v1.1` y `PREGUNTAS_BLOQUEANTES.md` quedan como archivo histórico: **ya no son documentos de consulta** |
| Decisión estratégica base | **Opción 1 aprobada** — herramienta clínica del médico primero; el directorio es consecuencia, no punto de partida |

### Cómo usar este documento

1. Este archivo sustituye a los 10 documentos anteriores como referencia de desarrollo. Los documentos originales pasan a ser **archivo histórico**, no fuente de requisitos. Si algo no está aquí, no está en el MVP.
2. Cada módulo (§7) es autocontenido y contiene: objetivo, alcance, reglas de negocio, flujo, validaciones, permisos, casos límite, errores, dependencias y criterios de aceptación. Un desarrollador debe poder tomar un módulo y construirlo sin preguntar.
3. Los bloques marcados **[DECISIÓN POR DEFECTO]** son decisiones que tomé por ti para no bloquear el avance. Puedes revertir cualquiera, pero cada reversión tiene un costo en semanas que está indicado.
4. Los bloques marcados **[BLOQUEANTE]** no pueden resolverse sin tu respuesta o sin un tercero (abogado, notario, proveedor).

---

## 1. RESUMEN EJECUTIVO

### 1.1 Qué encontré en tu documentación

Tu documentación es **notablemente completa en visión y notablemente incompleta en ejecución**. Tienes 10 documentos, ~490,000 caracteres, que cubren estrategia, branding, UX, pricing, legal y flujos de pantalla con IDs (PAC-001 a PAC-007, MED-001 a MED-004, LAB-001 a LAB-003, ADM-001 a ADM-003). Eso es más de lo que tiene el 90% de las startups que buscan levantar capital.

Lo que **no** tienes, y sin lo cual no se puede escribir una línea de código:

| Falta | Impacto |
|---|---|
| Modelo de datos | Nadie sabe qué se guarda ni cómo se relaciona. Se resuelve en §6 |
| Contratos de API | Frontend y backend no pueden trabajar en paralelo. Se resuelve en §8 |
| Matriz de permisos real | Riesgo de fuga de datos clínicos. Se resuelve en §5 |
| Reglas de negocio y casos límite | El desarrollador improvisa y tú pagas el retrabajo. Se resuelve en §7 |
| Definición de MVP | **El problema más grave.** Ver §1.2 |
| Stack técnico decidido | Se resuelve en §4 |
| Máquinas de estado (cita, orden, receta) | Origen del 60% de los bugs en plataformas de agendamiento. Se resuelve en §7 |

### 1.2 El problema estructural: tu MVP no es un MVP

Tu documentación define como MVP: agendamiento + directorio verificado + expediente clínico electrónico completo NOM-004 + receta electrónica con validez legal + órdenes de laboratorio + portal de laboratorios + telemedicina + chat + **IA clínica de apoyo diagnóstico** + panel admin + 4 subdominios + apps móviles nativas + microservicios + multi-región + blockchain para integridad + FHIR/DICOM/SNOMED/LOINC.

El presupuesto documentado para ese MVP es **MXN 250,000** con costo operativo de **MXN 280,000/mes**.

Esos dos números son incompatibles por un factor de aproximadamente 10x, y el segundo es incompatible con el primero por sí mismo (el costo operativo mensual excede el presupuesto total de construcción). Un equipo capaz de entregar ese alcance cuesta entre MXN 2.5M y 4.5M en 9–12 meses en el mercado mexicano actual. Con MXN 250,000 se contrata aproximadamente un desarrollador full-stack senior durante 2.5–3 meses.

Además, el costo operativo de MXN 280,000/mes implica que necesitas **~MXN 3.36M de ingresos anuales solo para no perder dinero**, con cero usuarios en el día uno. Tu propia proyección requiere 1,500 pacientes pagando y 175 médicos pagando en el año 1 — es decir, necesitas capturar médicos a un ritmo de ~15/mes sostenido desde el mes uno, compitiendo contra Doctoralia que ya tiene la red instalada.

**Esto no es una crítica al proyecto. Es una crítica a la secuencia.** El proyecto es viable. La secuencia actual garantiza que te quedes sin dinero antes de tener un producto en manos de un médico real.

### 1.3 La decisión de alcance que recomiendo

Recorto el MVP a **un solo problema resuelto excepcionalmente bien**, y el problema que elijo no es el agendamiento.

**Razonamiento:** si Medicfy lanza como directorio con agendamiento, compite frontalmente contra Doctoralia en el único terreno donde Doctoralia es imbatible: efecto de red. Un directorio con 20 médicos pierde contra un directorio con 20,000 médicos, siempre, sin importar cuánto mejor sea la UX. El paciente va donde están los médicos.

Pero Doctoralia es débil en algo concreto: **es una máquina de captación de pacientes, no una herramienta clínica**. Su expediente es pobre, su receta electrónica es limitada, y no toca laboratorios. El médico independiente mexicano paga MXN 1,665–2,749/mes a Doctoralia por visibilidad, y además paga por separado un sistema de expediente/receta, y además coordina laboratorios por WhatsApp.

**Por eso el MVP debe ser la herramienta clínica del médico, no el directorio del paciente.** Se vende al médico, el médico trae a sus propios pacientes (no necesitas efecto de red para empezar), y el agendamiento público se activa cuando ya tienes densidad de médicos.

Esto invierte la estrategia de tu documentación y es la recomendación más importante de este documento. **Requiere tu aprobación explícita antes de que el equipo escriba código**, porque cambia el orden de construcción de todo lo demás.

**[DECISIÓN POR DEFECTO]** El resto del documento asume esta secuencia. Si prefieres arrancar por el directorio público, dímelo y reescribo §7 y §12 — el trabajo perdido es de ~1 día de mi lado, no de tu equipo.

---

## 2. ALCANCE DEL MVP

### 2.1 Dentro del MVP (v1.0) — 14 semanas

| # | Módulo | Justificación |
|---|---|---|
| M1 | Identidad, cuentas y sesión | Base de todo |
| M2 | Perfil médico + verificación de cédula | Es tu diferenciador declarado. Sin esto Medicfy es un directorio más |
| M2B | Publicaciones del médico y control de audiencia *(agregado v2.2)* | Ver §7 — extensión de M2, no el directorio (M3) completo |
| M3 | Directorio y búsqueda de médicos, sin reseñas/calificaciones *(agregado v2.3)* | Ver §7 y la nota de reversión consciente de §1.3, abajo |
| M4 | Agenda y disponibilidad del médico | El médico no adopta nada que no gestione su día |
| M5 | Citas (creación por médico y por paciente vía enlace) | Núcleo operativo |
| M5b | Identidad de paciente y agendamiento público *(agregado v2.3)* | Ver §7 — completa el "paso de pago" que M5-RN-007 ya daba por hecho |
| M8 | Expediente clínico electrónico — perfil mínimo NOM-004 | **El corazón del MVP** |
| M9 | Receta electrónica no controlada (Grupos III–VI) | **El segundo corazón del MVP** |
| M12 | Notificaciones transaccionales (email + WhatsApp) | Sin recordatorios, el no-show mata la propuesta de valor |
| M13 | Panel admin mínimo (verificación de médicos + soporte) | Operativamente indispensable |
| M15 | Auditoría, cifrado y bitácora de accesos | Obligación legal, no opcional |

### 2.2 Fuera del MVP — y por qué

| Excluido | Movido a | Razón |
|---|---|---|
| **Portal de laboratorios (M10)** | v1.1 | Requiere vender a laboratorios (ciclo B2B de 3–6 meses) antes de que exista volumen de órdenes. Construir el portal antes de tener el primer laboratorio firmado es construir para nadie. En MVP: la orden de laboratorio se emite como PDF firmado que el paciente lleva a cualquier laboratorio. Cubre el 100% del caso de uso clínico con 5% del esfuerzo |
| **IA clínica (M14)** | v1.2 | Ver §2.3. Es un riesgo legal y clínico serio, no una feature |
| **Apps nativas iOS/Android** | v2.0 | PWA instalable cubre el 95% del caso de uso. Ahorra ~10 semanas y ~MXN 600k. Las notificaciones push funcionan en PWA en Android y en iOS 16.4+ |
| **Chat médico-paciente (M11)** | v1.1 | Abre responsabilidad clínica sin cita de por medio (¿qué pasa si un paciente reporta dolor torácico por chat un domingo?). Requiere política de tiempos de respuesta y triage que aún no existe |
| **Teleconsulta con video propio (M7)** | v1.1 parcial | En MVP: la cita de modalidad "en línea" genera un enlace de videollamada de proveedor externo (ver §4.4). No construimos WebRTC |
| **Suscripción de pacientes ("Medicfy Plus")** | v1.2+ | No hay evidencia de que el paciente mexicano pague por esto. Ver §11.2 |
| **Reseñas y calificaciones de pacientes sobre médicos** | v1.1 | Ver §1.3. *(v2.3: el fundador autorizó explícitamente el resto de M3 — búsqueda y directorio, ver §7 — con conocimiento consciente de que esto revierte "la recomendación más importante" de §1.3 sobre no competir con Doctoralia en efecto de red. Las reseñas/calificaciones NO se autorizaron — nadie las pidió — y siguen fuera del MVP.)* |
| **Microservicios, multi-región, blockchain, FHIR/DICOM** | v3.0 o nunca | Ver §4.2 |
| **Facturación CFDI automática** | v1.1 | Se resuelve manualmente con 20 médicos |
| **Integración con aseguradoras** | v2.0+ | Ciclo de venta de 12+ meses |

### 2.3 Nota crítica sobre la IA clínica

Tu documentación define la IA como apoyo al diagnóstico durante la consulta, con la posibilidad de sugerir "alguna lista preferente de medicamentos en caso de algún convenio con alguna farmacéutica".

Tengo que ser directo contigo en dos puntos, y el segundo es serio:

**Primero, lo técnico/regulatorio:** un sistema que sugiere diagnósticos o tratamientos es, bajo criterio internacional (FDA SaMD, MDR europeo) y crecientemente en México, un **dispositivo médico de software**. Eso implica validación clínica, registro sanitario ante COFEPRIS y responsabilidad de producto. No es una feature de dos semanas; es una línea de producto con su propio expediente regulatorio. Lanzarla sin eso te expone a que un desenlace adverso se atribuya a la sugerencia del sistema, y tu documentación legal actual no te protege de eso.

**Segundo, lo ético:** un motor de sugerencia de medicamentos que prioriza el catálogo de un laboratorio con el que tienes convenio comercial, sin que el médico sepa que la lista está sesgada por un acuerdo económico, es un conflicto de interés que afecta la prescripción. Como médico sabes lo que eso significa para el paciente. Si esa función existe, tiene que ser explícita en la interfaz ("estos medicamentos son de la marca X, con la que Medicfy tiene un acuerdo comercial"), separada de las sugerencias clínicas, y auditable. Si no puede sostenerse con esa transparencia, no debe existir: es el tipo de decisión que hunde la reputación de una plataforma de salud de un solo golpe y es indefendible ante un colegio médico o ante prensa.

**Lo que sí recomiendo para v1.2, y que da el 80% del valor percibido con 5% del riesgo:**
- Transcripción y estructuración de la nota clínica dictada por voz (el médico dicta, la IA redacta el SOAP, el médico corrige y firma). Ahorro real: 4–7 minutos por consulta. Esto es lo que los médicos realmente quieren.
- Resumen automático del expediente al abrir la consulta ("paciente de 54 años, 3 consultas previas, hipertensión en tratamiento con losartán, última HbA1c...").
- Verificación de interacciones medicamentosas y alertas de alergia contra el expediente. Esto es **seguridad del paciente**, es defendible, y es una base de datos consultada, no un modelo generativo opinando.
- Codificación CIE-10 sugerida a partir del texto libre.

Ninguna de estas cuatro emite un juicio diagnóstico. Todas son asistencia documental. Y las cuatro son mucho más vendibles que "IA que te ayuda a diagnosticar", que a un médico con 20 años de práctica le suena, con razón, a insulto.

---

## 3. HALLAZGOS REGULATORIOS BLOQUEANTES

Verifiqué el marco vigente a agosto de 2026. Tu documentación legal está desactualizada en un punto grave.

### 3.1 [BLOQUEANTE] Tu documentación legal cita una ley derogada

Tu `Documentación Legal Completa para Medicfy` está construida sobre la **LFPDPPP de 2010** y designa al **INAI** como autoridad.

Ambas cosas dejaron de ser válidas. <cite index="14-1">El 20 de marzo de 2025 se publicó en el Diario Oficial de la Federación la nueva Ley Federal de Protección de Datos Personales en Posesión de los Particulares, que entró en vigor el 21 de marzo de 2025 y abrogó la ley homónima de 2010</cite>. <cite index="13-1">La Secretaría de Anticorrupción y Buen Gobierno asumió las funciones que antes correspondían al INAI, convirtiéndose en la nueva autoridad en materia de protección de datos personales para particulares</cite>.

Consecuencias concretas para el desarrollo:

- **Tu Aviso de Privacidad debe reescribirse completo.** <cite index="14-1">El aviso de privacidad integral ahora elimina la obligación de informar sobre transferencias, pero incorpora la exigencia de detallar los datos personales que serán tratados identificando los sensibles, y de distinguir entre finalidades que requieren consentimiento y aquellas que no</cite>. Tu aviso actual no cumple esa estructura.
- **La definición de responsable se amplió.** <cite index="14-1">Ahora es cualquier persona física o moral que realice tratamiento de datos personales, sin necesidad de que tome decisiones sobre dicho tratamiento, lo que amplía el universo de sujetos obligados e incluye también a los encargados</cite>. Esto significa que **tus proveedores de infraestructura y los médicos usuarios tienen obligaciones propias**, y necesitas contratos de encargo con cada uno.
- **La exposición económica es material.** Las multas alcanzan del orden de 320,000 UMA, con agravamiento cuando se trata de datos sensibles — que es exactamente el 100% de lo que Medicfy almacena.

**Acción requerida:** contratar revisión legal del paquete completo con abogado especialista en protección de datos y salud digital antes del lanzamiento. Presupuesta MXN 60,000–120,000. **No es opcional y no puede hacerse después del lanzamiento.**

### 3.2 [BLOQUEANTE] Receta electrónica: hay ambigüedad real sobre el tipo de firma exigida

Aquí las fuentes disponibles se contradicen, y esto define arquitectura, así que necesitas criterio legal propio, no el mío.

- Una postura sostiene que <cite index="4-1">se requiere firma electrónica avanzada (e.firma del SAT o cédula profesional digital de la SEP) ligada al CURP del médico prescriptor, sistema con sello digital de tiempo no editable retroactivamente, almacenamiento cifrado por al menos 5 años con trazabilidad de cambios, y consentimiento informado del paciente para recibir su prescripción por canal digital</cite>. En esta lectura, <cite index="6-1">una receta digital sin firma electrónica avanzada es jurídicamente equivalente a un papel sin firma autógrafa: no surte efectos, y la firma avanzada requiere certificado de un PSC autorizado o la e.firma del SAT</cite>.
- La postura contraria sostiene que para la receta de consultorio ordinaria basta la firma del propio sistema de expediente, con registro de autoría por usuario/contraseña y bitácora de auditoría conforme a NOM-024.

**Cómo resuelvo esto en la arquitectura, para no apostar:** el módulo de firma (M9) se construye como una **interfaz abstracta con dos implementaciones intercambiables** — firma interna del sistema (usuario + contraseña + TOTP + bitácora + sello de tiempo) y firma electrónica avanzada vía e.firma/PSC. Se lanza con la primera y se activa la segunda por configuración cuando tu abogado lo confirme, sin reescribir nada. Costo de esta precaución: ~1 semana de desarrollo. Costo de no tomarla: recetas potencialmente inválidas y reescritura del módulo.

**Lo que sí está claro y es obligatorio desde el día uno** — la receta debe contener, conforme al art. 33 del Reglamento de Insumos para la Salud: <cite index="6-1">nombre, cédula profesional e institución que la expidió, domicilio del consultorio, datos del paciente, fecha, denominación genérica del medicamento, presentación, dosis, vía, frecuencia, duración del tratamiento y firma del prescriptor</cite>. La denominación genérica es obligatoria por ley; la comercial es opcional y adicional. Ver validaciones en §7.9.

### 3.3 [BLOQUEANTE] Medicamentos controlados quedan fuera del MVP, sin excepción

<cite index="4-1">Para medicamentos controlados de Grupo I y II, COFEPRIS aún exige el recetario físico con código de barras: la receta digital no sustituye este requisito</cite>.

**Regla de negocio inviolable (M9-RN-012):** el catálogo de medicamentos debe marcar el grupo de control de cada fármaco. Si el médico intenta prescribir un Grupo I o II, el sistema **bloquea la emisión** y muestra: *"Este medicamento requiere recetario físico con código de barras de COFEPRIS. Medicfy no puede emitir esta receta electrónicamente."* No es una advertencia que se pueda ignorar; es un bloqueo duro.

Esto tiene que estar en el contrato con el médico y en el onboarding, porque un psiquiatra o un anestesiólogo descubrirá esta limitación en su primera consulta y se irá si nadie se lo advirtió.

### 3.4 Otras obligaciones que entran al alcance técnico

| Norma | Obligación técnica derivada | Módulo |
|---|---|---|
| NOM-004-SSA3-2012 | Estructura mínima del expediente clínico; **las notas no se borran ni se editan, se corrigen con nota adicional**; conservación mínima 5 años | M8, M15 |
| NOM-024-SSA3-2012 | Sistema de registro electrónico con trazabilidad, bitácora de acceso, respaldo | M15 |
| NOM-035-SSA3-2012 | Estructura del expediente electrónico e intercambio de información | M8 |
| NOM-151-SCFI-2016 | Conservación de mensajes de datos mediante constancia de PSC (relevante si se opta por firma avanzada) | M9 |
| LFPDPPP 2025 art. 9 | Consentimiento **expreso** para datos sensibles, registrado con fecha, hora, IP y versión del aviso aceptada | M1, M15 |
| Ley General de Salud art. 226 | Clasificación de medicamentos por grupo | M9 |

---

## 4. ARQUITECTURA TÉCNICA

### 4.1 Principio rector

Optimizamos para **velocidad de entrega y bajo costo operativo con un equipo de 2–4 personas**, no para escala hipotética. La arquitectura correcta para 20 médicos y 2,000 pacientes es radicalmente distinta a la correcta para 500,000 usuarios, y elegir la segunda desde el día uno es la causa más común de muerte de startups técnicas.

### 4.2 Lo que descarto de tu documentación, y por qué

| Propuesta original | Veredicto | Razón |
|---|---|---|
| Microservicios | **Descartado** | Con 2–4 desarrolladores, los microservicios multiplican por 3–5 el costo operativo y de depuración sin beneficio alguno. Se adoptan cuando el cuello de botella es la coordinación entre equipos, no antes. Un **monolito modular** con fronteras internas limpias se puede partir después si hace falta |
| Despliegue multi-región + BCP/DRP activo-activo | **Descartado** | Costo de infraestructura 4–6x. Un despliegue en una región con réplica de lectura, respaldos automáticos con PITR y un RTO de 4 horas es apropiado y defendible en auditoría |
| Blockchain para integridad de datos clínicos | **Descartado** | No resuelve ningún problema que no resuelva una tabla de auditoría append-only con encadenamiento de hashes, que es 100x más simple, más rápida y más auditable |
| FHIR / DICOM / SNOMED CT completos | **Diferido** | FHIR importa cuando integras con un hospital o una aseguradora. En MVP: CIE-10 (obligatorio para diagnósticos) y LOINC solo como campo opcional en el catálogo de estudios. DICOM no aplica sin imagenología |
| 4 subdominios separados (`pacientes.`, `medicos.`, `laboratorios.`, `admin.`) | **Modificado** | Se conserva la *percepción* de portales separados y el aislamiento de `admin.`, pero con **una sola base de código** y enrutamiento por rol. Cuatro despliegues independientes cuadruplican el mantenimiento sin beneficio de seguridad real. `admin.medicfy.com` sí va en subdominio aparte con acceso restringido y MFA obligatorio |
| React Native + Flutter (ambos) | **Descartado** | PWA en v1.0. Una sola app nativa en v2.0 si las métricas lo justifican |

### 4.3 Stack seleccionado

**[DECISIÓN POR DEFECTO]** — Cámbialo solo si tu equipo tiene experiencia fuerte en otra cosa; la familiaridad del equipo pesa más que la elección teórica.

| Capa | Tecnología | Razón |
|---|---|---|
| Frontend web + PWA | **Next.js 15** (App Router) + TypeScript + React 19 | SSR para SEO del directorio en v1.1; un solo lenguaje en todo el stack; ecosistema enorme en México |
| Estilos | **Tailwind CSS** + design tokens de §9 | Velocidad; consistencia forzada |
| Componentes | **shadcn/ui** como base, adaptado a la identidad Medicfy | No reinventar el design system; accesibilidad incluida |
| Backend | **NestJS** (Node + TypeScript) | Estructura modular impuesta, inyección de dependencias, decoradores de guardias por rol — encaja con RBAC clínico. Alternativa válida: Django + DRF si el equipo es Python |
| Base de datos | **PostgreSQL 16** | Transaccional, JSONB para datos clínicos semiestructurados, cifrado en reposo, RLS disponible |
| ORM | **Prisma** | Migraciones versionadas y tipadas |
| Caché / colas | **Redis** + **BullMQ** | Recordatorios, envío de notificaciones, generación de PDF asíncrona |
| Almacenamiento de archivos | **S3** (o Cloudflare R2) con cifrado SSE-KMS y URLs prefirmadas de vida corta | Resultados, PDFs, documentos de verificación |
| Autenticación | Implementación propia con **Argon2id** + JWT de acceso corto (15 min) + refresh rotativo en cookie `httpOnly` | No delegar identidad clínica a un tercero SaaS sin contrato de encargo |
| MFA | **TOTP** (RFC 6238) obligatorio para médico, laboratorio y admin | Requisito de seguridad y de firma de receta |
| Pagos | **Stripe MX** o **Conekta** — ver §7.6 | Suscripciones + SPEI + OXXO |
| Video | **Daily.co** o **LiveKit Cloud** | HIPAA-ready, sin construir WebRTC |
| Email transaccional | **Resend** o **AWS SES** | |
| WhatsApp | **Meta Cloud API** directa o vía **Twilio** | Canal crítico en México; requiere plantillas aprobadas |
| PDF | **Puppeteer** en worker aislado, plantilla HTML | Recetas, órdenes, resúmenes |
| Observabilidad | **Sentry** + **Axiom/Better Stack** + **Grafana Cloud** (free tier) | |
| Hosting | **Vercel** (frontend) + **AWS ECS Fargate o Railway** (backend) + **RDS** | |
| CI/CD | **GitHub Actions** | |
| IaC | **Terraform** desde el día uno | Reproducibilidad exigible en auditoría |

**Región de datos: `us-east-1` o `mx-central-1` (AWS México, si está disponible en tu cuenta).** **[BLOQUEANTE menor]** Confirmar con abogado si hay exigencia de residencia de datos en territorio nacional para expedientes clínicos; la nueva LFPDPPP amplió obligaciones sobre transferencias.

### 4.4 Entornos

| Entorno | Propósito | Datos |
|---|---|---|
| `local` | Desarrollo | Semillas ficticias |
| `staging` | QA, pruebas de usabilidad, demos a médicos | **Solo datos ficticios. Prohibido cargar datos clínicos reales, incluso anonimizados** |
| `production` | Operación | Datos reales, acceso restringido, bitácora total |

---

## 5. IDENTIDAD, ROLES Y MATRIZ DE PERMISOS

### 5.1 Roles del MVP

| Rol | Código | Alta | MFA |
|---|---|---|---|
| Paciente | `PATIENT` | Auto-registro o creado por médico | Opcional |
| Médico | `DOCTOR` | Auto-registro + **verificación manual por admin** | **Obligatorio** |
| Asistente de médico | `ASSISTANT` | Invitado por un médico | Obligatorio |
| Laboratorio (v1.1) | `LAB` | Invitación + verificación | Obligatorio |
| Soporte Medicfy | `SUPPORT` | Creado por superadmin | Obligatorio |
| Administrador | `ADMIN` | Creado por superadmin | Obligatorio |
| Superadministrador | `SUPERADMIN` | Semilla inicial | Obligatorio + IP allowlist |

**Decisión importante:** agrego el rol `ASSISTANT`, que **no está en tu documentación y es un error grave de omisión**. En la práctica clínica mexicana, la secretaria o asistente del médico es quien gestiona la agenda el 80% del tiempo. Si el sistema solo permite que el médico toque su propia agenda, el médico no lo usa. El asistente puede gestionar agenda y citas, y **no puede ver notas clínicas, ni emitir recetas, ni ver diagnósticos**.

### 5.2 Matriz de permisos (extracto normativo — la implementación completa vive en código como política declarativa)

| Recurso / Acción | PATIENT | DOCTOR | ASSISTANT | LAB | SUPPORT | ADMIN |
|---|---|---|---|---|---|---|
| Ver propio perfil | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editar nombre / cédula / especialidad propios | — | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ver directorio de médicos | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Crear cita | ✅ (propia) | ✅ | ✅ | — | ✅ | ✅ |
| Cancelar cita | ✅ (propia, con ventana) | ✅ | ✅ | — | ✅ | ✅ |
| Ver expediente de paciente | ✅ (propio) | ✅ **solo con vínculo activo** | ❌ | ❌ | ❌ | ❌ |
| Crear nota clínica | ❌ | ✅ | ❌ | — | ❌ | ❌ |
| Editar nota clínica firmada | ❌ | ❌ (solo nota de corrección) | ❌ | — | ❌ | ❌ |
| Emitir receta | ❌ | ✅ | ❌ | — | ❌ | ❌ |
| Emitir orden de laboratorio | ❌ | ✅ | ❌ | — | ❌ | ❌ |
| Subir resultados | ❌ | ✅ | ❌ | ✅ (orden asignada) | ❌ | ❌ |
| Ver datos de pago del médico | ❌ | ✅ (propios) | ❌ | — | ❌ | ✅ |
| Verificar médico | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Desactivar cuenta | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ver bitácora de auditoría | ❌ | ✅ (accesos a sus pacientes) | ❌ | ❌ | ✅ (lectura) | ✅ |
| Acceder a expediente sin vínculo | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Publicar contenido en el perfil propio *(v2.2, M2B)* | — | ✅ (propio) | ❌ | — | ❌ | ❌ |
| Ver publicación con audiencia "solo mis pacientes" *(v2.2/v2.3, M2B)* | ✅ (solo con `care_relationship` activo, vía el portal de paciente de M5-RN-009+) | ✅ (propias) | ❌ | — | ❌ | ❌ |
| Archivar publicación de cualquier médico *(v2.2, M2B, moderación mínima)* | ❌ | ❌ (solo las propias) | ❌ | — | ❌ | ✅ |
| Dar like / comentar una publicación que puede ver *(v2.3, M2B)* | ✅ | ✅ | ✅ | — | ❌ | ❌ |
| Borrar un comentario ajeno *(v2.3, M2B)* | ❌ | ✅ (solo en publicaciones propias) | ❌ | — | ❌ | ✅ |
| Buscar/listar médicos en el directorio *(v2.3, M3)* | ✅ (público, sin sesión) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Agendar cita por el enlace público, a nombre propio *(v2.3, M5-RN-009+)* | ✅ | — | — | — | ❌ | ❌ |
| Subir/revisar una hoja de laboratorio para transcripción automática *(v2.5, M10)* | ❌ | ✅ (con vínculo activo) | ❌ | — | ❌ | ❌ |
| Aprobar un rango de referencia de laboratorio pendiente *(v2.5, M10)* | ❌ | ❌ | ❌ | — | ❌ | ❌ (solo rol `CURATOR` o `SUPERADMIN` — ni `ADMIN` ni `DOCTOR` por sí solos; mismo criterio que la curaduría de catálogos) |

### 5.3 Reglas de autorización no negociables

**AUTH-RN-001 — Vínculo médico-paciente.** Un médico accede al expediente de un paciente **solo si existe un registro `care_relationship` activo**, creado por una de estas tres vías: (a) cita agendada, (b) el paciente autorizó explícitamente al médico, (c) el paciente fue creado por ese médico. El vínculo caduca a los **18 meses sin interacción** y debe renovarse con nueva cita o nueva autorización.

**AUTH-RN-002 — Nadie ve expedientes de forma masiva.** Ni admin, ni soporte, ni superadmin. El panel de administración muestra metadatos (número de consultas, fechas, estado) pero **nunca contenido clínico**. Si soporte necesita ver un expediente por una incidencia, requiere: solicitud registrada + aprobación de un segundo administrador + notificación al paciente y al médico + registro en bitácora con justificación. Esto se llama *break-glass access* y es lo que separa una plataforma auditable de una demanda.

**AUTH-RN-003 — Toda lectura de dato clínico se registra.** Sin excepción. Quién, qué, cuándo, desde qué IP, con qué justificación. Ver §7.15.

**AUTH-RN-004 — Datos inmutables del médico.** Nombre legal, cédula profesional y especialidad **no son editables por el médico** una vez verificados (regla que definiste tú y que es correcta). Cambiarlos requiere solicitud a soporte con documento probatorio y queda registrado con el documento adjunto. El médico sí edita: nombre de despliegue, foto, biografía, consultorios, precios, horarios, servicios.

**AUTH-RN-005 — Aislamiento del panel admin.** `admin.medicfy.com` en subdominio propio, sin enlaces públicos, MFA obligatorio, sesión de 30 minutos, y allowlist de IP para `SUPERADMIN`.

---

## 6. MODELO DE DATOS

Esquema PostgreSQL. Todas las tablas tienen `id UUID PK DEFAULT gen_random_uuid()`, `created_at`, `updated_at`, y borrado lógico (`deleted_at`) **excepto** las tablas clínicas y de auditoría, que **no admiten borrado de ningún tipo**.

### 6.1 Identidad y cuentas

```
users
  id, email UNIQUE, phone_e164, password_hash (argon2id),
  primary_role, status ENUM(pending_email,active,suspended,deactivated),
  email_verified_at, phone_verified_at,
  mfa_enabled, mfa_secret_encrypted, mfa_backup_codes_hashed[],
  failed_login_attempts, locked_until,
  last_login_at, last_login_ip,
  accepted_terms_version, accepted_privacy_version, accepted_at

user_roles                -- un usuario puede tener varios roles
  user_id FK, role, scope_id (p.ej. clinic_id / lab_id), granted_by, granted_at

consents                  -- LFPDPPP: consentimiento expreso, versionado
  user_id FK, consent_type ENUM(privacy_notice, sensitive_data, telemedicine,
    digital_prescription_channel, marketing),
  document_version, granted BOOLEAN, granted_at, revoked_at,
  ip_address, user_agent, evidence_hash
  -- NUNCA se borra. Revocar = nueva fila con granted=false

sessions
  user_id FK, refresh_token_hash, device_fingerprint, ip, user_agent,
  expires_at, revoked_at
```

### 6.2 Paciente

```
patients
  user_id FK NULLABLE,     -- NULL si fue creado por médico y aún no activa cuenta
  medicfy_id VARCHAR UNIQUE,  -- folio legible: MDF-000123
  first_name, last_name_paternal, last_name_maternal,
  birth_date, sex_at_birth ENUM(F,M), gender_identity NULLABLE,
  curp NULLABLE, blood_type NULLABLE,
  phone_e164, email,
  address_street, address_ext, address_int, address_colonia,
  address_municipality, address_state, address_postal_code,
  emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
  created_by_user_id, source ENUM(self_signup, created_by_doctor)
  -- M5-RN-009 (v2.3): source=self_signup ahora sí crea esta fila en el
  -- mismo momento que auth/register/patient crea el user — antes solo
  -- creaba el user y esta fila quedaba pendiente para siempre.

patient_guardians         -- menores de edad: APROBADO en alcance (pediatría en piloto)
  patient_id FK, guardian_name, guardian_relation ENUM(madre, padre,
    tutor_legal, otro), guardian_curp, guardian_phone_e164, guardian_email,
  guardian_id_document_key,        -- INE del tutor, cifrado
  consent_granted_at, is_primary,
  revoked_at, revoked_reason
  -- Trabajo programado: al cumplir 18 años el paciente, todo acceso del
  -- tutor se revoca automáticamente y se notifica a ambas partes.

patient_allergies         -- crítico para alertas de prescripción
  patient_id FK, substance, reaction, severity ENUM(mild,moderate,severe),
  recorded_by_user_id, recorded_at

patient_chronic_conditions
  patient_id FK, icd10_code, description, diagnosed_date, status, recorded_by

care_relationships        -- ver AUTH-RN-001
  patient_id FK, doctor_id FK,
  status ENUM(active, expired, revoked),
  origin ENUM(appointment, patient_granted, created_by_doctor),
  started_at, last_interaction_at, expires_at, revoked_at, revoked_by
```

### 6.3 Médico

```
doctors
  user_id FK UNIQUE,
  -- INMUTABLES tras verificación (AUTH-RN-004):
  legal_first_name, legal_last_name, professional_license (cédula) UNIQUE,
  specialty_license NULLABLE, primary_specialty_id FK,
  -- EDITABLES:
  display_name, photo_url, biography, secondary_specialties[],
  years_experience, languages[], university,
  verification_status ENUM(draft, submitted, in_review, verified,
    rejected, suspended),
  verification_notes, verified_by_user_id, verified_at,
  accepts_new_patients, subscription_plan, subscription_status

doctor_documents          -- expediente de verificación
  doctor_id FK, doc_type ENUM(cedula_profesional, cedula_especialidad,
    ine, cv, certificado_consejo, comprobante_domicilio),
  file_key, file_hash_sha256, uploaded_at,
  review_status, reviewed_by, reviewed_at, rejection_reason

specialties
  code, name_es, cie_group, is_active, requires_specialty_license

practice_locations        -- consultorios
  doctor_id FK, name, address_*, latitude, longitude,
  phone, is_primary, is_active

doctor_services           -- precios NO públicos (regla de Jorge)
  doctor_id FK, location_id FK NULLABLE,
  service_type ENUM(first_visit, follow_up, teleconsultation, procedure),
  name, duration_minutes, price_mxn, currency,
  price_visibility ENUM(private, shared_on_booking),  -- default: private
  is_active

doctor_posts               -- M2B (v2.2), ver §7 — independiente de doctors,
                            -- NO sujeta a R1 (no es dato clínico): sí admite
                            -- DELETE real por el propio autor.
  doctor_id FK,
  title NULLABLE, body,
  category ENUM(health_education, health_tip, health_fact,
    professional_update, congress, research, certification,
    patient_notice, prevention, lifestyle, video, photo, announcement),
  visibility ENUM(public, patients_only, private),  -- independiente de category
  status ENUM(draft, published, archived),
  published_at NULLABLE, archived_at NULLABLE,
  archived_by_user_id NULLABLE  -- admin que archivó, si no fue el propio autor

doctor_post_media          -- M2B (v2.2)
  post_id FK, media_type ENUM(photo, video), file_key, display_order

doctor_post_likes          -- M2B (v2.3)
  post_id FK, user_id FK,
  UNIQUE(post_id, user_id)  -- M2B-RN-010: un like por usuario por post

doctor_post_comments       -- M2B (v2.3)
  post_id FK, author_user_id FK, body, created_at
  -- M2B-RN-012: sin campo de edición — se borra y se vuelve a escribir.

doctor_education            -- M2 (v2.3)
  doctor_id FK, institution,
  kind ENUM(degree, residency, fellowship, certification),
  start_year, end_year NULLABLE,  -- NULL = en curso
  display_order
```

### 6.4 Agenda y citas

```
availability_rules        -- recurrencia semanal
  doctor_id FK, location_id FK NULLABLE,
  modality ENUM(in_person, online),
  weekday 0..6, start_time, end_time,
  slot_duration_minutes, buffer_minutes,
  valid_from, valid_until, is_active

availability_exceptions   -- bloqueos, vacaciones, días festivos
  doctor_id FK, start_at, end_at, reason, blocks_all_day

appointments
  patient_id FK, doctor_id FK, location_id FK NULLABLE, service_id FK,
  modality ENUM(in_person, online),
  starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  timezone VARCHAR DEFAULT 'America/Mexico_City',
  status ENUM(pending_payment, scheduled, confirmed, in_progress,
    completed, cancelled_by_patient, cancelled_by_doctor, no_show),
  created_by_user_id, created_via ENUM(doctor_panel, assistant,
    patient_link, public_directory),
  price_mxn, payment_id FK NULLABLE,
  video_room_url NULLABLE, video_provider_ref NULLABLE,
  cancellation_reason, cancelled_at, cancelled_by_user_id,
  reminder_24h_sent_at, reminder_2h_sent_at,
  CONSTRAINT no_overlap EXCLUDE USING gist (
    doctor_id WITH =, tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status NOT IN ('cancelled_by_patient','cancelled_by_doctor'))

appointment_status_history  -- append-only
  appointment_id FK, from_status, to_status, changed_by_user_id,
  reason, changed_at
```

> **Nota técnica crítica:** la restricción `EXCLUDE USING gist` es la única forma confiable de impedir doble agendamiento bajo concurrencia. Validarlo solo en la capa de aplicación **fallará** cuando dos pacientes reserven el mismo espacio en el mismo segundo, y este es el bug más caro y más común de las plataformas de citas.

### 6.5 Expediente clínico (NOM-004) — **append-only**

```
clinical_encounters       -- una consulta
  patient_id FK, doctor_id FK, appointment_id FK NULLABLE,
  encounter_type ENUM(first_visit, follow_up, teleconsultation, urgent),
  started_at, ended_at,
  status ENUM(draft, signed),       -- draft solo mientras el médico escribe
  signed_at, signed_by_user_id, signature_method, content_hash_sha256,
  previous_hash_sha256              -- encadenamiento de integridad

clinical_notes            -- estructura NOM-004
  encounter_id FK,
  chief_complaint TEXT,             -- motivo de consulta
  current_illness TEXT,             -- padecimiento actual
  vitals JSONB,                     -- {bp_systolic, bp_diastolic, hr, rr,
                                    --  temp_c, spo2, weight_kg, height_cm, bmi}
  physical_exam TEXT,
  assessment TEXT,                  -- análisis / impresión diagnóstica
  plan TEXT,                        -- plan de manejo
  prognosis TEXT NULLABLE,
  created_at, is_correction_of_note_id FK NULLABLE

  -- NO HAY UPDATE. NO HAY DELETE. Corregir = nueva fila apuntando a la anterior.

encounter_diagnoses
  encounter_id FK, icd10_code, description,
  diagnosis_type ENUM(principal, secondary), certainty ENUM(suspected, confirmed)

clinical_attachments
  patient_id FK, encounter_id FK NULLABLE,
  file_key, file_name, file_hash_sha256, mime_type, size_bytes,
  category ENUM(lab_result, imaging, external_document, photo, other),
  uploaded_by_user_id, uploaded_at, description
```

### 6.6 Receta electrónica

```
prescriptions
  encounter_id FK, patient_id FK, doctor_id FK,
  folio VARCHAR UNIQUE,             -- serie + consecutivo, irrepetible
  issued_at TIMESTAMPTZ,
  -- snapshot inmutable de datos legales al momento de emisión (art.33 RIS):
  doctor_name_snapshot, doctor_license_snapshot,
  doctor_specialty_snapshot, doctor_institution_snapshot,
  practice_address_snapshot,
  patient_name_snapshot, patient_age_snapshot, patient_sex_snapshot,
  diagnosis_snapshot,
  general_instructions TEXT,
  status ENUM(issued, cancelled),   -- NUNCA se borra ni se edita
  cancelled_at, cancellation_reason, replaced_by_prescription_id FK,
  signature_method ENUM(internal_system, advanced_efirma),
  signature_payload_encrypted, signature_timestamp,
  timestamp_authority_response NULLABLE,   -- sello de tiempo
  content_hash_sha256,
  pdf_file_key, qr_verification_token UNIQUE,
  delivered_via[] , delivered_at

prescription_items
  prescription_id FK,
  generic_name NOT NULL,            -- denominación genérica: OBLIGATORIA
  brand_name NULLABLE,
  presentation NOT NULL,            -- p.ej. "tableta 500 mg"
  dose NOT NULL, route NOT NULL, frequency NOT NULL,
  duration NOT NULL, quantity NULLABLE,
  special_instructions,
  medication_catalog_id FK NULLABLE, control_group ENUM(I,II,III,IV,V,VI)

specialty_field_schemas   -- campos clínicos por especialidad, definidos como
                          -- DATOS, no como código. La pantalla se genera sola.
  specialty_id FK, version,
  section ENUM(antecedentes, interrogatorio, exploracion, escalas, seguimiento),
  field_key, label,
  input_type ENUM(number, text, textarea, select, multiselect, boolean,
    date, computed),
  unit, min_value, max_value, options JSONB,
  is_required, display_order, help_text,
  computed_formula NULLABLE,     -- IMC, percentil OMS, FPP, SDG, TFG
  published_at, published_by
  -- v1.0 publica 4 esquemas: medicina general (base), ginecología y
  -- obstetricia, pediatría, medicina interna. Cualquier otra especialidad
  -- usa el esquema base, que ya es NOM-004 completa.

encounter_specialty_data
  encounter_id FK, specialty_schema_version,
  data JSONB                     -- validado contra el esquema al firmar.
                                 -- La versión queda fija: si cambia una guía,
                                 -- las notas viejas conservan su cálculo.

medication_prices         -- prescripción consciente del costo
  medication_catalog_id FK,
  product_type ENUM(patent, generic, similar, institutional),
  brand_name, presentation, price_min_mxn, price_max_mxn,
  price_source, price_updated_at, region, is_active
  -- Orden de presentación por criterio clínico y precio. NUNCA por
  -- acuerdo comercial. Ver M9-RN-015.

medications_catalog
  generic_name, brand_names[], presentations JSONB,
  atc_code, control_group,          -- Grupos I-VI, Ley Gral. de Salud art.226
  is_electronically_prescribable BOOLEAN,   -- false para I y II
  common_doses JSONB, contraindications[], is_active
```

### 6.7 Órdenes de laboratorio

```
lab_orders
  encounter_id FK, patient_id FK, doctor_id FK,
  folio UNIQUE, issued_at,
  clinical_indication TEXT, fasting_required BOOLEAN,
  status ENUM(issued, in_progress, results_uploaded, cancelled),
  assigned_lab_id FK NULLABLE,      -- NULL en MVP: paciente elige
  pdf_file_key, qr_verification_token,
  content_hash_sha256, signature_method, signed_at

lab_order_items
  lab_order_id FK, study_name, loinc_code NULLABLE, notes

lab_results               -- v1.0: sube el médico o el paciente
  lab_order_id FK NULLABLE, patient_id FK,
  uploaded_by_user_id, uploaded_by_role,
  file_key, file_hash_sha256, lab_name, result_date,
  reviewed_by_doctor_id NULLABLE, reviewed_at, doctor_comment

lab_result_analytes        -- Prompt 42A: analitos estructurados, no el PDF
  lab_order_id FK NULLABLE, patient_id FK,
  analyte_name, loinc_code NULLABLE, value, unit,
  reference_min NULLABLE, reference_max NULLABLE, measured_at,
  entered_by_user_id, reviewed_by_doctor_id NULLABLE, reviewed_at,
  source ENUM(manual, ocr_reviewed), lab_name NULLABLE       -- v2.5

-- v2.5 — lectura e interpretación de hojas de laboratorio (4 capas)
lab_sheet_extractions       -- Capa 1: cabecera de una hoja subida
  patient_id FK, uploaded_by_user_id,
  file_key, file_hash_sha256,
  status ENUM(uploading, extracting, review_pending, accepted, failed),
  lab_name_detected NULLABLE, result_date_detected NULLABLE,
  reviewed_at NULLABLE, reviewed_by_user_id NULLABLE

lab_sheet_extraction_candidates   -- Capa 1: un analito candidato, antes de revisión
  extraction_id FK,
  analyte_name_raw, value_raw, unit_raw NULLABLE,
  reference_min_printed NULLABLE, reference_max_printed NULLABLE,
  confidence ENUM(low, medium, high),
  doctor_confirmed_analyte_name NULLABLE, doctor_confirmed_value NULLABLE,
  doctor_confirmed_unit NULLABLE, was_edited BOOLEAN, included BOOLEAN

lab_reference_ranges        -- Capa 2: tabla curada, propia del sistema
  analyte_key, analyte_label, unit,
  sex ENUM(m, f, any), age_min_years, age_max_years,
  value_min, value_max, critical_min NULLABLE, critical_max NULLABLE,
  pending_medical_review BOOLEAN DEFAULT true,
  curated_by_user_id NULLABLE, source TEXT

note_lab_results             -- Capa 3: sección de laboratorio congelada en la nota firmada
  note_id FK, source_analyte_id FK,
  analyte_name, value, unit, reference_min NULLABLE, reference_max NULLABLE,
  range_source ENUM(sheet, system, none),
  status ENUM(normal, low, high, critical, unknown),
  measured_at,                 -- fecha del estudio; sin columna aparte
  lab_name NULLABLE,
  source ENUM(manual, ocr_reviewed)
```

### 6.8 Pagos y suscripciones

```
subscriptions
  user_id FK, plan_code, provider ENUM(stripe, conekta),
  provider_subscription_id, status, current_period_start,
  current_period_end, cancel_at_period_end, trial_ends_at,
  price_mxn, billing_interval

payments
  user_id FK, appointment_id FK NULLABLE, subscription_id FK NULLABLE,
  provider, provider_payment_id, amount_mxn, currency,
  status ENUM(pending, authorized, paid, failed, refunded, partially_refunded),
  payment_method ENUM(card, spei, oxxo),
  paid_at, failed_reason, refund_amount_mxn, refunded_at,
  platform_fee_mxn, doctor_payout_mxn

webhook_events            -- idempotencia: obligatorio
  provider, provider_event_id UNIQUE, event_type,
  payload JSONB, received_at, processed_at, processing_error
```

### 6.9 Notificaciones y auditoría

```
notifications
  user_id FK, channel ENUM(email, whatsapp, sms, push, in_app),
  template_code, payload JSONB,
  status ENUM(queued, sent, delivered, failed, bounced),
  provider_message_id, scheduled_for, sent_at, failed_reason,
  related_entity_type, related_entity_id

notification_preferences
  user_id FK, channel, category, enabled

audit_log                 -- APPEND-ONLY. Sin UPDATE. Sin DELETE.
  actor_user_id, actor_role, impersonated_by_user_id NULLABLE,
  action,                          -- 'clinical_record.read', 'prescription.issue'
  resource_type, resource_id,
  patient_id NULLABLE,             -- indexado: "quién vio a este paciente"
  ip_address, user_agent, request_id,
  justification NULLABLE,          -- obligatorio en break-glass
  result ENUM(success, denied),
  metadata JSONB, occurred_at,
  prev_entry_hash, entry_hash      -- encadenamiento
```

**Retención:** expedientes, recetas, órdenes y auditoría se conservan **mínimo 5 años** desde la última interacción (NOM-004). Una solicitud de supresión de datos personales bajo LFPDPPP **no elimina el expediente clínico**, porque existe obligación legal de conservación; sí anonimiza datos de contacto y marketing. Esto tiene que estar redactado explícitamente en el aviso de privacidad.

---

## 7. MÓDULOS FUNCIONALES

Formato de cada módulo: **Objetivo · Alcance MVP · Reglas de negocio (RN) · Flujo · Validaciones · Permisos · Casos límite · Errores · Dependencias · Criterios de aceptación (CA)**.

Convención de IDs: `M<n>-RN-<nnn>` reglas, `M<n>-CA-<nnn>` criterios de aceptación. Estos IDs deben citarse en los tickets de Jira/Linear y en las pruebas automatizadas.

---

### M1 — IDENTIDAD, CUENTAS Y SESIÓN

**Objetivo.** Permitir registro, verificación y acceso seguro diferenciado por rol, con captura y versionado del consentimiento exigido por LFPDPPP.

**Alcance MVP.** Registro de paciente y de médico. Login con selector de rol. Verificación de email y teléfono. MFA TOTP. Recuperación de contraseña. Invitación de asistente. Registro de laboratorio queda para v1.1.

**Reglas de negocio**

- **M1-RN-001.** Un email identifica una sola cuenta. Un usuario puede tener varios roles, pero no dos cuentas.
- **M1-RN-002.** El registro de médico deja la cuenta en `verification_status = submitted`. **El médico puede entrar y configurar su perfil, pero no puede emitir recetas, órdenes ni notas clínicas hasta estar `verified`.** Esto permite onboarding sin fricción sin comprometer la validación, que es tu diferenciador.
- **M1-RN-003.** El registro de paciente requiere consentimiento **expreso y separado** para: (a) aviso de privacidad, (b) tratamiento de datos personales sensibles de salud, (c) recepción de receta por canal digital. Tres casillas distintas, ninguna premarcada. Cada una genera una fila en `consents` con versión del documento, timestamp, IP y user agent. Sin la (a) y la (b) no hay cuenta; la (c) es opcional pero su ausencia bloquea el envío digital de recetas.
- **M1-RN-004.** El consentimiento es versionado: si cambia el aviso de privacidad, en el siguiente login se solicita reaceptación. El historial nunca se sobrescribe.
- **M1-RN-005.** MFA obligatorio para `DOCTOR`, `ASSISTANT`, `LAB`, `SUPPORT`, `ADMIN`, `SUPERADMIN`. Se fuerza el alta de MFA en el primer login; no se puede posponer más de 3 sesiones.
- **M1-RN-006.** Bloqueo por fuerza bruta: 5 intentos fallidos → bloqueo 15 min con backoff exponencial. El bloqueo se registra en `audit_log`.
- **M1-RN-007.** Token de acceso 15 min, refresh 30 días con rotación. Sesión de médico expira por inactividad a los **30 min** (dato clínico en pantalla en consultorio compartido); paciente a los 7 días.
- **M1-RN-008.** Un médico puede invitar hasta 3 asistentes en MVP. La invitación caduca en 72 h.
- **M1-RN-009.** Cuando un médico crea un paciente que no tiene cuenta, se genera el `patients` sin `user_id`. Si ese paciente después se registra con el mismo email o teléfono, el sistema **propone la vinculación** y requiere confirmación del paciente. Nunca se vincula automáticamente por coincidencia de nombre.

**Flujo — registro de médico**

1. `/registro/profesional` → email, contraseña, nombre legal, cédula profesional, especialidad, teléfono.
2. Verificación de email (código de 6 dígitos, 10 min de vigencia).
3. Alta obligatoria de MFA TOTP con códigos de respaldo descargables.
4. Carga de documentos: cédula profesional, INE, cédula de especialidad si aplica.
5. Estado `submitted` → el admin recibe notificación → revisión (SLA objetivo: 24 h hábiles).
6. `verified` → correo de bienvenida y desbloqueo de funciones clínicas. `rejected` → correo con motivo y posibilidad de corregir.

**Validaciones**

| Campo | Regla | Mensaje de error |
|---|---|---|
| email | RFC 5322, ≤254, normalizado a minúsculas | "Ingresa un correo electrónico válido." |
| password | ≥12 caracteres, no en lista de 10k contraseñas comunes, medidor zxcvbn ≥3 | "Tu contraseña debe tener al menos 12 caracteres y no ser una contraseña común." |
| phone | E.164, prefijo +52, 10 dígitos nacionales | "Ingresa un teléfono a 10 dígitos." |
| cédula profesional | 7–8 dígitos numéricos, **verificación contra el Registro Nacional de Profesionistas (SEP)** | "No encontramos esta cédula en el registro de la SEP. Verifica el número." |
| CURP | 18 caracteres, algoritmo de dígito verificador | "El CURP no es válido." |
| birth_date | Entre hoy−120 años y hoy | "Revisa la fecha de nacimiento." |

**[BLOQUEANTE] Verificación de cédula.** La validación contra el buscador de la SEP no tiene API pública oficial estable. Opciones: (a) scraping del portal — frágil y de legalidad discutible; (b) proveedor comercial de validación de cédulas — costo por consulta, hay varios en México; (c) verificación manual del admin contra el portal — 2 minutos por médico, viable hasta ~200 médicos. **[DECISIÓN POR DEFECTO]: (c) manual en MVP, con (b) evaluado en v1.1.** Necesito que confirmes si aceptas la carga operativa.

**Casos límite**

- Email ya registrado con otro rol → ofrecer añadir rol, no crear cuenta nueva.
- Médico que se registra y también quiere ser paciente → mismo `user`, dos roles, expedientes separados. Un médico **no puede ver su propio expediente desde el rol de médico** ni prescribirse a sí mismo (M1-RN-010: autoprescripción bloqueada).
- Dispositivo perdido con MFA → recuperación solo con código de respaldo o verificación de identidad por soporte con evidencia documental. Registrado en auditoría.
- Cédula duplicada (dos cuentas con la misma cédula) → rechazo duro y alerta a admin: indica suplantación.

**Errores**

| Código | HTTP | Significado |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Mensaje genérico, sin revelar si el email existe |
| `AUTH_ACCOUNT_LOCKED` | 423 | Incluye `retry_after` |
| `AUTH_MFA_REQUIRED` | 428 | Falta segundo factor |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 | |
| `AUTH_CONSENT_REQUIRED` | 451 | Nueva versión de aviso pendiente de aceptar |
| `DOCTOR_NOT_VERIFIED` | 403 | Intentó acción clínica sin verificación |

**Dependencias.** Proveedor de email. Proveedor de SMS/WhatsApp para verificación de teléfono. Documentos legales finales (§3.1).

**Criterios de aceptación**

- **M1-CA-001** Un paciente completa el registro en ≤3 pantallas y ≤90 segundos, con las tres casillas de consentimiento visibles y desmarcadas.
- **M1-CA-002** Existe una fila en `consents` por cada casilla aceptada, con versión del documento e IP.
- **M1-CA-003** Un médico en estado `submitted` que intenta emitir una receta recibe `DOCTOR_NOT_VERIFIED` y un mensaje claro en la interfaz.
- **M1-CA-004** Tras 5 intentos fallidos la cuenta queda bloqueada 15 minutos y hay registro en `audit_log`.
- **M1-CA-005** El médico no puede acceder al panel sin MFA activo después de la tercera sesión.
- **M1-CA-006** La sesión de médico se cierra automáticamente a los 30 minutos de inactividad mostrando un aviso a los 28.
- **M1-CA-007** *(verifica M1-RN-001)* Registrar con un email ya existente devuelve `EMAIL_ALREADY_REGISTERED` (409) y no crea una segunda fila en `users`. Si el email pertenece a una cuenta con otro rol, la respuesta ofrece **añadir el rol a la cuenta existente**, y ese flujo existe y funciona.
- **M1-CA-008** *(verifica M1-RN-003)* Un registro sin `privacyNotice: true` o sin `sensitiveData: true` no crea cuenta ni fila en `consents`.
- **M1-CA-009** *(verifica M1-RN-004)* Si la versión vigente del aviso de privacidad cambia después de que el usuario aceptó una anterior, el siguiente login devuelve `AUTH_CONSENT_REQUIRED` (451) en lugar de tokens.
- **M1-CA-010** *(verifica M1-RN-006)* Un segundo bloqueo de la misma cuenta dura más que el primero (backoff exponencial verificable).
- **M1-CA-011** *(verifica M1-RN-007)* El refresh token de un paciente sobrevive 7 días de inactividad y no más; el del médico, 30 minutos y no más. La rotación invalida el token anterior.
- **M1-CA-012** *(verifica M1-RN-008)* Un cuarto intento de invitación con 3 pendientes devuelve 409 `ASSISTANT_INVITATION_LIMIT_REACHED`; una invitación caduca a las 72 h.
- **M1-CA-013** *(verifica M1-RN-009)* Un paciente que se registra con el mismo email o teléfono de un `patients` sin `user_id` recibe una **propuesta** de vinculación que exige su confirmación. La coincidencia de nombre nunca vincula.

---

### M2 — PERFIL MÉDICO Y VERIFICACIÓN

**Objetivo.** Construir y sostener la credibilidad que es el diferenciador central de Medicfy.

**Alcance MVP.** Perfil editable, consultorios, servicios y precios privados, expediente de verificación, flujo de revisión por admin, sello visible de médico verificado.

**Reglas de negocio**

- **M2-RN-001.** Campos inmutables tras verificación: nombre legal, cédula profesional, cédula de especialidad, especialidad principal (AUTH-RN-004).
- **M2-RN-002.** Un médico sin `primary_specialty` verificada aparece como "Medicina General" y no puede publicarse como especialista. Reclamar especialidad exige cédula de especialidad o constancia de consejo.
- **M2-RN-003.** **Precios privados por defecto** (tu regla). El precio no se muestra en el directorio público. Se revela al paciente en el momento de agendar y en el mensaje de confirmación. El campo `price_visibility` permite abrir esto por médico si más adelante decides probar transparencia.
- **M2-RN-004.** El médico debe tener al menos un `practice_location` activo o habilitar teleconsulta para poder recibir citas.
- **M2-RN-005.** Suspensión: un admin puede suspender a un médico. Al suspenderse, sus citas futuras se marcan para reagenda y se notifica a los pacientes afectados con 100% de reembolso. **Sus expedientes no se borran ni se ocultan a los pacientes.**
- **M2-RN-006.** El sello "Médico verificado" solo se muestra con `verification_status = verified` y documentos vigentes. La cédula de especialidad con fecha de vencimiento (recertificación de consejo) dispara recordatorio a 60 días y degradación del sello al vencer.

**Validaciones.** Foto: JPG/PNG/WebP, ≤5 MB, ≥400×400 px, detección de rostro obligatoria (evita logotipos y fotos genéricas). Biografía: 50–2,000 caracteres, filtro de datos de contacto (evita que el médico ponga su teléfono para saltarse la plataforma). Precio: 1–99,999 MXN. Documentos: PDF/JPG/PNG, ≤10 MB, hash SHA-256 almacenado.

**Permisos.** Médico edita lo suyo. Asistente ve pero no edita perfil profesional; sí edita horarios y consultorios. Admin edita todo y es el único que verifica.

**Casos límite**

- Médico con dos especialidades y dos consultorios con precios distintos → soportado por `doctor_services` ligado a `location_id`.
- Médico que sube documento ilegible → rechazo con motivo tipificado y reintento sin reiniciar el registro.
- Médico que renuncia y quiere borrar su cuenta → se desactiva el perfil público, **los expedientes permanecen accesibles a los pacientes y a Medicfy por obligación de conservación de 5 años**. Esto debe estar en el contrato del médico, porque es la pregunta que todo médico hace.
- Cédula suspendida por autoridad → proceso manual de suspensión; no hay fuente automatizada.

**Criterios de aceptación**

- **M2-CA-001** El precio de consulta no aparece en ninguna respuesta de API pública ni en el HTML del directorio.
- **M2-CA-002** Un médico no puede modificar ninguno de los cuatro campos inmutables — nombre legal, cédula profesional, cédula de especialidad y especialidad principal — desde ninguna interfaz mientras esté **verificado, en revisión (`in_review`) o suspendido (`suspended`)**; cada intento por API devuelve 403 y se registra. **En `draft`, `submitted` o `rejected`** sí puede corregirlos. *(Adición v2.1, no estaba en la v2.0: corregir un campo legal estando en `submitted` devuelve el expediente a `draft` y lo registra en `audit_log`, para que el admin no revise contra datos que cambiaron bajo sus pies. Adición v2.1.1: `rejected` se incorpora a los estados corregibles, con el mismo efecto de reversión a `draft` — el motivo más común de rechazo es un campo legal mal capturado, y sin ruta de corrección el flujo de rechazo no tiene salida.)*
- **M2-CA-003** El admin ve una cola de verificación con documentos, hash y botones aprobar/rechazar con motivo obligatorio.
- **M2-CA-004** Al suspender un médico, todos sus pacientes con cita futura reciben notificación en ≤5 min y se generan los reembolsos.
- **M2-CA-005** *(verifica M2-RN-002)* Un médico que reclama una especialidad sin cédula de especialidad aprobada se presenta públicamente como "Medicina General". Existe un flujo explícito de reclamo de especialidad que exige el documento y pasa por revisión de admin.
- **M2-CA-006** *(verifica M2-RN-004)* Un médico sin `practice_location` activo y sin teleconsulta habilitada no aparece como disponible y no puede recibir citas.
- **M2-CA-007** *(verifica M2-RN-005)* Tras suspender a un médico, su perfil, sus documentos y **los expedientes de sus pacientes** siguen existiendo y siendo accesibles para esos pacientes. Nada se borra ni se oculta.
- **M2-CA-008** *(verifica M2-RN-006)* El sello de verificado es `false` en cualquier estado distinto de `verified`. Una cédula de especialidad con vencimiento registrado dispara recordatorio a 60 días y degrada el sello al vencer.

**Defecto de la v2.0, corregido aquí.** El inventario de endpoints (§8.1) asignaba `GET/POST /patients` al módulo M2, pero el alcance narrado de M2 nunca mencionaba pacientes. La contradicción era real.

**Resolución adoptada en v2.1:** la tabla `patients` (§6.2) y los endpoints `GET/POST /patients` no pertenecen a M2. Se construyen como bloque inicial de M5 (Citas), que es el primer módulo que realmente los necesita — M4 gestiona disponibilidad del médico y no requiere pacientes. El inventario §8.1 queda corregido para reflejarlo. M2 no se reabre.

- **M2-CA-009** *(reasignado a M5)* Un médico crea un paciente sin cuenta de usuario, queda con `medicfy_id` legible y `source = created_by_doctor`, y se genera automáticamente el `care_relationship` correspondiente. Se verifica al cerrar M5.

#### Formación académica de varias instituciones *(agregado v2.3)*

**Origen.** La referencia visual del fundador mostraba varias entradas (título, residencia, fellowship) en vez del campo único `university` que M2 ya tiene. Confirmado como pedido explícito, no como algo inferido.

- **M2-RN-007** *(v2.3)*. `doctor_education` es una tabla independiente, muchas filas por médico: institución, tipo (`degree` | `residency` | `fellowship` | `certification` — catálogo cerrado, sin texto libre para el tipo), año de inicio, año de fin (nullable — en curso), orden de despliegue.
- **M2-RN-008** *(v2.3)*. El campo `university` original de `doctors` **no se elimina** (evita una migración de datos destructiva) pero deja de ser lo único que se muestra: si el médico tiene entradas en `doctor_education`, esas reemplazan al chip único en el perfil público; si no tiene ninguna, se sigue mostrando `university` como hoy.

**Permisos.** El propio médico administra sus entradas (crear/editar/borrar/reordenar) — mismo criterio de "el médico sí edita" que el resto de M2's campos editables (AUTH-RN-004).

**Criterios de aceptación**

- **M2-CA-010** *(v2.3)* Un médico con entradas en `doctor_education` las ve, en el orden que definió, en su perfil público — nunca inventadas ni completadas automáticamente.
- **M2-CA-011** *(v2.3)* Un médico sin ninguna entrada sigue mostrando su `university` como antes — no aparece una sección vacía.

---

### M2B — PUBLICACIONES DEL MÉDICO Y CONTROL DE AUDIENCIA *(agregado v2.2)*

**Origen.** Pedido directo del fundador en conversación, 1 septiembre 2026: que el perfil del médico funcione también como un espacio de publicación continua (fotos, avisos, educación en salud, actividad profesional), con una audiencia elegible por publicación. Se verificó contra §1.3/§2.2: el MVP excluye a propósito **M3 — directorio con búsqueda y reseñas**, por el riesgo de competir con Doctoralia en efecto de red antes de tener densidad de médicos. Se confirmó con el fundador que este módulo es una cosa distinta: publicar contenido en el perfil de un médico que un paciente **ya visitó** no ayuda a nadie a *descubrir* médicos nuevos, así que no reabre ese riesgo. M3 (búsqueda + reseñas) sigue fuera del MVP.

**Objetivo.** Que el perfil del médico deje de ser solo una ficha estática y se convierta en un espacio donde el médico comparte contenido de forma continua, con control real — no cosmético — de quién puede verlo.

**Alcance de esta versión.** Publicaciones de texto + medios (foto/video), con tres audiencias (`public`, `patients_only`, `private`) y tres estados (`draft`, `published`, `archived`), gestionadas desde el panel privado del médico y mostradas en su perfil público existente (M5, `/dr/{slug}`). **Ampliado en v2.3** (ver M2B-RN-010 a M2B-RN-013 abajo) con reacciones (like) y comentarios — el fundador los pidió explícitamente al mostrar una referencia visual con ambos. **Sigue explícitamente fuera de esta versión:** seguir médicos, guardar publicaciones, notificaciones de nuevas publicaciones, feed personalizado entre médicos, cola de moderación con revisión editorial, y la visibilidad **del perfil completo** (público/limitado/privado-para-pacientes que pidió el fundador como sistema aparte de la audiencia por publicación) — esa última queda pendiente de alcance propio si se decide construir; hoy el perfil público (M5) sigue mostrando siempre los mismos campos ya definidos ahí.

**Reglas de negocio**

- **M2B-RN-001.** `doctor_posts` es una entidad independiente de `doctors`, no un campo del perfil. Cada publicación tiene, en ejes independientes entre sí: `category` (de qué trata), `visibility` (quién puede verla) y `status` (en qué momento de su ciclo de vida está). Cualquier combinación de los tres es válida — por ejemplo `category=patient_notice` con `visibility=public` es una combinación legítima (un aviso que el médico decide hacer público), igual que `category=health_tip` con `visibility=patients_only`.
- **M2B-RN-002 — Audiencia, autorizada en backend, nunca en frontend.**
  - `public`: visible para cualquiera, autenticado o no, únicamente si `status=published`. Se sirve por `GET /doctors/{slug}/public/posts`, la misma familia de rutas públicas de M5.
  - `patients_only`: visible únicamente a un usuario autenticado con `care_relationship` **activo** con ese médico (misma regla que AUTH-RN-001, sin excepción ni caso especial). El backend nunca descarga la publicación al cliente para luego ocultarla con CSS o JavaScript: si no hay vínculo activo, el endpoint responde 403 y el cuerpo no contiene la publicación.
  - `private`: visible únicamente para el propio médico autor.
  - **Nota de arquitectura, importante:** hoy no existe ningún portal ni sesión de paciente en el frontend (se verificó explícitamente esta sesión — los pacientes son registros que administra el médico, casi ninguno tiene cuenta propia, y no hay una sola pantalla donde un paciente inicie sesión). Esta versión construye la autorización de `patients_only` completa y correcta en el backend, y el médico ya puede crear, publicar y administrar estas publicaciones desde su panel — pero **no existe todavía ningún visitante real que pueda autenticarse como paciente y verlas**. `GET /doctors/{id}/posts/patients-only` es correcto y probado, sin consumidor real hasta que exista un portal de pacientes, que es un módulo propio, no construido aquí.
- **M2B-RN-003 — Ciclo de vida.** `draft` (visible solo al autor, en cualquier audiencia) → `published` (visible según `visibility`, fija `published_at`) → `archived` (deja de aparecer en cualquier respuesta pública o de pacientes, pero el autor sigue consultándola; fija `archived_at` y, si fue un admin quien archivó, `archived_by_user_id`). A diferencia de las tablas clínicas (R1, CLAUDE.md §2), una publicación **no es dato clínico** y sí admite `DELETE` real por su propio autor — archivar y borrar son dos acciones distintas, ambas disponibles.
- **M2B-RN-004.** `category` es un catálogo cerrado de 13 valores fijos (ver §6.3) y es independiente de `visibility` — cambiar la categoría de una publicación nunca cambia quién puede verla, y viceversa.
- **M2B-RN-005 — Medios.** Cada publicación admite cero o más archivos en `doctor_post_media` (foto o video), con orden de despliegue explícito. Se sirven por el mismo `FILE_STORAGE_PORT` que ya usan `doctor_documents` y los assets de marca — no se integra un proveedor de almacenamiento nuevo. Imagen: JPG/PNG/WebP, ≤5 MB (mismo límite que la foto de perfil de M2, sin la exigencia de detección de rostro). **Video: formato y límite de tamaño `PENDIENTE(jorge)` — no hay cifra definida en la documentación existente y no se inventa aquí.** Mientras no se decida, el límite aplicado es el mismo de 5 MB que una imagen, lo cual en la práctica bloqueará casi cualquier video real; es una salvaguarda intencional, no el límite final.
- **M2B-RN-006 — Aviso educativo.** Toda publicación cuya `category` sea `health_education`, `health_tip`, `health_fact`, `prevention` o `lifestyle` se renderiza siempre con el aviso fijo, no editable por el médico: *"Información general con fines educativos. No sustituye una valoración médica individual."*
- **M2B-RN-007 — Datos clínicos identificables, prohibidos.** Una publicación no debe incluir información clínica identificable de un paciente (nombre, fotografía reconocible, resultado, historia clínica) sin un proceso de consentimiento específico, que **no existe todavía** en la plataforma. Esta regla no se puede hacer cumplir automáticamente en esta versión (exigiría moderación de contenido con IA, fuera de alcance) — es una responsabilidad contractual del médico, respaldada por la moderación mínima de M2B-RN-008.
- **M2B-RN-008 — Moderación mínima.** Un `ADMIN` puede archivar cualquier publicación de cualquier médico (`POST /admin/doctor-posts/{id}/archive`), auditado igual que el resto de acciones de admin. No existe cola de revisión editorial ni moderación automática en esta versión — se documenta como diferido, no se construye un panel de moderación completo.
- **M2B-RN-009 — Asistente y suspensión.** `ASSISTANT` no gestiona publicaciones (no las crea, edita, publica ni archiva) — mismo criterio que M2 ya aplica a "perfil profesional": el asistente administra agenda y consultorios, no la imagen profesional del médico. Un médico con `verification_status = suspended` no puede crear ni publicar contenido nuevo (mismo bloqueo que el resto de escritura de perfil bajo M2-RN-005); sus publicaciones `public` ya publicadas antes de la suspensión permanecen visibles, sin ocultarse — mismo espíritu que M2-CA-007.
- **M2B-RN-010 — Reacciones (like), agregado v2.3.** Cualquier usuario autenticado que **puede ver** la publicación (misma autorización de M2B-RN-002 — un `patients_only` exige el mismo `care_relationship` que verla) puede marcarla con like. Único por `(post, usuario)` — no se puede duplicar. Quitar el like es una acción real (borra la fila), no un contador que solo baja visualmente.
- **M2B-RN-011 — Comentarios, agregado v2.3.** Mismo criterio de autorización que el like: solo quien puede ver la publicación puede comentarla, y solo si está `published` (nunca en `draft` ni `archived`). Texto libre acotado (ver Validaciones). No hay edición de comentarios en esta versión — se borra y se vuelve a escribir.
- **M2B-RN-012 — Borrado de comentarios, agregado v2.3.** Tres roles pueden borrar un comentario: su propio autor, el autor de la publicación donde vive (moderación del médico sobre su propio espacio), y un `ADMIN`. Nadie más.
- **M2B-RN-013 — Datos clínicos identificables en comentarios, agregado v2.3.** Mismo límite reconocido en M2B-RN-007: no se puede impedir automáticamente que un comentario describa un caso clínico identificable. La salvaguarda real es M2B-RN-012 — cualquiera de los tres roles autorizados puede borrarlo.

**Validaciones.** `title`: opcional, máximo 200 caracteres. `body` de la publicación: 1–5,000 caracteres. Máximo 10 archivos de media por publicación. `body` de un comentario: 1–500 caracteres *(v2.3)*.

**Permisos.** Médico gestiona (crea/edita/publica/archiva/borra) únicamente sus propias publicaciones. Asistente no gestiona publicaciones. Admin solo puede archivar, nunca editar el contenido de una publicación ajena. Paciente (con su portal, M5b) ve `public` siempre, y `patients_only` solo con vínculo activo con ese médico. Like/comentario *(v2.3)*: cualquier usuario autenticado que puede ver la publicación; borrado de un comentario: su autor, el autor de la publicación, o un admin.

**Casos límite**

- Publicación cambiada de `public` a `private` después de haber sido compartida por enlace directo → deja de responder de inmediato en la ruta pública; la autorización se evalúa en cada lectura, nunca desde una copia cacheada.
- Publicación con `visibility=patients_only` de un médico que todavía no tiene ningún paciente vinculado → se guarda con normalidad, simplemente no la ve nadie todavía. No es un error.
- Médico verificado que además tiene publicaciones `patients_only` y es suspendido → las públicas quedan visibles (ver M2B-RN-009); las `patients_only` y `private` no se tocan, siguen existiendo para cuando se reactive.

**Criterios de aceptación**

- **M2B-CA-001** Una publicación con `visibility=private` no aparece en ninguna respuesta de ningún endpoint salvo al propio autor autenticado.
- **M2B-CA-002** Una publicación con `visibility=patients_only` nunca aparece en `GET /doctors/{slug}/public/posts`; solo es alcanzable por `GET /doctors/{id}/posts/patients-only`, que devuelve 403 sin `care_relationship` activo — probado con un usuario autenticado sin vínculo.
- **M2B-CA-003** Cambiar la audiencia de una publicación de `public` a `private` la retira de inmediato de la respuesta pública, sin necesitar purgar ningún caché.
- **M2B-CA-004** Una publicación en estado `draft` no aparece en ninguna respuesta salvo al autor, sin importar su `visibility`.
- **M2B-CA-005** Una publicación en estado `archived` no aparece en ninguna respuesta pública ni de pacientes; el autor sigue pudiendo consultarla.
- **M2B-CA-006** Toda publicación con categoría educativa (`health_education`, `health_tip`, `health_fact`, `prevention`, `lifestyle`) se renderiza siempre junto con el aviso de M2B-RN-006.
- **M2B-CA-007** Un `ADMIN` puede archivar la publicación de cualquier médico, queda auditado, y ningún rol distinto del autor puede archivar o editar la publicación de otro médico (prueba negativa: un segundo médico intenta archivar la publicación del primero → 403).
- **M2B-CA-008** Un médico `suspended` no puede crear ni publicar contenido nuevo (403); sus publicaciones `public` previamente publicadas siguen respondiendo con normalidad en la ruta pública.
- **M2B-CA-009** *(v2.3)* Un usuario sin autorización para ver una publicación `patients_only` tampoco puede darle like ni comentarla (403 en ambos casos, mismo criterio que M2B-CA-002).
- **M2B-CA-010** *(v2.3)* Dar like dos veces al mismo post por el mismo usuario no duplica la fila ni el conteo.
- **M2B-CA-011** *(v2.3)* El autor de un comentario puede borrarlo; cualquier otro usuario que no sea el autor del comentario, el autor de la publicación, ni un admin, recibe 403 al intentarlo.
- **M2B-CA-012** *(v2.3)* El autor de la publicación puede borrar un comentario ajeno hecho en ella, aunque no sea el autor de ese comentario.
- **M2B-CA-013** *(v2.3)* No se puede comentar ni dar like en una publicación `draft` o `archived`.

---

### M3 — DIRECTORIO Y BÚSQUEDA DE MÉDICOS *(agregado v2.3)*

**Origen.** El fundador pidió una referencia visual ("MedNetwork") con barra de búsqueda de profesionales y navegación por especialidad en el propio perfil público del médico. Se le señaló que esto es exactamente el M3 que §1.3/§2.2 excluyen a propósito del MVP — *"la recomendación más importante de este documento"*, para no competir con Doctoralia en efecto de red antes de tener densidad de médicos. El fundador confirmó explícitamente que quiere construirlo de todas formas, con esa advertencia ya sobre la mesa. Esta sección documenta esa decisión consciente, no una que el agente de código haya tomado por su cuenta.

**Objetivo.** Que un visitante encuentre médicos por nombre o especialidad sin conocer de antemano el enlace `/dr/{slug}` de ninguno.

**Alcance de esta versión.** Un endpoint público de búsqueda/listado y una pantalla que lo consume. **Explícitamente fuera de esta versión** (nadie los pidió — construirlos sería inventar, CLAUDE.md §7): reseñas y calificaciones de pacientes (siguen excluidas en §2.2), cualquier algoritmo de "relevancia" u orden patrocinado, geolocalización ("cerca de mí" con coordenadas+radio — no hay infraestructura de geocodificación), publicidad o promoción pagada de perfiles.

**Reglas de negocio**

- **M3-RN-001.** Solo aparecen médicos con `verification_status` distinto de `draft`/`rejected`/`suspended` — mismo umbral que ya protege el resto de vistas públicas del médico (M2/M5).
- **M3-RN-002.** `q` (un solo cuadro de búsqueda, sin pedirle al usuario distinguir "nombre" de "especialidad") hace coincidencia de texto simple contra el nombre de despliegue **o** el nombre de la especialidad (`specialties.name_es`) — nunca contra el nombre legal. `specialty` es un segundo filtro independiente, por código exacto del catálogo cerrado, para cuando el cliente ya sabe cuál quiere (p. ej. las tarjetas de "explora por especialidad"). Sin motor de texto libre difuso inventado en ninguno de los dos. **No existe búsqueda por síntoma** ("dolor de rodilla" → especialidad): mapear un síntoma a una especialidad es un juicio clínico, y CLAUDE.md prohíbe inventar reglas clínicas sin que un médico las valide — queda `PENDIENTE(jorge)`.
- **M3-RN-003.** El orden de resultados es determinista y explicable: alfabético por `displayName`, o por estado de verificación primero — nunca un "score de relevancia" no auditable.
- **M3-RN-004.** Los campos devueltos son exactamente los de `toPublicDoctorView` (`doctor-public-view.ts`) — nunca precio (M2-RN-003/M2-CA-001), nunca un campo nuevo inventado para esta pantalla.
- **M3-RN-005.** Paginación por cursor, máximo 50 resultados por página — misma regla transversal que el resto de la API (§8, "Reglas transversales").
- **M3-RN-006** *(v2.4)*. Filtros adicionales, todos sobre datos que YA existen (ninguno inventa un campo nuevo): `teleconsultation` (`acceptsTeleconsultation`), `acceptsNewPatients`, `language` (contra `doctors.languages[]`), `location` (coincidencia de texto simple contra `addressMunicipality`/`addressState` de los `practice_locations` **activos** del médico — no geolocalización, no distancia). Subespecialidad y hospital/institución **no son filtros de esta versión**: ese dato no existe en el modelo (`doctors` no tiene esos campos) — filtrar por algo que no se captura sería fingir precisión que no hay.

**Validaciones.** `q` (nombre): 0–120 caracteres. `specialty`: debe existir en el catálogo activo o se ignora (nunca error 500 por un código desconocido). `location`: 0–120 caracteres, comparación insensible a mayúsculas/acentos.

**Permisos.** Público, sin autenticación — mismo nivel que `/doctors/{slug}/public`.

**Criterios de aceptación**

- **M3-CA-001** El precio no aparece en ninguna respuesta de búsqueda (re-verificación de M2-CA-001 en una superficie nueva).
- **M3-CA-002** Un médico `draft`, `rejected` o `suspended` no aparece en los resultados.
- **M3-CA-003** Buscar por un código de especialidad inexistente no produce error 500 — regresa lista vacía o ignora el filtro.
- **M3-CA-004** Paginar con cursor no repite ni omite médicos entre páginas consecutivas.
- **M3-CA-005** *(v2.4)* Filtrar por `teleconsultation=true` excluye a un médico con `acceptsTeleconsultation=false`; filtrar por `location=` excluye a un médico sin ningún `practice_location` activo que coincida.

#### Home de descubrimiento del paciente y "tus médicos" *(agregado v2.4)*

**Origen.** El fundador pidió reemplazar la pantalla raíz (`/`) — hasta ahora la página de reclutamiento de médicos (PUB-01, construida alrededor de §1.3: "véndele al médico") — por un marketplace de descubrimiento orientado a pacientes. Decisión explícita del fundador, confirmada tras señalarle el conflicto: la página de reclutamiento **se conserva íntegra**, movida a `/para-medicos`, no se descarta.

- **M3-RN-007** *(v2.4)*. Nuevo `GET /patients/me/doctors` (PATIENT) — médicos con `care_relationship` activo con el paciente autenticado, para la sección "Tus médicos" y para armar el feed de publicaciones de sus médicos en el cliente (reutiliza `GET /doctors/{slug}/public/posts` y `GET /doctors/{id}/posts/patients-only` por cada médico vinculado — no se crea un endpoint de feed agregado nuevo en el servidor en esta versión).
- **M3-CA-006** *(v2.4)* Un paciente sin ningún `care_relationship` activo recibe una lista vacía de `/patients/me/doctors`, nunca un error.

---

### M4 — AGENDA Y DISPONIBILIDAD

**Objetivo.** Que el médico gestione su tiempo con menos fricción que en su agenda de papel. Si esto falla, no hay adopción.

**Alcance MVP.** Reglas de disponibilidad recurrentes por consultorio y modalidad, excepciones y bloqueos, vista día/semana, generación de espacios disponibles.

**Reglas de negocio**

- **M4-RN-001.** Todos los tiempos se almacenan en **UTC** (`TIMESTAMPTZ`) y se presentan en `America/Mexico_City`. **Ningún cálculo de horario se hace en el navegador.**
- **M4-RN-002.** Los espacios se **calculan**, no se almacenan: `availability_rules` − `availability_exceptions` − `appointments` activas − `buffer_minutes`. Materializar espacios genera inconsistencias imposibles de depurar.
- **M4-RN-003.** Duración del espacio = duración del servicio, no un valor fijo global. Una primera vez de 40 min y un seguimiento de 20 min conviven en el mismo día.
- **M4-RN-004.** Reglas solapadas del mismo médico y modalidad → rechazo al guardar con indicación del conflicto.
- **M4-RN-005.** Antelación mínima configurable por médico (por defecto **2 horas**) y ventana máxima de agenda (por defecto **90 días**).
- **M4-RN-006.** Al crear una excepción que invalida citas ya agendadas, el sistema **no las cancela en silencio**: lista las citas afectadas y exige que el médico decida cancelar-con-reembolso o reagendar, una por una.
- **M4-RN-007.** Horario de verano: México no aplica DST desde 2022, pero la librería de zonas horarias debe usarse igualmente (IANA `America/Mexico_City`), nunca offsets fijos.

**Validaciones.** `start_time < end_time`. Duración de espacio 5–240 min. Buffer 0–60 min. Bloqueo máximo 365 días.

**Casos límite**

- Dos pacientes reservan el mismo espacio simultáneamente → resuelto por la restricción `EXCLUDE` de §6.4; el segundo recibe `SLOT_TAKEN` y ve la agenda recargada.
- Médico que atiende en dos consultorios el mismo día con 45 min de traslado → `buffer_minutes` por regla y validación de que no haya citas presenciales en ubicaciones distintas dentro del buffer.
- Cita que cruza medianoche → prohibida en MVP.
- Médico que borra una regla con citas futuras → mismo tratamiento que M4-RN-006.

**Criterios de aceptación**

- **M4-CA-001** Prueba de concurrencia: 50 solicitudes paralelas por el mismo espacio → exactamente 1 éxito, 49 `SLOT_TAKEN`.
- **M4-CA-002** El médico configura una semana típica en ≤3 minutos.
- **M4-CA-003** Un bloqueo por vacaciones nunca cancela citas sin decisión explícita del médico.
- **M4-CA-004** Los espacios mostrados al paciente respetan antelación mínima y buffers.

---

### M5 — CITAS

**Objetivo.** Agendar, confirmar, recordar, reagendar, cancelar y cerrar citas sin ambigüedad de estado.

**Alcance MVP.** Creación por médico/asistente, creación por paciente vía **enlace de agendamiento del médico** (`medicfy.com/dr/{slug}`), reagenda, cancelación con política, no-show, recordatorios.

**Máquina de estados** — ninguna transición fuera de esta tabla es válida:

```
pending_payment ──pago confirmado──> scheduled
pending_payment ──30 min sin pago──> cancelled_by_patient (auto, libera espacio)
scheduled ──paciente/médico confirma──> confirmed
scheduled|confirmed ──inicia consulta──> in_progress
in_progress ──médico firma nota──> completed
scheduled|confirmed ──cancela paciente──> cancelled_by_patient
scheduled|confirmed ──cancela médico──> cancelled_by_doctor
scheduled|confirmed ──60 min tras hora de fin sin inicio──> no_show
completed ──> [terminal]
cancelled_* ──> [terminal]
```

**Reglas de negocio**

- **M5-RN-001.** Toda transición se registra en `appointment_status_history` con actor y motivo. Sin excepciones.
- **M5-RN-002.** Política de cancelación por defecto: paciente cancela con **>24 h** → reembolso 100%; **2–24 h** → 50%; **<2 h o no-show** → 0%. Configurable por médico. **La política vigente se muestra al paciente antes de pagar y se guarda como snapshot en la cita** (si el médico la cambia después, aplica la que el paciente aceptó).
- **M5-RN-003.** Cancelación por el médico → siempre reembolso 100% y notificación inmediata, sin importar la antelación.
- **M5-RN-004.** Reagenda = cancelación + nueva cita ligada por `rescheduled_from_id`, conservando el pago. Máximo 2 reagendas por cita.
- **M5-RN-005.** Recordatorios: 24 h antes y 2 h antes. Para teleconsulta, el de 2 h incluye el enlace de video. Idempotentes (los campos `reminder_*_sent_at` impiden duplicados).
- **M5-RN-006.** Una cita solo pasa a `completed` cuando existe una nota clínica firmada. **Esto es deliberado:** fuerza la disciplina de expediente y es lo que hace defendible el sistema en auditoría. Excepción: el médico puede cerrar como `completed` marcando "consulta sin nota" con justificación, que queda en auditoría y genera reporte de calidad.
- **M5-RN-007.** El enlace público del médico (`/dr/{slug}`) muestra especialidad, foto, biografía, ubicaciones y **espacios disponibles**, nunca precio hasta el paso de pago (M2-RN-003).
- **M5-RN-008.** Paciente sin cuenta que agenda por enlace → registro mínimo (nombre, teléfono, email, fecha de nacimiento) + consentimientos. Sin cuenta no hay cita, porque no hay consentimiento válido para tratar datos de salud.

**Casos límite**

- Paciente que agenda dos citas con dos médicos en horario solapado → permitido con advertencia (puede ser un familiar gestionando).
- Paciente que agenda dos veces con el mismo médico el mismo día → bloqueado, probable error.
- **Menor de edad: DENTRO DEL ALCANCE (decidido).** Pediatría está en el piloto, así que no es opcional. Si `birth_date` implica <18 años, se exige registro de tutor completo (`patient_guardians`) y el consentimiento para tratamiento de datos sensibles lo otorga el tutor con registro de su identidad. El tutor accede al expediente del menor mediante vínculo `guardianship` explícito y auditado. **Al cumplir 18 años, el acceso del tutor se revoca automáticamente por trabajo programado y se notifica a ambos**; el paciente decide si lo reactiva. Costo: +1 semana, ya incluido en el cronograma de §12.2.
- Falla del proveedor de pago tras cobrar pero antes del webhook → resuelto por reconciliación (§7.6).
- Zona horaria: paciente en Tijuana agendando con médico en Guadalajara → ambos ven su hora local, se almacena UTC, el correo indica ambas.

**Errores.** `SLOT_TAKEN` (409), `SLOT_TOO_SOON` (422), `OUTSIDE_BOOKING_WINDOW` (422), `DOCTOR_NOT_ACCEPTING_PATIENTS` (403), `MAX_RESCHEDULES_REACHED` (422), `CANCELLATION_WINDOW_CLOSED` (422).

**Criterios de aceptación**

- **M5-CA-001** Toda transición de estado inválida devuelve 409 y no modifica la cita.
- **M5-CA-002** Una cita sin pago confirmado libera su espacio a los 30 minutos exactos.
- **M5-CA-003** El paciente ve y acepta la política de cancelación antes de pagar, y esa versión queda almacenada en la cita.
- **M5-CA-004** Los recordatorios se envían una sola vez incluso si el worker se reintenta.
- **M5-CA-005** Un paciente nuevo agenda desde el enlace del médico en ≤4 pantallas.

#### Completando M5-RN-007/M5-RN-008 — identidad de paciente y agendamiento público real *(v2.3)*

**Origen.** M5-RN-007 y M5-RN-008 ya describían esto desde la v2.0/v2.1 —*"paciente sin cuenta que agenda por enlace"*, *"nunca precio hasta el paso de pago"*— pero nunca se implementó de punta a punta: hoy `POST /appointments` exige `JwtAuthGuard` + rol médico/asistente (`SchedulingAuthService.resolveActingDoctor`), y no existe ninguna pantalla de registro/login de paciente en el frontend. Esta sub-sección no abre un módulo nuevo — cierra el que ya estaba escrito, con las reglas de seguridad que faltaban especificar.

**Reglas de negocio**

- **M5-RN-009** *(v2.3)*. El registro mínimo de M5-RN-008 crea una cuenta real (`users`, rol `PATIENT`) **y** su fila `patients` en la misma operación — hoy `POST /auth/register/patient` solo crea la primera; es el hueco que cierra esta versión.
- **M5-RN-010** *(v2.3, regla de seguridad — no se puede relajar)*. En la ruta de agendamiento iniciada por el paciente, el `patient_id` de la cita se resuelve **siempre en el servidor** a partir del usuario autenticado (`patients.user_id = usuario del token`), nunca de un campo del cuerpo de la petición. Motivo: `appointment-state-machine.service.ts` documenta un IDOR real, ya cerrado, donde la ruta del médico creaba un `care_relationship` desde cualquier `patientId` del body — aceptar un `patientId` de cliente en la ruta del paciente reabriría el mismo patrón desde el otro lado.
- **M5-RN-011** *(v2.3)*. Esta ruta, a diferencia de la del médico (que solo renueva un vínculo ya existente, ver el hallazgo de Bloque 0 citado arriba), sí puede **crear** el `care_relationship` desde cero, con `origin = appointment` — es exactamente el caso para el que ese valor de origen se reservó.
- **M5-RN-012** *(v2.3)*. Sin pasarela de pago: **[DECISIÓN POR DEFECTO], reafirmada]** M6-RN-006 ya estableció que el cobro de la consulta ocurre fuera de la plataforma. "El paso de pago" de M5-RN-007 es, en esta versión, la reserva del espacio en `pending_payment` — el médico confirma el pago manualmente, igual que ya hace hoy con una cita creada por él mismo.

**Criterios de aceptación**

- **M5-CA-006** *(v2.3)* Un paciente autenticado agenda un espacio real desde `/dr/{slug}` y la cita aparece en la agenda del médico con `created_via = patient_link` y el `care_relationship` correspondiente creado con `origin = appointment`.
- **M5-CA-007** *(v2.3, prueba de seguridad)* Enviar un `patientId` distinto al del usuario autenticado en el cuerpo de la petición no tiene efecto — la cita se crea siempre a nombre del paciente resuelto por el token, nunca del valor del body.
- **M5-CA-008** *(v2.3)* Un visitante sin sesión que intenta agendar es dirigido a iniciar sesión o registrarse, nunca ve un botón que no responde (CLAUDE.md §7).

---

### M6 — PAGOS Y SUSCRIPCIONES

**Objetivo.** Cobrar la suscripción del médico (ingreso principal del MVP) y, opcionalmente, la consulta del paciente.

**Alcance MVP.** Suscripción mensual/anual del médico con tarjeta y SPEI. Cobro de consulta al paciente **opcional por médico** (muchos médicos preferirán cobrar en consultorio). Webhooks idempotentes y reconciliación. CFDI manual.

**Reglas de negocio**

- **M6-RN-001.** **Medicfy nunca almacena datos de tarjeta.** Tokenización del lado del proveedor, PCI-DSS SAQ-A.
- **M6-RN-002.** Todo webhook se procesa **por `provider_event_id` con unicidad en base de datos**. Un webhook duplicado no genera doble efecto. Esta es la fuente número uno de cobros duplicados en plataformas nuevas.
- **M6-RN-003.** Un job diario de reconciliación compara los pagos del proveedor con la tabla `payments` y reporta discrepancias al admin. Obligatorio, no opcional.
- **M6-RN-004.** Cobro fallido de suscripción: 3 reintentos (día 1, 3, 7) → `past_due` con acceso limitado (lectura de expedientes sí, emisión de recetas no) → `cancelled` al día 14. **Nunca se elimina información clínica por impago.**
- **M6-RN-005.** Precios en MXN, IVA 16% desglosado.
- **M6-RN-006.** Si Medicfy cobra la consulta, retiene comisión y liquida al médico. **[BLOQUEANTE] Esto tiene implicaciones fiscales y regulatorias serias** (agregador de pagos, retenciones, posible necesidad de figura de fondos de terceros). Requiere contador y abogado antes de implementarse. **[DECISIÓN POR DEFECTO]: en MVP, Medicfy cobra únicamente su suscripción al médico; el pago de la consulta ocurre entre paciente y médico fuera de la plataforma.** Esto elimina el bloqueo fiscal y simplifica el MVP en ~3 semanas.

**Casos límite.** Reembolso parcial por cancelación tardía. Contracargo → suspensión de suscripción y alerta. Cambio de plan a mitad de periodo → prorrateo del proveedor. Suscripción cancelada con citas futuras → se honran las citas ya agendadas.

**Criterios de aceptación**

- **M6-CA-001** Enviar el mismo webhook 10 veces produce exactamente un pago registrado.
- **M6-CA-002** El sistema nunca recibe ni registra un PAN de tarjeta; verificado por revisión de logs y de esquema.
- **M6-CA-003** Un médico en `past_due` puede leer expedientes pero recibe 403 al emitir receta.
- **M6-CA-004** La reconciliación diaria detecta un pago inyectado manualmente en el proveedor y lo reporta.

---

### M8 — EXPEDIENTE CLÍNICO ELECTRÓNICO

**Objetivo.** Ser el mejor lugar para documentar una consulta en México. Este módulo es el producto.

**Alcance MVP.** Ficha del paciente, alergias, condiciones crónicas, encuentro con estructura NOM-004 (motivo, padecimiento actual, signos vitales, exploración física, análisis, plan), diagnósticos CIE-10, adjuntos, firma del encuentro, línea de tiempo del paciente, plantillas del médico.

**Reglas de negocio**

- **M8-RN-001. El expediente es append-only.** Una nota firmada **no se edita y no se borra, nunca, por nadie, incluido el superadmin**. Corregir = nueva nota con `is_correction_of_note_id`. La interfaz muestra ambas, marcando la corrección. Esto no es una preferencia técnica: es lo que exige NOM-004 y es lo único que hace el expediente admisible como prueba.
- **M8-RN-002.** Mientras el encuentro está `draft`, el contenido se autoguarda cada 10 s y es editable libremente. **Al firmar se congela**, se calcula `content_hash_sha256` y se encadena con el hash del encuentro anterior del mismo paciente.
- **M8-RN-003.** Un `draft` sin firmar por más de **72 h** se marca como abandonado, se conserva visible solo para su autor y no aparece en la línea de tiempo del paciente.
- **M8-RN-004.** Acceso condicionado a `care_relationship` activo (AUTH-RN-001). Cada lectura genera una fila en `audit_log`.
- **M8-RN-005.** El paciente ve su expediente completo en modo lectura, salvo campos marcados por el médico como "nota reservada" — figura contemplada en NOM-004 para información cuyo conocimiento directo puede perjudicar al paciente. Uso restringido, justificado y auditado.
- **M8-RN-006.** Diagnóstico principal obligatorio con **código CIE-10** para poder firmar. Texto libre permitido como complemento, nunca como sustituto.
- **M8-RN-007.** Signos vitales con rangos de plausibilidad. Un valor fuera de rango exige confirmación explícita ("¿confirmas TA 250/140?"), no se rechaza: puede ser real y ser una urgencia.
- **M8-RN-008.** Alergias registradas se cruzan **automáticamente** contra cada prescripción (M9-RN-008). Es la función de seguridad más valiosa del sistema y debe existir desde el día uno.
- **M8-RN-009.** Plantillas: el médico guarda plantillas de exploración física y de plan por padecimiento frecuente. Esto es lo que reduce el tiempo de documentación de 8 minutos a 2 y es la razón real por la que un médico cambia de sistema.
- **M8-RN-010.** Adjuntos: los archivos se cifran en reposo y se sirven solo por URL prefirmada de **≤5 minutos**, generada tras validar permisos. Nunca URL pública.
- **M8-RN-011.** En pacientes menores de 12 años, peso y talla son **obligatorios en cada consulta**, y el sistema calcula y grafica percentiles OMS de peso, talla, perímetro cefálico e IMC pediátrico. Sin esto ningún pediatra adopta el producto.
- **M8-RN-012. Dos modos de documentación, no uno.** Esta es la regla que resuelve la tensión entre cumplir NOM-004 íntegra y no perder al médico por fricción:

  | | Modo Historia Clínica (primera vez) | Modo Nota de Evolución (seguimiento) |
  |---|---|---|
  | Secciones | NOM-004 completa: ficha, AHF, APP, APNP, AGO, interrogatorio por aparatos y sistemas, exploración física completa, resultados previos, dx, pronóstico, tratamiento | Evolución del padecimiento, signos vitales, resultados relevantes, dx, tratamiento |
  | Antecedentes | Se capturan aquí, una sola vez | Se muestran de la consulta anterior, editables, **no se recapturan** |
  | Tiempo objetivo | **12–15 min** | **3–4 min** |
  | Base normativa | Historia clínica completa | Nota de evolución completa |

  Los antecedentes viven en el **paciente**, no en el encuentro: se capturan una vez, se arrastran a cada consulta y toda modificación queda versionada. Así se cumple la norma al 100% sin que el médico reescriba la misma información cada visita.

- **M8-RN-013. El sistema mide su propia propuesta de valor.** Se registra el tiempo entre abrir y firmar cada nota, por médico, por modo y por especialidad. No es telemetría opcional: es la métrica norte del negocio (ver Módulo 1 §10). Si el tiempo no baja de 25 min a 12–15 en primera vez y a 3–4 en seguimiento, la propuesta de valor es falsa y hay que replantear el producto, no el marketing.
- **M8-RN-014. Campos por especialidad, generados desde datos.** `DOC-06` renderiza dinámicamente los campos definidos en `specialty_field_schemas` según la especialidad verificada del médico. Los campos calculados (IMC, percentil OMS, semanas de gestación, FPP, TFG por CKD-EPI) se resuelven **en el servidor, nunca en el navegador**, y su fórmula queda versionada en el encuentro firmado.

  Contenido publicado en v1.0:

  | Especialidad | Campos propios |
  |---|---|
  | **Medicina general** (base) | NOM-004 completa; signos vitales; IMC calculado |
  | **Ginecología y obstetricia** | Gestas, partos, abortos, cesáreas; FUM; FUR; ciclo; método anticonceptivo; última citología y resultado; última mastografía; en embarazo: SDG calculadas, FPP, altura de fondo uterino, FCF, curva de peso |
  | **Pediatría** | Peso, talla y perímetro cefálico con percentiles OMS graficados; IMC pediátrico; esquema de vacunación con cartilla; antecedentes perinatales (Apgar, SDG al nacer, peso al nacer, tipo de parto); hitos de desarrollo psicomotor; alimentación |
  | **Medicina interna** | HbA1c; perfil lipídico; TFG calculada; presión objetivo; riesgo cardiovascular; medicación crónica activa con adherencia; laboratorios en tendencia gráfica |

  Cualquier especialidad no listada usa el esquema base. **Decisión de alcance:** "servir para todas las especialidades" se cumple con la arquitectura desde el día uno; el contenido clínico se publica por oleadas, porque cada esquema exige validación de un especialista de esa área y eso es trabajo clínico, no de programación.

**Validaciones.** Motivo de consulta 3–500 caracteres, obligatorio. Padecimiento actual obligatorio. Al menos un diagnóstico con CIE-10. Signos vitales: TAS 40–300, TAD 20–200, FC 20–250, FR 5–60, temp 30–43 °C, SpO₂ 50–100, peso 0.5–400 kg, talla 20–250 cm. Adjuntos: PDF/JPG/PNG/DICOM, ≤25 MB, análisis antivirus antes de aceptar.

**Casos límite**

- Médico que pierde conexión a mitad de la nota → autoguardado local (IndexedDB) + sincronización al reconectar. **Requisito no negociable:** un médico que pierde 20 minutos de nota clínica abandona el producto ese día.
- Dos médicos documentando al mismo paciente simultáneamente → permitido, encuentros separados.
- Paciente que pide corregir un dato incorrecto en su expediente → derecho de rectificación LFPDPPP; se resuelve con nota de corrección del médico, no con edición. Debe existir el flujo de solicitud.
- Paciente que pide supresión → se explica la obligación de conservación de 5 años; se suprimen datos de contacto y marketing, no el expediente.
- Paciente fallecido → expediente en estado `deceased`, sin nuevas notas, accesible por obligación legal.

**Criterios de aceptación**

- **M8-CA-001** No existe endpoint, consulta ni procedimiento que actualice o borre `clinical_notes`. Verificado por revisión de código, permisos de base de datos (rol de aplicación sin `UPDATE`/`DELETE` en esa tabla) y prueba automatizada.
- **M8-CA-002** Toda lectura de expediente produce una fila en `audit_log` con `patient_id`, actor, IP y timestamp.
- **M8-CA-003** Un médico sin `care_relationship` activo recibe 403 y el intento queda registrado como `result = denied`.
- **M8-CA-004** El hash del encuentro N encadena con el del N−1; alterar un registro en base de datos rompe la cadena y lo detecta el verificador de integridad diario.
- **M8-CA-005** Corte de red durante 5 minutos no pierde contenido de la nota.
- **M8-CA-006** Prescribir un medicamento al que el paciente es alérgico dispara alerta bloqueante que exige confirmación escrita del médico.

---

### M9 — RECETA ELECTRÓNICA

**Objetivo.** Emitir recetas legalmente válidas, verificables y aceptadas en farmacia.

**Alcance MVP.** Recetas de medicamentos **no controlados (Grupos III–VI)**. Catálogo de medicamentos con genérico, presentación y grupo de control. Verificación de interacciones y alergias. Firma. Sello de tiempo. Folio único. PDF con QR de verificación pública. Entrega por email/WhatsApp/descarga/impresión.

**Reglas de negocio**

- **M9-RN-001.** Solo `DOCTOR` con `verification_status = verified` y suscripción activa emite recetas.
- **M9-RN-002.** Toda receta pertenece a un `clinical_encounter`. **No hay recetas sin consulta documentada.** Esto es defensa legal y es lo que distingue a Medicfy de un generador de PDFs.
- **M9-RN-003. Contenido obligatorio** (art. 33 RIS): nombre y cédula profesional del médico e institución que la expidió, domicilio del consultorio, nombre y edad del paciente, fecha, **denominación genérica**, presentación, dosis, vía, frecuencia, duración del tratamiento y firma. Falta de cualquiera → no se puede emitir.
- **M9-RN-004.** Los datos legales se guardan como **snapshot** en la receta. Si el médico cambia de consultorio mañana, la receta emitida ayer conserva el domicilio correcto. Nunca se resuelven por join al momento de imprimir.
- **M9-RN-005.** Folio único e irrepetible: `MDF-{año}-{serie del médico}-{consecutivo}`, generado con secuencia transaccional, sin huecos ni duplicados.
- **M9-RN-006.** Una receta emitida **no se edita**. Se cancela (con motivo) y se emite una nueva con `replaced_by_prescription_id`. La cancelada permanece visible como cancelada.
- **M9-RN-007. Sello de tiempo.** Al firmar se registra timestamp del servidor (nunca del cliente) y, cuando se active firma avanzada, constancia de PSC conforme a NOM-151.
- **M9-RN-008.** **Verificación previa obligatoria**: (a) alergia registrada al principio activo → bloqueo con confirmación explícita; (b) interacción mayor con medicamento activo del paciente → advertencia; (c) duplicidad terapéutica → advertencia; (d) dosis fuera de rango para la edad/peso → advertencia. Todas las confirmaciones quedan en auditoría.
- **M9-RN-009.** Firma abstraída en dos implementaciones intercambiables (§3.2). En MVP: contraseña + TOTP en el momento de firmar (no basta con la sesión abierta) + bitácora + hash + sello de tiempo del servidor.
- **M9-RN-010.** El PDF incluye **QR** a `medicfy.com/verificar/{token}`, página pública que confirma folio, fecha, nombre y cédula del médico, y nombre del paciente **parcialmente enmascarado** ("María G. L."). Nunca el contenido de la receta: cualquiera puede escanear ese QR.
- **M9-RN-011.** Envío digital solo con consentimiento (c) de M1-RN-003 vigente. WhatsApp/email **nunca llevan el medicamento en el cuerpo del mensaje**: llevan un enlace autenticado de vida limitada. Un PDF clínico adjunto en WhatsApp es una fuga de datos sensibles.
- **M9-RN-012. Grupos I y II bloqueados** (§3.3). Bloqueo duro, no advertencia.
- **M9-RN-013.** Autoprescripción y prescripción a familiar directo del médico: bloqueada la primera, marcada para revisión la segunda.
- **M9-RN-014. Registro de prescripción externa — el bloqueo de controlados no debe bloquear el expediente.** Con medicina general y medicina interna en el piloto, la prescripción de Grupos I y II va a ocurrir en las primeras semanas. Cuando el médico lo intenta:

  1. El sistema bloquea la emisión electrónica y explica por qué (M9-RN-012).
  2. Ofrece **"Registrar receta emitida en recetario físico"**.
  3. El médico captura medicamento, dosis, vía, frecuencia, duración y **el folio de su recetario oficial COFEPRIS**.
  4. Queda como `prescription_type = external_physical`: sin PDF, sin QR, sin pretensión de validez electrónica.

  Con esto el expediente queda completo (obligación NOM-004 cumplida), existe trazabilidad, el libro de control de psicotrópicos se puede reconstruir desde Medicfy, y el médico no siente que el sistema le estorba. **Obligación de comunicación:** esto se advierte en el onboarding con letra clara, no se descubre en la primera consulta. Un médico que lo descubre solo, se va.

- **M9-RN-015. Prescripción consciente del costo.** Cada medicamento muestra el rango de precio de patente y de genérico, y el costo estimado del tratamiento completo (precio × duración), para que el médico prescriba sabiendo si el paciente puede pagarlo. Dos condiciones firmes e inviolables:

  1. **El orden de presentación nunca se vende.** Los medicamentos se ordenan por criterio clínico y por precio, jamás por acuerdo comercial. Si en el futuro existe un convenio con una farmacéutica, aparece **etiquetado explícitamente como patrocinado y separado** de las sugerencias clínicas.
  2. **El precio se etiqueta como referencia, con fecha:** "Precio de referencia al DD/MMM/AAAA, puede variar por farmacia." Un precio desactualizado que el médico repite al paciente y no coincide en la farmacia daña la confianza en todo el sistema.

  Justificación clínica: en México, con gasto de bolsillo en salud elevado, un tratamiento que el paciente no puede pagar es un tratamiento que se abandona en la farmacia. Esta función mejora adherencia y es defendible ante cualquiera.

**Validaciones.** Al menos 1 medicamento, máximo 10 por receta. Genérico obligatorio del catálogo (texto libre solo con justificación). Duración 1–365 días. Diagnóstico asociado obligatorio.

**Casos límite**

- Medicamento no existe en el catálogo → alta con captura manual, marcado para curación por admin.
- Paciente pediátrico → dosis por peso; el peso pasa a obligatorio en signos vitales cuando el paciente es menor de 12 años.
- Farmacia rechaza la receta → flujo de soporte y contacto con la cadena. **Riesgo de adopción real, no técnico** (§13).
- Receta que el paciente pierde → siempre descargable desde su cuenta, con registro de cada descarga.
- Embarazo → bandera `pregnancy_status` en el paciente que dispara advertencias de categoría de riesgo.

**Errores.** `PRESCRIPTION_CONTROLLED_BLOCKED` (422), `PRESCRIPTION_ALLERGY_CONFLICT` (409, requiere `override_confirmed`), `PRESCRIPTION_MISSING_LEGAL_FIELD` (422 con lista), `SIGNATURE_MFA_REQUIRED` (428), `DOCTOR_SUBSCRIPTION_INACTIVE` (402).

**Dependencias.** **[BLOQUEANTE] Catálogo de medicamentos.** No existe una base pública mexicana completa y mantenida con grupo de control y presentaciones. Opciones: (a) licenciar base comercial (Vademécum, First Databank, Medi-Span) — costo anual relevante pero incluye interacciones; (b) construir catálogo propio a partir del Cuadro Básico y el Compendio Nacional de Insumos para la Salud — gratuito pero incompleto para el sector privado y sin motor de interacciones; (c) híbrido: catálogo propio + base de interacciones licenciada. **Esta decisión define si M9-RN-008 es real o decorativa. Necesito tu instrucción.** **[DECISIÓN POR DEFECTO]: (b) para el catálogo + evaluación de proveedor de interacciones en paralelo, con las alertas de alergia (que sí puedo construir sin licencia) activas desde el día uno.**

**Criterios de aceptación**

- **M9-CA-001** Una receta sin cualquiera de los campos del art. 33 no puede emitirse; el error indica exactamente qué falta.
- **M9-CA-002** Intentar prescribir un Grupo I o II devuelve `PRESCRIPTION_CONTROLLED_BLOCKED` y es imposible forzarlo desde la interfaz o la API.
- **M9-CA-003** Prescribir a un paciente con alergia registrada al principio activo exige confirmación explícita registrada en auditoría con nombre del médico.
- **M9-CA-004** El QR del PDF abre una página pública que no revela ningún medicamento ni diagnóstico.
- **M9-CA-005** Los folios de 1,000 recetas concurrentes son únicos y consecutivos sin huecos.
- **M9-CA-006** Modificar el PDF almacenado rompe la verificación de hash y lo reporta el verificador diario.
- **M9-CA-007** Firmar exige segundo factor aunque la sesión esté abierta.

---

### M10 — ÓRDENES DE LABORATORIO (parcial en MVP)

**Objetivo.** Que el médico emita órdenes formales y reciba resultados dentro del expediente.

**Alcance MVP.** Emisión de orden con estudios, indicación clínica y ayuno; PDF firmado con folio y QR; carga de resultados por el médico o por el paciente; vinculación al expediente; notificación al médico; analitos estructurados con marcado de fuera de rango/crítico calculado por el servidor, con lectura automática opcional de la hoja como primera transcripción siempre sujeta a revisión del médico (v2.5). **Sin portal de laboratorio** (v1.1).

**Reglas de negocio**

- **M10-RN-001.** La orden pertenece a un encuentro, igual que la receta.
- **M10-RN-002.** El paciente lleva el PDF a cualquier laboratorio. Sin lista blanca en MVP.
- **M10-RN-003.** El resultado subido por el paciente se marca `source = patient_uploaded` y **queda pendiente de validación del médico**. Un resultado no revisado no se presenta como validado en el expediente. Esta distinción es clínica y legal.
- **M10-RN-004.** Al subirse un resultado, el médico solicitante recibe notificación. **No se le atribuye responsabilidad de interpretación fuera de consulta**, y el texto de la notificación debe decirlo — esto protege al médico y es lo que un abogado revisará.
- **M10-RN-005.** Catálogo de estudios semilla (~150 estudios frecuentes) con LOINC opcional, mantenido por admin.
- **M10-RN-006.** *(v2.5)* Un analito puede llegar transcrito automáticamente desde una hoja de laboratorio subida (imagen o PDF), pero ningún valor extraído se escribe en `lab_result_analytes` sin que el médico lo revise y confirme campo por campo. La extracción vive en una tabla de espera (`lab_sheet_extractions`/`lab_sheet_extraction_candidates`) hasta ese momento — nunca directamente en el expediente estructurado.
- **M10-RN-007.** *(v2.5)* Toda candidata extraída con confianza baja exige una confirmación explícita adicional del médico — no basta con dejarla sin tocar — antes de poder aceptarse.
- **M10-RN-008.** *(v2.5)* El marcado de "fuera de rango" y "valor crítico" de un analito lo decide siempre el servidor de forma determinista, nunca el modelo que haya asistido en la lectura de la hoja ni el Segundo Lector. Prioridad: (1) el rango impreso en la propia hoja, si se extrajo con confianza suficiente; (2) `lab_reference_ranges`, tabla propia del sistema, por analito, con variación por sexo y edad. Esta regla **revierte conscientemente** la nota de "Casos límite" de la versión original de este módulo, que dejaba las reglas por analito fuera del MVP (v1.2) — el fundador lo pidió explícitamente el 2 de septiembre de 2026, con esa nota ya sobre la mesa.
- **M10-RN-009.** *(v2.5)* Cada fila de `lab_reference_ranges` nace marcada `pending_medical_review = true` y cita su fuente; deja de estarlo solo cuando un usuario con rol `CURATOR` (o `SUPERADMIN`) la aprueba explícitamente. Mientras está pendiente **se sigue usando** para marcar fuera de rango — pendiente de revisión no es lo mismo que inválido — pero queda visible como tal en la bandeja de curaduría. Ningún rango de este sistema tiene precedente en una versión anterior de esta especificación; se documenta aquí por primera vez, con este mecanismo de aprobación como condición.
- **M10-RN-010.** *(v2.5)* Un resultado que el médico selecciona para la nota de esta consulta se congela al firmar — mismo momento y mismo patrón que los signos vitales (`vital_sign_sets`) — en `note_lab_results`, con su estado ya calculado. Nunca como texto libre.
- **M10-RN-011.** *(v2.5)* Si algún resultado incluido en una nota proviene de una lectura automática ya revisada (`source = ocr_reviewed`), la nota conserva esa procedencia y muestra el aviso de validación correspondiente.

**Casos límite.** Resultado ilegible o de otro paciente → el médico lo marca como inválido, no se borra. Estudios de imagen → se aceptan como adjunto PDF/JPG; sin visor DICOM. Falla la lectura automática de una hoja → el médico puede reintentar sobre el mismo archivo o capturar el analito a mano; el archivo nunca se pierde.

**Criterios de aceptación**

- **M10-CA-001** La orden en PDF contiene folio, datos del médico con cédula, datos del paciente, estudios, indicación e instrucciones de ayuno.
- **M10-CA-002** Un resultado subido por el paciente aparece etiquetado como no validado hasta que el médico lo revisa.
- **M10-CA-003** El médico recibe notificación de resultado nuevo en ≤5 minutos.
- **M10-CA-004** *(v2.5)* Una candidata extraída con confianza baja no puede promoverse al expediente sin una confirmación explícita separada del médico.
- **M10-CA-005** *(v2.5)* Un valor fuera de rango se marca en rojo en la nota firmada; un valor crítico usa un énfasis visual mayor que uno simplemente fuera de rango, nunca el mismo tratamiento.
- **M10-CA-006** *(v2.5)* Un usuario que no es `CURATOR` ni `SUPERADMIN` no puede aprobar un rango de referencia pendiente.

---

### M12 — NOTIFICACIONES

**Objetivo.** Que nadie falte a una cita ni pierda una receta, sin filtrar datos clínicos por canales inseguros.

**Alcance MVP.** Email y WhatsApp transaccionales. Preferencias por usuario. Cola con reintentos.

**Reglas de negocio**

- **M12-RN-001. Ningún canal externo transporta contenido clínico.** El mensaje contiene: quién, cuándo, qué acción, y un enlace autenticado. Nunca diagnóstico, nunca medicamento, nunca resultado.
- **M12-RN-002.** Enlaces de acceso directo con token de un solo uso, vigencia 15 minutos, y segundo factor si el contenido es clínico.
- **M12-RN-003.** Recordatorios de cita son transaccionales, no marketing: no se pueden desactivar por completo, pero sí elegir canal.
- **M12-RN-004.** WhatsApp requiere plantillas aprobadas por Meta. **Presupuestar 2–3 semanas de trámite** de la cuenta de WhatsApp Business y la aprobación de plantillas: es el cuello de botella externo más frecuente en lanzamientos mexicanos. **Iniciar este trámite en la semana 1, no en la 12.**
- **M12-RN-005.** Fallo de WhatsApp → respaldo automático a email, y registro del fallo.
- **M12-RN-006.** Idempotencia por `(user_id, template_code, related_entity_id)`.

**Plantillas mínimas del MVP:** cita agendada, cita confirmada, recordatorio 24 h, recordatorio 2 h (con enlace de video si aplica), cita cancelada, cita reagendada, receta disponible, orden de laboratorio disponible, resultado cargado, verificación de médico aprobada/rechazada, contraseña restablecida, pago fallido.

**Criterios de aceptación**

- **M12-CA-001** Ningún mensaje enviado contiene nombre de medicamento, diagnóstico ni valor de resultado. Verificado por prueba automatizada sobre las plantillas.
- **M12-CA-002** Los enlaces caducan a los 15 minutos y son de un solo uso.
- **M12-CA-003** Reintentar un envío no genera duplicado en el destinatario.

---

### M13 — PANEL DE ADMINISTRACIÓN

**Objetivo.** Operar la plataforma: verificar médicos, dar soporte y ver salud del negocio, sin acceso a contenido clínico.

**Alcance MVP.** Cola de verificación de médicos. Búsqueda y gestión de usuarios. Métricas operativas. Consulta de bitácora. Break-glass con doble aprobación.

**Reglas de negocio**

- **M13-RN-001. El admin nunca ve contenido clínico** (AUTH-RN-002). El detalle de un paciente muestra: identificación, número de consultas, fechas, médicos vinculados, estado de pagos. **Nunca** motivo de consulta, diagnóstico, nota, receta ni resultado.
- **M13-RN-002.** Break-glass: solicitud con justificación → aprobación de un segundo admin → acceso de solo lectura por 60 minutos → notificación automática al paciente y al médico → registro completo.
- **M13-RN-003.** Suplantación de usuario para soporte (*impersonation*): permitida solo con consentimiento registrado del usuario, marcada visiblemente en la interfaz, y registrada en `audit_log.impersonated_by_user_id`. **Sin acceso a datos clínicos ni a firma de recetas durante la suplantación.**
- **M13-RN-004.** Toda acción de admin queda en bitácora.
- **M13-RN-005.** Métricas del MVP: médicos por estado de verificación, médicos activos (≥1 nota en 30 días), citas por estado, tasa de no-show, notas firmadas, recetas emitidas, MRR, churn, cola de verificación y su antigüedad.

**Criterios de aceptación**

- **M13-CA-001** Ninguna respuesta de API del panel admin incluye campos clínicos. Verificado por prueba de contrato.
- **M13-CA-002** El break-glass requiere dos administradores distintos y notifica al paciente.
- **M13-CA-003** La cola de verificación muestra antigüedad y alerta a las 24 h hábiles.

---

### M15 — AUDITORÍA, SEGURIDAD Y CUMPLIMIENTO

**Objetivo.** Poder demostrar ante una autoridad, un juez o un cliente institucional qué pasó con cada dato.

**Reglas de negocio**

- **M15-RN-001.** `audit_log` es append-only a nivel de permisos de base de datos: el rol de la aplicación tiene `INSERT` y `SELECT`, nunca `UPDATE` ni `DELETE`. Esto no se implementa en el ORM; se implementa con `GRANT`.
- **M15-RN-002.** Encadenamiento de hashes en la bitácora; verificador diario que alerta ante ruptura.
- **M15-RN-003.** Eventos de registro obligatorio: login (éxito y fallo), logout, cambio de contraseña, alta/baja de MFA, **toda lectura de dato clínico**, creación/firma de nota, emisión/cancelación de receta u orden, carga y descarga de adjunto, cambio de permisos, verificación de médico, break-glass, suplantación, exportación de datos, cambio de consentimiento.
- **M15-RN-004.** Cifrado: TLS 1.3 en tránsito con HSTS; AES-256 en reposo (base de datos y objetos); campos hipersensibles (secreto MFA, payload de firma) con cifrado a nivel de aplicación y llaves en KMS con rotación anual.
- **M15-RN-005.** Respaldos: automáticos diarios con retención 35 días + PITR; respaldo mensual retenido 5 años en almacenamiento inmutable (object lock). **Prueba de restauración documentada cada trimestre.** Un respaldo nunca probado no es un respaldo.
- **M15-RN-006.** Plan de respuesta a incidentes escrito antes del lanzamiento, con notificación a titulares afectados y a la autoridad en los plazos que exija la LFPDPPP 2025 y su reglamento.
- **M15-RN-007.** Prueba de penetración externa antes del lanzamiento público. Presupuesta MXN 80,000–200,000. **No lances una plataforma con expedientes clínicos sin esto.**
- **M15-RN-008.** Contratos de encargo del tratamiento con **cada** proveedor que toque datos: hosting, email, WhatsApp, video, pagos, observabilidad. Obligación reforzada por la ampliación del concepto de responsable en la ley de 2025 (§3.1).
- **M15-RN-009.** Los datos de `staging` son siempre sintéticos. Nunca una copia de producción, ni "anonimizada".
- **M15-RN-010.** Rate limiting por IP y por usuario en autenticación, búsqueda y descarga de archivos.

**Criterios de aceptación**

- **M15-CA-001** El usuario de base de datos de la aplicación no tiene privilegios de `UPDATE`/`DELETE` sobre `audit_log`, `clinical_notes` ni `prescriptions`. Verificado con consulta de privilegios en CI.
- **M15-CA-002** Existe un reporte "quién accedió al expediente del paciente X" ejecutable en <2 segundos.
- **M15-CA-003** Restauración completa desde respaldo ejecutada y documentada antes del lanzamiento.
- **M15-CA-004** Informe de pruebas de penetración sin hallazgos críticos ni altos abiertos.
- **M15-CA-005** Ningún secreto en el repositorio; verificado por escáner en CI.

---

### MÓDULOS DIFERIDOS — contratos de interfaz

Se diseñan las fronteras ahora para no reescribir después.

- **M3 Directorio y búsqueda (v1.1).** Índice de búsqueda separado (Postgres full-text primero, Typesense si hace falta). Reseñas: solo pacientes con cita `completed`, moderación previa, derecho de réplica del médico. Sin esto último, las reseñas son un pasivo legal.
- **M7 Teleconsulta (v1.1 completo).** Interfaz `VideoProvider` con métodos `createRoom`, `getJoinToken`, `endRoom`. En MVP solo enlace generado. **Nunca grabar la consulta sin consentimiento expreso de ambas partes; y si se graba, es dato clínico sensible con todas las obligaciones que eso implica.**
- **M11 Mensajería (v1.1).** Requiere antes: política de tiempos de respuesta, aviso explícito de que no es canal de urgencias, y triage. Sin eso es un riesgo clínico.
- **M14 IA (v1.2).** Interfaz `ClinicalAssistant`. Toda salida de IA se almacena con `model_version`, `prompt_hash`, `confidence` y **requiere aceptación explícita del médico** antes de entrar al expediente. Ninguna salida de IA se guarda como dato clínico sin firma humana. Ver §2.3.

---

## 8. CONTRATOS DE API

REST versionada bajo `/api/v1`. Autenticación `Authorization: Bearer <jwt>`. Errores con formato uniforme.

```json
// Error estándar
{
  "error": {
    "code": "PRESCRIPTION_ALLERGY_CONFLICT",
    "message": "El paciente tiene alergia registrada a penicilina.",
    "details": { "substance": "penicilina", "severity": "severe" },
    "request_id": "req_01J8X..."
  }
}
```

### 8.1 Inventario de endpoints del MVP

| Método | Ruta | Rol | Módulo |
|---|---|---|---|
| POST | `/auth/register/patient` | público | M1 |
| POST | `/auth/register/doctor` | público | M1 |
| POST | `/auth/login` | público | M1 |
| POST | `/auth/mfa/verify` | público (con token parcial) | M1 |
| POST | `/auth/mfa/enroll` · `/auth/mfa/disable` | autenticado | M1 |
| POST | `/auth/refresh` · `/auth/logout` | autenticado | M1 |
| POST | `/auth/password/forgot` · `/auth/password/reset` | público | M1 |
| POST | `/auth/email/verify` · `/auth/phone/verify` | autenticado | M1 |
| GET/POST | `/consents` | autenticado | M1 |
| GET/PATCH | `/me` | autenticado | M1 |
| GET/PATCH | `/doctors/me` | DOCTOR | M2 |
| POST | `/doctors/me/documents` | DOCTOR | M2 |
| GET/POST/PATCH/DELETE | `/doctors/me/locations` | DOCTOR | M2 |
| GET/POST/PATCH/DELETE | `/doctors/me/services` | DOCTOR | M2 |
| POST | `/doctors/me/assistants/invite` | DOCTOR | M1 |
| GET | `/doctors/{slug}/public` | público | M5 |
| GET | `/doctors/{slug}/public/services` | público | M5 *(agregado v2.2, sin precio — necesario para elegir `service_id` antes de consultar disponibilidad)* |
| GET | `/doctors/{id}/availability?from&to&service_id` | público | M4 |
| GET | `/doctors/public?q=&specialty=&cursor=` | público | M3 *(agregado v2.3, nunca precio — mismos campos que `/doctors/{slug}/public`)* |
| GET/POST | `/doctors/me/posts` | DOCTOR | M2B *(agregado v2.2)* |
| GET/PATCH/DELETE | `/doctors/me/posts/{id}` | DOCTOR autor | M2B *(agregado v2.2)* |
| POST | `/doctors/me/posts/{id}/media` | DOCTOR autor | M2B *(agregado v2.2)* |
| GET | `/doctors/{slug}/public/posts` | público | M2B *(agregado v2.2 — solo `visibility=public` y `status=published`)* |
| GET | `/doctors/{id}/posts/patients-only` | autenticado, con `care_relationship` activo | M2B *(agregado v2.2, con portal real desde v2.3/M5-RN-009)* |
| POST | `/admin/doctor-posts/{id}/archive` | ADMIN | M2B *(agregado v2.2, moderación mínima)* |
| POST/DELETE | `/doctors/{slug}/public/posts/{id}/like` | autenticado, con acceso al post | M2B *(agregado v2.3)* |
| GET/POST | `/doctors/{slug}/public/posts/{id}/comments` | GET según acceso al post; POST autenticado con acceso al post | M2B *(agregado v2.3)* |
| DELETE | `/doctors/{slug}/public/posts/{id}/comments/{commentId}` | autor del comentario, autor del post, o ADMIN | M2B *(agregado v2.3, M2B-RN-012)* |
| GET/POST/PATCH/DELETE | `/doctors/me/education` | DOCTOR | M2 *(agregado v2.3)* |
| GET/POST/PATCH/DELETE | `/doctors/me/availability-rules` | DOCTOR, ASSISTANT | M4 |
| GET/POST/DELETE | `/doctors/me/availability-exceptions` | DOCTOR, ASSISTANT | M4 |
| GET/POST | `/patients` | DOCTOR, ASSISTANT | M5 *(corregido en v2.1; la v2.0 decía M2)* |
| GET/PATCH | `/patients/{id}` | según vínculo | M8 |
| GET/POST/DELETE | `/patients/{id}/allergies` | DOCTOR | M8 |
| GET/POST | `/patients/{id}/conditions` | DOCTOR | M8 |
| GET | `/patients/{id}/timeline` | PATIENT (propio), DOCTOR (vinculado) | M8 |
| GET | `/patients/me` | PATIENT | M5-RN-009 *(agregado v2.3 — resuelve la fila `patients` del usuario autenticado)* |
| GET/POST | `/patients/me/appointments` | PATIENT | M5-RN-009 a 012 *(agregado v2.3 — POST es el agendamiento público real: `patient_id` siempre resuelto del token, nunca del body, ver M5-RN-010)* |
| GET/POST | `/appointments` | según rol | M5 |
| GET | `/appointments/{id}` | participantes | M5 |
| POST | `/appointments/{id}/confirm` | participantes | M5 |
| POST | `/appointments/{id}/reschedule` | participantes | M5 |
| POST | `/appointments/{id}/cancel` | participantes | M5 |
| POST | `/appointments/{id}/start` · `/complete` · `/no-show` | DOCTOR | M5 |
| POST | `/encounters` | DOCTOR | M8 |
| GET/PATCH | `/encounters/{id}` (PATCH solo en `draft`) | DOCTOR autor | M8 |
| POST | `/encounters/{id}/sign` | DOCTOR autor | M8 |
| POST | `/encounters/{id}/notes/correction` | DOCTOR autor | M8 |
| GET/POST | `/encounters/{id}/diagnoses` | DOCTOR | M8 |
| POST | `/patients/{id}/attachments` | DOCTOR, PATIENT | M8 |
| GET | `/attachments/{id}/signed-url` | según permiso | M8 |
| GET | `/icd10/search?q=` | DOCTOR | M8 |
| GET | `/medications/search?q=` | DOCTOR | M9 |
| POST | `/prescriptions/preflight` | DOCTOR | M9 |
| POST | `/prescriptions` | DOCTOR verificado | M9 |
| POST | `/prescriptions/{id}/sign` | DOCTOR autor | M9 |
| POST | `/prescriptions/{id}/cancel` | DOCTOR autor | M9 |
| POST | `/prescriptions/{id}/deliver` | DOCTOR, PATIENT | M9 |
| GET | `/prescriptions/{id}/pdf` | participantes | M9 |
| GET | `/verificar/{token}` | público | M9 |
| GET/POST | `/lab-orders` | DOCTOR | M10 |
| POST | `/lab-orders/{id}/sign` | DOCTOR | M10 |
| POST | `/lab-results` | DOCTOR, PATIENT | M10 |
| POST | `/lab-results/{id}/review` | DOCTOR | M10 |
| GET | `/lab-studies/search?q=` | DOCTOR | M10 |
| GET/POST | `/lab-analytes/patients/{patientId}` | DOCTOR | M10 (Prompt 42A) |
| POST | `/lab-analytes/patients/{patientId}/{id}/review` | DOCTOR | M10 (Prompt 42A) |
| POST | `/lab-sheet-extractions/patients/{patientId}` | DOCTOR | M10 (v2.5) |
| GET | `/lab-sheet-extractions/{id}` | DOCTOR | M10 (v2.5) |
| POST | `/lab-sheet-extractions/{id}/retry` | DOCTOR | M10 (v2.5) |
| POST | `/lab-sheet-extractions/{id}/review` | DOCTOR | M10 (v2.5) |
| GET | `/lab-reference-ranges?pendingOnly=` | CURATOR, SUPERADMIN | M10 (v2.5) |
| POST | `/lab-reference-ranges/{id}/approve` | CURATOR, SUPERADMIN | M10 (v2.5) |
| GET/POST | `/subscriptions` | DOCTOR | M6 |
| POST | `/webhooks/{provider}` | firma verificada | M6 |
| GET/PATCH | `/notification-preferences` | autenticado | M12 |
| GET | `/admin/doctors?verification_status=` | ADMIN | M13 |
| POST | `/admin/doctors/{id}/verify` · `/reject` · `/suspend` | ADMIN | M13 |
| GET | `/admin/users` · `/admin/metrics` | ADMIN | M13 |
| GET | `/admin/audit-log?patient_id=&actor=&from=&to=` | ADMIN, SUPPORT | M15 |
| POST | `/admin/break-glass/request` · `/approve` | ADMIN | M13 |

**Reglas transversales de API**

- `POST` de creación de citas, recetas y pagos aceptan header `Idempotency-Key` obligatorio.
- Paginación por cursor (`?cursor=&limit=`), máximo 100.
- Rate limit: 5/min en autenticación, 60/min general, 10/min en descarga de archivos.
- Todo endpoint que devuelva datos clínicos escribe en `audit_log` antes de responder.
- Especificación **OpenAPI 3.1 generada desde el código** (decoradores de NestJS), publicada en `/api/docs`, con contrato verificado en CI.

---

## 9. DESIGN SYSTEM E INVENTARIO DE PANTALLAS

### 9.1 Tokens

Consolido tu identidad visual, que tenía tres paletas contradictorias entre documentos. **Esta es la única válida:**

```css
--brand-900:#003B6F; --brand-700:#005DAA; /* azul cobalto oficial */
--brand-500:#2B7FC4; --brand-100:#E6F0F9;
--accent-600:#0E9F8F; --accent-100:#E0F5F2; /* aqua: éxito clínico, acentos */
--gray-900:#1A1D21; --gray-700:#4A4A4A;   /* gris grafito oficial */
--gray-500:#6B7280; --gray-300:#D1D5DB;
--gray-100:#F4F6F8; --white:#FFFFFF;
--danger-600:#C62828; --warn-600:#B45309; --success-600:#177245;
--critical-600:#7F1D1D; /* alertas clínicas: alergia, interacción */

--font-heading:'Montserrat',sans-serif;  /* oficial del manual de marca */
--font-body:'Inter',sans-serif;
--text-xs:12px; --text-sm:14px; --text-base:16px; --text-lg:18px;
--text-xl:22px; --text-2xl:28px; --text-3xl:36px;
--space: 4px base → 4,8,12,16,24,32,48,64
--radius-sm:6px; --radius-md:10px; --radius-lg:16px;
--shadow-card:0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
```

**Decisiones que corrigen tu documentación:**

1. **Elimino la paleta por rol.** Tu documentación asigna un color distinto a cada rol (azul paciente, gris azulado médico, verde laboratorio, negro admin). Es un error de diseño: fragmenta la marca, cuadruplica el mantenimiento del design system y no resuelve ningún problema real de usuario — la gente sabe en qué portal está por el contenido, no por el color. La diferenciación se hace con **iconografía, densidad de información y estructura de navegación**, que es lo que realmente distingue una herramienta clínica de un portal de paciente.
2. **Tamaño mínimo de texto clínico: 16 px.** No 14. El texto de una nota clínica o una dosis se lee en condiciones de prisa; el error de lectura de dosis es un evento adverso.
3. **Contraste AA obligatorio, AAA en datos clínicos** (dosis, alergias, valores de resultado).
4. **Área de toque mínima 44×44 px.** El médico usa tablet con guantes o con una mano.
5. **Nunca color como único portador de significado.** Alergia = color + icono + texto.
6. **El rojo `--critical-600` está reservado exclusivamente a alertas de seguridad del paciente.** No se usa para errores de formulario. Si el rojo aparece por un campo vacío, deja de significar "peligro".

### 9.2 Inventario de pantallas del MVP

Renumero desde cero: tus IDs (PAC-001…) están ligados a la estrategia de directorio-primero que estamos invirtiendo.

**Público**
`PUB-01` Landing · `PUB-02` Registro paciente · `PUB-03` Registro médico · `PUB-04` Login con selector de rol · `PUB-05` Verificación email/teléfono · `PUB-06` Recuperar contraseña · `PUB-07` Perfil público del médico (`/dr/{slug}`) · `PUB-08` Agendar: selección de servicio, fecha y hora · `PUB-09` Agendar: datos y consentimientos · `PUB-10` Confirmación de cita · `PUB-11` Verificación pública de receta (QR) · `PUB-12` Aviso de privacidad · `PUB-13` Términos

**Médico** — *estas son las pantallas que deciden si el producto vive o muere*
`DOC-01` Agenda del día (pantalla de inicio, **no un dashboard de métricas**) · `DOC-02` Agenda semanal · `DOC-03` Configuración de disponibilidad · `DOC-04` Lista de pacientes · `DOC-05` Ficha del paciente con línea de tiempo · `DOC-06` **Consulta en curso** (nota clínica) · `DOC-07` Emisión de receta · `DOC-08` Receta emitida y envío · `DOC-09` Emisión de orden de laboratorio · `DOC-10` Adjuntos y resultados · `DOC-11` Mi perfil profesional · `DOC-12` Consultorios · `DOC-13` Servicios y precios · `DOC-14` Plantillas clínicas · `DOC-15` Suscripción y facturación · `DOC-16` Asistentes · `DOC-17` Onboarding y verificación · `DOC-18` Bitácora de accesos a mis pacientes

**Paciente**
`PAT-01` Inicio (próxima cita) · `PAT-02` Mis citas · `PAT-03` Mi expediente · `PAT-04` Mis recetas · `PAT-05` Mis estudios · `PAT-06` Subir documento · `PAT-07` Mi perfil y alergias · `PAT-08` Consentimientos y privacidad

**Admin**
`ADM-01` Cola de verificación · `ADM-02` Detalle de verificación · `ADM-03` Usuarios · `ADM-04` Detalle de usuario (sin datos clínicos) · `ADM-05` Métricas · `ADM-06` Bitácora · `ADM-07` Break-glass · `ADM-08` Catálogos

**Total: 47 pantallas.** Tu documentación implicaba ~110 para el "MVP".

### 9.3 La pantalla que hay que diseñar primero: DOC-06

`DOC-06` (consulta en curso) es donde el médico pasa el 80% de su tiempo. **Si esta pantalla es mediocre, ninguna otra importa.** Requisitos duros:

- El médico completa una consulta de seguimiento típica **sin usar el ratón** (navegación completa por teclado con atajos).
- Antecedentes, alergias y últimas 3 consultas visibles **sin scroll ni clic** en 1280×800.
- Autoguardado con indicador visible y funcionamiento sin conexión.
- Plantillas insertables con un atajo de teclado.
- Emitir receta **sin salir de la pantalla** (panel lateral, no navegación).
- Diseñada para 1280×800 (portátil de consultorio) **y** para tablet en horizontal.

---

## 10. PRUEBAS Y CRITERIOS DE LIBERACIÓN

| Tipo | Alcance mínimo | Herramienta |
|---|---|---|
| Unitarias | Cobertura ≥80% en dominio (agenda, estados de cita, validación de receta, permisos) | Vitest / Jest |
| Integración | Todos los endpoints contra base de datos real efímera | Supertest + Testcontainers |
| Contrato | OpenAPI vs implementación | Dredd / Schemathesis |
| E2E | 8 recorridos críticos (ver abajo) | Playwright |
| Concurrencia | Doble agendamiento, folios, webhooks duplicados | k6 |
| Seguridad | OWASP ASVS L2, escaneo de dependencias, secretos, IDOR sobre expedientes | ZAP + Snyk + pruebas propias |
| Accesibilidad | WCAG 2.2 AA en las 47 pantallas | axe-core |
| Carga | 200 usuarios concurrentes, p95 <500 ms | k6 |

**Recorridos E2E obligatorios:** (1) registro y verificación de médico; (2) configuración de agenda; (3) paciente agenda por enlace; (4) consulta completa con nota firmada; (5) emisión de receta con alerta de alergia; (6) emisión de orden y carga de resultado; (7) cancelación con reembolso; (8) intento de acceso a expediente sin vínculo → denegado y registrado.

**Puertas de liberación — el MVP no sale a producción sin las nueve:**

1. Todos los CA marcados en §7 verificados.
2. Prueba de penetración sin hallazgos críticos ni altos.
3. Restauración de respaldo probada y documentada.
4. Documentos legales revisados por abogado (§3.1) y publicados.
5. Verificación de que no existe ruta de escritura sobre `clinical_notes`, `prescriptions` ni `audit_log`.
6. Plantillas de WhatsApp aprobadas.
7. Contratos de encargo firmados con todos los proveedores.
8. Plan de respuesta a incidentes escrito y con responsables asignados.
9. **Pruebas de usabilidad con 5 médicos reales sobre `DOC-06`**, con ≥80% de tareas completadas sin ayuda.

---

## 11. MODELO DE NEGOCIO — CORRECCIONES

No pediste este apartado en la opción D, pero cambia el alcance técnico, así que lo incluyo en corto.

### 11.1 El precio de médico de tu documentación está mal calibrado

Tu documentación propone MXN 1,200–3,500/mes para médicos, calibrado contra Doctoralia (MXN 1,665–2,749/mes).

El problema: **estás comparando contra el precio de un producto que hace algo distinto.** Doctoralia cobra por *captación de pacientes* — el médico paga porque le llegan pacientes nuevos. Medicfy en su MVP no capta pacientes (no hay red todavía); ofrece *eficiencia clínica*. Son mercados con anclas de precio diferentes: los sistemas de expediente/receta en México se venden entre MXN 400 y 1,200/mes.

Si lanzas a MXN 1,800 prometiendo captación que no puedes entregar, tu churn será brutal en el mes 3 y habrás quemado tu reputación con los primeros 50 médicos, que son los más difíciles de reemplazar.

**DECISIÓN CERRADA: un solo plan, MXN 799/mes** (o MXN 7,990/año, equivalente a 2 meses gratis), sin niveles, con todo incluido. Razones: (a) el precio es honesto respecto a lo que entrega el MVP; (b) los niveles requieren mantener tres conjuntos de funciones y triplican el soporte cuando aún no sabes qué valora el médico; (c) subir precio después con producto probado es fácil, bajarlo es fatal. Los niveles y el plan de clínica llegan en el año 2, cuando el uso real indique dónde está la línea natural de corte.

### 11.1.1 Política de médicos fundadores — DECISIÓN CERRADA (reemplaza la versión anterior)

La política original que aprobaste (30 médicos gratis 6 meses) retrasaba tu primer ingreso hasta el **mes 10**: 3.5 meses de construcción + 6 de gratuidad. Con un burn de 150,000/mes eso son ~1.5 M antes de facturar un peso, y además obligaba a convertir a médicos acostumbrados a no pagar durante medio año, que es la conversión más difícil que existe. Queda reemplazada por:

| Cohorte | Condición | Contraprestación |
|---|---|---|
| **Médicos fundadores (los primeros 10)** | Gratis **3 meses** | Compromiso explícito de sesión de feedback semanal, documentado |
| **Los mismos 10, al terminar** | **50% de descuento permanente** (399 MXN/mes) | Lealtad y referencias |
| **Del médico 11 en adelante** | **30 días de prueba**, luego precio completo | — |

Efecto: primer ingreso en el **mes 7** en lugar del mes 10, con un ahorro aproximado de **MXN 450,000 de runway sin escribir una línea de código**. Diez médicos son suficientes para aprender; treinta solo multiplican la carga de soporte en la etapa en que menos gente tienes.

**Onboarding asistido, deliberadamente no escalable:** en los primeros 30 médicos, alguien de tu equipo captura las plantillas clínicas junto con el médico en una llamada de 30 minutos. La etapa de configuración es donde se pierde la mayoría de los usuarios de software clínico, y esa llamada es lo que convierte un registro en un hábito.

### 11.2 La suscripción de pacientes es la parte más frágil del plan

Tu propia documentación reconoce que el modelo de suscripción de pacientes no es tradicional en México. Coincido, y voy más allá: **no tienes evidencia de que un solo paciente pagaría MXN 79/mes**, y tu punto de equilibrio depende de 1,500 de ellos.

Antes de escribir código para esto: una landing con el plan y un botón de pago real, MXN 5,000 de anuncios en Guadalajara, y cuenta cuántos intentan pagar. Dos semanas, y evita construir un módulo entero para un mercado que puede no existir.

### 11.3 Costo operativo real — RESUELTO

Los MXN 280,000/mes de tu documentación **no estaban mal: estaban mal etiquetados.** Eran el burn de equipo en el extremo alto, no el costo de operación. La distinción es decisiva, porque el costo de equipo se puede reducir o pausar y el de infraestructura no.

**Infraestructura y servicios** — MVP en producción, 30 médicos, ~2,000 pacientes, ~1,200 consultas/mes:

| Concepto | MXN/mes |
|---|---|
| Frontend (Vercel Pro) | 400 – 600 |
| Backend (2 instancias pequeñas) | 1,000 – 1,800 |
| PostgreSQL administrado + respaldos + PITR | 1,200 – 2,200 |
| Redis | 250 – 500 |
| Almacenamiento de objetos + transferencia | 300 – 700 |
| Email transaccional | 350 – 600 |
| WhatsApp (~4,000 mensajes de utilidad) | 600 – 1,600 |
| Observabilidad | 600 – 1,000 |
| Dominios, certificados, misceláneos | 200 – 400 |
| **Subtotal infraestructura** | **4,900 – 9,400** |

Es entre **1.7% y 3.4%** de los 280,000 originales.

**Licencias de terceros:** base de medicamentos con interacciones 4,000–25,000/mes (rango amplio a propósito: pendiente de cotizar, ver §12.5); CIE-10 y LOINC gratuitos; video 0–800/mes cuando entre teleconsulta.

**Burn de equipo en construcción (14 semanas):** 182,000–280,000/mes (tech lead 80–120k, full-stack medio 45–70k, diseño 60% 35–55k, QA 50% 22–35k).

**Burn de equipo en operación:** 126,000–214,000/mes. **Si el tech lead es cofundador con participación en lugar de salario, baja a 46,000–94,000/mes.** Esa sola decisión cambia tu supervivencia por un factor de dos a tres, y es la razón por la que §12.6 la trata como la prioridad número uno del proyecto.

### 11.4 Punto de equilibrio

Con plan único de 799 MXN/mes:

| Burn mensual | Médicos pagando para equilibrio |
|---|---|
| 110,000 (tech lead con participación) | **138 médicos** |
| 165,000 | **207 médicos** |
| 250,000 | **313 médicos** |

Jalisco tiene alrededor de 36,200 médicos generales y familiares. 138–313 médicos es una fracción pequeña del mercado local, pero es un trabajo de ventas de 18–24 meses, no de 6. La cifra es más alta que la de tu documentación original porque eliminamos el ingreso de pacientes, que no está validado.

---

## 12. ROADMAP Y ESTIMACIÓN

### 12.1 Equipo mínimo

| Rol | Dedicación | Notas |
|---|---|---|
| Tech lead / full-stack senior | 100% | Imprescindible. Toma las decisiones de arquitectura |
| Full-stack medio | 100% | |
| Diseñador de producto UX/UI | 60% las primeras 8 semanas | Se concentra en `DOC-06` |
| QA | 50% desde semana 6 | |
| Tú (product owner + criterio clínico) | 30% | **No delegable.** Eres el único que sabe cómo se documenta una consulta de verdad |

### 12.2 Cronograma — 14 semanas a producción con médicos piloto

| Semanas | Entregable | Puerta de salida |
|---|---|---|
| 0 | Kickoff: aprobar §1.3, §2, §4.3. Iniciar trámite de WhatsApp Business. Contratar abogado. Contratar proveedor de pentest | Alcance firmado |
| 1–2 | Infraestructura, IaC, CI/CD, esquema de base de datos, M1 (auth + MFA + consentimientos) | Un médico se registra y entra con MFA |
| 3 | M2 (perfil + verificación) + `ADM-01/02` | Admin verifica un médico de punta a punta |
| 4–5 | M4 (agenda) con pruebas de concurrencia | 50 solicitudes paralelas → 1 cita |
| 6–7 | M5 (citas) + M12 (notificaciones) + `PUB-07/08/09/10` | Paciente agenda por enlace y recibe recordatorio |
| 8–10 | **M8 (expediente) — el bloque más importante.** `DOC-05/06/14` | 5 médicos completan consultas reales en staging con datos ficticios |
| 11–12 | M9 (receta) + M10 (órdenes) + PDF + QR | Receta válida emitida, firmada, verificable |
| 13 | M6 (suscripción) + M13 + M15 (endurecimiento) + pentest | Sin hallazgos críticos |
| 14 | Estabilización, restauración de respaldo, revisión legal final, piloto con 5 médicos | **Producción** |
| 15–20 | Piloto cerrado: 20–30 médicos, iteración semanal | Métricas de §12.4 |

**Riesgos de cronograma:** el trámite de WhatsApp y la revisión legal son externos y pueden desplazar la fecha. Ambos deben arrancar en la semana 0.

### 12.3 Estimación de costo (Guadalajara, agosto 2026)

| Concepto | Rango MXN |
|---|---|
| Tech lead senior, 3.5 meses | 280,000 – 420,000 |
| Full-stack medio, 3.5 meses | 160,000 – 245,000 |
| Diseño UX/UI | 70,000 – 130,000 |
| QA (medio tiempo, 2 meses) | 50,000 – 80,000 |
| Revisión legal (paquete completo, ley 2025) | 60,000 – 120,000 |
| Prueba de penetración | 80,000 – 200,000 |
| Infraestructura y servicios (14 semanas) | 25,000 – 45,000 |
| Contingencia 15% | 110,000 – 185,000 |
| **Total MVP a producción** | **835,000 – 1,425,000** |

Comparado con los MXN 250,000 documentados. **Este es el hallazgo financiero más importante del análisis** y hay que resolverlo antes de contratar a nadie. Tres caminos: (a) levantar capital con esta especificación como soporte técnico — es exactamente el documento que un inversionista ángel quiere ver; (b) recortar a un "pre-MVP" de 6 semanas (expediente + receta, sin agenda, sin pagos, sin portal de paciente) por MXN 300,000–400,000, y venderlo a 10 médicos para financiar el resto; (c) buscar un cofundador técnico que aporte el desarrollo por participación, lo que convierte el costo en dilución.

**La opción (b) es la que recomiendo si el capital es la restricción real.** Un médico que documenta y receta en Medicfy ya está dentro del producto; todo lo demás se construye alrededor de él.

### 12.4 Métricas que deciden si seguir

Al final del piloto (semana 20), la pregunta no es cuántos médicos se registraron:

| Métrica | Umbral de continuar | Umbral de replantear |
|---|---|---|
| Médicos que documentan ≥10 consultas/semana en Medicfy | ≥60% de los activados | <30% |
| Tiempo medio de documentación por consulta | ≤4 min | >7 min |
| Retención de médicos al mes 3 | ≥70% | <50% |
| Recetas emitidas por médico activo/semana | ≥8 | <3 |
| Recetas rechazadas en farmacia | <2% | >10% |
| Médicos que pagarían al terminar el periodo gratuito | ≥50% | <25% |
| Incidentes de seguridad | 0 | ≥1 |

Si a la semana 20 los médicos se registran pero no documentan, el producto no resolvió su problema y ninguna cantidad de marketing lo arregla.

---

## 13. REGISTRO DE RIESGOS

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Presupuesto insuficiente por 3–5x | **Alta** | **Crítico** | §12.3, opción (b) |
| R2 | Documentos legales inválidos por ley 2025 | **Alta (ya ocurrió)** | **Crítico** | §3.1, abogado en semana 0 |
| R3 | Ambigüedad sobre tipo de firma exigido | Media | **Crítico** | §3.2, firma abstraída |
| R4 | Farmacias rechazan la receta electrónica | Media | Alto | Piloto con 3 farmacias de Guadalajara **antes** de la semana 12; PDF imprimible con QR como respaldo siempre disponible |
| R5 | Médicos no adoptan por resistencia al cambio | **Alta** | **Crítico** | `DOC-06` obsesivamente pulida; plantillas; importación de datos; acompañamiento presencial de los primeros 30 |
| R6 | Brecha de datos clínicos | Baja | **Catastrófico** | §M15 completo, pentest, cifrado, bitácora, seguro de responsabilidad cibernética |
| R7 | Doctoralia lanza expediente/receta competitivo | Media | Alto | Ventaja en profundidad clínica y en laboratorios; velocidad |
| R8 | Catálogo de medicamentos sin licencia limita alertas | **Alta** | Alto | §M9 dependencias; alergias sí desde día 1 |
| R9 | Trámite de WhatsApp retrasa el lanzamiento | Media | Medio | Iniciar semana 0; email como respaldo |
| R10 | Tú como único punto de decisión clínica te saturas | **Alta** | Alto | Reclutar 2 médicos asesores del piloto como consejo clínico |
| R11 | Verificación manual de cédulas no escala | Media | Medio | Umbral definido: a los 150 médicos, contratar proveedor |
| R12 | Responsabilidad clínica por sugerencia de IA | Media | **Catastrófico** | IA fuera del MVP; §2.3 |
| **R13** | **Cofundador técnico ausente — RIESGO NÚMERO UNO DEL PROYECTO** | **Confirmada** | **Crítico** | Confirmado por el fundador: no hay tech lead ni cofundador técnico. Supera al presupuesto como riesgo principal. Mitigación completa en §12.6 |
| R14 | **Marca:** IMPI rechazó la clase 44 (servicios médicos) por confusión con un signo anterior | **Confirmada** | Alto | Postura estricta de intermediario tecnológico en toda comunicación (§12.7); clases 9 y 42 vigentes; monitoreo de la marca anterior |
| R15 | Mercado local insuficiente para una tesis de Serie A: el SAM de la ZMG es de ~MXN 85 M/año | Alta | Alto | La conversación con inversionistas se ancla en el TAM nacional (~MXN 1,026 M/año en suscripción de médicos) y en las capas 2 a 7 de monetización, nunca solo en Guadalajara. Ver Módulo 1 §3.2 |
| R16 | Diferir el gasto legal hasta después del MVP | Media | **Crítico si se cruza la línea** | Se puede construir y demostrar el MVP completo sin gasto legal, con datos sintéticos. **No se puede meter un solo paciente real sin sociedad constituida y aviso de privacidad válido.** Ruta de dos fases en §12.8 |

---

## 14. REGISTRO DE DECISIONES CERRADAS

Toda decisión de esta tabla está tomada. Ninguna requiere aprobación adicional para que el desarrollo arranque. Si alguna se revierte, la reversión se documenta aquí con fecha y motivo.

| # | Decisión | Estado |
|---|---|---|
| D01 | Opción 1: herramienta clínica del médico primero | Cerrada |
| D02 | Alcance del MVP: 9 módulos, 47 pantallas, 14 semanas | Cerrada |
| D03 | Sin apps nativas; PWA instalable | Cerrada |
| D04 | Monolito modular; sin microservicios, Kafka ni Kubernetes | Cerrada |
| D05 | Sin portal de laboratorios en v1.0 (orden en PDF firmado) | Cerrada |
| D06 | Sin IA en v1.0; asistencia documental en v1.2; nunca sugerencia diagnóstica sin expediente regulatorio | Cerrada |
| D07 | Sin chat médico-paciente en v1.0 | Cerrada |
| D08 | Sin suscripción de pacientes hasta validar demanda con una landing y pago real | Cerrada |
| D09 | Paleta única; se elimina el color por rol | Cerrada |
| D10 | Plan único de médico: **MXN 799/mes** | Cerrada |
| D11 | **10 médicos fundadores, 3 meses gratis, 50% permanente después**; del 11 en adelante, 30 días de prueba | Cerrada (reemplaza la política de 30 médicos × 6 meses) |
| D12 | Stack: Next.js 15 + NestJS + PostgreSQL 16 + Redis, sujeto a validación del tech lead | Cerrada |
| D13 | Medicamentos controlados Grupos I y II bloqueados por diseño | **No negociable** |
| D14 | Expediente append-only: sin edición ni borrado de notas firmadas, por nadie | **No negociable** |
| D15 | Admin sin acceso a contenido clínico; break-glass con doble aprobación | **No negociable** |
| D16 | Rol de asistente de médico | Cerrada |
| D17 | Menores de edad dentro del alcance, con modelo de tutor y revocación automática a los 18 | Cerrada |
| D18 | Dos modos de documentación (historia clínica / nota de evolución) | Cerrada |
| D19 | 4 esquemas de especialidad en v1.0 (MG, GO, pediatría, MI); el resto usa esquema base | Cerrada |
| D20 | Registro de prescripción externa para controlados | Cerrada |
| D21 | Prescripción consciente del costo, con orden nunca vendible | Cerrada |
| D22 | Firma abstraída en dos implementaciones intercambiables | Cerrada |
| D23 | Medición del tiempo de documentación como métrica norte del negocio | Cerrada |
| D24 | Solo suscripción del médico; el pago de la consulta ocurre fuera de la plataforma en v1.0 | Cerrada |
| D25 | Verificación manual de cédulas contra el portal de la SEP, con equipo dedicado | Cerrada |
| D26 | Nota reservada incluida, con uso justificado y auditado | Cerrada |

---

## 15. LOS TRES PLANES QUE RESUELVEN LOS RIESGOS CRÍTICOS

### 15.1 Tech lead — el riesgo número uno (R13)

Con esta especificación en la mano y sin responsable técnico permanente, el escenario más probable es un segundo código inservible y menos dinero. Una plataforma con expedientes clínicos necesita a alguien que responda de madrugada, aplique parches, adapte el sistema cuando cambie una NOM y recuerde por qué cada decisión se tomó así. Una agencia entrega y se va.

Hay un problema adicional: **siendo médico, no tienes forma de evaluar técnicamente a quien contrates.** Sin criterio propio, el proveedor decide el stack, los plazos y cuándo está "terminado".

**Las tres salidas, en orden de preferencia:**

| Opción | Costo | Veredicto |
|---|---|---|
| **(a) Cofundador técnico con participación** (15–35%, vesting 4 años, cliff 1 año) | Dilución, no efectivo | **La mejor.** Baja el burn de operación a 46–94k/mes y alinea incentivos a años. Tus inversionistas van a preferir financiar una empresa con equipo técnico que a un médico con una especificación. Consulta la estructura con tu abogado corporativo |
| (b) Tech lead de tiempo completo | 80–120k/mes | Funciona; consume runway rápido y no resuelve retención |
| (c) Agencia + tech lead propio a medio tiempo que la supervise | Mayor total | Salida pragmática si no encuentras cofundador en 6–8 semanas |
| **(d) Agencia sola, sin nadie técnico de tu lado** | — | **Descartada.** Es exactamente el escenario que ya te costó una versión del producto |

**Protocolo de evaluación sin ser técnico:**

1. Mándale esta especificación y pídele **una crítica escrita de dos páginas**. Alguien competente va a estar en desacuerdo con algo aquí y lo va a fundamentar. **Descarta a cualquiera que no cuestione nada:** no leyó el documento o no tiene criterio.
2. *"¿Cómo evitarías que dos pacientes agenden el mismo horario al mismo tiempo?"* → La respuesta correcta menciona una restricción a nivel de base de datos. Si dice "validando antes de guardar", no ha operado un sistema de citas bajo concurrencia.
3. *"¿Por qué no harías microservicios aquí?"* → Si los defiende para un equipo de dos personas, está optimizando su curriculum.
4. *"¿Qué harías si te pido borrar una nota clínica firmada?"* → La respuesta correcta es negarse y proponer nota de corrección. Si dice que sí, no entiende el dominio.
5. **Prueba pagada de 1–2 semanas** antes de cualquier compromiso: que construya M1 completo (registro + MFA + consentimientos). Págala. Aprenderás más en esas dos semanas que en diez entrevistas.

### 15.2 Ruta legal de dos fases (R16)

> **Puedes construir el MVP completo sin gastar un peso en legal. No puedes poner a un solo paciente real dentro sin sociedad constituida y aviso de privacidad válido.**

Sin sociedad, el responsable del tratamiento eres tú como persona física, con tu patrimonio personal respondiendo por una brecha de datos clínicos. Y sin aviso conforme a la ley de 2025, el consentimiento que recabes es inválido: **todo el expediente del piloto quedaría viciado en su origen** y habría que recabarlo otra vez, paciente por paciente.

**Fase 1 — antes de tocar datos reales (semana 12, no antes):**

| Concepto | MXN |
|---|---|
| Constitución de sociedad (SAPI de C.V., por tener inversionistas) + notario + RFC | 20,000 – 40,000 |
| Aviso de privacidad integral y simplificado conforme LFPDPPP 2025 | 15,000 – 30,000 |
| Términos y condiciones de paciente | 8,000 – 15,000 |
| Contrato con el médico (incluye la cláusula de conservación de expedientes 5 años) | 15,000 – 30,000 |
| **Mínimo para pilotar legalmente** | **58,000 – 115,000** |

**Fase 2 — al escalar (mes 8–12):** contratos con laboratorios, política de IA, contratos de encargo con proveedores, política de retención y supresión, plan de respuesta a incidentes revisado. 40,000–80,000 adicionales.

**Mientras tanto (semanas 0–11):** todo el desarrollo y todas las demos con **datos sintéticos exclusivamente**, ya obligatorio por M15-RN-009. Se puede vender y validar perfectamente así. Cero cuentas de paciente real, cero notas clínicas reales, cero recetas emitidas a una persona.

**Lo que no se puede diferir:** la prueba de penetración (80,000–200,000). Es lo único del presupuesto que protege contra R6. Una brecha de expedientes en el mes 3 no es un problema técnico: es el fin del proyecto. Si el capital obliga a recortar, recorta alcance de producto, no esto.

### 15.3 Disciplina de marca por el rechazo en clase 44 (R14)

IMPI rechazó la clase 44 por confusión con un signo anterior registrado para servicios relacionados. Las clases 9 (software) y 42 (servicios tecnológicos) están concedidas y vigentes, y esa es precisamente la postura correcta: **Medicfy no presta servicios médicos; los prestan los médicos usuarios.**

Eso protege la marca y la responsabilidad civil a la vez, pero obliga a una regla de comunicación sin excepciones, que entra al manual de tono de voz y a la revisión de cada texto de interfaz:

| Prohibido | Correcto |
|---|---|
| "Consulta con Medicfy" | "Agenda con el Dr. X a través de Medicfy" |
| "Los médicos de Medicfy" | "Médicos verificados que usan Medicfy" |
| "Atención médica Medicfy" | "Plataforma para médicos y sus pacientes" |
| "Medicfy te atiende" | "Medicfy es la herramienta clínica de tu médico" |

---

## 16. LO ÚNICO QUE SIGUE ABIERTO

Dos insumos, y **ninguno de los dos bloquea el arranque del desarrollo**:

**1. Capital y runway.** No puedo calcularlo sin tus cifras, y no necesitas compartírmelas. Llena esto:

| Dato | Tu número |
|---|---|
| A — Capital disponible hoy (en cuenta) | |
| B — Capital comprometido, no depositado | |
| C — ¿B está condicionado a hitos? ¿Cuáles? | |
| D — Tu retiro personal mensual del proyecto | |
| E — Burn mensual elegido (§11.3) | |

```
Runway en construcción (meses) = A ÷ (E + D)
Primer ingreso                 = mes 7 (política D11)

Runway ≥ 9 meses  → arranca, con margen
Runway 7–9 meses  → arranca, sin margen para errores
Runway < 7 meses  → NO ARRANQUES. Levanta capital primero
```

Si el resultado es menor a 7 meses, la decisión correcta no es empezar más barato: es no empezar todavía. Un MVP a medio construir con el dinero agotado no tiene valor de rescate — no se vende, no se pilotea y no convence a un inversionista. Dos meses levantando capital con esta documentación en la mano rinden más, y es exactamente para lo que sirve.

**2. Tu material clínico.** Necesario para diseñar `DOC-06`, que es la pantalla que decide si el producto vive: el texto real de una primera consulta y de un seguimiento con tus abreviaturas, el orden en que llenas las secciones, y las frases que repites en el 80% de los casos. Puedes dictarlo por voz y pegarlo sin editar.

**3. Origen de los precios de medicamentos.** ¿Los captura tu equipo, los aporta un distribuidor, o se obtienen de otra fuente? Define si M9-RN-015 es una función mantenible o una que envejece en tres meses. Autorización para cotizar la base con interacciones: **otorgada** por defecto, D21.

---

**Fin del documento v2.0 — APROBADO Y CONGELADO.** Los cambios posteriores se registran en §14 con fecha y motivo.

---

## 17. REGISTRO DE CAMBIOS

### v2.5 — 2 septiembre 2026

Origen: el fundador pidió un módulo de lectura e interpretación de estudios de laboratorio en 4 capas separadas para el Escritorio de Consulta — extracción OCR de la hoja subida (con nivel de confianza por valor y revisión obligatoria del médico antes de guardar nada), marcado determinista de fuera de rango/crítico contra el rango impreso o una tabla propia curada, sección tipada en la nota firmada, e interpretación opcional por el Segundo Lector. Investigación previa a escribir código encontró dos cosas que se le presentaron antes de continuar: (1) la nota de "Casos límite" original de este mismo módulo (v1.0) decía textualmente que "valores críticos" requerían "reglas por analito... fuera de alcance del MVP (v1.2)" — el fundador confirmó reabrir esa exclusión con esa nota ya sobre la mesa; (2) ni el motor OCR ni una tabla de rangos de referencia propia tenían precedente en ningún documento de especificación anterior — se le preguntó directamente qué motor usar (Claude con visión vs. un servicio de OCR dedicado) y, dentro de esa segunda opción, cuál proveedor; en un primer momento eligió AWS Textract. Se construyó y verificó así (degradación honesta confirmada en vivo). El mismo día, el fundador revirtió esa decisión explícitamente: usar la visión de Claude (misma `ANTHROPIC_API_KEY` del Segundo Lector) en vez de una integración de AWS aparte — la Capa 1 completa se reconstruyó sobre ese motor sin tocar el resto de la arquitectura (tablas de espera, regla de oro, confianza por valor, clasificación por contenido — ahora hecha por el propio modelo al leer la imagen — y el plan de captura manual).

| Cambio | Tipo |
|---|---|
| M10-RN-006 a M10-RN-011, M10-CA-004 a M10-CA-006 (dentro de M10, §7) | Reglas nuevas — revierten conscientemente la exclusión de "valores críticos" de la v1.0 de este módulo, documentado ahí mismo |
| `lab_sheet_extractions`, `lab_sheet_extraction_candidates`, `lab_reference_ranges`, `note_lab_results` (§6.7); `lab_result_analytes` gana `source` | Entidades nuevas / extensión de una existente |
| `POST/GET /lab-sheet-extractions/...`, `GET/POST /lab-reference-ranges/...` (§8.1) | Endpoints nuevos |
| Rol `CURATOR` (ya existente desde la Fase 0 de catálogos) gana autoridad sobre `lab_reference_ranges` — fila nueva en la matriz de permisos (§5.2) | Extensión de un rol existente, no uno nuevo |
| Capa 1 — visión de Claude (reutiliza `ANTHROPIC_API_KEY`, sin credencial nueva) | Decisión revertida sobre la marcha: se construyó primero con AWS Textract (`@aws-sdk/client-textract` + `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION`), luego el fundador pidió explícitamente reemplazarlo por Claude — ambas dependencias/variables de AWS se retiraron por completo |

**Fuera de esta versión, deliberadamente**: escalamiento activo de valores críticos (notificación push/SMS urgente) — el fundador pidió el marcado visual, no un flujo de alertas fuera de la pantalla, que sería inventar un requisito de negocio no pedido (CLAUDE.md §7).

### v2.4 — 1 septiembre 2026

Origen: el fundador pidió reemplazar `/` (hoy la página de reclutamiento de médicos, PUB-01) por un marketplace de descubrimiento de pacientes, mostrando una segunda referencia visual ("MedMarket"). Se le señaló el conflicto (`/` está construida alrededor de §1.3, "véndele al médico") antes de tocar código. Decisión del fundador: mover el reclutamiento a `/para-medicos` en vez de descartarlo, y construir el marketplace en `/`.

| Cambio | Tipo |
|---|---|
| `/para-medicos` (antes `/`) | Reubicación de contenido existente, sin cambios de copy |
| `/` — home de descubrimiento del paciente | Pantalla nueva |
| M3-RN-006/M3-CA-005 — filtros `teleconsultation`/`acceptsNewPatients`/`language`/`location` en `GET /doctors/public` | Extensión de M3 sobre campos que ya existen — ninguno nuevo |
| M3-RN-007/M3-CA-006 — `GET /patients/me/doctors` | Endpoint nuevo, sección "Tus médicos" |
| Búsqueda por síntoma, subespecialidad, hospital/institución, "cerca de mí" con geolocalización | Pedidos por el fundador pero **no construidos**: el primero exige un juicio clínico que CLAUDE.md prohíbe inventar sin validación médica (`PENDIENTE(jorge)`); los otros tres exigen datos que el modelo no captura hoy — agregarlos habría sido fingir precisión inexistente (CLAUDE.md §7) |

### v2.3 — 1 septiembre 2026

Origen: el fundador compartió una captura de referencia de otra aplicación ("MedNetwork") pidiendo un perfil de médico "tal cual, con todo" — búsqueda de directorio, agendamiento real del paciente, likes/comentarios, y formación académica de varias instituciones. Antes de escribir código se le presentó explícitamente que esto reabre tres decisiones ya tomadas y documentadas: §1.3 (no competir con Doctoralia en efecto de red — la exclusión de M3), la ausencia total de portal de paciente en el frontend, y M6-RN-006 (sin pasarela de pago para la consulta). El fundador confirmó, con esa información ya sobre la mesa, que quiere construirlo de todas formas. Esta versión documenta esa decisión consciente **antes** de instalar el código, siguiendo la regla de procedencia que la v2.1 estableció.

| Cambio | Tipo |
|---|---|
| Módulo nuevo M3 — Directorio y búsqueda de médicos, sin reseñas (§7) | Reversión consciente de la exclusión de §2.2/§1.3 — autorizada explícitamente por el fundador, con la advertencia estratégica ya conocida. Las reseñas/calificaciones NO se autorizaron y siguen excluidas |
| M5-RN-009 a M5-RN-012, M5-CA-006 a M5-CA-008 (§7, dentro de M5) | Completa M5-RN-007/M5-RN-008 y M5-CA-005, que ya estaban escritos desde la v2.0/v2.1 pero nunca se implementaron de punta a punta — no es una regla nueva, es cerrar una ya existente. La única regla genuinamente nueva es M5-RN-010 (resolución server-side del `patient_id`, motivada por el hallazgo de IDOR ya documentado en el código de `appointment-state-machine.service.ts`) |
| M2B-RN-010 a M2B-RN-013, M2B-CA-009 a M2B-CA-013 (§7, dentro de M2B) | Reacciones y comentarios — la v2.2 los había excluido explícitamente ("fuera de esta versión"); el fundador los pidió al mostrar la referencia visual |
| M2-RN-007/M2-RN-008, M2-CA-010/M2-CA-011 (§7, dentro de M2) — formación académica | Extensión nueva. `university` no se elimina (evita migración destructiva); `doctor_education` la complementa cuando existe |
| `doctor_education`, `doctor_post_likes`, `doctor_post_comments` (§6.3) | Entidades nuevas |
| Nota en `patients` (§6.2): `source=self_signup` ahora crea la fila, no solo el `user` | Cierra un hueco real, confirmado leyendo `auth.service.ts`: el registro de paciente nunca creaba esta fila |
| `GET /doctors/public`, endpoints de like/comentario, `/doctors/me/education`, `/patients/me`, `/patients/me/appointments` (§8.1) | Endpoints nuevos |
| Filas nuevas en la matriz de permisos (§5.2): directorio, like/comentario, agendamiento por enlace público | Consecuencia directa de los módulos nuevos |

**Fuera de esta versión, deliberadamente** (nadie los pidió — construirlos sería inventar, CLAUDE.md §7): reseñas/calificaciones de pacientes sobre médicos, pasarela de pago para la consulta (M6-RN-006 ya decidió que no), mensajería médico-paciente, "seguir médicos" y "guardar publicaciones" (ya excluidos en v2.2, sin cambios).

### v2.2 — 1 septiembre 2026

Origen: pedido directo del fundador al agente de código, en conversación, el 1 de septiembre de 2026 — que el perfil del médico admita publicaciones con audiencia elegible (pública / solo mis pacientes / privada). Se verificó contra §1.3/§2.2 antes de escribir código: el pedido original (recibido primero en una versión mucho más amplia, con feed tipo red social, congresos y publicaciones como contenido, seguir/guardar/reaccionar médicos) se solapaba con **M3 — directorio con búsqueda y reseñas**, excluido a propósito del MVP por riesgo de competir con Doctoralia en efecto de red (la recomendación de mayor peso del documento, §1.3). Se le presentó esta tensión al fundador explícitamente, junto con el hallazgo de que no existe portal de pacientes en el frontend. Decisión del fundador, en dos pasos: (1) autorizar las tres audiencias, incluida la pública, aceptando conscientemente que esto adelanta la parte de M3 que consiste en *enriquecer un perfil que un paciente ya visitó* — no la parte de *búsqueda/descubrimiento de médicos nuevos ni reseñas*, que sigue excluida; (2) para "solo mis pacientes", construir la autorización real en backend ahora y dejar la vista del lado del paciente pendiente de que exista un portal de pacientes, en vez de construir ese portal en este mismo pase o dejar la opción sin ningún efecto real.

| Cambio | Tipo |
|---|---|
| Módulo nuevo M2B — Publicaciones del médico y control de audiencia (§7) | Módulo nuevo, no estaba en ningún borrador anterior de este documento |
| `doctor_posts`, `doctor_post_media` (§6.3) | Entidades nuevas |
| `GET/POST /doctors/me/posts`, `GET/PATCH/DELETE /doctors/me/posts/{id}`, `POST /doctors/me/posts/{id}/media`, `GET /doctors/{slug}/public/posts`, `GET /doctors/{id}/posts/patients-only`, `POST /admin/doctor-posts/{id}/archive` (§8.1) | Endpoints nuevos |
| `GET /doctors/{slug}/public/services` (§8.1) | Documenta un endpoint que ya existía en el código (construido junto con M5-RN-007) pero no estaba listado en el inventario — corrección de una omisión, no una regla nueva |
| Fila de M3 en §2.2 aclarada: la búsqueda/descubrimiento y las reseñas de pacientes siguen fuera del MVP; solo se autorizó la publicación de contenido en un perfil ya existente (M2B) | Aclaración de alcance sobre una exclusión ya existente, no una reversión de M3 completo |
| Video en `doctor_post_media`: formato y límite de tamaño | Marcado `PENDIENTE(jorge)` — no hay cifra definida, no se inventa aquí (protocolo de CLAUDE.md §12) |
| Visibilidad del **perfil completo** (público/limitado/privado-para-pacientes, distinta de la audiencia por publicación) | Pedida por el fundador en el mismo mensaje, pero sin alcance operativo definido todavía (qué campos exactos gatilla, si un perfil "limitado" sigue siendo agendable) — queda explícitamente fuera de esta versión, no construida, para no inventar ese diseño sin su decisión |

**Pendiente, no resuelto por esta versión:** el límite de tamaño/formato de video en publicaciones (`PENDIENTE(jorge)`), el diseño de "visibilidad del perfil completo" como sistema aparte de la audiencia por publicación, y el portal de pacientes del que depende la vista real de "solo mis pacientes".

### v2.1 — agosto 2026

Origen: al construir M1 y M2, el mapeo de reglas de negocio contra criterios de aceptación reveló que 15 reglas tenían solo 10 criterios. Siete reglas no tenían ninguno, y por eso nadie las probaba.

| Cambio | Tipo |
|---|---|
| M1-CA-007 a M1-CA-013 (7 criterios nuevos) | Cobertura de M1-RN-001, 003, 004, 006, 007, 008, 009. Criterios nuevos sobre reglas que ya existían en la v2.0. No se añadió ninguna regla de negocio. |
| M2-CA-005 a M2-CA-008 (4 criterios nuevos) | Cobertura de M2-RN-002, 004, 005, 006. Mismo caso |
| M2-CA-002 reescrito | La v2.0 solo nombraba "cédula"; ahora nombra los cuatro campos inmutables de AUTH-RN-004 y distingue antes/después de la verificación |
| Reversión a `draft` al editar un campo legal en `submitted` | Adición de comportamiento, no aclaración. No estaba en la v2.0 ni se deriva de M2-RN-001 |
| `patients` reasignado de M2 a M5 en §8.1 y §7 | Corrección de una contradicción de la v2.0 entre el inventario de endpoints y el alcance narrado de M2 |
| `doctor_documents`: columna de vencimiento | Se captura desde ahora; el recordatorio a 60 días queda en `CRITERIOS_DIFERIDOS.md` |

**Regla de procedencia, a partir de esta versión.** Todo cambio a este documento se registra aquí antes de instalarse en `/docs`, indicando si es criterio nuevo sobre regla existente, adición de comportamiento o corrección de contradicción. Un criterio redactado en una conversación no es canon hasta que aparece en este registro y el archivo está en el repositorio. El agente de código debe rechazar cualquier requisito que no cumpla las dos condiciones.

### v2.1.1 — 14 agosto 2026

Origen: aclaración dada directamente por el fundador al agente de código, en conversación, el 14 de agosto de 2026 — no proviene de un archivo `v2.1.1` preexistente (se verificó que no existe ninguno en el repositorio ni en las carpetas del fundador). El agente la redacta aquí, en el formato de la especificación, siguiendo la regla de procedencia de la v2.1: primero este registro, después el código.

| Cambio | Tipo |
|---|---|
| `rejected` se agrega a los estados donde se permite corregir campos legales (M2-CA-002), con reversión a `draft` igual que `submitted` | Aclaración normativa sobre un criterio ya existente (M2-CA-002), no una regla de negocio nueva. Motivo: un médico rechazado recibe un correo pidiéndole corregir, y el motivo más común de rechazo es un campo legal mal capturado; sin ruta de corrección el flujo de rechazo no tiene salida |

**Pendiente, no resuelto por esta versión.** Dos referencias señaladas en el registro de la v2.1 siguen sin verificarse en ningún archivo accesible al agente: la columna de vencimiento en `doctor_documents` (§6.3 no la define) y el archivo `CRITERIOS_DIFERIDOS.md` (no existe en el repositorio). Ambas quedan abiertas hasta que el fundador las provea de forma verificable.
