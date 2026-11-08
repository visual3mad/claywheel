import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { exportOBJ } from '../src/obj-export.js';
import { SHAPES, RINGS, SEGMENTS, MIN_INNER_RADIUS, GEOMETRY_RESOLUTIONS, createProfile, makeClayGeometry } from '../src/ceramic.js';

globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((result) => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((result) => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};

const key = (p) => [p.x, p.y, p.z].map((n) => Math.round(n * 1e5)).join(',');
function checkGeometry(geometry, label) {
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), index = geometry.index;
  const elementCount = index?.count ?? positions?.count;
  if (!positions || !normals || elementCount % 3) throw new Error(`${label}: atributos o triángulos incompletos`);
  const edges = new Map(), faces = new Set();
  let volume = 0, degenerate = 0, duplicate = 0;
  const point = (i) => new THREE.Vector3().fromBufferAttribute(positions, i);
  const vertexIndex = (i) => index?.getX(i) ?? i;
  for (let i = 0; i < elementCount; i += 3) {
    const ids = [vertexIndex(i), vertexIndex(i + 1), vertexIndex(i + 2)], pts = ids.map(point), keys = pts.map(key);
    if (new Set(keys).size !== 3 || new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).lengthSq() < 1e-14) degenerate++;
    const face = [...keys].sort().join('|'); if (faces.has(face)) duplicate++; faces.add(face);
    volume += pts[0].dot(new THREE.Vector3().crossVectors(pts[1], pts[2])) / 6;
    for (let side = 0; side < 3; side++) {
      const a = keys[side], b = keys[(side + 1) % 3], edgeKey = a < b ? `${a}|${b}` : `${b}|${a}`;
      const edge = edges.get(edgeKey) || { count: 0, winding: 0 };
      edge.count++; edge.winding += a < b ? 1 : -1; edges.set(edgeKey, edge);
    }
  }
  const badEdges = [...edges.values()].filter((edge) => edge.count !== 2 || edge.winding !== 0).length;
  if (degenerate || duplicate || badEdges || volume <= 0) throw new Error(`${label}: defectos geométricos ${JSON.stringify({ degenerate, duplicate, badEdges, volume })}`);
  for (let i = 0; i < normals.count; i++) {
    const normal = new THREE.Vector3().fromBufferAttribute(normals, i);
    if (![normal.x, normal.y, normal.z].every(Number.isFinite) || normal.lengthSq() < 0.9) throw new Error(`${label}: normal inválida`);
  }
  const topology = geometry.userData.topology;
  if (topology) for (let side = 0; side < 2; side++) for (let j = 0; j <= topology.rings; j++) {
    const row = side * (topology.rings + 1) * (topology.segments + 1) + j * (topology.segments + 1), last = row + topology.segments;
    if (point(row).distanceTo(point(last)) > 1e-7 || new THREE.Vector3().fromBufferAttribute(normals, row).distanceTo(new THREE.Vector3().fromBufferAttribute(normals, last)) > 1e-5) throw new Error(`${label}: costura de UV visible`);
  }
  return { triangles: elementCount / 3, vertices: positions.count, volume };
}

async function exportRoundTrip(geometry, label) {
  const material = new THREE.MeshStandardMaterial({ color: '#a95739', roughness: 0.86 });
  const mesh = new THREE.Mesh(geometry, material), scene = new THREE.Scene(); scene.add(mesh); scene.updateMatrixWorld(true);

  const obj = new OBJExporter().parse(mesh);
  const objVertices = (obj.match(/^v /gm) || []).length, objNormals = (obj.match(/^vn /gm) || []).length, objFaces = (obj.match(/^f /gm) || []).length;
  if (objVertices !== geometry.getAttribute('position').count || objNormals !== objVertices || objFaces !== geometry.index.count / 3) throw new Error(`${label}: OBJ perdió posiciones, normales o caras`);
  const objPositions = obj.split('\n').filter((line) => line.startsWith('v ')).map((line) => line.trim().split(/\s+/).slice(1).map(Number));
  const sourcePositions = geometry.getAttribute('position');
  for (let i = 0; i < objPositions.length; i++) for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(objPositions[i][axis] - sourcePositions.getComponent(i, axis)) > 1e-5) throw new Error(`${label}: OBJ modificó la silueta`);
  }

  const quads = exportOBJ(mesh, { prioritizeQuads: true });
  const topology = geometry.userData.topology;
  const faceSizes = quads.split('\n').filter((line) => line.startsWith('f ')).map((line) => line.trim().split(/\s+/).length - 1);
  const expectedQuads = 2 * topology.rings * topology.segments + topology.segments;
  if (faceSizes.filter((count) => count === 4).length !== expectedQuads || faceSizes.filter((count) => count === 3).length !== 2 * topology.segments) throw new Error(`${label}: OBJ no conserva quads de superficie y tapas triangulares`);
  const objScene = new OBJLoader().parse(quads);
  let objGeometry;
  objScene.traverse((object) => { if (object.isMesh && !objGeometry) objGeometry = object.geometry; });
  if (!objGeometry) throw new Error(`${label}: OBJ quad no se reimporta`);
  const objResult = checkGeometry(objGeometry, `${label} OBJ quad`);
  if (objResult.triangles !== geometry.index.count / 3) throw new Error(`${label}: OBJ quad alteró la triangulación al reimportarse`);

  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  let glbGeometry;
  gltf.scene.traverse((object) => { if (object.isMesh && !glbGeometry) glbGeometry = object.geometry; });
  if (!glbGeometry) throw new Error(`${label}: GLB no contiene malla`);
  const glbResult = checkGeometry(glbGeometry, `${label} GLB`);
  const glbPositions = glbGeometry.getAttribute('position');
  if (glbResult.triangles !== geometry.index.count / 3 || glbPositions.count !== sourcePositions.count) throw new Error(`${label}: GLB cambió la triangulación o los vértices`);
  for (let i = 0; i < sourcePositions.count; i++) for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(glbPositions.getComponent(i, axis) - sourcePositions.getComponent(i, axis)) > 1e-5) throw new Error(`${label}: GLB modificó la silueta`);
  }
  return { objVertices, objFaces, quadFaces: expectedQuads, quadTriangles: faceSizes.filter((count) => count === 3).length, glbBytes: glb.byteLength, glbTriangles: glbResult.triangles };
}

