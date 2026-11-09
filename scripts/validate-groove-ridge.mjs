import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RINGS, SEGMENTS, influenceCursorDiameter, ringReliefSigma, createVerticalProfile, applyRingRelief, makeClayGeometry } from '../src/ceramic.js';
import { SnapshotTimeline } from '../src/history.js';
import en from '../src/locales/en.js';
import es from '../src/locales/es.js';

const height = 0.62, centerT = 0.5, center = RINGS / 2, pressure = 0.62, influence = 0.06;
const profile = Array(RINGS + 1).fill(0.8);
const applyDab = (input, kind, options = {}) => applyRingRelief({
  profile: input, centerT, pressure, influence, height, kind, dab: true,
  minRadius: 0.14, maxRadius: 1.85, ...options,
});
const groove = applyDab(profile, 'groove');
const ridge = applyDab(profile, 'ridge');
assert(groove[center] < profile[center], 'a press on a smooth surface must create a recessed groove');
assert(ridge[center] > profile[center], 'a press on a smooth surface must create a raised ridge');
assert(groove[center] < groove[center - 1] && groove[center] < groove[center + 1], 'a groove must have one centered low point');
assert(ridge[center] > ridge[center - 1] && ridge[center] > ridge[center + 1], 'a ridge must have one centered high point');
assert(Array.from({ length: center }, (_, i) => groove[i + 1] <= groove[i] + 1e-10).every(Boolean), 'the groove must transition smoothly toward the base');
assert(Array.from({ length: RINGS - center }, (_, i) => groove[center + i + 1] >= groove[center + i] - 1e-10).every(Boolean), 'the groove must transition smoothly toward the mouth');
assert(Array.from({ length: center }, (_, i) => ridge[i + 1] >= ridge[i] - 1e-10).every(Boolean), 'the ridge must transition smoothly toward the base');
assert(Array.from({ length: RINGS - center }, (_, i) => ridge[center + i + 1] <= ridge[center + i] + 1e-10).every(Boolean), 'the ridge must transition smoothly toward the mouth');

const secondPass = applyDab(groove, 'groove');
assert(secondPass[center] < groove[center], 'repeated groove passes must deepen the same ring progressively');
const secondRidgePass = applyDab(ridge, 'ridge');
assert(secondRidgePass[center] > ridge[center], 'repeated ridge passes must raise the same ring progressively');
const lowPressure = applyDab(profile, 'groove', { pressure: 0.2 });
assert(profile[center] - lowPressure[center] < profile[center] - groove[center], 'pressure must control groove depth');
assert.deepEqual(lowPressure.map((radius, i) => radius === profile[i]), groove.map((radius, i) => radius === profile[i]), 'pressure must alter depth without changing groove width');
const lowPressureRidge = applyDab(profile, 'ridge', { pressure: 0.2 });
assert(lowPressureRidge[center] - profile[center] < ridge[center] - profile[center], 'pressure must control ridge height');

