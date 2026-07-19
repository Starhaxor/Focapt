export interface OverlayGeometryInput {
  x: number;
  y: number;
  overlayWidth: number;
  overlayHeight: number;
  videoWidth: number;
  videoHeight: number;
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function clampOverlayPosition(input: OverlayGeometryInput): { x: number; y: number } {
  const videoWidth = nonNegativeFinite(input.videoWidth);
  const videoHeight = nonNegativeFinite(input.videoHeight);
  const overlayWidth = nonNegativeFinite(input.overlayWidth);
  const overlayHeight = nonNegativeFinite(input.overlayHeight);
  const x = nonNegativeFinite(input.x);
  const y = nonNegativeFinite(input.y);

  return {
    x: Math.min(x, Math.max(0, videoWidth - overlayWidth)),
    y: Math.min(y, Math.max(0, videoHeight - overlayHeight))
  };
}
