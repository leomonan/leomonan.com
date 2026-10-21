import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORY_VIEWS, FAN_SIDE_WASH, FAN_VISUAL, wrap, slotFor, directionToward, planFanStep, poseFor,
  smoothProgress, depthDuringTurn, offscreenX, offstagePose,
  visibleOrientationProgress,
} from '../src/lib/aistory-fan3d-layout.js';

test('exactly one center/left/right/hidden per active view', () => {
  assert.equal(STORY_VIEWS.length, 4);
  for (let active = 0; active < 4; active++) {
    const slots = STORY_VIEWS.map((_, i) => slotFor(i, active)).sort();
    assert.deepEqual(slots, ['center', 'hidden', 'left', 'right']);
  }
});

test('every adjacent rotation is continuous and uses the same four devices', () => {
  for (let active = 0; active < 4; active++) for (const direction of [-1, 1]) {
    const plan = planFanStep(active, direction);
    assert.equal(plan.length, 4);
    assert.equal(new Set(plan.map(x => x.index)).size, 4);
    assert.equal(plan.filter(x => x.enters).length, 1);
    assert.equal(plan.filter(x => x.exits).length, 1);
    assert.equal(plan.filter(x => x.to === 'center').length, 1);
    if (direction === 1) {
      assert.equal(plan.find(x => x.enters).entrySide, 'right');
      assert.equal(plan.find(x => x.exits).exitSide, 'left');
    } else {
      assert.equal(plan.find(x => x.enters).entrySide, 'left');
      assert.equal(plan.find(x => x.exits).exitSide, 'right');
    }
  }
});

test('wrapping and latest-target nearest-direction tie are deterministic', () => {
  assert.equal(wrap(-1), 3);
  assert.equal(wrap(4), 0);
  assert.equal(directionToward(0, 3), -1);
  assert.equal(directionToward(3, 0), 1);
  assert.equal(directionToward(0, 2), 1);
});

test('left/right poses are mirrored with smaller scale and receded z', () => {
  const left = poseFor('left');
  const right = poseFor('right');
  const center = poseFor('center');
  assert.equal(left.x, -right.x);
  assert.equal(left.yaw, -right.yaw);
  assert.equal(left.roll, -right.roll);
  assert.equal(left.scale, right.scale);
  assert.ok(left.scale < center.scale);
  assert.ok(left.z < center.z);
  // Hidden/offstage phones must be upright irrespective of their side.
  assert.deepEqual([poseFor('hidden', 1, 'left').yaw, poseFor('hidden', 1, 'left').roll], [0, 0]);
  assert.deepEqual([poseFor('hidden', 1, 'right').yaw, poseFor('hidden', 1, 'right').roll], [0, 0]);
});

test('easing stays inside 0..1 and reduces motion near endpoints', () => {
  assert.equal(smoothProgress(-100), 0);
  assert.equal(smoothProgress(0), 0);
  assert.equal(smoothProgress(1), 1);
  assert.equal(smoothProgress(200), 1);
  assert.equal(smoothProgress(.5), .5);
  for (let i = 0; i < 100; i++) {
    const x = i / 100;
    assert.ok(smoothProgress(x + .01) >= smoothProgress(x));
  }
});


test('incoming phone crosses foreground in the first tenth of turn', () => {
  const sideStart = poseFor('right').z;
  const centerStart = poseFor('center').z;
  const sideEnd = poseFor('left').z;
  const centerEnd = poseFor('center').z;

  assert.equal(depthDuringTurn('right', 'center', sideStart, centerEnd, 0), sideStart);
  assert.equal(depthDuringTurn('center', 'left', centerStart, sideEnd, 0), centerStart);
  assert.equal(depthDuringTurn('right', 'center', sideStart, centerEnd, 1), centerEnd);
  assert.equal(depthDuringTurn('center', 'left', centerStart, sideEnd, 1), sideEnd);

  // The old naive linear interpolation kept the incoming phone behind until
  // half-way. This test requires the depth handoff before the 10% frame.
  const zIncoming = depthDuringTurn('right', 'center', sideStart, centerEnd, .10);
  const zOutgoing = depthDuringTurn('center', 'left', centerStart, sideEnd, .10);
  assert.ok(zIncoming > zOutgoing,
    'incoming center must already be in front during first 10%');

  // No instantaneous 3D teleport at the first frame: both curves continuous.
  const startDelta = .000001;
  assert.ok(Math.abs(depthDuringTurn('right', 'center',
    sideStart, centerEnd, startDelta) - sideStart) < .001);
  assert.ok(Math.abs(depthDuringTurn('center', 'left',
    centerStart, sideEnd, startDelta) - centerStart) < .001);

  for (const direction of ['left', 'right']) {
    const start = poseFor(direction).z;
    const incoming = depthDuringTurn(direction, 'center', start, centerEnd, .10);
    assert.ok(incoming > zOutgoing, 'mirrored depth priority for ' + direction);
  }
});

