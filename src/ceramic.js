import * as THREE from 'three';

export const RINGS = 72;
export const SEGMENTS = 88;
export const INFLUENCE_SUPPORT_SIGMAS = 3.2;
export const MIN_INNER_RADIUS = 0.01; // 1 mm in the studio's 100 mm/unit scale.
export const GEOMETRY_RESOLUTIONS = {
  light: { rings: 36, segments: 48 },
  balanced: { rings: RINGS, segments: SEGMENTS },
  high: { rings: 128, segments: 160 },
};
export const SHAPES = [
  { id: 'cylinder', name: 'Cilindro', height: 0.62, cavity: 0.43, profile: (t) => 0.79 - 0.04 * smooth(0.92, 1, t) + 0.015 * smooth(0, 0.045, t),
    freshProfile: (t) => 0.79 - 0.008 * smooth(0.97, 1, t) + 0.008 * smooth(0, 0.025, t) },
  { id: 'bowl', name: 'Cuenco', height: 0.9, cavity: 0.2, profile: (t) => 0.24 + 0.73 * Math.pow(t, 1.65) },
  { id: 'cup', name: 'Vaso', height: 1.24, cavity: 0.34, profile: (t) => 0.47 + 0.2 * smooth(0.08, 0.42, t) + 0.035 * smooth(0.82, 1, t) },
  { id: 'vase', name: 'Jarrón', height: 1.45, cavity: 0.39, profile: (t) => 0.29 + 0.42 * Math.sin(Math.PI * Math.pow(t, 0.78)) + 0.16 * smooth(0.77, 1, t) - 0.15 * smooth(0.65, 0.87, t) },
  { id: 'amphora', name: 'Ánfora', height: 1.42, cavity: 0.4, profile: (t) => 0.28 + 0.55 * Math.sin(Math.PI * Math.pow(t, 0.68)) - 0.23 * smooth(0.71, 0.88, t) + 0.18 * smooth(0.88, 1, t) },
  { id: 'plate', name: 'Plato', height: 0.24, cavity: 0.18, profile: (t) => 0.2 + 0.74 * smooth(0.1, 0.28, t) - 0.08 * smooth(0.65, 0.83, t) + 0.12 * smooth(0.85, 1, t) },
];

export const CLAY_COLORS = [
  { id: 'terracotta', name: 'Terracota', color: '#6b5143' },
  { id: 'white', name: 'Blanca', color: '#d0c6b0' },
  { id: 'gray', name: 'Gris', color: '#898982' },
  { id: 'black', name: 'Negra', color: '#353b3b' },
  { id: 'red', name: 'Roja', color: '#9f4438' },
  { id: 'sand', name: 'Arena', color: '#bb9568' },
];

export function smooth(a, b, x) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createProfile(shapeId = 'vase', presetVersion = 2) {
  const shape = SHAPES.find((item) => item.id === shapeId) || SHAPES[0];
  const profile = shapeId === 'cylinder' && presetVersion >= 2 ? shape.freshProfile : shape.profile;
  return Array.from({ length: RINGS + 1 }, (_, i) => Math.max(0.12, profile(i / RINGS)));
}

export function createVerticalProfile(height) {
  return Array.from({ length: RINGS + 1 }, (_, i) => height * i / RINGS);
}

export function formatHeightControlValue(height) {
  return (height * 10).toFixed(1);
}

export function sampleVerticalProfile(verticalProfile, t, height) {
  if (!Array.isArray(verticalProfile) || verticalProfile.length !== RINGS + 1) return THREE.MathUtils.clamp(t, 0, 1) * height;
  const sample = THREE.MathUtils.clamp(t, 0, 1) * RINGS;
  const low = Math.floor(sample), high = Math.min(RINGS, low + 1);
  return THREE.MathUtils.lerp(verticalProfile[low], verticalProfile[high], sample - low);
}

