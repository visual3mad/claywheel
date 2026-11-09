import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  RINGS, MIN_INNER_RADIUS, createProfile, createVerticalProfile, applyDiameterDrag,
  applyVerticalPull, verticalPullDisplacement,
} from '../src/ceramic.js';
import en from '../src/locales/en.js';
import es from '../src/locales/es.js';

const height = 0.62, thickness = 0.11, influence = 0.18, pressure = 0.42;
const profile = createProfile('cylinder', 2), verticalProfile = createVerticalProfile(height);
const centerT = 0.52, centerRing = Math.round(centerT * RINGS), minRadius = Math.max(0.14, thickness + MIN_INNER_RADIUS);
function throwGesture({ dx, dy, heightLock = true }) {
  const radial = applyDiameterDrag({
    profile, centerT, deltaX: dx, screenSide: 1, pressure, influence, height, minRadius,
  });
  const displacement = verticalPullDisplacement(dy, 0.003, 0.8, pressure);
  return applyVerticalPull({
    profile: radial, verticalProfile, height, centerT, displacement, influence, thickness, heightLock,
  });
}

const expandAndPull = throwGesture({ dx: 24, dy: -24 });
assert(expandAndPull.profile[centerRing] > profile[centerRing], 'combined outward/upward throw must expand radial profile');
assert(expandAndPull.verticalProfile[centerRing] > verticalProfile[centerRing], 'combined upward throw must pull clay locally');
assert.equal(expandAndPull.height, height, 'default height lock must keep the total height fixed during a combined gesture');

const contractAndCompress = throwGesture({ dx: -24, dy: 24 });
assert(contractAndCompress.profile[centerRing] < profile[centerRing], 'combined inward/downward throw must contract radial profile');
assert(contractAndCompress.verticalProfile[centerRing] < verticalProfile[centerRing], 'combined downward throw must compress clay locally');

const unlockedPull = throwGesture({ dx: 24, dy: -24, heightLock: false });
assert(unlockedPull.height > height, 'unlocked Throw gesture must be able to raise total height');
assert(unlockedPull.profile.every((radius) => Number.isFinite(radius) && radius >= minRadius - 1e-9 && radius <= 1.85), 'combined throw must honor radius and wall bounds');

for (const key of ['tool.throw', 'tool.throw.short', 'hint.throw']) assert(en[key] && es[key], `Throw UI string must be translated: ${key}`);
assert.equal(es['tool.throw'], 'Tornear');
assert.equal(en['tool.throw.short'], 'Throw');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const toolIds = [...html.matchAll(/data-tool="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(toolIds, ['throw', 'diameter', 'deform', 'height', 'groove', 'ridge', 'sharpen', 'smooth'], 'Throw must be first while existing tools remain available');
assert.match(html, /class="tool-option tool-option-primary active"[^>]*data-tool="throw"/, 'Throw must be highlighted by default');
assert.match(mainSource, /tool = 'throw'/, 'Throw must be the application default');

console.log('Throw: combined radial/vertical gestures, height lock, wall bounds, default tool, ordering and bilingual labels passed.');
