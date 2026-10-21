// Pure four-page fan layout. Every page has one persistent 3D device and
// one persistent screen texture; position changes never replace artwork.
export const STORY_VIEWS = Object.freeze([
  { id: 'episode', label: 'Episode', crop: { x: 257, y: 48, w: 583, h: 1249 } },
  { id: 'universe', label: 'Universe', crop: { x: 262, y: 50, w: 572, h: 1279 } },
  { id: 'character', label: 'Character', crop: { x: 270, y: 36, w: 560, h: 1310 } },
  { id: 'create', label: 'Create', crop: { x: 243, y: 36, w: 616, h: 1281 } },
]);

export const FAN_DURATION_MS = 820;
// Slightly wash side screens toward the card background without transparency.
export const FAN_SIDE_WASH = 0.13;
// Single geometric SSOT for the runtime scene AND generated fallback posters.
export const FAN_VISUAL = Object.freeze({
  modelHeight: 5.52,
  referenceWidth: 720,
  desktopCameraZ: 10.55,
  mobileCameraZ: 10.65,
  // Exact K composition selected from the 2026-10-21 real WebGL study.
  // Reference: K-desktop-episode.webp (737 × 571); keep the original GLB
  // proportions and screen textures. Do not apply K-phi nonuniform stretching.
  sideX: 2.10984375,
  sideY: -0.14875,
  sideScale: 0.946875,
  sideYaw: 38.171875,
  sideRoll: 12.0625,
  // Entry and exit are upright OFFSCREEN. K angles apply only to settled sides.
});
export const FAN_AUTOPLAY_MS = 5200;
export const FAN_MODEL_PATH = '/images/work/glb/apple_iphone_18_pro_max_silver_2026.glb';
export const FAN_SCREEN_MATERIAL = 'COLOUR_Silver_Screen';

export function wrap(index, total = STORY_VIEWS.length) {
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 3) {
    throw new RangeError('Invalid carousel index or total');
  }
  return ((index % total) + total) % total;
}

export function slotFor(index, active, total = STORY_VIEWS.length) {
  const delta = wrap(index - active, total);
  if (delta === 0) return 'center';
  if (delta === 1) return 'right';
  if (delta === total - 1) return 'left';
  return 'hidden';
}

export function directionToward(active, target, total = STORY_VIEWS.length) {
  const forwards = wrap(target - active, total);
  const backwards = wrap(active - target, total);
  return forwards <= backwards ? 1 : -1;
}

export function planFanStep(active, direction, total = STORY_VIEWS.length) {
  if (direction !== 1 && direction !== -1) throw new RangeError('Step must be +1 or -1');
  const next = wrap(active + direction, total);
  return Array.from({ length: total }, (_, index) => {
    const from = slotFor(index, active, total);
    const to = slotFor(index, next, total);
    const enters = from === 'hidden' && (to === 'left' || to === 'right');
    const exits = to === 'hidden' && (from === 'left' || from === 'right');
    if (from === 'hidden' && to === 'center') {
      throw new Error('A hidden phone cannot jump directly to center');
    }
    return {
      index, from, to,
      enters, exits,
      entrySide: enters ? to : undefined,
      exitSide: exits ? from : undefined,
    };
  });
}

// Three.js operates in world coordinates (Y points up). Rotations are mirrored:
// left phone's TOP leans toward left, right phone's TOP toward right.
export function poseFor(slot, widthFactor = 1, exitSide = 'right') {
  const factor = Math.max(.70, Math.min(1, widthFactor));
  switch (slot) {
    case 'center': return { x: 0, y: .05, z: .38, scale: 1.0, yaw: 0, roll: 0, wash: 0 };
    case 'left':   return { x: -FAN_VISUAL.sideX * factor, y: FAN_VISUAL.sideY, z: -.62, scale: FAN_VISUAL.sideScale, yaw: FAN_VISUAL.sideYaw, roll: FAN_VISUAL.sideRoll, wash: FAN_SIDE_WASH };
    case 'right':  return { x:  FAN_VISUAL.sideX * factor, y: FAN_VISUAL.sideY, z: -.62, scale: FAN_VISUAL.sideScale, yaw: -FAN_VISUAL.sideYaw, roll: -FAN_VISUAL.sideRoll, wash: FAN_SIDE_WASH };
    case 'hidden': return poseFor(exitSide === 'left' ? 'exit-left' : 'exit-right', factor);
    case 'exit-left':  return { x: 0, y: -.20, z: -1.6, scale: .77, yaw: 0, roll: 0, wash: FAN_SIDE_WASH };
    case 'exit-right': return { x: 0, y: -.20, z: -1.6, scale: .77, yaw: 0, roll: 0, wash: FAN_SIDE_WASH };
    default: throw new RangeError('Unknown fan slot: ' + slot);
  }
}


