const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = import('../collaboration.js');
const data = { typ: 'termin', titel: 'Gemeinsam', datum: '2026-10-05', start: '10:00', ende: '12:00' };
test('a proposal never starts with another participant consent', async () => {
  const { proposal, vote } = await api;
  const p = proposal(data, ['a', 'b', 'c'], 'a');
  assert.deepEqual(p.zusagen, { a: 'ja' }); assert.equal(p.phase, 'pending');
  const b = vote(p, 'b', 'ja', 1); assert.equal(b.phase, 'pending');
  assert.equal(vote(b, 'c', 'ja', 1).phase, 'ready');
  assert.throws(() => vote(b, 'c', 'ja', 0), /changed-request/);
});
test('initial decline remains removable; shift decline removes the same participant entirely', async () => {
  const { proposal, vote } = await api;
  const p = proposal(data, ['a', 'b'], 'a');
  assert.deepEqual(vote(p, 'b', 'nein', 1).teilnehmer, ['a', 'b']);
  const shifted = vote({ ...p, basis: data }, 'b', 'nein', 1);
  assert.deepEqual(shifted.teilnehmer, ['a']); assert.equal(shifted.phase, 'ready');
  assert.deepEqual(shifted.zusagen, { a: 'ja' });
});
test('participant restrictions apply to both sides and allow administrator-only planning', async () => {
  const { canMeet } = await api;
  const circle = { mitglieder: ['a', 'b', 'c'], verwalter: ['a'], rechte: { b: { planenMit: 'verwalter' } } };
  assert.equal(canMeet(circle, ['a', 'b']), true);
  assert.equal(canMeet(circle, ['c', 'b']), false);
  circle.rechte.b = { planenMit: 'auswahl', personen: ['c'] };
  assert.equal(canMeet(circle, ['a', 'b']), false); assert.equal(canMeet(circle, ['b', 'c']), true);
});
test('each participant receives their own copy; untimed tasks do not reserve time', async () => {
  const { proposal, personalCopy } = await api;
  const p = { ...proposal({ ...data, typ: 'task', start: '', ende: '' }, ['a', 'b'], 'a'), erstellerId: 'a', kreisId: 'family' };
  const b = personalCopy('request', p, 'b');
  assert.equal(b.ownerId, 'b'); assert.deepEqual(b.sichtbarFuer, ['b']); assert.deepEqual(b.teilnehmer, ['b']);
  assert.equal(b.sperrenVersion, 0); assert.equal(b.status, 'offen');
});
