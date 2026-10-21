/**
 * Remove ONLY the camera pill baked into the photographed phone screenshot.
 * The real iPhone GLB supplies its own physical Dynamic Island hardware.
 * Preserve status bar text, icons, and the rest of the app screenshot.
 *
 * The original mockups are 1122x1402; crop is the cropped screen-space
 * window. All positions are in that crop, then scaled into the canvas.
 * No translucent overlay or second camera/pill is added.
 */
export function eraseBakedIsland(context, width, height, cropHeight) {
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
      !Number.isFinite(cropHeight) || width < 20 || height < 30 || cropHeight < 80) {
    throw new RangeError('Invalid screen texture dimensions');
  }
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  const rowScale = height / cropHeight;

  // Based on measurements of all four approved front WebPs. The island is
  // centered at ~52% and spans x=37-67%, y=15-74 source pixels. The
  // feathered repair occupies only x=34.5-69.5%, y=6-80 source pixels.
  const left = Math.round(width * .345);
  const right = Math.round(width * .695);
  const sampleLeft = Math.round(width * .318);
  const sampleRight = Math.round(width * .721);
  const top = Math.max(0, Math.round(6 * rowScale));
  const bottom = Math.min(height, Math.round(80 * rowScale));
  const edgeX = Math.max(2, Math.round(8 * width / 600));
  const edgeTop = Math.max(1, Math.round(2 * rowScale));
  const edgeBottom = Math.max(2, Math.round(6 * rowScale));

  const smooth = (x) => {
    const v = Math.max(0, Math.min(1, x));
    return v * v * (3 - 2 * v);
  };
  for (let y = top; y < bottom; y++) {
    const alphaY = smooth(Math.min(
      (y - top) / edgeTop,
      (bottom - 1 - y) / edgeBottom,
      1,
    ));
    const l = (y * width + sampleLeft) * 4;
    const r = (y * width + sampleRight) * 4;
    const start = [data[l], data[l + 1], data[l + 2]];
    const finish = [data[r], data[r + 1], data[r + 2]];
    for (let x = left; x < right; x++) {
      const alphaX = smooth(Math.min(
        (x - left) / edgeX,
        (right - 1 - x) / edgeX,
        1,
      ));
      const alpha = alphaY * alphaX;
      if (alpha <= 0) continue;
      const t = (x - left) / (right - left);
      const offset = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const fill = start[c] * (1 - t) + finish[c] * t;
        data[offset + c] = Math.round(data[offset + c] * (1 - alpha) + fill * alpha);
      }
    }
  }
  context.putImageData(pixels, 0, 0);
}
