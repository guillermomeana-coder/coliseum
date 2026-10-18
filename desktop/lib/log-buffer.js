'use strict';
// Fixed-size ring of recent log lines for the "Running" view. No electron.

class LogBuffer {
  constructor(max = 200) {
    this.max = max;
    this.items = [];
  }

  push(line, source) {
    const text = source ? `[${source}] ${line}` : String(line);
    this.items.push(text);
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
    return text;
  }

  lines() { return this.items.slice(); }

  clear() { this.items = []; }
}

module.exports = { LogBuffer };
