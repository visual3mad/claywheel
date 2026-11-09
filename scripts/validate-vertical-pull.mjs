import assert from 'node:assert/strict';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import {
  RINGS, MIN_INNER_RADIUS, createProfile, createVerticalProfile, estimateVolume, isValidVerticalProfile,
  applyFullHeightStretch, applyVerticalPull, verticalPullDisplacement, formatHeightControlValue, makeClayGeometry,
} from '../src/ceramic.js';
import en from '../src/locales/en.js';
import es from '../src/locales/es.js';
import { SnapshotTimeline } from '../src/history.js';

const height = 0.62, cavity = 0.43, thickness = 0.11;
const profile = createProfile('cylinder', 2);
const verticalProfile = createVerticalProfile(height);
const minimumRadius = thickness + MIN_INNER_RADIUS;
const settings = { profile, verticalProfile, height, centerT: 0.52, influence: 0.18, thickness, cavityFraction: cavity };
const initialVolume = estimateVolume(profile, height, verticalProfile);
const fullDeformUp = applyFullHeightStretch({
  profile, verticalProfile, height, deltaY: -40, pressure: 0.42, desiredVolume: initialVolume, minRadius: minimumRadius,
});
const fullDeformDown = applyFullHeightStretch({
  profile, verticalProfile, height, deltaY: 40, pressure: 0.42, desiredVolume: initialVolume, minRadius: minimumRadius,
});
assert(fullDeformUp.height > height && fullDeformUp.verticalProfile[RINGS] === fullDeformUp.height, 'Height must retain the legacy full-height upward stretch behavior');
assert(fullDeformDown.height < height && fullDeformDown.verticalProfile[RINGS] === fullDeformDown.height, 'Height must retain the legacy full-height compression behavior');
assert(Math.abs(estimateVolume(fullDeformUp.profile, fullDeformUp.height, fullDeformUp.verticalProfile) / initialVolume - 1) < 1e-6, 'Height must retain legacy volume compensation');
const upwardPointerDelta = verticalPullDisplacement(-48, 0.003, 0.8, 0.42);
const downwardPointerDelta = verticalPullDisplacement(48, 0.003, 0.8, 0.42);
assert(upwardPointerDelta > 0, 'upward screen drag must map to positive vertical geometry displacement');
assert(downwardPointerDelta < 0, 'downward screen drag must map to negative vertical geometry displacement');
const lockedUp = applyVerticalPull({ ...settings, displacement: 0.09, heightLock: true });
assert.equal(lockedUp.height, height, 'height lock must hold total height');
assert.equal(lockedUp.verticalProfile[0], 0, 'height lock must pin the base');
assert.equal(lockedUp.verticalProfile[RINGS], height, 'height lock must pin the rim');
assert(lockedUp.verticalProfile[38] > verticalProfile[38], 'upward pull must raise clay around contact');
assert(lockedUp.verticalProfile[38] - verticalProfile[38] > lockedUp.verticalProfile[8] - verticalProfile[8], 'pull influence must be localized');
assert(lockedUp.profile[38] < profile[38], 'stretched local rings must narrow slightly');

const lockedDown = applyVerticalPull({ ...settings, displacement: -0.06, heightLock: true });
assert.equal(lockedDown.height, height, 'compression under height lock must preserve total height');
assert(lockedDown.verticalProfile[38] < verticalProfile[38], 'downward drag must compress clay around contact');
assert(lockedDown.profile[38] > profile[38], 'compressed local rings must widen slightly');

const unlockedUp = applyVerticalPull({ ...settings, displacement: 0.09, heightLock: false });
assert(unlockedUp.height > height + 0.01, 'unlocked upward pull must materially increase total height');
assert(Math.abs(unlockedUp.height - (height + 0.09)) < 1e-6, 'the unlocked rim must follow the full upward drag displacement');
assert(Number(formatHeightControlValue(unlockedUp.height)) > Number(formatHeightControlValue(height)), 'height control display value must increase after an upward pull');
const lowerContactPull = applyVerticalPull({ ...settings, centerT: 0.25, displacement: 0.09, heightLock: false });
assert(lowerContactPull.height > height + 0.08, 'an upward pull beginning below the rim must still increase the vessel height');
assert(Math.abs(lowerContactPull.verticalProfile[RINGS] - lowerContactPull.height) < 1e-8, 'the raised geometry rim and global height must remain synchronized');
const unlockedDown = applyVerticalPull({ ...settings, displacement: -0.06, heightLock: false });
assert(unlockedDown.height < height - 0.01, 'unlocked downward pull must materially decrease total height');
assert(Math.abs(unlockedDown.height - (height - 0.06)) < 1e-6, 'the unlocked rim must follow the full downward drag displacement');

