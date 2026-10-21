import test from 'node:test';
import assert from 'node:assert/strict';
import { eraseBakedIsland } from '../src/lib/aistory-fan3d-texture.js';

function mockContext(w, h, background) {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const offset = i * 4;
    for (let c = 0; c < 3; c++) pixels[offset + c] = background[c];
    pixels[offset + 3] = 255;
  }
  return {
    pixels,
    getImageData: () => ({ data: pixels }),
    putImageData: ({ data }) => {
      assert.equal(data.length, pixels.length);
    },
  };
}

function pixel(ctx, w, x, y) {
  return [...ctx.pixels.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];
}

test('removes baked camera pill without touching time, signal or app content', () => {
  const w = 600, h = 1200, cropH = 1200;
  const ctx = mockContext(w, h, [233, 242, 250]);
  // Simulate a dark source camera pill in the mockup area.
  for (let y = 19; y <= 69; y++) {
    for (let x = Math.round(w * .372); x <= Math.round(w * .665); x++) {
      const k = (y * w + x) * 4;
      ctx.pixels[k] = ctx.pixels[k+1] = ctx.pixels[k+2] = 0;
    }
  }
  const beforeStatus = pixel(ctx, w, 40, 50);
  const beforeContent = pixel(ctx, w, 290, 250);
  assert.equal(pixel(ctx, w, 300, 49)[0], 0);
  eraseBakedIsland(ctx, w, h, cropH);
  assert.ok(pixel(ctx, w, 300, 49)[0] > 210, 'camera pill painted with nearby header');
  assert.deepEqual(pixel(ctx, w, 40, 50), beforeStatus, 'left status time untouched');
  assert.deepEqual(pixel(ctx, w, 540, 50), beforeStatus, 'right signal area untouched');
  assert.deepEqual(pixel(ctx, w, 290, 250), beforeContent, 'real app content untouched');
});

test('dark episode background retains dark color instead of a white ghost halo', () => {
  const w = 600, h = 1200;
  const ctx = mockContext(w, h, [24, 40, 58]);
  for (let y = 20; y <= 68; y++) {
    for (let x = 225; x < 396; x++) {
      const k=(y*w+x)*4;
      ctx.pixels[k]=ctx.pixels[k+1]=ctx.pixels[k+2]=0;
    }
  }
  eraseBakedIsland(ctx,w,h,h);
  const center = pixel(ctx,w,300,50);
  assert.ok(center[0] >= 20 && center[0] <= 26);
  assert.ok(center[1] >= 37 && center[1] <= 43);
  assert.ok(center[2] >= 55 && center[2] <= 61);
});

test('rejects invalid texture dimensions', () => {
  assert.throws(() => eraseBakedIsland({}, 0, 1200, 1200), RangeError);
  assert.throws(() => eraseBakedIsland({}, 600, 1200, 20), RangeError);
});