test('non-center hidden entry/exit keeps smooth Z progression', () => {
  const from = poseFor('exit-right').z;
  const to = poseFor('right').z;
  assert.equal(depthDuringTurn('hidden', 'right', from, to, .5),
    from + (to - from) * smoothProgress(.5));
});


test('side views move outward symmetrically and keep the same original sizes', () => {
  const left = poseFor('left', 1);
  const right = poseFor('right', 1);
  assert.equal(left.x, -2.10984375);
  assert.equal(right.x, 2.10984375);
  assert.ok(Math.abs(left.x) > 1.85);
  assert.equal(left.y, -0.14875);
  assert.equal(right.y, -0.14875);
  assert.equal(left.scale, .946875);
  assert.equal(right.scale, .946875);
  assert.equal(left.roll, -right.roll);
  assert.equal(left.yaw, -right.yaw);
  const mobileLeft = poseFor('left', .73);
  assert.ok(mobileLeft.x < 0);
  assert.equal(mobileLeft.x, -poseFor('right', .73).x);
});

test('side wash is subtle, symmetric, opaque by design and reversible', () => {
  const center = poseFor('center');
  const left = poseFor('left');
  const right = poseFor('right');
  assert.equal(center.wash, 0);
  assert.ok(FAN_SIDE_WASH >= .08 && FAN_SIDE_WASH <= .16);
  assert.equal(left.wash, FAN_SIDE_WASH);
  assert.equal(right.wash, FAN_SIDE_WASH);
  assert.equal(poseFor('exit-left').wash, FAN_SIDE_WASH);
  assert.equal(poseFor('exit-right').wash, FAN_SIDE_WASH);
  const values = [0, .05, .25, .5, .75, 1].map(t =>
    left.wash + (center.wash - left.wash) * smoothProgress(t));
  assert.equal(values[0], FAN_SIDE_WASH);
  assert.equal(values.at(-1), 0);
  for (let i = 1; i < values.length; i++)
    assert.ok(values[i] <= values[i-1], 'fade must diminish continuously toward center');
});


test('original K side angles are retained and both offstage endpoints are upright', () => {
  const center = poseFor('center');
  const left = poseFor('left');
  const right = poseFor('right');
  const exitLeft = poseFor('exit-left');
  const exitRight = poseFor('exit-right');

  assert.deepEqual([center.yaw, center.roll, center.scale], [0, 0, 1]);
  assert.deepEqual([left.yaw, left.roll], [38.171875, 12.0625]);
  assert.deepEqual([right.yaw, right.roll], [-38.171875, -12.0625]);
  assert.equal(FAN_VISUAL.sideYaw, 38.171875);
  assert.equal(FAN_VISUAL.sideRoll, 12.0625);
  assert.equal(left.scale, .946875, 'K side phone scale must match the rendered screenshot');
  assert.equal(right.scale, .946875);
  assert.equal(left.x, -right.x);
  assert.deepEqual([exitLeft.yaw, exitLeft.roll], [0, 0]);
  assert.deepEqual([exitRight.yaw, exitRight.roll], [0, 0]);
  assert.equal(FAN_VISUAL.sideYaw, 38.171875);
  assert.equal(FAN_VISUAL.sideRoll, 12.0625);
  for (const factor of [1, .85, .73]) {
    const l = poseFor('left', factor);
    const r = poseFor('right', factor);
    assert.equal(l.yaw, -r.yaw);
    assert.equal(l.roll, -r.roll);
  }
});