const modelLevels = ['light', 'balanced', 'high'], exportLevels = ['high', 'light', 'standard'];
const tests = SHAPES.map((shape, i) => ({ name: shape.name, profile: createProfile(shape.id), height: shape.height, cavity: shape.cavity, thickness: 0.11, modelResolution: modelLevels[i % 3], exportResolution: exportLevels[i % 3], roundTrip: true }));
const vase = createProfile('vase');
const soft = createProfile('cylinder'), bilateral = createProfile('vase');
for (let i = 0; i <= RINGS; i++) {
  const t = i / RINGS;
  const neckWeight = Math.exp(-0.5 * ((t - 0.72) / 0.055) ** 2);
  vase[i] = Math.max(0.14, vase[i] * (1 - 0.48 * neckWeight));
  soft[i] = THREE.MathUtils.clamp(soft[i] + 0.24 * Math.exp(-0.5 * ((i - 32) / 5.5) ** 2), 0.14, 1.85);
  bilateral[i] = THREE.MathUtils.clamp(bilateral[i] - 0.19 * Math.exp(-0.5 * ((i - 51) / 6.5) ** 2), 0.14, 1.85);
}
tests.push(
  { name: 'Plato bajo ancho · pared 1 mm', profile: createProfile('plate'), height: 0.24, cavity: 0.18, thickness: 0.01, modelResolution: 'light', exportResolution: 'high', imperfections: 0, roundTrip: true },
  { name: 'Vaso alto estrecho · 100 cm', profile: createProfile('cup').map((r) => Math.max(0.14, r * 0.58)), height: 10, cavity: 0.34, thickness: 0.01, modelResolution: 'high', exportResolution: 'standard', imperfections: 75, roundTrip: true },
  { name: 'Jarrón con cuello estrecho', profile: vase, height: 1.45, cavity: 0.39, thickness: 0.11, modelResolution: 'balanced', exportResolution: 'high', roundTrip: true },
  { name: 'Modelado suave aplicado', profile: soft, height: 0.62, cavity: 0.43, thickness: 0.11, modelResolution: 'high', exportResolution: 'light', roundTrip: true },
  { name: 'Presión bilateral aplicada', profile: bilateral, height: 1.45, cavity: 0.39, thickness: 0.11, modelResolution: 'balanced', exportResolution: 'standard', imperfections: 100, roundTrip: true },
  { name: 'Estirar aplicado', profile: createProfile('cup'), height: 2.4, cavity: 0.34, thickness: 0.11, modelResolution: 'light', exportResolution: 'high', roundTrip: true },
);

for (const test of tests) {
  const minimumWall = Math.min(...test.profile.map((radius) => radius - Math.max(MIN_INNER_RADIUS, radius - test.thickness)));
  if (minimumWall < 0.01 - 1e-6 || test.profile.some((radius) => !Number.isFinite(radius) || radius <= test.thickness + MIN_INNER_RADIUS - 1e-6)) throw new Error(`${test.name}: pared mínima insuficiente`);
  const imperfection = test.imperfections ?? 50;
  const geometry = makeClayGeometry(test.profile, test.height, test.cavity, test.thickness, { ...GEOMETRY_RESOLUTIONS[test.modelResolution || 'balanced'], adaptive: true, imperfections: imperfection });
  const result = checkGeometry(geometry, `${test.name} modelo`);
  const exportGeometry = makeClayGeometry(test.profile, test.height, test.cavity, test.thickness, { ...GEOMETRY_RESOLUTIONS[(test.exportResolution || 'standard') === 'standard' ? 'balanced' : test.exportResolution], adaptive: true, imperfections: imperfection });
  const exportResult = checkGeometry(exportGeometry, `${test.name} exportación`);
  if (test.roundTrip) {
    const outputs = await exportRoundTrip(exportGeometry, test.name);
    console.log(`${test.name}: modelo ${test.modelResolution || 'balanced'}, exportación ${test.exportResolution || 'standard'} (${exportGeometry.userData.topology.rings}×${exportGeometry.userData.topology.segments}); tris ${result.triangles}/${exportResult.triangles}; OBJ ${outputs.quadFaces} quads + ${outputs.quadTriangles} tri; GLB ${outputs.glbTriangles} tris`);
  }
  geometry.dispose(); exportGeometry.dispose();
}
