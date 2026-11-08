import * as THREE from 'three';

export const RINGS = 72;
export const SEGMENTS = 88;
export const MIN_INNER_RADIUS = 0.01; // 1 mm in the studio's 100 mm/unit scale.
export const GEOMETRY_RESOLUTIONS = {
  light: { rings: 36, segments: 48 },
  balanced: { rings: RINGS, segments: SEGMENTS },
  high: { rings: 128, segments: 160 },
};
export const SHAPES = [
  { id: 'cylinder', name: 'Cilindro', height: 0.62, cavity: 0.43, profile: (t) => 0.79 - 0.04 * smooth(0.92, 1, t) + 0.015 * smooth(0, 0.045, t) },
  { id: 'bowl', name: 'Cuenco', height: 0.9, cavity: 0.2, profile: (t) => 0.24 + 0.73 * Math.pow(t, 1.65) },
  { id: 'cup', name: 'Vaso', height: 1.24, cavity: 0.34, profile: (t) => 0.47 + 0.2 * smooth(0.08, 0.42, t) + 0.035 * smooth(0.82, 1, t) },
  { id: 'vase', name: 'Jarrón', height: 1.45, cavity: 0.39, profile: (t) => 0.29 + 0.42 * Math.sin(Math.PI * Math.pow(t, 0.78)) + 0.16 * smooth(0.77, 1, t) - 0.15 * smooth(0.65, 0.87, t) },
  { id: 'amphora', name: 'Ánfora', height: 1.42, cavity: 0.4, profile: (t) => 0.28 + 0.55 * Math.sin(Math.PI * Math.pow(t, 0.68)) - 0.23 * smooth(0.71, 0.88, t) + 0.18 * smooth(0.88, 1, t) },
  { id: 'plate', name: 'Plato', height: 0.24, cavity: 0.18, profile: (t) => 0.2 + 0.74 * smooth(0.1, 0.28, t) - 0.08 * smooth(0.65, 0.83, t) + 0.12 * smooth(0.85, 1, t) },
];

export const CLAY_COLORS = [
  { id: 'terracotta', name: 'Terracota', color: '#a95739' },
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

export function createProfile(shapeId = 'vase') {
  const shape = SHAPES.find((item) => item.id === shapeId) || SHAPES[0];
  return Array.from({ length: RINGS + 1 }, (_, i) => Math.max(0.12, shape.profile(i / RINGS)));
}

export function makeClayMaterial(color = '#a95739') {
  const map = noiseTexture(256, 43);
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.86, metalness: 0.008, side: THREE.DoubleSide,
    bumpMap: map, bumpScale: 0.012, roughnessMap: map,
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

function noiseTexture(size, seed, brushed = false) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  let state = seed >>> 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const grain = (state >>> 24) & 255;
    const bands = brushed ? (Math.sin(y * 1.3) * 12 + Math.sin(y * 0.31) * 8) : 0;
    const v = THREE.MathUtils.clamp(188 + (grain - 128) * (brushed ? 0.2 : 0.15) + bands, 0, 255);
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
  const cavityY = THREE.MathUtils.clamp(cavityFraction, 0.12, 0.82) * height;
  const ringCount = Math.max(3, Math.floor(options.rings ?? RINGS));
  const segmentCount = Math.max(12, Math.floor(options.segments ?? SEGMENTS));
  const adaptive = options.adaptive === true;
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
      const y = t * height;
      const outer = profileAt(y / height);
      const inner = Math.max(MIN_INNER_RADIUS, outer - thickness);
      const radius = side === 0 ? outer : inner;
      for (let k = 0; k <= segmentCount; k++) {
        // Keep the UV seam duplicated, but make both endpoint positions exact.
        const a = k === segmentCount ? 0 : (k / segmentCount) * Math.PI * 2;
        const throwing = imperfections * (0.0017 * Math.sin(t * Math.PI * 16 + a * 3) + 0.0007 * Math.sin(t * Math.PI * 30 - a * 2));
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
  for (let k = 0; k < segmentCount; k++) indices.push(outerTop + k, innerTop + k, outerTop + k + 1, outerTop + k + 1, innerTop + k, innerTop + k + 1);
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
  geometry.userData.topology = { rings: ringCount, segments: segmentCount, adaptive, outerLevels, innerLevels };
  geometry.computeBoundingSphere();
  return geometry;
}

export function estimateVolume(profile, height) {
  let sum = 0;
  for (let i = 0; i < RINGS; i++) sum += (profile[i] ** 2 + profile[i + 1] ** 2) * 0.5;
  return Math.PI * (height / RINGS) * sum;
}

export function conserveProfileVolume(profile, height, desiredVolume, minRadius = 0.14) {
  const actual = estimateVolume(profile, height);
  if (!actual || !desiredVolume) return;
  const scale = THREE.MathUtils.clamp(Math.sqrt(desiredVolume / actual), 0.78, 1.28);
  for (let i = 0; i < profile.length; i++) profile[i] = THREE.MathUtils.clamp(profile[i] * scale, minRadius, 1.85);
}
