const copy = (snapshot) => JSON.parse(JSON.stringify(snapshot));

export class SnapshotTimeline {
  constructor(limit = 50) {
    this.limit = Math.max(2, Math.floor(limit));
    this.entries = [];
    this.index = -1;
    this.cleanIndex = -1;
  }

  reset(snapshot) {
    this.entries = [copy(snapshot)];
    this.index = 0;
    this.cleanIndex = 0;
  }

  record(snapshot, { clean = false } = {}) {
    const next = copy(snapshot);
    if (this.index >= 0 && JSON.stringify(this.entries[this.index]) === JSON.stringify(next)) {
      if (clean) this.markClean();
      return false;
    }
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(next);
    if (this.entries.length > this.limit) {
      this.entries.shift();
      if (this.cleanIndex >= 0) this.cleanIndex--;
    }
    this.index = this.entries.length - 1;
    if (clean) this.markClean();
    return true;
  }

  markClean() { this.cleanIndex = this.index; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
  get isDirty() { return this.index !== this.cleanIndex; }

  undo() {
    if (!this.canUndo) return null;
    this.index--;
    return copy(this.entries[this.index]);
  }

  redo() {
    if (!this.canRedo) return null;
    this.index++;
    return copy(this.entries[this.index]);
  }
}