const distancePass = applyRingRelief({ profile, centerT, pressure, influence, height, kind: 'ridge', deltaDistance: 12, minRadius: 0.14 });
assert(distancePass[center] > profile[center], 'dragging must accumulate relief continuously after the initial press');
const wide = applyDab(profile, 'ridge', { influence: 0.42 });
assert(wide.filter((radius, i) => Math.abs(radius - profile[i]) > 1e-8).length > ridge.filter((radius, i) => Math.abs(radius - profile[i]) > 1e-8).length, 'Influence must control ring width');
const minimumInfluence = 0.01;
const fineSigma = ringReliefSigma(minimumInfluence, height);
const fineWidth = fineSigma * height / RINGS * 2.35482;
assert(Math.abs(fineWidth - influenceCursorDiameter(minimumInfluence)) < 1e-8, 'the relief full width at half maximum must match the visible cursor diameter');
const fineGroove = applyRingRelief({ profile, centerT, pressure, influence: minimumInfluence, height, kind: 'groove', dab: true, minRadius: 0.14 });
const fineDepth = profile[center] - fineGroove[center];
const fineFwhmSamples = fineGroove.filter((radius, i) => Math.abs(i - center) <= RINGS * 0.2 && profile[i] - radius >= fineDepth * 0.5).length;
assert.equal(fineFwhmSamples, 1, 'the minimum-width V groove must remain a sharp line rather than a broad trough');
const changedFineRings = fineGroove.map((radius, i) => Math.abs(radius - profile[i]) > 1e-10 ? i : -1).filter((i) => i >= 0);
const representedFineWidth = (changedFineRings.at(-1) - changedFineRings[0]) * height / RINGS;
assert(Math.abs(representedFineWidth / influenceCursorDiameter(minimumInfluence) - 1) < 0.2, 'the sampled groove width must remain close to the cursor diameter');
assert.equal(changedFineRings.length, 3, 'a fine groove must affect only the center ring and its two adjacent samples');
const tallestHeight = 1.45;
const tallWidth = ringReliefSigma(minimumInfluence, tallestHeight) * tallestHeight / RINGS * 2.35482;
assert(Math.abs(tallWidth / influenceCursorDiameter(minimumInfluence) - 1) < 0.1, 'the minimum influence must remain close to cursor width on the tallest preset');
const tallFineGroove = applyRingRelief({ profile, centerT, pressure, influence: minimumInfluence, height: tallestHeight, kind: 'groove', dab: true, minRadius: 0.14 });
const mediumGroove = applyDab(profile, 'groove', { influence: 0.18 });
const maximumGroove = applyDab(profile, 'groove', { influence: 0.42 });
const changedSpan = (values) => {
  const changed = values.map((radius, i) => Math.abs(radius - profile[i]) > 1e-10 ? i : -1).filter((i) => i >= 0);
  return changed.at(-1) - changed[0];
};
assert(changedSpan(fineGroove) < changedSpan(mediumGroove) && changedSpan(mediumGroove) < changedSpan(maximumGroove), 'minimum, medium and maximum Influence must widen the groove progressively');
const multipleRings = applyRingRelief({ profile: groove, centerT: 0.72, pressure, influence, height, kind: 'ridge', dab: true, minRadius: 0.14 });
assert(multipleRings[Math.round(0.72 * RINGS)] > groove[Math.round(0.72 * RINGS)], 'separate strokes must create rings at different heights');
assert(multipleRings[center] < profile[center], 'adding a ring elsewhere must retain the earlier groove');

const boundedGroove = applyRingRelief({ profile, centerT, pressure: 1, influence, height, kind: 'groove', dab: true, minRadius: 0.79 });
assert(boundedGroove.every((radius) => radius >= 0.79 && radius <= 1.85), 'deep grooves must honor the wall radius limit');
const boundedRidge = applyRingRelief({ profile: Array(RINGS + 1).fill(1.84), centerT, pressure: 1, influence, height, kind: 'ridge', dab: true, minRadius: 0.14, maxRadius: 1.85 });
assert(boundedRidge.every((radius) => radius >= 0.14 && radius <= 1.85), 'high ridges must honor the maximum radius limit');
assert.equal(groove[0], profile[0], 'the base endpoint must remain protected');
assert.equal(groove[RINGS - 2], profile[RINGS - 2], 'the mouth approach must remain protected');
assert.equal(groove[RINGS - 1], profile[RINGS - 1], 'the mouth edge must remain protected');
assert.equal(groove[RINGS], profile[RINGS], 'the mouth endpoint must remain protected');