/**
 * Fully outside the actual perspective camera frustum, including the whole
 * three-dimensional phone body.
 *
 * Old fixed exit poses (+/-5.25 * widthFactor) were partly inside the viewport,
 * especially on narrow mobile screens, so toggling root.visible at animation
 * boundaries made large chunks of the phone pop into/out of view.
 *
 * A bounding sphere conservatively encloses the tilted handset. We project
 * the FAR edge of that sphere to calculate the widest relevant camera frustum
 * and place even its NEAREST horizontal edge beyond the corresponding border.
 * No alpha fade, clipping trick, or timer-based visibility threshold.
 */
export function offscreenX({
  side,
  verticalFovDeg,
  aspect,
  cameraZ,
  poseZ,
  modelRadius,
  scale,
  clearance = .40,
}) {
  if (side !== 'left' && side !== 'right') {
    throw new RangeError('Offscreen side must be left or right');
  }
  if (![verticalFovDeg, aspect, cameraZ, poseZ, modelRadius, scale, clearance]
      .every(Number.isFinite) ||
      verticalFovDeg <= 0 || verticalFovDeg >= 160 || aspect <= 0 ||
      cameraZ <= poseZ || modelRadius <= 0 || scale <= 0 || clearance < 0) {
    throw new RangeError('Invalid camera or model bounds for offscreen pose');
  }
  const radius = modelRadius * scale;
  // Projection bound at the farthest depth of any point on the phone.
  const horizontalHalfView =
    (cameraZ - poseZ + radius) *
    Math.tan(verticalFovDeg * Math.PI / 360) * aspect;
  const outsideX = horizontalHalfView + radius + clearance;
  return side === 'left' ? -outsideX : outsideX;
}

/**
 * Apply the camera-aware full offstage translation to an upright phone.
 * Preserve scale and depth; x depends on camera. Offstage angle is always zero.
 */
export function offstagePose(side, widthFactor, camera) {
  const pose = poseFor(side === 'left' ? 'exit-left' : 'exit-right', widthFactor);
  return {
    ...pose,
    x: offscreenX({ ...camera, side, poseZ: pose.z, scale: pose.scale }),
  };
}

export function smoothProgress(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}


/**
 * Foreground handoff precedes the horizontal / rotational movement.
 *
 * The old linear Z interpolation made the incoming phone wait behind the
 * outgoing center until ~50% of the turn. Accelerate only Z over the first
 * 16% (~131ms of 820ms) so the next center takes visual priority almost
 * immediately, without teleporting or swapping meshes/materials.
 *
 * All endpoints remain exactly continuous. Non-center entry/exit uses the
 * original eased Z movement.
 */
export function depthDuringTurn(fromSlot, toSlot, fromZ, toZ, progress) {
  const isCenterHandoff =
    ((fromSlot === 'left' || fromSlot === 'right') && toSlot === 'center') ||
    (fromSlot === 'center' && (toSlot === 'left' || toSlot === 'right'));
  const zProgress = isCenterHandoff
    ? smoothProgress(Math.min(1, Math.max(0, progress) / .16))
    : smoothProgress(progress);
  return fromZ + (toZ - fromZ) * zProgress;
}

/**
 * Rotate only during VISIBLE travel. The crossing is the normalized time when
 * the full upright handset first intersects (entry) or fully leaves (exit)
 * the projected camera viewport. Position keeps its independent 820ms easing.
 *
 * Entry: upright until the first visible pixel, then ease to the K side tilt.
 * Exit: unwind from K while still visible, upright before the last pixel leaves.
 */
export function visibleOrientationProgress(kind, t, crossing) {
  if (kind !== 'enter' && kind !== 'exit') throw new RangeError('Invalid orientation kind');
  if (!Number.isFinite(t) || !Number.isFinite(crossing) ||
      crossing <= 0 || crossing >= 1) throw new RangeError('Invalid crossing or time');
  return kind === 'enter'
    ? smoothProgress((t - crossing) / (1 - crossing))
    : smoothProgress(t / crossing);
}
