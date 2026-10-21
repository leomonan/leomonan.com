import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  STORY_VIEWS, FAN_DURATION_MS, FAN_AUTOPLAY_MS, FAN_MODEL_PATH, FAN_VISUAL,
  FAN_SCREEN_MATERIAL, slotFor, directionToward, planFanStep,
  poseFor, offstagePose, smoothProgress, depthDuringTurn,
  visibleOrientationProgress, wrap,
} from './aistory-fan3d-layout.js';
import { eraseBakedIsland } from './aistory-fan3d-texture.js';

const DEG = Math.PI / 180;
const PHONE_HEIGHT = FAN_VISUAL.modelHeight;
const STAGE_WIDTH = FAN_VISUAL.referenceWidth;
const SOURCE_SIZE = { width: 1122, height: 1402 };
const $ = (root, selector) => root.querySelector(selector);

function makeTexture(url, crop, renderer) {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  return image.decode().then(() => {
    if (image.naturalWidth !== SOURCE_SIZE.width ||
        image.naturalHeight !== SOURCE_SIZE.height) {
      throw new Error('Unexpected AIStory source dimensions: ' + url);
    }
    const canvas = document.createElement('canvas');
    // Preserve the original crop pixels 1:1. Upscaling the 560–616px
    // source to a fixed 720px canvas smoothed small text before WebGL could
    // sample it; texture UVs already adapt to the real screen dimensions.
    canvas.width = crop.w;
    canvas.height = crop.h;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D is not available');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0,
      canvas.width, canvas.height);
    // The source mockup includes its own black Dynamic Island pill. Replace
    // ONLY those camera pixels with the adjacent header background. The
    // physical GLB island then remains the single visible camera cutout.
    eraseBakedIsland(context, canvas.width, canvas.height, crop.h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // glTF UVs use the loader's unflipped texture convention.
    texture.flipY = false;
    // The side screens face the camera obliquely (original K yaw).
    texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  });
}

function findScreenMesh(scene) {
  let result = null;
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const isScreen = materials.some((material) => material?.name === FAN_SCREEN_MATERIAL);
    if (isScreen || node.name === 'Object_60') {
      if (result) throw new Error('Model has more than one matching display Mesh');
      if (!node.geometry?.getAttribute('uv')) throw new Error('Display Mesh has no UV');
      result = node;
    }
  });
  if (!result) throw new Error('Unable to locate COLOUR_Silver_Screen in the GLB');
  return result;
}

function normalizePhone(source) {
  const scene = source.clone(true);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0 ||
      size.y < size.x || size.y < size.z) {
    throw new Error('The selected GLB is not a vertical phone');
  }
  const scale = PHONE_HEIGHT / size.y;
  scene.scale.multiplyScalar(scale);
  scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  scene.updateMatrixWorld(true);
  return scene;
}

function makePhone(source, texture, index) {
  const visual = normalizePhone(source);
  const screen = findScreenMesh(visual);
  // The black-glass model uses a co-planar face close to its actual screen.
  // A very small forward offset prevents depth fighting, without a fake frame.
  screen.position.z += .00008;
  const material = new THREE.MeshBasicMaterial({
    map: texture, toneMapped: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  // Keep the exact same screenshot on this phone throughout the entire turn.
  // A tiny *opaque* neutral wash in the screen shader softly de-emphasizes
  // side views. Alpha remains 1, so we never see the model through its screen
  // or crossfade two different screenshots.
  const screenWash = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFanScreenWash = screenWash;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform float uFanScreenWash;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n' +
      'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.92, 0.935, 0.99), uFanScreenWash);',
    );
  };
  material.customProgramCacheKey = () => 'aistory-screen-wash-v1';
  screen.material = material;
  const wrapper = new THREE.Group();
  wrapper.name = 'AIStory-' + STORY_VIEWS[index].id;
  wrapper.userData.phoneIndex = index;
  wrapper.add(visual);
  return { root: wrapper, visual, screenMaterial: material, screenWash, index };
}

function makeShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(128, 128, 4, 128, 128, 120);
  gradient.addColorStop(0, 'rgba(23,35,73,.36)');
  gradient.addColorStop(.45, 'rgba(35,47,94,.16)');
  gradient.addColorStop(1, 'rgba(40,60,110,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.PlaneGeometry(7.8, 2.25);
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, opacity: .76,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -PHONE_HEIGHT / 2 - .12, -.35);
  return { ground, texture, geometry, material };
}

function quaternionFor(pose) {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, pose.yaw * DEG, pose.roll * DEG, 'YXZ'),
  );
}

