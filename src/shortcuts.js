const TOOL_BY_KEY = Object.freeze({
  '1': 'throw', '2': 'diameter', '3': 'deform', '4': 'height',
  '5': 'groove', '6': 'ridge', '7': 'sharpen', '8': 'smooth',
});

export function isShortcutBlockedTarget(target) {
  return Boolean(target?.isContentEditable
    || target?.closest?.('input, textarea, select, button, summary, a, dialog, [contenteditable="true"], [role="textbox"]'));
}

export function resolveShortcut(event, targetIsInteractive = false) {
  if (targetIsInteractive || event.repeat) return null;
  const key = String(event.key || '').toLowerCase();
  if (event.altKey) return null;

  if (key === 'shift' && !event.metaKey && !event.ctrlKey) return { type: 'temporary-smooth' };
  if (key === 'z') return { type: event.shiftKey ? 'redo' : 'undo' };

  if (event.metaKey || event.ctrlKey || event.shiftKey) return null;
  if (TOOL_BY_KEY[key]) return { type: 'tool', tool: TOOL_BY_KEY[key] };
  if (key === 'h') return { type: 'immersive' };
  if (key === ' ' || event.code === 'Space') return { type: 'wheel' };
  return null;
}
