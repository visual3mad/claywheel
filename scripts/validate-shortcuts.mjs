import assert from 'node:assert/strict';
import { isShortcutBlockedTarget, resolveShortcut } from '../src/shortcuts.js';

const press = (key, options = {}, targetIsInteractive = false) => resolveShortcut({ key, code: key === ' ' ? 'Space' : '', repeat: false, ...options }, targetIsInteractive);
const tools = ['throw', 'diameter', 'deform', 'height', 'groove', 'ridge', 'sharpen', 'smooth'];
tools.forEach((tool, index) => assert.deepEqual(press(String(index + 1)), { type: 'tool', tool }));
assert.deepEqual(press(' '), { type: 'wheel' });
assert.deepEqual(press(' ', { code: 'Space' }), { type: 'wheel' });
assert.deepEqual(press('h'), { type: 'immersive' });
assert.deepEqual(press('z'), { type: 'undo' });
assert.deepEqual(press('z', { shiftKey: true }), { type: 'redo' });
assert.deepEqual(press('z', { metaKey: true }), { type: 'undo' });
assert.deepEqual(press('z', { ctrlKey: true }), { type: 'undo' });
assert.deepEqual(press('z', { metaKey: true, shiftKey: true }), { type: 'redo' });
assert.deepEqual(press('z', { ctrlKey: true, shiftKey: true }), { type: 'redo' });
assert.deepEqual(press('Shift', { shiftKey: true }), { type: 'temporary-smooth' });

for (const options of [
  { altKey: true }, { shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { repeat: true },
]) assert.equal(press('1', options), null, `tool shortcut blocked for ${JSON.stringify(options)}`);
assert.equal(press('h', { altKey: true }), null);
assert.equal(press(' ', { shiftKey: true }), null);
assert.equal(press('Shift', { shiftKey: true, repeat: true }), null);
assert.equal(press('z', {}, true), null);
assert.equal(resolveShortcut({ key: '1', repeat: false }, true), null);

const interactiveTarget = { isContentEditable: false, closest: (selector) => selector.includes('input') ? {} : null };
const buttonTarget = { isContentEditable: false, closest: (selector) => selector.includes('button') ? {} : null };
assert.equal(isShortcutBlockedTarget(interactiveTarget), true);
assert.equal(isShortcutBlockedTarget(buttonTarget), true);
assert.equal(isShortcutBlockedTarget({ isContentEditable: true }), true);
assert.equal(isShortcutBlockedTarget({ isContentEditable: false, closest: () => null }), false);

console.log('Shortcuts: tool selection, wheel, immersive, undo/redo modifiers, temporary Smooth and form-control guards passed.');