function maximumRadialChange(before, after) {
  return Math.max(...after.map((radius, index) => Math.abs(radius / before[index] - 1)));
}
assert(maximumRadialChange(profile, lockedUp.profile) < 0.011, 'height-locked pull must keep diameter approximately stable');
assert(maximumRadialChange(profile, lockedDown.profile) < 0.011, 'height-locked compression must keep diameter approximately stable');
assert(maximumRadialChange(profile, unlockedUp.profile) < 0.011, 'upward pull must raise the rim without disproportionate radial growth');
assert(maximumRadialChange(profile, unlockedDown.profile) < 0.011, 'downward compression must not cause disproportionate radial growth');
assert(unlockedUp.verticalProfile[RINGS] > verticalProfile[RINGS], 'upward drag must raise the vessel rim');
assert(unlockedDown.verticalProfile[RINGS] < verticalProfile[RINGS], 'downward drag must lower the vessel rim');

for (const [label, result] of [['locked pull', lockedUp], ['locked compression', lockedDown], ['unlocked pull', unlockedUp], ['unlocked compression', unlockedDown]]) {
  assert(isValidVerticalProfile(result.verticalProfile, result.height), `${label}: ring heights must stay ordered`);
  assert(result.profile.every((radius) => Number.isFinite(radius) && radius >= minimumRadius - 1e-8 && radius <= 1.85), `${label}: minimum wall profile constraint`);
  // The same profile fields are used by app history and JSON snapshots.
  const snapshot = JSON.parse(JSON.stringify({ profile: result.profile, verticalProfile: result.verticalProfile, height: result.height }));
  assert.deepEqual(snapshot.verticalProfile, result.verticalProfile, `${label}: vertical profile must serialize for undo/redo and project saves`);
}
const timeline = new SnapshotTimeline();
const beforePull = { profile, verticalProfile, height, heightLock: false };
const afterPull = { profile: unlockedUp.profile, verticalProfile: unlockedUp.verticalProfile, height: unlockedUp.height, heightLock: false };
timeline.reset(beforePull); timeline.record(afterPull);
assert.deepEqual(timeline.undo(), beforePull, 'undo must restore the pre-pull ring profile and height');
assert.equal(timeline.isDirty, false, 'undo back to the clean snapshot must clear dirty state');
assert.deepEqual(timeline.redo(), afterPull, 'redo must restore the pulled ring profile and height');
assert.equal(timeline.isDirty, true, 'redo must restore the edited state');

const geometry = makeClayGeometry(unlockedUp.profile, unlockedUp.height, cavity, thickness, {
  rings: RINGS, segments: 88, verticalProfile: unlockedUp.verticalProfile, adaptive: true,
});
geometry.computeBoundingBox();
assert(Math.abs(geometry.boundingBox.max.y - unlockedUp.height) < 1e-5, 'mesh rim must match saved height');
const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
const exported = new STLExporter().parse(mesh, { binary: true });
const exportedBuffer = exported.buffer.slice(exported.byteOffset, exported.byteOffset + exported.byteLength);
const imported = new STLLoader().parse(exportedBuffer);
imported.computeBoundingBox();
assert(Math.abs(imported.boundingBox.max.y - unlockedUp.height) < 1e-4, 'STL round trip must preserve pulled height');
assert(imported.getAttribute('position').count > 1000, 'STL round trip must include the deformed shell');
for (const key of ['tool.height', 'tool.height.short', 'hint.height', 'tool.deform', 'tool.deform.short', 'hint.deform', 'control.heightLock', 'control.heightLock.hint']) {
  assert(en[key] && es[key], `new interface string must be translated in both languages: ${key}`);
}
geometry.dispose(); imported.dispose(); mesh.material.dispose();

console.log('Vertical Pull: pointer direction, localized height change, stable diameter, height lock, wall safety, JSON/history snapshot data and STL round trip passed.');
