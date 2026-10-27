import { common } from "./common";
import { nav } from "./nav";
import { landing } from "./landing";
import { catalogos } from "./catalogos";
import { ui } from "./ui";
import { validacion } from "./validacion";
import { auth } from "./auth";
import { paraMedicos } from "./paraMedicos";
import { directorio, verificacionPublica } from "./directorio";
import { perfilPublico } from "./perfilPublico";
import { cuenta } from "./cuenta";
import { agenda, citaNueva, citaReprogramar } from "./agenda";
import { pacientes, tipoEncuentro } from "./pacientes";
import { consulta } from "./consulta";
import { teleconsulta } from "./teleconsulta";
import { clinico, red } from "./clinico";
import { perfil } from "./perfil";
import { disponibilidad } from "./disponibilidad";
import { publicaciones } from "./publicaciones";
import { admin, auditoria } from "./admin";

// El diccionario español es el canónico: de su forma se deriva el
// tipo que obliga al inglés a tener exactamente las mismas claves.
// Agregar una cadena aquí y olvidarla en en/ es un error de
// compilación, no una pantalla a medio traducir.
export const es = {
  common,
  nav,
  landing,
  catalogos,
  ui,
  validacion,
  auth,
  paraMedicos,
  directorio,
  verificacionPublica,
  perfilPublico,
  cuenta,
  agenda,
  citaNueva,
  citaReprogramar,
  pacientes,
  tipoEncuentro,
  consulta,
  teleconsulta,
  clinico,
  red,
  perfil,
  disponibilidad,
  publicaciones,
  admin,
  auditoria,
};

export type Dictionary = typeof es;