export function materialTAtHeight(verticalProfile, y, height) {
  if (!Array.isArray(verticalProfile) || verticalProfile.length !== RINGS + 1) return THREE.MathUtils.clamp(y / height, 0, 1);
  const target = THREE.MathUtils.clamp(y, verticalProfile[0], verticalProfile[RINGS]);
  let low = 0, high = RINGS;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (verticalProfile[mid] <= target) low = mid; else high = mid;
  }
  const span = Math.max(1e-8, verticalProfile[high] - verticalProfile[low]);
  return THREE.MathUtils.clamp((low + (target - verticalProfile[low]) / span) / RINGS, 0, 1);
}

export function isValidVerticalProfile(verticalProfile, height, minimumStep = 1e-5) {
  return Array.isArray(verticalProfile) && verticalProfile.length === RINGS + 1
    && verticalProfile.every(Number.isFinite)
    && Math.abs(verticalProfile[0]) <= 1e-5
    && Math.abs(verticalProfile[RINGS] - height) <= 1e-5
    && verticalProfile.slice(1).every((y, i) => y - verticalProfile[i] >= minimumStep);
}

export function verticalPullDisplacement(deltaY, worldPerPixel, screenUpY, pressure) {
  // Screen Y grows downward, so an upward pointer drag must produce positive world-Y motion.
  return -deltaY * worldPerPixel * Math.max(0.2, Math.abs(screenUpY)) * 0.28 * (pressure / 0.42);
}

export function screenSideFromAxis(screenX, axisScreenX) {
  return Math.sign(screenX - axisScreenX) || 1;
}

export function influenceCursorDiameter(influence) {
  // Show the one-sigma high-effect zone, not the full low-strength Gaussian tail.
  return Math.max(0, Number(influence) || 0) * 2;
}

export function ringReliefSigma(influence, height) {
  // Match the Gaussian FWHM to the visible brush diameter for Groove/Ridge.
  const sigmaWorld = influenceCursorDiameter(influence) / 2.35482;
  return Math.max(0.45, (sigmaWorld / Math.max(height, 0.24)) * RINGS);
}

export function applyDiameterDrag({
  profile, centerT, deltaX, screenSide, pressure, influence, height, minRadius,
  preserveVolume = false, desiredVolume = null, verticalProfile = null,
}) {
  const center = centerT * RINGS;
  const spread = Math.max(2.2, (influence / Math.max(height, 0.24)) * RINGS);
  const sensitivity = preserveVolume ? 0.00135 : 0.00075;
  const amount = deltaX * screenSide * sensitivity * (pressure / 0.42);
  const nextProfile = profile.map((radius, i) => {
    const d = (i - center) / spread;
    if (Math.abs(d) > INFLUENCE_SUPPORT_SIGMAS) return radius;
    return THREE.MathUtils.clamp(radius + amount * Math.exp(-0.5 * d * d), minRadius, 1.85);
  });
  if (preserveVolume && amount && desiredVolume) {
    conserveProfileVolume(nextProfile, height, desiredVolume, minRadius, verticalProfile);
  }
  return nextProfile;
}

