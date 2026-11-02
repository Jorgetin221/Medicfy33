// Catálogos del servidor que sí se traducen en el cliente.
//
// REGLA: aquí solo entra vocabulario de navegación con un catálogo
// cerrado, pequeño y de códigos estables. NO entran diagnósticos
// CIE-10, nombres de medicamento ni analitos de laboratorio: esos son
// dato clínico catalogado, se muestran exactamente como están
// registrados, y traducirlos en el cliente sería inventar
// terminología médica delante de quien prescribe.
export const catalogos = {
  // Las 4 especialidades del MVP, por `code` (no por nombre: el
  // nombre puede cambiar en el catálogo, el código no). Un código que
  // no esté aquí cae de vuelta al nameEs del servidor.
  especialidades: {
    ALERGIA_E_INMUNOLOGIA_CLINICA: "Alergia e Inmunología Clínica",
    ANATOMIA_PATOLOGICA: "Anatomía Patológica",
    ANESTESIOLOGIA: "Anestesiología",
    ANGIOLOGIA_CIRUGIA_VASCULAR_Y_ENDOVASCULAR: "Angiología, Cirugía Vascular y Endovascular",
    AUDIOLOGIA_OTONEUROLOGIA_Y_FONIATRIA: "Audiología, Otoneurología y Foniatría",
    CALIDAD_DE_LA_ATENCION_CLINICA: "Calidad de la Atención Clínica",
    CARDIOLOGIA: "Cardiología",
    CIRUGIA_CARDIOTORACICA: "Cirugía Cardiotorácica",
    CIRUGIA_GENERAL: "Cirugía General",
    CIRUGIA_ONCOLOGICA: "Cirugía Oncológica",
    CIRUGIA_PEDIATRICA: "Cirugía Pediátrica",
    CIRUGIA_PLASTICA_Y_RECONSTRUCTIVA: "Cirugía Plástica y Reconstructiva",
    COLOPROCTOLOGIA: "Coloproctología",
    DERMATOLOGIA: "Dermatología",
    ENDOCRINOLOGIA: "Endocrinología",
    EPIDEMIOLOGIA: "Epidemiología",
    GASTROENTEROLOGIA: "Gastroenterología",
    GENERAL: "Medicina General",
    GENETICA_MEDICA: "Genética Médica",
    GERIATRIA: "Geriatría",
    GINECOLOGIA_OBSTETRICIA: "Ginecología y Obstetricia",
    HEMATOLOGIA: "Hematología",
    IMAGENOLOGIA_DIAGNOSTICA_Y_TERAPEUTICA: "Imagenología Diagnóstica y Terapéutica",
    INFECTOLOGIA: "Infectología",
    MEDICINA_DEL_ENFERMO_EN_ESTADO_CRITICO: "Medicina del Enfermo en Estado Crítico",
    MEDICINA_DEL_TRABAJO_Y_AMBIENTAL: "Medicina del Trabajo y Ambiental",
    MEDICINA_DE_LA_ACTIVIDAD_FISICA_Y_DEPORTIVA: "Medicina de la Actividad Física y Deportiva",
    MEDICINA_DE_REHABILITACION: "Medicina de Rehabilitación",
    MEDICINA_DE_URGENCIAS: "Medicina de Urgencias",
    MEDICINA_FAMILIAR: "Medicina Familiar",
    MEDICINA_INTERNA: "Medicina Interna",
    MEDICINA_LEGAL: "Medicina Legal",
    MEDICINA_NUCLEAR_E_IMAGENOLOGIA_MOLECULAR: "Medicina Nuclear e Imagenología Molecular",
    MEDICINA_PALIATIVA: "Medicina Paliativa",
    MEDICINA_PREVENTIVA: "Medicina Preventiva",
    NEFROLOGIA: "Nefrología",
    NEUMOLOGIA: "Neumología",
    NEUROCIRUGIA: "Neurocirugía",
    NEUROLOGIA: "Neurología",
    NUTRIOLOGIA_CLINICA: "Nutriología Clínica",
    OFTALMOLOGIA: "Oftalmología",
    ONCOLOGIA_MEDICA: "Oncología Médica",
    OTORRINOLARINGOLOGIA_Y_CIRUGIA_DE_CABEZA_Y_CUELLO: "Otorrinolaringología y Cirugía de Cabeza y Cuello",
    PATOLOGIA_CLINICA: "Patología Clínica",
    PEDIATRIA: "Pediatría",
    PSIQUIATRIA: "Psiquiatría",
    RADIO_ONCOLOGIA: "Radio-oncología",
    REUMATOLOGIA: "Reumatología",
    TRAUMATOLOGIA_Y_ORTOPEDIA: "Traumatología y Ortopedia",
    UROLOGIA: "Urología",
  },
};
