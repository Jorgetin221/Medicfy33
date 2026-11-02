// Recorte cuadrado de la foto de perfil, sin dependencias (CLAUDE.md §4):
// la imagen "cubre" un visor cuadrado, el médico la arrastra y la
// acerca, y lo que queda dentro del visor es lo que se guarda. Todo en
// funciones puras para poder probar la geometría sin un navegador.

export const CROP_OUTPUT_SIZE = 512;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

export interface CropState {
  zoom: number;
  // Esquina superior izquierda de la imagen, relativa al visor (≤ 0).
  x: number;
  y: number;
}

interface Geometry {
  viewport: number;
  naturalWidth: number;
  naturalHeight: number;
}

// Escala que hace que la imagen cubra el visor con zoom 1.
function coverScale({ viewport, naturalWidth, naturalHeight }: Geometry): number {
  return Math.max(viewport / naturalWidth, viewport / naturalHeight);
}

export function displayScale(geometry: Geometry, zoom: number): number {
  return coverScale(geometry) * zoom;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// La imagen nunca deja huecos dentro del visor.
export function clampOffset(geometry: Geometry, state: CropState): CropState {
  const scale = displayScale(geometry, state.zoom);
  const minX = geometry.viewport - geometry.naturalWidth * scale;
  const minY = geometry.viewport - geometry.naturalHeight * scale;
  return { zoom: state.zoom, x: clamp(state.x, minX, 0), y: clamp(state.y, minY, 0) };
}

export function centeredCrop(geometry: Geometry): CropState {
  const scale = displayScale(geometry, MIN_ZOOM);
  return {
    zoom: MIN_ZOOM,
    x: (geometry.viewport - geometry.naturalWidth * scale) / 2,
    y: (geometry.viewport - geometry.naturalHeight * scale) / 2,
  };
}

// Cambiar el zoom mantiene fijo el punto que está en el centro del visor.
export function zoomAroundCenter(geometry: Geometry, state: CropState, nextZoom: number): CropState {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const before = displayScale(geometry, state.zoom);
  const after = displayScale(geometry, zoom);
  const center = geometry.viewport / 2;
  const imageX = (center - state.x) / before;
  const imageY = (center - state.y) / before;
  return clampOffset(geometry, { zoom, x: center - imageX * after, y: center - imageY * after });
}

export function moveBy(geometry: Geometry, state: CropState, dx: number, dy: number): CropState {
  return clampOffset(geometry, { zoom: state.zoom, x: state.x + dx, y: state.y + dy });
}

// Rectángulo, en píxeles de la imagen original, que queda dentro del visor.
export function cropRect(geometry: Geometry, state: CropState): { sx: number; sy: number; size: number } {
  const scale = displayScale(geometry, state.zoom);
  // `+ 0` normaliza -0 (cuando la imagen toca el borde) a 0.
  return { sx: -state.x / scale + 0, sy: -state.y / scale + 0, size: geometry.viewport / scale };
}

// Dibuja el recorte en un canvas de 512×512 y lo devuelve como JPEG.
// Además de recortar, reduce el peso: una foto de celular de 6 MB
// queda en decenas de KB, muy por debajo del límite del servidor.
export async function renderCroppedPhoto(image: HTMLImageElement, geometry: Geometry, state: CropState): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = CROP_OUTPUT_SIZE;
  canvas.height = CROP_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este navegador no permite editar imágenes.");
  const { sx, sy, size } = cropRect(geometry, state);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, size, size, 0, 0, CROP_OUTPUT_SIZE, CROP_OUTPUT_SIZE);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("No se pudo preparar la foto.");
  return new File([blob], "foto-perfil.jpg", { type: "image/jpeg" });
}
