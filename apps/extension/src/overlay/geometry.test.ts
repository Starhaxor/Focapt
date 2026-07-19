import { describe, expect, it } from "vitest";
import { clampOverlayPosition } from "./geometry";

describe("clampOverlayPosition", () => {
  it("altyazı kutusunu video sınırında tutar", () => {
    expect(
      clampOverlayPosition({
        x: 900,
        y: 700,
        overlayWidth: 300,
        overlayHeight: 100,
        videoWidth: 1000,
        videoHeight: 720
      })
    ).toEqual({ x: 700, y: 620 });
  });

  it("video kutudan küçükken güvenli başlangıç noktasına sabitler", () => {
    expect(
      clampOverlayPosition({
        x: 100,
        y: 100,
        overlayWidth: 800,
        overlayHeight: 600,
        videoWidth: 320,
        videoHeight: 180
      })
    ).toEqual({ x: 0, y: 0 });
  });

  it.each([
    { x: Number.NaN, y: Number.POSITIVE_INFINITY },
    { x: Number.NEGATIVE_INFINITY, y: Number.NaN }
  ])("sonlu olmayan koordinatları güvenli değere çevirir", ({ x, y }) => {
    expect(
      clampOverlayPosition({
        x,
        y,
        overlayWidth: 100,
        overlayHeight: 50,
        videoWidth: 640,
        videoHeight: 360
      })
    ).toEqual({ x: 0, y: 0 });
  });

  it("negatif veya sonlu olmayan ölçülerde sonlu sonuç üretir", () => {
    const result = clampOverlayPosition({
      x: 40,
      y: 30,
      overlayWidth: -20,
      overlayHeight: Number.NaN,
      videoWidth: Number.POSITIVE_INFINITY,
      videoHeight: -1
    });

    expect(result).toEqual({ x: 0, y: 0 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});
