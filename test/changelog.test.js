const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {getSection} = require('../scripts/changelog.js');

const CHANGELOG = '2026.10.25\n=====\n* New\n\n2026.1.2 (2026-01-02)\n=====\n* Two\n    * Nested\n\n1.0\n=====\n- First\n';

test('changelog: a version with a date', () => {
  assert.deepStrictEqual(getSection(CHANGELOG, '2026.1.2'), {date: '2026-01-02', notes: '* Two\n    * Nested'});
});

test('changelog: a version without a date, and the last one', () => {
  assert.deepStrictEqual(getSection(CHANGELOG, '2026.10.25'), {date: null, notes: '* New'});
  assert.deepStrictEqual(getSection(CHANGELOG, '1.0'), {date: null, notes: '- First'});
});

test('changelog: an unknown version', () => {
  assert.strictEqual(getSection(CHANGELOG, '2.0'), null);
  assert.strictEqual(getSection(CHANGELOG, '2026.10'), null);
});

test('changelog: the version in manifest.json is in CHANGELOG.md', () => {
  const version = require('../manifest.json').version;
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  assert.ok(getSection(changelog, version), `CHANGELOG.md has no section for ${version}`);
});