test('upright entrance begins at viewport edge and exit finishes by edge', () => {
  for (const kind of ['enter', 'exit']) {
    for (const boundary of [.14, .38, .75]) {
      let prev = -1;
      for (let i=0; i<=100; i++) {
        const ratio = visibleOrientationProgress(kind, i/100, boundary);
        assert.ok(ratio >= prev && ratio <= 1);
        prev = ratio;
      }
      assert.equal(visibleOrientationProgress(kind, 0, boundary), 0);
      assert.equal(visibleOrientationProgress(kind, 1, boundary), 1);
      assert.equal(visibleOrientationProgress(kind, boundary, boundary), kind==='enter'?0:1);
      assert.equal(visibleOrientationProgress('enter', boundary-.01, boundary), 0);
      assert.equal(visibleOrientationProgress('exit', boundary+.01, boundary), 1);
    }
  }
  assert.throws(() => visibleOrientationProgress('bad', .5, .38), RangeError);
  assert.throws(() => visibleOrientationProgress('enter', .5, 0), RangeError);
  assert.throws(() => visibleOrientationProgress('enter', .5, 1), RangeError);
});

test('enter/exit is completely outside perspective camera at desktop/tablet/mobile', () => {
  // Bounding sphere here intentionally errs larger than the normalized GLB
  // so all corners, metal buttons and its full 3D roll are covered.
  const modelRadius = 3.1;
  const samples = [
    { width: 736.56, height: 570, cameraZ: 10.55, factor: 1 },
    { width: 850, height: 548, cameraZ: 10.55, factor: 1 },
    { width: 546, height: 452, cameraZ: 10.65, factor: .758 },
    { width: 312, height: 340, cameraZ: 12.3, factor: .73 },
    { width: 260, height: 340, cameraZ: 14.8, factor: .73 },
  ];
  for (const sample of samples) {
    const aspect = sample.width / sample.height;
    const camera = {
      verticalFovDeg: 34,
      aspect,
      cameraZ: sample.cameraZ,
      modelRadius,
      clearance: .42,
    };
    const left = offstagePose('left', sample.factor, camera);
    const right = offstagePose('right', sample.factor, camera);
    const screenRadius = modelRadius * left.scale;
    const conservativeHalfWidth =
      (sample.cameraZ - left.z + screenRadius) *
      Math.tan(camera.verticalFovDeg * Math.PI / 360) * aspect;

    assert.equal(left.x, -right.x, 'offstage world x must mirror exactly');
    assert.equal(left.yaw, 0, 'left phone is upright outside the viewport');
    assert.equal(right.yaw, 0, 'right phone is upright outside the viewport');
    assert.equal(left.roll, 0);
    assert.equal(right.roll, 0);
    assert.ok(-left.x - screenRadius > conservativeHalfWidth,
      'left phone must be entirely beyond left edge at ' + sample.width);
    assert.ok(right.x - screenRadius > conservativeHalfWidth,
      'right phone must be entirely beyond right edge at ' + sample.width);

    // Old fixed 5.25*factor coordinate was visibly in-frame in these cases.
    assert.ok(right.x > 5.25 * sample.factor,
      'never regress to partially visible fixed offstage position');
  }
});

test('offstage geometry is camera-responsive, not an animation-time visibility trick', () => {
  const base = { verticalFovDeg: 34, modelRadius: 3.1, scale: .77, poseZ: -1.6 };
  const desktop = offscreenX({ ...base, aspect: 1.3, cameraZ: 10.55, side: 'right' });
  const mobile = offscreenX({ ...base, aspect: .9, cameraZ: 12.5, side: 'right' });
  const wider = offscreenX({ ...base, aspect: 1.8, cameraZ: 10.55, side: 'right' });
  const left = offscreenX({ ...base, aspect: 1.3, cameraZ: 10.55, side: 'left' });
  assert.equal(desktop, -left);
  assert.ok(wider > desktop, 'wider canvas increases offstage clearance');
  assert.ok(mobile > 5.25*.73, 'mobile never clips an entering phone');
  assert.throws(() => offscreenX({ ...base, aspect: -1, cameraZ: 10, side:'left' }), RangeError);
  assert.throws(() => offscreenX({ ...base, aspect: 1, cameraZ: 10, side:'center' }), RangeError);
});
