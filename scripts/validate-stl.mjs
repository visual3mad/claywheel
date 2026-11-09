import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { SHAPES, MIN_INNER_RADIUS, GEOMETRY_RESOLUTIONS, createProfile, createVerticalProfile, applyVerticalPull, makeClayGeometry } from '../src/ceramic.js';

const scaleToMillimeters = 100;
const keyAt = (x, y, z) => [x, y, z].map((value) => Math.round(value * 1e4)).join(',');

function inspectMesh(geometry) {
  const positions = geometry.getAttribute('position');
  const edges = new Map(), faces = new Set();
  let degenerate = 0, duplicateFaces = 0, signedVolume = 0;
  const pointKey = (index) => keyAt(positions.getX(index), positions.getY(index), positions.getZ(index));

  for (let i = 0; i < positions.count; i += 3) {
    const keys = [pointKey(i), pointKey(i + 1), pointKey(i + 2)];
    if (new Set(keys).size !== 3) degenerate++;
    const face = [...keys].sort().join('|');
    if (faces.has(face)) duplicateFaces++;
    faces.add(face);

    const a = new THREE.Vector3().fromBufferAttribute(positions, i);
    const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (normal.lengthSq() < 1e-12) degenerate++;
    signedVolume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;

    for (let side = 0; side < 3; side++) {
      const from = keys[side], to = keys[(side + 1) % 3];
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      const edge = edges.get(key) || { count: 0, winding: 0 };
      edge.count++;
      edge.winding += from < to ? 1 : -1;
      edges.set(key, edge);
    }
  }

  const badEdges = [...edges.values()].filter((edge) => edge.count !== 2 || edge.winding !== 0).length;
  return { triangles: positions.count / 3, degenerate, duplicateFaces, badEdges, signedVolume, positions };
}

function sectionContours(geometry, y) {
  const positions = geometry.getAttribute('position'), adjacency = new Map(), segments = [];
  const vertex = (i) => new THREE.Vector3().fromBufferAttribute(positions, i);
  const key = (point) => keyAt(point.x, point.y, point.z);
  for (let i = 0; i < positions.count; i += 3) {
    const triangle = [vertex(i), vertex(i + 1), vertex(i + 2)], intersections = [];
    for (let side = 0; side < 3; side++) {
      const a = triangle[side], b = triangle[(side + 1) % 3];
      if ((a.y < y && b.y > y) || (a.y > y && b.y < y)) {
        const amount = (y - a.y) / (b.y - a.y);
        intersections.push(new THREE.Vector3(a.x + (b.x - a.x) * amount, y, a.z + (b.z - a.z) * amount));
      }
    }
    if (intersections.length !== 2) continue;
    const [a, b] = intersections, ka = key(a), kb = key(b);
    segments.push([ka, kb]);
    if (!adjacency.has(ka)) adjacency.set(ka, new Set());
    if (!adjacency.has(kb)) adjacency.set(kb, new Set());
    adjacency.get(ka).add(kb); adjacency.get(kb).add(ka);
  }
  let loops = 0, nonManifoldSectionNodes = 0;
  const visited = new Set();
  for (const [start, neighbours] of adjacency) {
    if (neighbours.size !== 2) nonManifoldSectionNodes++;
    if (visited.has(start)) continue;
    loops++;
    const stack = [start]; visited.add(start);
    while (stack.length) for (const next of adjacency.get(stack.pop())) if (!visited.has(next)) { visited.add(next); stack.push(next); }
  }
  const radii = [...adjacency.keys()].map((entry) => {
    const [x, , z] = entry.split(',').map((value) => Number(value) / 1e4);
    return Math.hypot(x, z);
  });
  return { loops, nonManifoldSectionNodes, segments: segments.length, radiusLevels: radii };
}

