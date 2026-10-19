import test from 'node:test';
import assert from 'node:assert';
import { mapImageKitUrlToSupabasePath } from '../services/supabaseStorageService.js';

test('Storage Path Mapping: extracts clean relative path from standard ImageKit URLs', () => {
  const ikUrl = 'https://ik.imagekit.io/dfkux2rsp/notes/cse/MATHS/Unit_1_Notes.pdf';
  const mapped = mapImageKitUrlToSupabasePath(ikUrl);
  assert.strictEqual(mapped, 'notes/cse/MATHS/Unit_1_Notes.pdf');
});

test('Storage Path Mapping: strips query strings and hash anchors', () => {
  const ikUrl = 'https://ik.imagekit.io/dfkux2rsp/notes/common/Physics.pdf?updatedAt=1710000000#page=2';
  const mapped = mapImageKitUrlToSupabasePath(ikUrl);
  assert.strictEqual(mapped, 'notes/common/Physics.pdf');
});

test('Storage Path Mapping: removes ImageKit transformation segments (tr:)', () => {
  const ikUrl = 'https://ik.imagekit.io/dfkux2rsp/tr:w-800,q-80/notes/ece/Signals.pdf';
  const mapped = mapImageKitUrlToSupabasePath(ikUrl);
  assert.strictEqual(mapped, 'notes/ece/Signals.pdf');
});

test('Storage Path Mapping: handles relative paths with or without leading slash', () => {
  const rel1 = '/notes/ds/Algorithm.pdf';
  const rel2 = 'notes/ds/Algorithm.pdf';
  assert.strictEqual(mapImageKitUrlToSupabasePath(rel1), 'notes/ds/Algorithm.pdf');
  assert.strictEqual(mapImageKitUrlToSupabasePath(rel2), 'notes/ds/Algorithm.pdf');
});

test('Storage Path Mapping: returns empty string for invalid inputs', () => {
  assert.strictEqual(mapImageKitUrlToSupabasePath(null), '');
  assert.strictEqual(mapImageKitUrlToSupabasePath(undefined), '');
  assert.strictEqual(mapImageKitUrlToSupabasePath(''), '');
});
