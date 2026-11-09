import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RINGS, createProfile, createVerticalProfile, estimateVolume, applyLocalSmooth, MIN_INNER_RADIUS } from '../src/ceramic.js';
import en from '../src/locales/en.js';
import es from '../src/locales/es.js';
import { SnapshotTimeline } from '../src/history.js';
import { resolveShortcut } from '../src/shortcuts.js';

const height = 0.62, minRadius = 0.14;
const profile = createProfile('cylinder', 2);
const center = RINGS / 2;
// Add a small local ridge and a finer ripple so the test can measure actual smoothing.
for (let i = center - 10; i <= center + 10; i++) profile[i] += (i % 2 ? 0.018 : -0.018);
profile[center] += 0.12;
const roughnessAt = (values, from, to) => {
  let total = 0;
  for (let i = from + 1; i < to; i++) total += Math.abs(values[i - 1] - 2 * values[i] + values[i + 1]);
  return total;
};
const beforeRoughness = roughnessAt(profile, center - 10, center + 10);
const beforeVolume = estimateVolume(profile, height, createVerticalProfile(height));
const smoothed = applyLocalSmooth({
  profile, centerT: 0.5, deltaDistance: 40, pressure: 0.72, influence: 0.06, height, minRadius,
});

assert(roughnessAt(smoothed, center - 10, center + 10) < beforeRoughness * 0.9, 'smoothing must reduce local profile irregularity');
assert(Math.abs(smoothed[center] - (smoothed[center - 1] + smoothed[center + 1]) / 2)
  < Math.abs(profile[center] - (profile[center - 1] + profile[center + 1]) / 2), 'smoothing must soften a local ridge');
assert.equal(smoothed[0], profile[0], 'the base boundary must remain fixed');
assert.equal(smoothed[RINGS], profile[RINGS], 'the upper rim boundary must remain fixed');
assert.equal(smoothed[center - 25], profile[center - 25], 'rings outside the influence support must remain untouched');
assert(smoothed.every((radius) => Number.isFinite(radius) && radius >= minRadius && radius <= 1.85), 'smoothing must preserve valid radius limits');
const afterVolume = estimateVolume(smoothed, height, createVerticalProfile(height));
assert(Math.abs(afterVolume / beforeVolume - 1) < 0.001, 'local smoothing must keep the clay volume effectively stable');
const history = new SnapshotTimeline();
const beforeSnapshot = { profile: [...profile] }, afterSnapshot = { profile: [...smoothed] };
history.reset(beforeSnapshot); history.record(afterSnapshot);
assert.deepEqual(history.undo(), beforeSnapshot, 'undo must restore the pre-smoothing profile');
assert.deepEqual(history.redo(), afterSnapshot, 'redo must restore the smoothed profile');

const lowPressure = applyLocalSmooth({ profile, centerT: 0.5, deltaDistance: 40, pressure: 0.24, influence: 0.06, height, minRadius });
assert(roughnessAt(lowPressure, center - 10, center + 10) > roughnessAt(smoothed, center - 10, center + 10), 'pressure must control smoothing intensity');
const wideInfluence = applyLocalSmooth({ profile, centerT: 0.5, deltaDistance: 40, pressure: 0.72, influence: 0.3, height, minRadius });
assert(Math.abs(wideInfluence[center + 8] - profile[center + 8]) > Math.abs(smoothed[center + 8] - profile[center + 8]), 'influence must control the extent of smoothing');
const invalidBounds = applyLocalSmooth({ profile, centerT: 0.5, deltaDistance: 10000, pressure: 1, influence: 0.06, height, minRadius: 0.78 });
assert(invalidBounds.every((radius) => radius >= 0.78 && radius <= 1.85), 'minimum wall radius must remain enforced under strong smoothing');

for (const key of ['tool.smooth', 'tool.smooth.short', 'hint.smooth']) assert(en[key] && es[key], `Smooth text must exist in both languages: ${key}`);
assert.equal(en['tool.smooth'], 'Smooth');
assert.equal(es['tool.smooth'], 'Suavizar');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const toolIds = [...html.matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(toolIds, ['throw', 'diameter', 'deform', 'height', 'groove', 'ridge', 'sharpen', 'smooth'], 'Smooth must remain available alongside the newer relief tools');
assert.match(html, /data-tool="smooth"[^>]*data-i18n-title="tool\.smooth"/, 'Smooth must expose a translated tooltip');
assert.deepEqual(resolveShortcut({ key: 'Shift', shiftKey: true, repeat: false }), { type: 'temporary-smooth' }, 'holding Shift must activate temporary smoothing');
assert.match(mainSource, /action\.type === 'temporary-smooth'[\s\S]*setTool\('smooth'\)/, 'temporary smoothing must switch to the Smooth tool');
assert.match(mainSource, /event\.key !== 'Shift'[\s\S]*setTool\(restoreTool\)/, 'releasing Shift must restore the previous tool');
assert.match(mainSource, /gestureTool === 'smooth'[\s\S]*applyLocalSmooth/, 'pointer strokes must use the localized smoothing algorithm');

console.log('Smooth: localized profile correction, pressure/influence, volume, boundary and radius safety, bilingual UI and Shift tool switching passed.');