export function applyLocalSmooth({ profile, centerT, deltaDistance, pressure, influence, height, minRadius = 0.14, maxRadius = 1.85 }) {
  if (!Array.isArray(profile) || profile.length !== RINGS + 1 || !(deltaDistance > 0)) return [...profile];
  const center = THREE.MathUtils.clamp(centerT, 0, 1) * RINGS;
  const spread = Math.max(2.2, (influence / Math.max(height, 0.24)) * RINGS);
  // Exponential accumulation makes smoothing depend on the distance traveled, not pointer event frequency.
  const blend = 1 - Math.exp(-deltaDistance * THREE.MathUtils.clamp(pressure, 0, 1) * 0.025);
  const masks = new Array(RINGS + 1).fill(0);
  const next = [...profile];
  for (let i = 1; i < RINGS; i++) {
    const t = i / RINGS;
    const d = (i - center) / spread;
    if (Math.abs(d) > INFLUENCE_SUPPORT_SIGMAS) continue;
    // Fade the brush near the foot and rim; keep both boundary rings fixed.
    const edgeFade = smooth(0.025, 0.14, t) * (1 - smooth(0.86, 0.975, t));
    const mask = Math.exp(-0.5 * d * d) * edgeFade;
    masks[i] = mask;
    const neighborAverage = (profile[i - 1] + profile[i + 1]) * 0.5;
    next[i] = THREE.MathUtils.clamp(profile[i] + (neighborAverage - profile[i]) * blend * mask, minRadius, maxRadius);
  }

  // Compensate the small radius-squared change inside the brush footprint only.
  // This avoids a visible loss of clay without changing the untouched profile.
  let target = 0, current = 0, weightTotal = 0;
  for (let i = 1; i < RINGS; i++) {
    const weight = masks[i];
    if (!weight) continue;
    target += profile[i] * profile[i] * weight;
    current += next[i] * next[i] * weight;
    weightTotal += weight;
  }
  if (weightTotal > 0 && Math.abs(target - current) > 1e-12) {
    let low = -0.2, high = 0.2;
    for (let step = 0; step < 22; step++) {
      const offset = (low + high) * 0.5;
      let corrected = 0;
      for (let i = 1; i < RINGS; i++) {
        const weight = masks[i];
        if (weight) corrected += THREE.MathUtils.clamp(next[i] + offset * weight, minRadius, maxRadius) ** 2 * weight;
      }
      if (corrected < target) low = offset; else high = offset;
    }
    const offset = (low + high) * 0.5;
    for (let i = 1; i < RINGS; i++) if (masks[i]) {
      next[i] = THREE.MathUtils.clamp(next[i] + offset * masks[i], minRadius, maxRadius);
    }
  }
  return next;
}

export function applyLocalSharpen({ profile, centerT, deltaDistance, pressure, influence, height, minRadius = 0.14, maxRadius = 1.85 }) {
  if (!Array.isArray(profile) || profile.length !== RINGS + 1 || !(deltaDistance > 0)) return [...profile];
  const center = THREE.MathUtils.clamp(centerT, 0, 1) * RINGS;
  const influenceWidth = THREE.MathUtils.clamp((influence / Math.max(height, 0.24)) * RINGS, 2.2, RINGS * 0.24);
  const firstAllowed = Math.ceil(RINGS * 0.04), lastAllowed = Math.floor(RINGS * 0.96);
  if (center <= firstAllowed || center >= lastAllowed) return [...profile];
  const left = Math.max(firstAllowed, Math.floor(center - influenceWidth));
  const right = Math.min(lastAllowed, Math.ceil(center + influenceWidth));
  if (center - left < 1 || right - center < 1) return [...profile];
  // Pressure advances the local profile toward a two-segment crease; repeated passes converge to one edge.
  const blend = 1 - Math.exp(-deltaDistance * THREE.MathUtils.clamp(pressure, 0, 1) * 0.025);
  const fadeWidth = THREE.MathUtils.clamp(influenceWidth * 0.2, 1, 4);
  const at = (position) => {
    const low = Math.floor(position), high = Math.min(RINGS, low + 1);
    return THREE.MathUtils.lerp(profile[low], profile[high], position - low);
  };
  const leftRadius = profile[left], contactRadius = at(center), rightRadius = profile[right];
  const chordAtContact = THREE.MathUtils.lerp(leftRadius, rightRadius, (center - left) / (right - left));
  // Exaggerate the curve's existing sag into one centered crease. Keep its value inside
  // the endpoint envelope so the operation cannot introduce an overshoot or a new loop.
  const creaseRadius = THREE.MathUtils.clamp(
    contactRadius + (contactRadius - chordAtContact),
    Math.min(leftRadius, rightRadius), Math.max(leftRadius, rightRadius),
  );
  const next = [...profile];
  for (let i = left + 1; i < right; i++) {
    const target = i <= center
      ? THREE.MathUtils.lerp(leftRadius, creaseRadius, (i - left) / (center - left))
      : THREE.MathUtils.lerp(creaseRadius, rightRadius, (i - center) / (right - center));
    const edgeDistance = Math.min(i - left, right - i);
    const edgeFade = smooth(0, fadeWidth, edgeDistance);
    const t = i / RINGS;
    // Keep the foot and mouth transitions protected, including their adjacent rings.
    const endFade = smooth(0.035, 0.09, t) * (1 - smooth(0.91, 0.965, t));
    const amount = blend * edgeFade * endFade;
    next[i] = THREE.MathUtils.clamp(THREE.MathUtils.lerp(profile[i], target, amount), minRadius, maxRadius);
  }
  return next;
}

