import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RINGS, MIN_INNER_RADIUS, smooth, applyLocalSharpen, makeClayGeometry } from '../src/ceramic.js';
import en from '../src/locales/en.js';
import es from '../src/locales/es.js';
import { SnapshotTimeline } from '../src/history.js';

const height = 0.62, minRadius = 0.14, centerT = 0.45;
const profile = Array.from({ length: RINGS + 1 }, (_, i) => 0.45 + 0.4 * smooth(0.34, 0.58, i / RINGS));
const center = Math.round(centerT * RINGS);
const curvature = (values, index) => Math.abs(values[index - 1] - 2 * values[index] + values[index + 1]);
const edgeDefinition = (values) => Math.abs((values[center + 2] - values[center]) / 2 - (values[center] - values[center - 2]) / 2);
const countSignChanges = (values) => {
  let previous = 0, changes = 0;
  for (const value of values) {
    const sign = Math.abs(value) < 1e-8 ? 0 : Math.sign(value);
    if (!sign) continue;
    if (previous && sign !== previous) changes++;
    previous = sign;
  }
  return changes;
};
const firstPass = applyLocalSharpen({ profile, centerT, deltaDistance: 32, pressure: 0.8, influence: 0.06, height, minRadius });
const secondPass = applyLocalSharpen({ profile: firstPass, centerT, deltaDistance: 32, pressure: 0.8, influence: 0.06, height, minRadius });

assert(edgeDefinition(firstPass) > edgeDefinition(profile) * 1.2, 'a small influence pass must create a visible crease on a smooth curve');
assert(edgeDefinition(secondPass) > edgeDefinition(firstPass), 'successive passes must progressively sharpen the contact edge');
assert(firstPass.every((radius) => Number.isFinite(radius) && radius >= minRadius && radius <= 1.85), 'sharpening must preserve radius and minimum wall bounds');
assert.equal(firstPass[0], profile[0], 'the base endpoint must remain unchanged');
assert.equal(firstPass[1], profile[1], 'the base protection zone must remain unchanged');
assert.equal(firstPass[RINGS - 2], profile[RINGS - 2], 'the mouth protection zone must remain unchanged');
assert.equal(firstPass[RINGS - 1], profile[RINGS - 1], 'the mouth edge must remain unchanged');
assert.equal(firstPass[RINGS], profile[RINGS], 'the mouth endpoint must remain unchanged');
assert.equal(firstPass[70], profile[70], 'rings outside the influence support must remain untouched');
assert(firstPass.slice(1).every((radius, i) => radius >= firstPass[i] - 1e-10), 'sharpening must not introduce folds or reverse an existing monotone transition');
const smallBrushDelta = firstPass.map((radius, i) => radius - profile[i]);
const widePass = applyLocalSharpen({ profile, centerT, deltaDistance: 32, pressure: 0.8, influence: 0.42, height, minRadius });
const wideBrushDelta = widePass.map((radius, i) => radius - profile[i]);
assert(edgeDefinition(widePass) > edgeDefinition(profile) * 1.2, 'a wide influence must still create a centered angular transition');
assert(wideBrushDelta.filter((delta) => Math.abs(delta) > 1e-8).length > smallBrushDelta.filter((delta) => Math.abs(delta) > 1e-8).length, 'wide influence must widen the affected transition');
assert(widePass.slice(1).every((radius, i) => radius >= widePass[i] - 1e-10), 'wide sharpening must not create secondary radial waves');
assert(countSignChanges(wideBrushDelta) <= 1, 'wide sharpening must create one smooth profile adjustment rather than oscillations');
const sharpenedGeometry = makeClayGeometry(firstPass, height, 0.43, 0.11, { adaptive: false, imperfections: 0 });
assert(sharpenedGeometry.getAttribute('position').array.every(Number.isFinite), 'sharpened profiles must generate finite export geometry');
assert(sharpenedGeometry.index?.count > 0, 'sharpened geometry must retain indexed continuous surfaces');
sharpenedGeometry.dispose();
const history = new SnapshotTimeline();
const beforeSnapshot = { profile: [...profile] }, afterSnapshot = { profile: [...firstPass] };
history.reset(beforeSnapshot); history.record(afterSnapshot);
assert.deepEqual(history.undo(), beforeSnapshot, 'undo must restore the pre-sharpening profile');
assert.deepEqual(history.redo(), afterSnapshot, 'redo must restore the sharpened profile');

const lowPressure = applyLocalSharpen({ profile, centerT, deltaDistance: 32, pressure: 0.25, influence: 0.06, height, minRadius });
assert(edgeDefinition(lowPressure) < edgeDefinition(firstPass), 'pressure must control sharpening intensity');
const wallLimit = MIN_INNER_RADIUS + 0.78;
const safeProfile = profile.map((radius) => radius + 0.4);
const strongSharpen = applyLocalSharpen({ profile: safeProfile, centerT, deltaDistance: 5000, pressure: 1, influence: 0.06, height, minRadius: wallLimit });
assert(strongSharpen.every((radius) => radius >= wallLimit && radius <= 1.85), 'strong sharpening must honor the minimum wall radius');

for (const key of ['tool.sharpen', 'tool.sharpen.short', 'hint.sharpen']) assert(en[key] && es[key], `Sharpen text must exist in both languages: ${key}`);
assert.equal(en['tool.sharpen'], 'Sharpen');
assert.equal(es['tool.sharpen'], 'Afilar');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const toolIds = [...html.matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(toolIds, ['throw', 'diameter', 'deform', 'height', 'groove', 'ridge', 'sharpen', 'smooth'], 'Sharpen must be a secondary tool and existing tools must remain available');
assert.match(html, /data-tool="sharpen"[^>]*data-i18n-title="tool\.sharpen"/, 'Sharpen must expose a translated tooltip');
assert.match(mainSource, /gestureTool === 'sharpen'[\s\S]*applyLocalSharpen/, 'pointer strokes must use the dedicated local sharpening operation');
assert.match(mainSource, /canvas\.addEventListener\('pointerup', stopSculpt\)[\s\S]*addHistory\(\)/, 'the existing stroke history must record tool edits');
assert.match(mainSource, /function exportMesh\([\s\S]*state\.profile/, 'existing exports must consume the updated profile');

console.log('Sharpen: progressive edge definition, pressure/influence, extrema and radius bounds, protected ends, translations, history path and profile exports passed.');
