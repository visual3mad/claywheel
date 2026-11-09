import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  RINGS, createProfile, createVerticalProfile, estimateVolume, influenceCursorDiameter, screenSideFromAxis, applyDiameterDrag,
} from '../src/ceramic.js';
import en from '../src/locales/en.js';
import es from '../src/locales/es.js';
import { SnapshotTimeline } from '../src/history.js';

const profile = createProfile('cylinder', 2);
const settings = {
  profile, centerT: 0.52, pressure: 0.42, influence: 0.06, height: 0.62, minRadius: 0.14,
};
const verticalProfile = createVerticalProfile(settings.height);
assert.equal(influenceCursorDiameter(settings.influence), 2 * settings.influence, 'cursor diameter must map to the high-effect one-sigma influence zone');
assert(influenceCursorDiameter(0.42) > influenceCursorDiameter(0.06), 'cursor size must update proportionally with Influence');
const center = Math.round(settings.centerT * RINGS);
const rightSide = screenSideFromAxis(0.35, 0);
const leftSide = screenSideFromAxis(-0.35, 0);
assert.equal(rightSide, 1, 'screen-right contact must map outward toward screen right');
assert.equal(leftSide, -1, 'screen-left contact must map outward toward screen left');

const expandRight = applyDiameterDrag({ ...settings, deltaX: 40, screenSide: rightSide });
const expandLeft = applyDiameterDrag({ ...settings, deltaX: -40, screenSide: leftSide });
assert(expandRight[center] > profile[center], 'dragging outward on the right must expand the contact diameter');
assert(expandLeft[center] > profile[center], 'dragging outward on the left must expand the contact diameter');
assert(Math.abs(expandRight[center] - expandLeft[center]) < 1e-12, 'outward expansion must behave symmetrically on either side');
assert.equal(expandRight[5], profile[5], 'volume preservation off must keep changes local to the influence area');
const baseVolume = estimateVolume(profile, settings.height, verticalProfile);
const unpreservedVolume = estimateVolume(expandRight, settings.height, verticalProfile);
const preserved = applyDiameterDrag({
  ...settings, deltaX: 40, screenSide: rightSide, preserveVolume: true,
  desiredVolume: baseVolume, verticalProfile,
});
assert(Math.abs(estimateVolume(preserved, settings.height, verticalProfile) / baseVolume - 1) < 1e-6, 'Preserve Volume must apply the legacy volume compensation');
assert(preserved[center] > profile[center], 'volume compensation must preserve the intended contact expansion');
assert.notEqual(preserved[5], profile[5], 'volume compensation must adjust surrounding profile rings');
assert(Math.abs(unpreservedVolume / baseVolume - 1) > 1e-5, 'volume preservation off must allow a localized volume change');
const history = new SnapshotTimeline();
const preferenceBefore = { profile, preserveVolume: false }, preferenceAfter = { profile: preserved, preserveVolume: true };
history.reset(preferenceBefore); history.record(preferenceAfter);
assert.deepEqual(history.undo(), preferenceBefore, 'undo must restore the prior volume-preservation setting');
assert.deepEqual(history.redo(), preferenceAfter, 'redo must restore the volume-preservation setting and profile');

const contractRight = applyDiameterDrag({ ...settings, deltaX: -40, screenSide: rightSide });
const contractLeft = applyDiameterDrag({ ...settings, deltaX: 40, screenSide: leftSide });
assert(contractRight[center] < profile[center], 'dragging inward on the right must contract the contact diameter');
assert(contractLeft[center] < profile[center], 'dragging inward on the left must contract the contact diameter');
const proportionalExpand = applyDiameterDrag({ ...settings, deltaX: 80, screenSide: rightSide });
assert(Math.abs((proportionalExpand[center] - profile[center]) / (expandRight[center] - profile[center]) - 2) < 1e-12, 'diameter change must scale proportionally with drag distance');

const reversed = applyDiameterDrag({ ...settings, profile: expandRight, deltaX: -40, screenSide: rightSide });
assert(reversed.every((radius, i) => Math.abs(radius - profile[i]) < 1e-12), 'reversing direction in one session must restore the prior profile');
const alternating = applyDiameterDrag({ ...settings, profile: expandRight, deltaX: -20, screenSide: rightSide });
assert(alternating[center] > profile[center] && alternating[center] < expandRight[center], 'the user must be able to alternate between expansion and contraction during one session');

const lowerPressure = applyDiameterDrag({ ...settings, pressure: 0.21, deltaX: 40, screenSide: rightSide });
assert(lowerPressure[center] - profile[center] < expandRight[center] - profile[center], 'pressure must scale deformation intensity');
const narrowInfluence = applyDiameterDrag({ ...settings, influence: 0.06, deltaX: 40, screenSide: rightSide });
const wideInfluence = applyDiameterDrag({ ...settings, influence: 0.42, deltaX: 40, screenSide: rightSide });
assert(wideInfluence[center + 12] > narrowInfluence[center + 12], 'influence must control the affected vertical region');
const maximumContraction = applyDiameterDrag({ ...settings, deltaX: -10000, screenSide: rightSide });
const maximumExpansion = applyDiameterDrag({ ...settings, deltaX: 10000, screenSide: rightSide });
for (const [label, radii] of [['expansion', expandRight], ['contraction', contractRight], ['maximum contraction', maximumContraction], ['maximum expansion', maximumExpansion]]) {
  assert(radii.every((radius) => Number.isFinite(radius) && radius >= settings.minRadius - 1e-9 && radius <= 1.85), `${label} must preserve safe radius and minimum wall bounds`);
}

for (const key of ['tool.diameter', 'tool.diameter.short', 'hint.diameter', 'control.preserveVolume', 'control.preserveVolume.hint', 'tool.deform', 'tool.height']) {
  assert(en[key] && es[key], `Diameter interface text must exist in English and Spanish: ${key}`);
}
assert.equal(es['tool.diameter'], 'Diámetro');
assert.equal(en['tool.diameter'], 'Diameter');
assert.equal(es['control.preserveVolume'], 'Conservar arcilla');
assert.equal(en['control.preserveVolume'], 'Preserve Clay');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const toolIds = [...html.matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(toolIds, ['throw', 'diameter', 'deform', 'height', 'groove', 'ridge', 'sharpen', 'smooth'], 'the tool strip must keep Throw first and all adjustment tools available');
assert.doesNotMatch(html, /id="heightLockLabel"[^>]*hidden/, 'height lock must be available for the default Throw tool');
assert.match(mainSource, /heightLockLabel'\)\.hidden = tool === 'diameter'/, 'height lock must follow the selected tool');
assert.match(html, /id="pressure" type="range" min="5" max="100" value="42"/, 'pressure control range and default must remain unchanged');
assert.match(html, /id="influence" type="range" min="1" max="42" value="18"/, 'influence must expose a finer minimum and retain its large range and default');

console.log('Diameter: two-sided expansion/compression, reversibility, pressure, influence, optional volume preservation, history and radius bounds passed.');