export function applyRingRelief({
  profile, centerT, pressure, influence, height, kind, dab = false, deltaDistance = 0,
  minRadius = 0.14, maxRadius = 1.85,
}) {
  if (!Array.isArray(profile) || profile.length !== RINGS + 1 || !['groove', 'ridge'].includes(kind)) return [...profile];
  const center = THREE.MathUtils.clamp(centerT, 0, 1) * RINGS;
  const sigma = kind === 'ridge' ? ringReliefSigma(influence, height) : null;
  const grooveHalfWidth = Math.max(0.5, (influenceCursorDiameter(influence) * 0.5 / Math.max(height, 0.24)) * RINGS);
  const dose = dab ? 1 : 1 - Math.exp(-Math.max(0, deltaDistance) / 12);
  if (!dose) return [...profile];
  const strength = (0.002 + 0.022 * THREE.MathUtils.clamp(pressure, 0, 1)) * dose;
  const direction = kind === 'ridge' ? 1 : -1;
  const next = [...profile];
  for (let i = 1; i < RINGS; i++) {
    if (i <= 2 || i >= RINGS - 2) continue;
    const t = i / RINGS;
    if (kind === 'groove') {
      // A compact V profile reaches zero at the cursor edge; no Gaussian tails widen the cut.
      const normalizedDistance = Math.abs(i - center) / grooveHalfWidth;
      if (normalizedDistance >= 1) continue;
      const weight = (1 - normalizedDistance) * smooth(0.025, 0.11, t) * (1 - smooth(0.89, 0.975, t));
      next[i] = THREE.MathUtils.clamp(profile[i] + direction * strength * weight, minRadius, maxRadius);
      continue;
    }
    const d = (i - center) / sigma;
    if (Math.abs(d) > INFLUENCE_SUPPORT_SIGMAS) continue;
    // Keep Ridge's original rounded Gaussian cross-section unchanged.
    const endFade = smooth(0.025, 0.11, t) * (1 - smooth(0.89, 0.975, t));
    const weight = Math.exp(-0.5 * d * d) * endFade;
    next[i] = THREE.MathUtils.clamp(profile[i] + direction * strength * weight, minRadius, maxRadius);
  }
  return next;
}

export function applyFullHeightStretch({ profile, verticalProfile, height, deltaY, pressure, desiredVolume, minRadius }) {
  const nextHeight = THREE.MathUtils.clamp(height - deltaY * 0.004 * (pressure / 0.42), 0.24, 10);
  const verticalScale = nextHeight / height;
  const nextVerticalProfile = verticalProfile.map((y) => y * verticalScale);
  nextVerticalProfile[RINGS] = nextHeight;
  const nextProfile = [...profile];
  conserveProfileVolume(nextProfile, nextHeight, desiredVolume, minRadius, nextVerticalProfile);
  return { profile: nextProfile, verticalProfile: nextVerticalProfile, height: nextHeight };
}

