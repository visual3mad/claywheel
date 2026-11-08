import * as THREE from 'three';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

const fixed = (value) => (Math.abs(value) < 5e-8 ? 0 : value).toFixed(6);

export function exportOBJ(mesh, { prioritizeQuads = true } = {}) {
  const geometry = mesh.geometry, topology = geometry.userData.topology;
  if (!prioritizeQuads || !topology || !geometry.index) return new OBJExporter().parse(mesh);

  mesh.updateMatrixWorld(true);
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
  const transformNormal = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const lines = ['# TORNO OBJ · quads para las superficies torneadas', 'o TORNO'];
  const point = new THREE.Vector3(), direction = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    lines.push(`v ${fixed(point.x)} ${fixed(point.y)} ${fixed(point.z)}`);
  }
  for (let i = 0; i < uv.count; i++) lines.push(`vt ${fixed(uv.getX(i))} ${fixed(uv.getY(i))}`);
  for (let i = 0; i < normal.count; i++) {
    direction.fromBufferAttribute(normal, i).applyMatrix3(transformNormal).normalize();
    lines.push(`vn ${fixed(direction.x)} ${fixed(direction.y)} ${fixed(direction.z)}`);
  }
  const face = (ids) => lines.push(`f ${ids.map((id) => `${id + 1}/${id + 1}/${id + 1}`).join(' ')}`);
  const { rings, segments } = topology;
  const rowWidth = segments + 1, innerBase = (rings + 1) * rowWidth, innerTop = innerBase + rings * rowWidth;

  // Keep one genuine OBJ quad per ring cell, with matching outward winding.
  for (let side = 0; side < 2; side++) {
    const offset = side * innerBase;
    for (let j = 0; j < rings; j++) for (let k = 0; k < segments; k++) {
      const a = offset + j * rowWidth + k, b = a + rowWidth;
      face(side === 0 ? [a, b, b + 1, a + 1] : [a, a + 1, b + 1, b]);
    }
  }
  const outerTop = rings * rowWidth;
  for (let k = 0; k < segments; k++) face([outerTop + k, innerTop + k, innerTop + k + 1, outerTop + k + 1]);

  // Flat floor and base remain triangles, as quads cannot cover their centers cleanly.
  const floorCenter = position.count - 2, baseCenter = position.count - 1;
  for (let k = 0; k < segments; k++) {
    face([floorCenter, innerBase + k + 1, innerBase + k]);
    face([baseCenter, k, k + 1]);
  }
  return `${lines.join('\n')}\n`;
}
