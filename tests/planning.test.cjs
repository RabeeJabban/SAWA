const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const names = ['minuten', 'ausText', 'wochentag', 'vereinteZeiten', 'zeitenAnTag', 'plaetzeVon', 'artZeiten', 'pausenAnTag', 'schnitt', 'abzug', 'ohnePausenListe', 'artModus', 'fensterFuer'];
const code = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  const rest = source.slice(start);
  const match = rest.match(/^function[^\n]+\{[^\n]*\}\r?\n|^function[\s\S]*?\n\}/);
  assert.ok(start >= 0 && match, name); return match[0];
}).join('\n');
const context = vm.createContext({}); vm.runInContext(code, context);
const art = (name, von, bis, modus = 'fest', dauer = 60) => ({ name, von, bis, modus, dauer, plaetze: 1, tage: [0,1,2,3,4,5] });
const slots = k => JSON.parse(JSON.stringify(context.fensterFuer(k, '2026-10-05')));

test('last type gets work hours minus breaks and earlier fixed types', () => {
  const k = { zeiten: [{ tage: [0], von: '09:00', bis: '17:00' }], pausen: [{ tage: [0], von: '12:00', bis: '13:00' }],
    arten: [art('A', '09:00', '10:00'), art('B', '10:00', '11:00'), art('Rest', '', '', 'rest')] };
  const result = slots(k);
  assert.deepEqual(result.filter(x => x.art.name === 'Rest').map(x => x.von), [660, 780, 840, 900, 960]);
  assert.equal(result.some(x => x.von < 780 && x.bis > 720), false);
});
test('a closed day stays closed even when a fixed type includes it', () => {
  const k = { zeiten: [{ tage: [1], von: '09:00', bis: '17:00' }], arten: [art('A', '09:00', '17:00')] };
  assert.deepEqual(slots(k), []);
});
test('overlapping working intervals do not duplicate slots', () => {
  const k = { zeiten: [{ tage: [0], von: '09:00', bis: '12:00' }, { tage: [0], von: '10:00', bis: '13:00' }], arten: [art('Rest', '', '', 'rest')] };
  assert.equal(slots(k).length, 4);
});
test('short remaining intervals can be filled by a shorter rest type', () => {
  const k = { zeiten: [{ tage: [0], von: '09:00', bis: '10:00' }], arten: [art('Long', '', '', 'rest', 45), art('Short', '', '', 'rest', 15)] };
  assert.deepEqual(slots(k).map(x => [x.art.name, x.von, x.bis]), [['Long', 540, 585], ['Short', 585, 600]]);
});
test('Saturday uses its own working hours', () => {
  const k = { zeiten: [{ tage: [0,1,2,3,4], von: '09:00', bis: '17:00' }, { tage: [5], von: '10:00', bis: '12:00' }], arten: [art('Rest', '', '', 'rest')] };
  assert.equal(context.fensterFuer(k, '2026-10-10').length, 2);
});
test('closing all work days leaves no slots in a configured service orbit', () => {
  assert.deepEqual(slots({ arbeitszeitenVersion: 1, zeiten: [], arten: [art('A', '09:00', '17:00')] }), []);
});
test('rest types may be limited to selected weekdays', () => {
  const k = { zeiten: [{ tage: [0, 5], von: '09:00', bis: '10:00' }], arten: [{ ...art('Rest', '', '', 'rest'), tage: [5] }] };
  assert.deepEqual(slots(k), []); assert.equal(context.fensterFuer(k, '2026-10-10').length, 1);
});