export function applyVerticalPull({
  profile, verticalProfile, height, centerT, displacement, influence, thickness, heightLock = true,
}) {
  const nextVertical = [...verticalProfile];
  const spread = Math.max(2.2, (influence / Math.max(height, 0.24)) * RINGS);
  for (let i = 1; i <= RINGS; i++) {
    const t = i / RINGS;
    if (heightLock && i === RINGS) continue;
    const d = (t - centerT) * RINGS / spread;
    const localInfluence = Math.abs(d) > INFLUENCE_SUPPORT_SIGMAS ? 0 : Math.exp(-0.5 * d * d);
    const propagationT = THREE.MathUtils.clamp((t - centerT) / Math.max(0.04, 1 - centerT), 0, 1);
    // Once unlocked, carry the gesture from its contact point smoothly to the rim.
    // The rim receives the full vertical delta so total height follows the drag.
    const rimPropagation = heightLock ? 0 : propagationT * propagationT * (3 - 2 * propagationT);
    nextVertical[i] += displacement * Math.max(localInfluence, rimPropagation);
  }

  let nextHeight = heightLock ? height : THREE.MathUtils.clamp(nextVertical[RINGS], 0.24, 10);
  if (!heightLock && Math.abs(nextHeight - nextVertical[RINGS]) > 1e-9) {
    const proposedHeight = nextVertical[RINGS];
    if (proposedHeight > 1e-6) {
      const limitScale = nextHeight / proposedHeight;
      for (let i = 1; i < RINGS; i++) nextVertical[i] *= limitScale;
    } else {
      for (let i = 1; i < RINGS; i++) nextVertical[i] = nextHeight * i / RINGS;
    }
  }
  nextVertical[0] = 0;
  nextVertical[RINGS] = nextHeight;
  const minimumGap = Math.max(1e-5, nextHeight / RINGS * 0.12);
  for (let i = 1; i < RINGS; i++) {
    const min = nextVertical[i - 1] + minimumGap;
    const max = nextHeight - (RINGS - i) * minimumGap;
    nextVertical[i] = THREE.MathUtils.clamp(nextVertical[i], min, max);
  }

  // Vertical pull should not widen rings to compensate for compressed gaps.
  // A tiny directional radius change is enough to suggest clay tension.
  const minimumRadius = Math.max(0.14, thickness + MIN_INNER_RADIUS);
  const pullSpread = Math.max(2.2, (influence / Math.max(height, 0.24)) * RINGS);
  const directedAmount = THREE.MathUtils.clamp(displacement / Math.max(height, 0.24) * 0.04, -0.01, 0.01);
  const nextProfile = profile.map((radius, i) => {
    const d = (i / RINGS - centerT) * RINGS / pullSpread;
    const contactWeight = Math.abs(d) > INFLUENCE_SUPPORT_SIGMAS ? 0 : Math.exp(-0.5 * d * d);
    const pullScale = 1 - directedAmount * contactWeight;
    return THREE.MathUtils.clamp(radius * pullScale, minimumRadius, 1.85);
  });

  return { profile: nextProfile, verticalProfile: nextVertical, height: nextHeight };
}

export function makeClayMaterial(color = '#a95739', finish = 'classic') {
  const freshClay = finish === 'fresh';
  const map = noiseTexture(256, 43, false, freshClay);
  return new THREE.MeshStandardMaterial({
    color, roughness: freshClay ? 0.55 : 0.86, metalness: 0.008, side: THREE.DoubleSide,
    bumpMap: map, bumpScale: freshClay ? 0.0035 : 0.012, roughnessMap: map,
  });
}

export function makeMetalMaterial() {
  const texture = noiseTexture(512, 91, true);
  texture.repeat.set(3, 7);
  return new THREE.MeshStandardMaterial({
    color: '#b9c0c2', metalness: 1, roughness: 0.23,
    roughnessMap: texture, bumpMap: texture, bumpScale: 0.006,
  });
}

