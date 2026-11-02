import { describe, expect, it } from "vitest";
import { MAX_ZOOM, centeredCrop, clampOffset, cropRect, moveBy, zoomAroundCenter } from "./photo-crop";

// Foto horizontal 1200×800 en un visor de 300: cubre por la altura.
const G = { viewport: 300, naturalWidth: 1200, naturalHeight: 800 };

describe("photo-crop", () => {
  it("centra la imagen cubriendo el visor y recorta el centro", () => {
    const state = centeredCrop(G);
    expect(state).toEqual({ zoom: 1, x: -75, y: 0 });
    expect(cropRect(G, state)).toEqual({ sx: 200, sy: 0, size: 800 });
  });

  it("nunca deja huecos: el arrastre se detiene en los bordes", () => {
    const state = centeredCrop(G);
    expect(moveBy(G, state, 500, 500)).toEqual({ zoom: 1, x: 0, y: 0 });
    expect(moveBy(G, state, -500, -500)).toEqual({ zoom: 1, x: -150, y: 0 });
    expect(clampOffset(G, { zoom: 1, x: 20, y: -999 })).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it("el zoom mantiene el centro y se limita entre 1 y 3", () => {
    const zoomed = zoomAroundCenter(G, centeredCrop(G), 2);
    const rect = cropRect(G, zoomed);
    expect(rect.size).toBeCloseTo(400);
    expect(rect.sx + rect.size / 2).toBeCloseTo(600);
    expect(rect.sy + rect.size / 2).toBeCloseTo(400);
    expect(zoomAroundCenter(G, zoomed, 10).zoom).toBe(MAX_ZOOM);
    expect(zoomAroundCenter(G, zoomed, 0).zoom).toBe(1);
  });

  it("el recorte siempre queda dentro de la imagen original", () => {
    let state = zoomAroundCenter(G, centeredCrop(G), 2.5);
    state = moveBy(G, state, -9999, -9999);
    const { sx, sy, size } = cropRect(G, state);
    expect(sx).toBeGreaterThanOrEqual(0);
    expect(sy).toBeGreaterThanOrEqual(0);
    expect(sx + size).toBeLessThanOrEqual(1200 + 1e-6);
    expect(sy + size).toBeLessThanOrEqual(800 + 1e-6);
  });
});