const geometry = makeClayGeometry(fineGroove, height, 0.43, 0.11, {
  rings: RINGS, segments: SEGMENTS, adaptive: false, imperfections: 0,
  verticalProfile: createVerticalProfile(height),
});
const position = geometry.getAttribute('position').array;
assert(position.every(Number.isFinite), 'groove geometry must contain finite coordinates');
assert(geometry.index?.count > 0, 'groove geometry must retain connected indexed surfaces');
const rowStart = Math.round(centerT * RINGS) * (SEGMENTS + 1);
const radii = Array.from({ length: SEGMENTS }, (_, k) => Math.hypot(position[(rowStart + k) * 3], position[(rowStart + k) * 3 + 2]));
assert(Math.max(...radii) - Math.min(...radii) < 1e-6, 'the relief must form a continuous 360-degree ring with rotational symmetry');
assert(Math.hypot(position[rowStart * 3], position[rowStart * 3 + 2]) < profile[center], 'the default-resolution mesh must represent the minimum-width groove');
geometry.dispose();
const tallGeometry = makeClayGeometry(tallFineGroove, tallestHeight, 0.43, 0.11, {
  rings: RINGS, segments: SEGMENTS, adaptive: false, imperfections: 0,
});
assert(tallGeometry.getAttribute('position').array.every(Number.isFinite), 'the same profile resolution must remain stable for the tallest preset');
assert(tallGeometry.index?.count > 0, 'the narrow groove must not break mesh connectivity on the tallest preset');
tallGeometry.dispose();
for (const [label, sample] of [['medium', mediumGroove], ['maximum', maximumGroove]]) {
  const sampleGeometry = makeClayGeometry(sample, height, 0.43, 0.11, { rings: RINGS, segments: SEGMENTS, adaptive: false, imperfections: 0 });
  assert(sampleGeometry.getAttribute('position').array.every(Number.isFinite), `${label}-width grooves must produce finite geometry`);
  assert(sampleGeometry.index?.count > 0, `${label}-width grooves must keep the mesh connected`);
  sampleGeometry.dispose();
}

const history = new SnapshotTimeline();
const before = { profile }, after = { profile: groove };
history.reset(before); history.record(after);
assert.deepEqual(history.undo(), before, 'undo must remove the groove');
assert.deepEqual(history.redo(), after, 'redo must restore the groove');
for (const key of ['tool.groove', 'tool.groove.short', 'hint.groove', 'tool.ridge', 'tool.ridge.short', 'hint.ridge']) {
  assert(en[key] && es[key], `both relief tools must have EN/ES text: ${key}`);
}
assert.equal(es['tool.groove'], 'Surco'); assert.equal(en['tool.groove'], 'Groove');
assert.equal(es['tool.ridge'], 'Cordón'); assert.equal(en['tool.ridge'], 'Ridge');

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const toolIds = [...html.matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(toolIds, ['throw', 'diameter', 'deform', 'height', 'groove', 'ridge', 'sharpen', 'smooth'], 'the new relief tools must be secondary and keep the existing tools');
const rows = [...html.matchAll(/class="tool-options-row tool-options-row-(three|four)"([\s\S]*?)<\/div>/g)];
assert.equal(rows.length, 2, 'secondary tools must be grouped into exactly two rows');
const idsByRow = rows.map((row) => [...row[2].matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]));
assert.deepEqual(idsByRow, [['diameter', 'deform', 'height'], ['groove', 'ridge', 'sharpen', 'smooth']], 'tools must follow the requested 3+4 row layout');
assert.match(html, /id="influence" type="range" min="1" max="42" value="18"/, 'Influence must expose the lower fine-detail minimum and preserve its upper range');
assert.match(mainSource, /gestureTool === 'groove' \|\| gestureTool === 'ridge'[\s\S]*applyRingRelief/, 'pointer drags must route through ring relief');
assert.match(mainSource, /dab: true/, 'pressing must create relief without requiring pointer movement');
assert.match(mainSource, /function exportMesh\([\s\S]*state\.profile/, 'the existing profile-based export pipeline must include rings');

console.log('Groove/Ridge: smooth-surface dabs, continuous strokes, width/depth controls, repeated/multiple rings, 360° symmetry, bounds, protected mouth/base, history, JSON-compatible profile and export geometry passed.');