function noiseTexture(size, seed, brushed = false, organic = false) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  let state = seed >>> 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const grain = (state >>> 24) & 255;
    const bands = brushed ? (Math.sin(y * 1.3) * 12 + Math.sin(y * 0.31) * 8) : 0;
    const softVariation = organic
      ? Math.sin(x * 0.035 + Math.sin(y * 0.013)) * 2.2 + Math.sin(y * 0.052 + Math.sin(x * 0.01)) * 1.6 + (grain - 128) * 0.035
      : (grain - 128) * (brushed ? 0.2 : 0.15);
    const v = THREE.MathUtils.clamp(188 + softVariation + bands, 0, 255);
    const p = (y * size + x) * 4;
    image.data[p] = image.data[p + 1] = image.data[p + 2] = v; image.data[p + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function profileRings(profile, count, adaptive, min = 0, max = 1) {
  if (!adaptive) return Array.from({ length: count + 1 }, (_, i) => min + (max - min) * i / count);
  const intervals = [];
  let total = 0;
  for (let i = 0; i < RINGS; i++) {
    const start = Math.max(min, i / RINGS), end = Math.min(max, (i + 1) / RINGS);
    if (end <= start) continue;
    const bend = i > 0 && i < RINGS - 1 ? Math.abs(profile[i - 1] - 2 * profile[i] + profile[i + 1]) : 0;
    const weight = (end - start) * (1 + bend * 24);
    intervals.push({ start, end, weight, begin: total }); total += weight;
  }
  if (!intervals.length) return Array.from({ length: count + 1 }, (_, i) => min + (max - min) * i / count);
  return Array.from({ length: count + 1 }, (_, sample) => {
    const target = total * sample / count;
    const interval = intervals.find((item) => target <= item.begin + item.weight) || intervals.at(-1);
    const local = THREE.MathUtils.clamp((target - interval.begin) / interval.weight, 0, 1);
    return THREE.MathUtils.lerp(interval.start, interval.end, local);
  });
}

export function makeClayGeometry(profile, height, cavityFraction, thickness, options = {}) {
  const positions = [], indices = [], uvs = [];
  const verticalProfile = options.verticalProfile;
  const verticalAt = (t) => sampleVerticalProfile(verticalProfile, t, height);
  const cavityY = verticalAt(THREE.MathUtils.clamp(cavityFraction, 0.12, 0.82));
  const ringCount = Math.max(3, Math.floor(options.rings ?? RINGS));
  const segmentCount = Math.max(12, Math.floor(options.segments ?? SEGMENTS));
  const adaptive = options.adaptive === true;
  const freshClay = options.surfaceStyle === 'fresh';
  const imperfections = THREE.MathUtils.clamp(options.imperfections ?? 50, 0, 100) / 50;
  const vertsPerRow = segmentCount + 1;
  const outerLevels = profileRings(profile, ringCount, adaptive);
  const innerLevels = profileRings(profile, ringCount, adaptive, THREE.MathUtils.clamp(cavityFraction, 0.12, 0.82), 1);
  const profileAt = (t) => {
    const sample = THREE.MathUtils.clamp(t, 0, 1) * RINGS;
    const low = Math.floor(sample), high = Math.min(RINGS, low + 1);
    return THREE.MathUtils.lerp(profile[low], profile[high], sample - low);
  };
  for (let side = 0; side < 2; side++) {
    for (let j = 0; j <= ringCount; j++) {
      const t = side === 0 ? outerLevels[j] : innerLevels[j];
      const y = verticalAt(t);
      const outer = profileAt(t);
      const inner = Math.max(MIN_INNER_RADIUS, outer - thickness);
      const radius = side === 0 ? outer : inner;
      for (let k = 0; k <= segmentCount; k++) {
        // Keep the UV seam duplicated, but make both endpoint positions exact.
        const a = k === segmentCount ? 0 : (k / segmentCount) * Math.PI * 2;
        const throwing = freshClay
          ? imperfections * (0.00031 * Math.sin(t * Math.PI * (8.1 + 0.24 * Math.sin(t * 5.4)) + 0.32 * Math.sin(a * 1.7))
            + 0.000095 * Math.sin(t * Math.PI * 2.7 + a * 3.3) + 0.000045 * Math.sin(t * Math.PI * 27.4 + a * 1.13))
          : imperfections * (0.0017 * Math.sin(t * Math.PI * 16 + a * 3) + 0.0007 * Math.sin(t * Math.PI * 30 - a * 2));
        positions.push(Math.cos(a) * Math.max(MIN_INNER_RADIUS * 0.5, radius + throwing), y, Math.sin(a) * Math.max(MIN_INNER_RADIUS * 0.5, radius + throwing));
        const v = side === 0 ? t : (t - cavityFraction) / (1 - cavityFraction);
        uvs.push(k / segmentCount, v);
      }
    }
  }
  for (let side = 0; side < 2; side++) {
    const offset = side * (ringCount + 1) * vertsPerRow;
    for (let j = 0; j < ringCount; j++) for (let k = 0; k < segmentCount; k++) {
      const a = offset + j * vertsPerRow + k, b = a + vertsPerRow;
      if (side === 0) indices.push(a, b, a + 1, b, b + 1, a + 1);
      else indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const outerTop = ringCount * vertsPerRow, innerTop = (ringCount + 1) * vertsPerRow + ringCount * vertsPerRow;
  // The lip faces upward, matching the outward winding of the STL shell.
  // Fresh clay gets split render normals at both sharp rim edges; coincident
  // positions keep the closed shell and the same physical wall thickness.
  let lipOuterTop = outerTop, lipInnerTop = innerTop;
  if (freshClay) {
    lipOuterTop = positions.length / 3;
    for (let k = 0; k <= segmentCount; k++) {
      const source = outerTop + k;
      positions.push(positions[source * 3], positions[source * 3 + 1], positions[source * 3 + 2]);
      uvs.push(uvs[source * 2], uvs[source * 2 + 1]);
    }
    lipInnerTop = positions.length / 3;
    for (let k = 0; k <= segmentCount; k++) {
      const source = innerTop + k;
      positions.push(positions[source * 3], positions[source * 3 + 1], positions[source * 3 + 2]);
      uvs.push(uvs[source * 2], uvs[source * 2 + 1]);
    }
  }
  for (let k = 0; k < segmentCount; k++) indices.push(lipOuterTop + k, lipInnerTop + k, lipOuterTop + k + 1, lipOuterTop + k + 1, lipInnerTop + k, lipInnerTop + k + 1);
  const innerBase = (ringCount + 1) * vertsPerRow;
  const floorCenter = positions.length / 3;
  positions.push(0, cavityY, 0); uvs.push(0.5, 0.5);
  for (let k = 0; k < segmentCount; k++) indices.push(floorCenter, innerBase + k + 1, innerBase + k);
  const baseCenter = positions.length / 3;
  positions.push(0, 0, 0); uvs.push(0.5, 0.5);
  for (let k = 0; k < segmentCount; k++) indices.push(baseCenter, k, k + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  for (let side = 0; side < 2; side++) for (let j = 0; j <= ringCount; j++) {
    const first = side * (ringCount + 1) * vertsPerRow + j * vertsPerRow;
    const last = first + segmentCount;
    const seamNormal = new THREE.Vector3(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
    normals.setXYZ(first, seamNormal.x, seamNormal.y, seamNormal.z);
    normals.setXYZ(last, seamNormal.x, seamNormal.y, seamNormal.z);
  }
  normals.needsUpdate = true;
  geometry.userData.topology = { rings: ringCount, segments: segmentCount, adaptive, outerLevels, innerLevels, verticalProfile: verticalProfile ? [...verticalProfile] : createVerticalProfile(height) };
  geometry.computeBoundingSphere();
  return geometry;
}

export function estimateVolume(profile, height, verticalProfile = null) {
  let sum = 0;
  for (let i = 0; i < RINGS; i++) {
    const ringHeight = verticalProfile ? verticalProfile[i + 1] - verticalProfile[i] : height / RINGS;
    sum += ((profile[i] ** 2 + profile[i + 1] ** 2) * 0.5) * ringHeight;
  }
  return Math.PI * sum;
}

export function conserveProfileVolume(profile, height, desiredVolume, minRadius = 0.14, verticalProfile = null) {
  const actual = estimateVolume(profile, height, verticalProfile);
  if (!actual || !desiredVolume) return;
  const scale = THREE.MathUtils.clamp(Math.sqrt(desiredVolume / actual), 0.78, 1.28);
  for (let i = 0; i < profile.length; i++) profile[i] = THREE.MathUtils.clamp(profile[i] * scale, minRadius, 1.85);
}
