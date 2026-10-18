'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LogBuffer } = require('../lib/log-buffer');

test('keeps only the last max lines', () => {
  const b = new LogBuffer(3);
  for (let i = 1; i <= 5; i++) b.push(`l${i}`);
  assert.deepEqual(b.lines(), ['l3', 'l4', 'l5']);
});

test('prefixes source and returns the formatted line', () => {
  const b = new LogBuffer();
  assert.equal(b.push('hi', 'foreman'), '[foreman] hi');
  assert.deepEqual(b.lines(), ['[foreman] hi']);
});

test('lines() is a copy; clear empties', () => {
  const b = new LogBuffer();
  b.push('a');
  b.lines().push('x');
  assert.equal(b.lines().length, 1);
  b.clear();
  assert.deepEqual(b.lines(), []);
});

test('defaults to 200 lines', () => {
  const b = new LogBuffer();
  for (let i = 0; i < 250; i++) b.push(String(i));
  assert.equal(b.lines().length, 200);
  assert.equal(b.lines()[0], '50');
});