function applyPose(phone, pose) {
  phone.root.position.set(pose.x, pose.y, pose.z);
  phone.root.quaternion.copy(quaternionFor(pose));
  phone.root.scale.setScalar(pose.scale);
  phone.screenWash.value = pose.wash;
}

function currentPose(phone) {
  return {
    position: phone.root.position.clone(),
    quaternion: phone.root.quaternion.clone(),
    scale: phone.root.scale.x,
    wash: phone.screenWash.value,
  };
}

function disposeOnce(resource, set) {
  if (resource && !set.has(resource)) {
    set.add(resource);
    resource.dispose();
  }
}

export async function mountAIStoryReal3DFan() {
  const host = document.querySelector('[data-real-fan-stage]');
  const root = document.querySelector('[data-real-fan]');
  if (!(host instanceof HTMLElement) || !(root instanceof HTMLElement)) return;
  const tabs = [...root.querySelectorAll('[data-real-fan-tab]')];
  const status = $(root, '[data-real-fan-status]');
  const fallback = $(host, '[data-real-fan-fallback]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const autoplayButton = $(root, '[data-real-fan-autoplay]');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true, antialias: true, powerPreference: 'low-power',
    });
  } catch (error) {
    if (status) status.textContent = 'WebGL unavailable. Static preview shown.';
    return;
  }
  renderer.setClearColor(0, 0);
  // Render small type with enough subpixel coverage even on 1x desktops.
  // A bounded DPR avoids the former 1.5x Retina blur without unbounded 3x/4x
  // mobile GPU cost; the visible stage is at most 850 × 570 CSS pixels.
  renderer.setPixelRatio(Math.min(2, Math.max(1.5, window.devicePixelRatio || 1)));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const camera = new THREE.PerspectiveCamera(34, 1, .1, 80);
  camera.position.set(0, .10, FAN_VISUAL.desktopCameraZ);
  camera.lookAt(0, 0, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xf6f8ff, 0x8993a6, 2.25));
  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  key.position.set(-3, 5, 8);
  scene.add(key);
  const silverRim = new THREE.DirectionalLight(0xdce5ff, 1.65);
  silverRim.position.set(4, 1, -3);
  scene.add(silverRim);
  const fill = new THREE.DirectionalLight(0xf4f6ff, .75);
  fill.position.set(4, 0, 5);
  scene.add(fill);

  let gltf;
  let textures = [];
  const phones = [];
  // Bounds are computed from the actual normalized GLB, not guessed widths.
  // They conservatively include metallic sides, buttons and tilted corners.
  let modelRadius = 0;
  const bodyCorners = []; // Exact normalized GLB body bounds, cached before posing.
  let shadow;
  let disposed = false;
  try {
    const sources = STORY_VIEWS.map((view) =>
      makeTexture('/images/work/aistory-' + view.id + '.webp', view.crop, renderer));
    [gltf, textures] = await Promise.all([
      new GLTFLoader().loadAsync(FAN_MODEL_PATH),
      Promise.all(sources),
    ]);
    if (disposed) return;
    for (let i = 0; i < STORY_VIEWS.length; i++) {
      const phone = makePhone(gltf.scene, textures[i], i);
      phones.push(phone);
      scene.add(phone.root);
    }
    const modelBounds = new THREE.Box3().setFromObject(phones[0].visual);
    const sphere = modelBounds.getBoundingSphere(new THREE.Sphere());
    modelRadius = sphere.radius;
    for (const x of [modelBounds.min.x, modelBounds.max.x]) {
      for (const y of [modelBounds.min.y, modelBounds.max.y]) {
        for (const z of [modelBounds.min.z, modelBounds.max.z]) {
          bodyCorners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    if (!Number.isFinite(modelRadius) || modelRadius <= 0) {
      throw new Error('Invalid GLB model bounds for offstage navigation');
    }
    shadow = makeShadow();
    if (shadow) scene.add(shadow.ground);
  } catch (error) {
    renderer.dispose();
    if (status) status.textContent = 'Unable to start 3D preview: ' +
      (error instanceof Error ? error.message : 'model load failed');
    return;
  }

  const canvas = renderer.domElement;
  canvas.className = 'real-fan-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Four AIStory phone screens rotating through one real 3D fan');
  canvas.tabIndex = 0;
  // Mount the transparent WebGL canvas above the SSR phone-shaped preview,
  // but keep the preview visible until the first actual rendered 3D frame.
  // Hiding it immediately on canvas insertion can reveal one blank frame.
  host.append(canvas);
  let firstFrameDisplayed = false;
  for (const tab of [...root.querySelectorAll('[data-real-fan-tab]')]) {
    if (tab instanceof HTMLButtonElement) tab.disabled = false;
  }

  let active = 0;
  let desired = 0;
  let animation = null;
  let frameId = 0;
  let widthFactor = 1;
  let visible = true;
  let documentVisible = !document.hidden;
  let hovered = false, focused = false, touching = false;
  let timer = 0;
  // User intent is separate from temporary hover/focus/visibility pauses.
  // Storage is optional; failures must not prevent local pause controls.
  const pauseKey = 'aistory:autoplay-paused';
  let userPaused = false;
  let contextLost = false;
  try { userPaused = sessionStorage.getItem(pauseKey) === '1'; } catch { /* optional */ }
  let pointer = null;
  const listeners = [];

  const add = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  };

  function syncAutoplayControl() {
    if (!(autoplayButton instanceof HTMLButtonElement)) return;
    autoplayButton.hidden = false;
    autoplayButton.disabled = motion.matches || contextLost;
    autoplayButton.textContent = contextLost ? 'Autoplay unavailable'
      : motion.matches ? 'Autoplay off (reduced motion)'
      : userPaused ? 'Resume autoplay' : 'Pause autoplay';
    autoplayButton.title = userPaused
      ? 'Manual controls still work. Resume applies when the carousel is not being interacted with.'
      : 'Finish the current move, then pause automatic rotation.';
  }

  function syncTabs() {
    tabs.forEach((button, index) => {
      const selected = index === active;
      button.setAttribute('aria-selected', String(selected));
      button.classList.toggle('is-active', selected);
      button.tabIndex = selected ? 0 : -1;
    });
    if (status && !animation) {
      status.textContent = STORY_VIEWS[active].label +
        ' centered · physical 3D · screen textures never crossfade';
    }
  }

  const offstage = (side) => offstagePose(side, widthFactor, {
    verticalFovDeg: camera.fov,
    aspect: camera.aspect,
    cameraZ: camera.position.z,
    modelRadius,
    clearance: .42,
  });

  // Project the actual GLB body as UPRIGHT at its viewport crossing.
  // Fit the motion to the real perspective camera, including narrow screens.
  function crossingFor(route, from, toPosition, toScale) {
    if (!route.enters && !route.exits) return null;
    const side = route.enters ? route.entrySide : route.exitSide;
    camera.updateMatrixWorld(true);
    const fromPosition = from.position;
    const fromScale = from.scale;
    const outside = (t) => {
      const eased = smoothProgress(t);
      const position = new THREE.Vector3().lerpVectors(fromPosition, toPosition, eased);
      position.z = depthDuringTurn(route.from, route.to, fromPosition.z, toPosition.z, t);
      const scale = THREE.MathUtils.lerp(fromScale, toScale, eased);
      let left = Infinity, right = -Infinity;
      for (const corner of bodyCorners) {
        const x = corner.clone().multiplyScalar(scale).add(position).project(camera).x;
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
      return side === 'left' ? right <= -1 : left >= 1;
    };
    if (outside(route.enters ? 1 : 0) || !outside(route.enters ? 0 : 1)) {
      throw new Error('The upright phone must cross the real camera boundary');
    }
    let low = 0, high = 1;
    for (let i = 0; i < 23; i++) {
      const mid = (low + high) / 2;
      if (outside(mid) === route.enters) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  function placeInstant(index) {
    active = desired = wrap(index);
    for (const phone of phones) {
      const slot = slotFor(phone.index, active);
      const pose = slot === 'hidden' ? offstage('right') : poseFor(slot, widthFactor);
      applyPose(phone, pose);
      phone.root.visible = slot !== 'hidden';
    }
    syncTabs();
    requestDraw();
  }

  function requestDraw() {
    if (disposed || !visible || !documentVisible || frameId) return;
    frameId = requestAnimationFrame(renderFrame);
  }

  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = 0;
  }

  function scheduleTimer() {
    stopTimer();
    if (disposed || animation || userPaused || contextLost || motion.matches || !visible || !documentVisible ||
        hovered || focused || touching) return;
    timer = window.setTimeout(() => select(active + 1), FAN_AUTOPLAY_MS);
  }

  function startStep() {
    if (animation || desired === active || disposed) {
      if (!animation) scheduleTimer();
      return;
    }
    if (motion.matches || !visible || !documentVisible) {
      placeInstant(desired);
      scheduleTimer();
      return;
    }
    const direction = directionToward(active, desired);
    const next = wrap(active + direction);
    const routes = planFanStep(active, direction);
    const motions = routes.map((route) => {
      const phone = phones[route.index];
      if (route.enters) {
        // Enter only after being positioned completely outside the actual
        // camera frustum. visible=true must not reveal a partial phone.
        applyPose(phone, offstage(route.entrySide));
        phone.root.visible = true;
      }
      const toPose = route.exits
        ? offstage(route.exitSide)
        : poseFor(route.to, widthFactor);
      const from = currentPose(phone);
      const toPosition = new THREE.Vector3(toPose.x, toPose.y, toPose.z);
      return {
        index: route.index,
        fromSlot: route.from,
        toSlot: route.to,
        from,
        toPosition,
        toQuaternion: quaternionFor(toPose),
        toScale: toPose.scale,
        toWash: toPose.wash,
        uprightPhase: route.enters ? 'enter' : route.exits ? 'exit' : null,
        crossing: crossingFor(route, from, toPosition, toPose.scale),
        invisibleAfter: route.exits,
      };
    });
    animation = { start: null, next, motions };
    if (status) status.textContent =
      STORY_VIEWS[active].label + ' → ' + STORY_VIEWS[next].label + ' · rotating real phone meshes';
    requestDraw();
  }

  function endStep() {
    const finished = animation;
    if (!finished) return;
    for (const route of finished.motions) {
      phones[route.index].root.visible = !route.invisibleAfter;
    }
    active = finished.next;
    animation = null;
    delete root.dataset.turnProgress;
    delete root.dataset.incomingDepth;
    delete root.dataset.outgoingDepth;
    syncTabs();
    if (desired !== active) startStep();
    else scheduleTimer();
  }

  function renderFrame(timestamp) {
    frameId = 0;
    if (disposed || !visible || !documentVisible) return;
    if (animation) {
      if (animation.start === null) animation.start = timestamp;
      const t = Math.min(1, (timestamp - animation.start) / FAN_DURATION_MS);
      const eased = smoothProgress(t);
      for (const route of animation.motions) {
        const phone = phones[route.index];
        phone.root.position.lerpVectors(route.from.position, route.toPosition, eased);
        // Physical foreground handoff starts in the opening frames rather
        // than waiting until the middle when both phone Z values cross.
        phone.root.position.z = depthDuringTurn(
          route.fromSlot, route.toSlot,
          route.from.position.z, route.toPosition.z, t,
        );
        // Side-to-center transitions are unchanged. Offstage phones rotate
        // only while their handset is visible, staying upright at the edge.
        const angleProgress = route.uprightPhase
          ? visibleOrientationProgress(route.uprightPhase, t, route.crossing)
          : eased;
        phone.root.quaternion.slerpQuaternions(
          route.from.quaternion, route.toQuaternion, angleProgress);
        const scale = THREE.MathUtils.lerp(route.from.scale, route.toScale, eased);
        phone.root.scale.setScalar(scale);
        phone.screenWash.value = THREE.MathUtils.lerp(
          route.from.wash, route.toWash, eased,
        );
      }
      // Browser tests may inspect world-space Z in the actual WebGL scene,
      // rather than inferring layer priority from a final screenshot.
      const incoming = animation.motions.find(route => route.toSlot === 'center');
      const outgoing = animation.motions.find(route => route.fromSlot === 'center');
      root.dataset.turnProgress = String(t.toFixed(3));
      if (incoming && outgoing) {
        root.dataset.incomingDepth = String(phones[incoming.index].root.position.z.toFixed(4));
        root.dataset.outgoingDepth = String(phones[outgoing.index].root.position.z.toFixed(4));
      }
      if (t >= 1) endStep();
    }
    renderer.render(scene, camera);
    if (!firstFrameDisplayed) {
      firstFrameDisplayed = true;
      host.classList.add('is-ready');
      fallback?.classList.add('is-hidden');
    }
    if (animation) requestDraw();
  }

  function select(index) {
    desired = wrap(index);
    stopTimer();
    if (!animation) startStep();
  }

  function resize() {
    if (disposed) return;
    const box = host.getBoundingClientRect();
    if (box.width < 20 || box.height < 20) return;
    renderer.setSize(box.width, box.height, false);
    camera.aspect = box.width / box.height;
    // Keep mirrored fan inside narrower mobile viewports without
    // shrinking the geometry assets individually.
    widthFactor = Math.max(.73, Math.min(1, box.width / STAGE_WIDTH));
    camera.position.z = camera.aspect < 1.05
      ? Math.max(FAN_VISUAL.mobileCameraZ,
          FAN_VISUAL.mobileCameraZ * 1.06 / camera.aspect)
      : FAN_VISUAL.desktopCameraZ;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    // Resize can occur during an animation; safely resolve it before
    // recalculating slot coordinates rather than mixing world-space poses.
    if (animation) {
      const destination = desired;
      animation = null;
      placeInstant(destination);
      scheduleTimer();
    } else {
      placeInstant(active);
      scheduleTimer();
    }
  }

  function pickPhone(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(phones.filter(p => p.root.visible).map(p => p.root), true);
    for (const hit of hits) {
      let object = hit.object;
      while (object) {
        if (Number.isInteger(object.userData.phoneIndex)) {
          return object.userData.phoneIndex;
        }
        object = object.parent;
      }
    }
    return null;
  }

  if (autoplayButton instanceof HTMLButtonElement) {
    add(autoplayButton, 'click', () => {
      if (motion.matches || contextLost) return;
      userPaused = !userPaused;
      try { sessionStorage.setItem(pauseKey, userPaused ? '1' : '0'); } catch { /* optional */ }
      // Do not cancel RAF or change poses: an in-flight move finishes normally.
      stopTimer();
      syncAutoplayControl();
      scheduleTimer();
    });
  }
  tabs.forEach((tab, index) => {
    add(tab, 'click', () => select(index));
    add(tab, 'keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const dir = event.key === 'ArrowRight' ? 1 : -1;
      const next = wrap(active + dir);
      tabs[next]?.focus();
      select(next);
    });
  });
  add(canvas, 'keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    select(active + (event.key === 'ArrowRight' ? 1 : -1));
  });
  add(canvas, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    touching = true;
    stopTimer();
    pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* not available */ }
  });
  add(canvas, 'pointerup', (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    pointer = null;
    touching = false;
    if (Math.abs(dx) > 43 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      select(active + (dx < 0 ? 1 : -1));
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const index = pickPhone(event.clientX, event.clientY);
      if (index !== null && index !== active) select(index);
      else scheduleTimer();
    } else scheduleTimer();
  });
  add(canvas, 'pointercancel', () => {
    pointer = null; touching = false; scheduleTimer();
  });
  add(root, 'mouseenter', () => { hovered = true; stopTimer(); });
  add(root, 'mouseleave', () => { hovered = false; scheduleTimer(); });
  add(root, 'focusin', () => { focused = true; stopTimer(); });
  add(root, 'focusout', (event) => {
    if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) {
      focused = false; scheduleTimer();
    }
  });
  add(document, 'visibilitychange', () => {
    documentVisible = !document.hidden;
    if (!documentVisible) {
      stopTimer();
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    } else {
      if (animation) {
        animation = null;
        placeInstant(desired);
      }
      requestDraw(); scheduleTimer();
    }
  });
  add(motion, 'change', () => {
    syncAutoplayControl();
    if (motion.matches && animation) {
      animation = null;
      placeInstant(desired);
    }
    scheduleTimer(); requestDraw();
  });
  add(canvas, 'webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    syncAutoplayControl();
    animation = null;
    stopTimer();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    visible = false;
    host.classList.remove('is-ready');
    fallback?.classList.remove('is-hidden');
    canvas.style.display = 'none';
    if (status) status.textContent = '3D context lost. Static fallback restored.';
  });

  const observer = new IntersectionObserver(([entry]) => {
    const nextVisible = Boolean(entry?.isIntersecting);
    if (visible === nextVisible) return;
    visible = nextVisible;
    if (!visible) {
      stopTimer();
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
    } else {
      if (animation) {
        animation = null;
        placeInstant(desired);
      }
      requestDraw(); scheduleTimer();
    }
  });
  observer.observe(host);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);

  function teardown() {
    if (disposed) return;
    disposed = true;
    stopTimer();
    if (frameId) cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    observer.disconnect();
    listeners.forEach(remove => remove());
    const freed = new Set();
    for (const phone of phones) disposeOnce(phone.screenMaterial, freed);
    for (const texture of textures) disposeOnce(texture, freed);
    gltf.scene.traverse((obj) => {
      if (!obj.isMesh) return;
      disposeOnce(obj.geometry, freed);
      for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) {
        if (!material) continue;
        for (const prop of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) {
          disposeOnce(material[prop], freed);
        }
        disposeOnce(material, freed);
      }
    });
    if (shadow) for (const resource of [shadow.texture, shadow.geometry, shadow.material]) {
      disposeOnce(resource, freed);
    }
    renderer.dispose();
    canvas.remove();
  }
  add(window, 'pagehide', teardown, { once: true });

  // P1 is visible on first frame. P2 runs entirely on THREE.Object3D,
  // without changing image source, screen material or CSS opacity.
  syncAutoplayControl();
  resize();
  placeInstant(0);
  if (status) status.textContent = 'Episode centered · true 3D device rotation ready';
  scheduleTimer();
}