const cases = SHAPES.map((shape) => ({ ...shape, profile: createProfile(shape.id), thickness: 0.11, surfaceStyle: shape.id === 'cylinder' ? 'fresh' : undefined, allResolutions: true }));
const smoothProfile = createProfile('cylinder'), bilateralProfile = createProfile('vase');
for (let i = 0; i <= 72; i++) {
  const soft = Math.exp(-0.5 * ((i - 32) / 5.5) ** 2);
  const squeeze = Math.exp(-0.5 * ((i - 51) / 6.5) ** 2);
  smoothProfile[i] = THREE.MathUtils.clamp(smoothProfile[i] + 0.24 * soft, 0.14, 1.85);
  bilateralProfile[i] = THREE.MathUtils.clamp(bilateralProfile[i] - 0.19 * squeeze, 0.14, 1.85);
}
cases.push(
  { id: 'cylinder-legacy', name: 'Cilindro legado desde JSON', height: 0.62, cavity: 0.43, profile: createProfile('cylinder', 1), thickness: 0.11, surfaceStyle: 'classic', allResolutions: true },
  { id: 'plate', name: 'Plato bajo ancho · pared 1 mm', height: 0.24, cavity: 0.18, profile: createProfile('plate'), thickness: 0.01, imperfections: 0 },
  { id: 'cup', name: 'Vaso alto estrecho · 100 cm', height: 10, cavity: 0.34, profile: createProfile('cup').map((r) => Math.max(0.14, r * 0.58)), thickness: 0.01, imperfections: 75 },
  { id: 'cylinder', name: 'Modelado suave aplicado', height: 0.62, cavity: 0.43, profile: smoothProfile, thickness: 0.11, imperfections: 50 },
  { id: 'vase', name: 'Presión bilateral aplicada', height: 1.45, cavity: 0.39, profile: bilateralProfile, thickness: 0.11, imperfections: 100 },
);
const verticalPull = applyVerticalPull({ profile: createProfile('cylinder', 2), verticalProfile: createVerticalProfile(0.62), height: 0.62, centerT: 0.52, displacement: 0.09, influence: 0.18, thickness: 0.11, cavityFraction: 0.43, heightLock: false });
cases.push({ id: 'vertical-pull', name: 'Tirón vertical desbloqueado', height: verticalPull.height, cavity: 0.43, profile: verticalPull.profile, verticalProfile: verticalPull.verticalProfile, thickness: 0.11, surfaceStyle: 'fresh' });

for (const shape of cases) {
  const { profile, thickness } = shape;
  const minWall = Math.min(...profile.map((radius) => radius - Math.max(MIN_INNER_RADIUS, radius - thickness)));
  const maxWall = Math.min(...profile.map((radius) => radius - MIN_INNER_RADIUS));
  const floorThickness = shape.height * shape.cavity;
  if (minWall < 0.01 - 1e-6 || thickness > maxWall + 1e-6 || floorThickness <= 0 || profile.some((radius) => !Number.isFinite(radius) || radius <= thickness + MIN_INNER_RADIUS - 1e-6)) throw new Error(`${shape.name}: pared o fondo inválido`);

  const resolutions = shape.allResolutions ? Object.entries(GEOMETRY_RESOLUTIONS) : [['high', GEOMETRY_RESOLUTIONS.high]];
  for (const [level, quality] of resolutions) {
    const sourceGeometry = makeClayGeometry(profile, shape.height, shape.cavity, thickness, { ...quality, adaptive: true, imperfections: shape.imperfections ?? 50, surfaceStyle: shape.surfaceStyle, verticalProfile: shape.verticalProfile });
    const mesh = new THREE.Mesh(sourceGeometry); mesh.scale.setScalar(scaleToMillimeters);
    const scene = new THREE.Scene(); scene.add(mesh); scene.updateMatrixWorld(true);
    const stl = new STLExporter().parse(scene, { binary: true });
    const reimported = new STLLoader().parse(stl.buffer);
    const report = inspectMesh(reimported);
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < report.positions.count; i++) { minY = Math.min(minY, report.positions.getY(i)); maxY = Math.max(maxY, report.positions.getY(i)); }
    const lower = sectionContours(reimported, shape.height * shape.cavity * scaleToMillimeters * 0.5);
    const cavity = sectionContours(reimported, shape.height * (shape.cavity + (1 - shape.cavity) * 0.62) * scaleToMillimeters);
    const radii = cavity.radiusLevels.sort((a, b) => a - b);
    const innerRadius = radii[0], outerRadius = radii.at(-1);
    const minSectionSegments = quality.segments * 0.8;

    if (report.degenerate || report.duplicateFaces || report.badEdges || report.signedVolume <= 0) throw new Error(`${shape.name} ${level}: malla STL defectuosa ${JSON.stringify(report)}`);
    if (Math.abs((maxY - minY) - shape.height * scaleToMillimeters) > 0.02) throw new Error(`${shape.name} ${level}: escala STL incorrecta`);
    if (lower.loops !== 1 || cavity.loops !== 2 || cavity.nonManifoldSectionNodes || cavity.segments < minSectionSegments || !(innerRadius < outerRadius - 0.9)) {
      throw new Error(`${shape.name} ${level}: sección STL hueca inválida ${JSON.stringify({ lower, cavity })}`);
    }
    console.log(`${shape.name} · ${level}: ${report.triangles} triángulos, cerrada/orientada, cavidad/fondo, pared ${Math.round(thickness * 100)} mm, ${(maxY - minY).toFixed(1)} mm`);
    reimported.dispose(); sourceGeometry.dispose();
  }
}
