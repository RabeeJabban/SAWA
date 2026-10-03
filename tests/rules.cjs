// Runs only against the explicitly configured local demo project.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
sdk.setLogLevel('silent');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function functionCode(name) {
  const pattern = new RegExp('(?:export )?(?:async )?function ' + name + '\\([\\s\\S]*?\\n\\}');
  const match = source.match(pattern);
  if (!match) throw Error(name);
  return match[0].replace(/^export /, '');
}
async function main() {
  const booking = await import('../booking.js');
  const { collaboration } = await import('../collaboration.js');
  const env = await initializeTestEnvironment({ projectId: 'demo-orbyx', firestore: {
    host: '127.0.0.1', port: 8089, rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8')
  } });
  const date = '2026-10-05';
  const circle = { id: 'team', name: 'Fahrschule', art: 'stern', erstellerId: 'teacher',
    mitglieder: ['teacher', 'anna', 'ben'], verwalter: ['teacher'], planer: [],
    rechte: { anna: { terminarten: ['Theorie', 'Automatik'] }, ben: { terminarten: ['Theorie', 'Automatik'] } },
    angebote: { Theorie: { plaetze: 2, dauer: 60, providerUid: 'teacher' }, Automatik: { plaetze: 1, dauer: 60, providerUid: 'teacher' } } };
  const accounts = Object.fromEntries(['teacher', 'anna', 'ben'].map(uid => [uid, env.authenticatedContext(uid, {
    email: uid + '@example.com', email_verified: true
  }).firestore()]));
  function actor(uid, k = circle) {
    function plain(value) {
      if (!value || typeof value !== 'object' || value instanceof sdk.Timestamp) return value;
      if (Array.isArray(value)) return Array.from(value, plain);
      return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, plain(v)]));
    }
    const context = vm.createContext({ ...sdk, ...booking, db: accounts[uid], structuredClone, crypto: crypto.webcrypto,
      serverTimestamp: () => sdk.Timestamp.now(),
      runTransaction: (db, fn) => sdk.runTransaction(db, tx => fn({
        get: ref => tx.get(ref), set: (ref, data) => tx.set(ref, plain(data)), update: (ref, data) => tx.update(ref, plain(data)), delete: ref => tx.delete(ref)
      })),
      writeBatch: db => {
        const b = sdk.writeBatch(db); return { set: (r, d, o) => b.set(r, plain(d), o),
          update: (r, d) => b.update(r, plain(d)), delete: r => b.delete(r), commit: () => b.commit() };
      },
      tageBis: (bis, von) => Math.round((new Date(bis) - new Date(von)) / 86400000),
      plus: (date, n) => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
      nutzer: { uid }, meineEintraege: [], belegtFremd: [],
      darfTerminart: (k, a, person) => (k.verwalter || []).includes(person) || !k.rechte?.[person]?.terminarten || k.rechte[person].terminarten.includes(a.name),
      anbieterVon: (k, a) => a.belegung === 'parallel' ? '' : a.providerUid || k.erstellerId,
      sitzungsId: (k, d, f) => booking.sessionKey(k.id, d, f.von, f.bis, f.art.name, f.art.belegung === 'parallel' ? '' : f.art.providerUid || k.erstellerId),
      belegtFuerListe: () => [uid, 'teacher'], kreisVon: () => k,
      darfPlanen: k => k.verwalter.includes(uid), istBetreiber: () => false,
      istTeamPlaner: k => !!k && (k.verwalter.includes(uid) || (k.planer || []).includes(uid)), istStern: k => k?.art === 'stern',
      wochentag: date => (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7,
      istFeiertag: () => false, ferienRoh: () => null,
      t: key => key, confirm: () => true, melde: () => {}, alert: message => { throw Error(message); },
      zeitStatus: [], slots: []
    });
    vm.runInContext(['minuten', 'ausMinuten', 'zeitraum', 'istSerie', 'serieAnTag', 'laeuftAnTag', 'darfBearbeiten', 'buchungsFehler', 'loescheEintrag', 'sageSerientagAb', 'slotKennung', 'zeitKonflikt', 'geplanterBatch', 'schreibeZeitSperren', 'entferneZeitSperren', 'schreibeZeitStatus', 'entferneZeitStatus', 'schreibeBuchungsFreigabe', 'reserviereTermin', 'storniereBuchung', 'weiseTourZu']
      .map(functionCode).join('\n'), context);
    return context;
  }
  async function reset(k = circle) {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c => {
      const db = c.firestore(), batch = sdk.writeBatch(db);
      const { id, ...data } = k; batch.set(sdk.doc(db, 'kreise', id), data);
      for (const uid of ['teacher', 'anna', 'ben']) batch.set(sdk.doc(db, 'users', uid), { name: uid, vollzugriff: uid === 'teacher' });
      await batch.commit();
    });
  }
  const window = (name, start = 600) => ({ von: start, bis: start + 60, plaetze: name === 'Theorie' ? 2 : 1,
    art: { name, providerUid: 'teacher', dauer: 60, ort: 'Fahrschule' } });
  const check = async (name, fn) => {
    if (process.env.ORBYX_RULES_FILTER && !new RegExp(process.env.ORBYX_RULES_FILTER).test(name)) return;
    await reset(); console.log('CHECK:', name); await fn(); console.log('PASS:', name);
  };
  const open = { ...circle, id: 'family', art: 'kreis', rechte: {} };
  async function family() {
    const { id, ...data } = open;
    await env.withSecurityRulesDisabled(c => sdk.setDoc(sdk.doc(c.firestore(), 'kreise', id), data));
  }
  function joint(uid) {
    const a = actor(uid, open);
    return collaboration({ ...sdk, runTransaction: a.runTransaction, db: accounts[uid], user: () => ({ uid }), minutes: a.minuten,
      writeLocks: a.schreibeZeitSperren, removeLocks: a.entferneZeitSperren,
      writeStatus: a.schreibeZeitStatus, removeStatus: a.entferneZeitStatus,
      notify: async () => {}, error: error => { throw error; } });
  }
  function serviceWorkflow(uid) {
    const a = actor(uid);
    return collaboration({ ...sdk, runTransaction: a.runTransaction, db: accounts[uid], user: () => ({ uid }),
      notify: async () => {}, releaseService: a.schreibeBuchungsFreigabe,
      confirmService: async (id, request) => {
        const snap = await sdk.getDoc(sdk.doc(accounts[uid], 'eintraege', request.entryId));
        const old = { id: snap.id, ...snap.data() }, data = request.daten;
        await a.reserviereTermin(circle, data.datum, window(data.artName, a.minuten(data.start)), old.participantUid, false, old, data, id);
      } });
  }
  async function approveShift(entry, name, start) {
    const data = { titel: name, typ: 'termin', datum: date, start: actor('teacher').ausMinuten(start), ende: actor('teacher').ausMinuten(start + 60), artName: name, ort: '', notiz: '' };
    await serviceWorkflow('teacher').service(entry, data);
    const id = 'service_' + entry.id;
    await sdk.updateDoc(sdk.doc(accounts.anna, 'abstimmungen', id), { 'zusagen.anna': 'ja', phase: 'ready' });
    return { id, data };
  }
  try {
    await check('personal deletion removes all busy data and makes the time bookable', async () => {
      const teacher = actor('teacher'), entry = { id: 'personal-delete', ownerId: 'teacher', titel: 'Privat', typ: 'termin',
        datum: date, start: '10:00', ende: '11:00', wiederholung: 'einmal', kreisIds: [], teilnehmer: ['teacher'], sperrenVersion: 1, zeitStatusVersion: 1 };
      const b = teacher.geplanterBatch();
      b.set(sdk.doc(accounts.teacher, 'eintraege', entry.id), entry);
      b.set(sdk.doc(accounts.teacher, 'belegt', entry.id), { ownerId: 'teacher', datum: date });
      teacher.schreibeZeitSperren(b, entry.id, entry); teacher.schreibeZeitStatus(b, entry.id, entry); await b.commit();
      await assert.rejects(actor('anna').reserviereTermin(circle, date, window('Automatik'), 'anna'));
      assert.equal(await actor('anna').loescheEintrag(entry), false, 'another member cannot delete a private entry');
      await assertFails(sdk.deleteDoc(sdk.doc(accounts.anna, 'eintraege', entry.id)));
      assert.equal(await teacher.loescheEintrag(entry), true);
      await env.withSecurityRulesDisabled(async c => {
        for (const name of ['eintraege', 'belegt', 'zeitstatus', 'zeitsperren']) assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), name))).size, 0, name);
      });
      await actor('anna').reserviereTermin(circle, date, window('Automatik'), 'anna');
    });
    await check('deleting one recurring day releases only that day; deleting the series releases all', async () => {
      const teacher = actor('teacher'), secondDay = '2026-10-12', entry = { id: 'series-delete', ownerId: 'teacher', titel: 'Privatserie', typ: 'termin',
        datum: date, start: '10:00', ende: '11:00', wiederholung: 'serie', kreisIds: [], teilnehmer: ['teacher'], sperrenVersion: 1, zeitStatusVersion: 1,
        serie: { bis: secondDay, wochentage: [0], ausnahmen: [], ohneFeiertage: false, ohneFerien: false } };
      const b = teacher.geplanterBatch(); b.set(sdk.doc(accounts.teacher, 'eintraege', entry.id), entry);
      b.set(sdk.doc(accounts.teacher, 'belegt', entry.id), { ownerId: 'teacher', datum: date });
      teacher.schreibeZeitSperren(b, entry.id, entry); teacher.schreibeZeitStatus(b, entry.id, entry); await b.commit();
      console.log('Series reservations created');
      await teacher.sageSerientagAb(entry, date);
      const status = (await sdk.getDoc(sdk.doc(accounts.teacher, 'zeitstatus', entry.id + '_teacher'))).data();
      assert.deepEqual(status.serie.ausnahmen, [date]);
      const student = actor('anna'); student.zeitStatus = [status];
      assert.equal(student.zeitKonflikt(circle, date, window('Automatik')), false);
      assert.equal(student.zeitKonflikt(circle, secondDay, window('Automatik')), true);
      const freed = await student.reserviereTermin(circle, date, window('Automatik'), 'anna');
      await assert.rejects(actor('ben').reserviereTermin(circle, secondDay, window('Automatik'), 'ben'));
      await student.storniereBuchung(freed);
      const current = (await sdk.getDoc(sdk.doc(accounts.teacher, 'eintraege', entry.id))).data();
      assert.equal(await teacher.loescheEintrag({ id: entry.id, ...current }), true);
      await env.withSecurityRulesDisabled(async c => {
        for (const name of ['eintraege', 'belegt', 'zeitstatus', 'zeitsperren']) assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), name))).size, 0, name);
      });
      await actor('ben').reserviereTermin(circle, secondDay, window('Automatik'), 'ben');
    });
    await check('two concurrent pupils contend for one seat with no orphan entry', async () => {
      const results = await Promise.allSettled(['anna', 'ben'].map(uid => actor(uid).reserviereTermin(circle, date, window('Automatik'), uid)));
      if (!results.some(r => r.status === 'fulfilled')) console.error(results.map(r => r.reason));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      await env.withSecurityRulesDisabled(async c => {
        for (const name of ['slots', 'eintraege', 'sitzungen']) assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), name))).size, 1, name);
      });
    });
    await check('two theory seats share one teacher and cancel independently', async () => {
      const teacher = actor('teacher');
      const anna = await teacher.reserviereTermin(circle, date, window('Theorie'), 'anna', true);
      const ben = await teacher.reserviereTermin(circle, date, window('Theorie'), 'ben', true);
      await assertFails(sdk.deleteDoc(sdk.doc(accounts.anna, 'eintraege', ben.id)));
      await actor('anna').storniereBuchung(anna);
      await env.withSecurityRulesDisabled(async c => {
        const s = await sdk.getDoc(sdk.doc(c.firestore(), 'sitzungen', anna.sessionId));
        assert.deepEqual(s.data().seats, { [ben.id]: 'ben' });
        assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'zeitsperren'))).size, 24);
      });
      await actor('ben').storniereBuchung(ben);
      await env.withSecurityRulesDisabled(async c => {
        for (const name of ['slots', 'eintraege', 'sitzungen', 'zeitsperren']) assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), name))).size, 0, name);
      });
    });
    await check('private teacher appointment rejects a booking and rolls back all writes', async () => {
      const teacher = actor('teacher'), entry = { ownerId: 'teacher', typ: 'termin', datum: date, start: '10:00', ende: '11:00',
        wiederholung: 'einmal', kreisIds: [], teilnehmer: ['teacher'], sperrenVersion: 1, zeitStatusVersion: 1 };
      const batch = teacher.geplanterBatch();
      batch.set(sdk.doc(accounts.teacher, 'eintraege', 'private'), entry);
      teacher.schreibeZeitSperren(batch, 'private', entry); teacher.schreibeZeitStatus(batch, 'private', entry);
      await assertSucceeds(batch.commit());
      await assert.rejects(actor('anna').reserviereTermin(circle, date, window('Automatik'), 'anna'));
      await env.withSecurityRulesDisabled(async c => {
        for (const name of ['slots', 'sitzungen']) assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), name))).size, 0, name);
        assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'eintraege'))).size, 1);
      });
      const next = { ...entry, start: '11:00', ende: '12:00' }, edit = teacher.geplanterBatch();
      teacher.entferneZeitSperren(edit, 'private', entry); teacher.schreibeZeitSperren(edit, 'private', next);
      teacher.entferneZeitStatus(edit, 'private', entry); teacher.schreibeZeitStatus(edit, 'private', next);
      edit.set(sdk.doc(accounts.teacher, 'eintraege', 'private'), next); await assertSucceeds(edit.commit());
      await actor('anna').reserviereTermin(circle, date, window('Automatik'), 'anna');
    });
    await check('a database client cannot claim two seats for the same pupil', async () => {
      const e = await actor('anna').reserviereTermin(circle, date, window('Theorie'), 'anna');
      const snapshot = await sdk.getDoc(sdk.doc(accounts.anna, 'sitzungen', e.sessionId)), old = snapshot.data();
      const id = 'duplicate', slotId = 'team_' + date + '_10:00_2', b = sdk.writeBatch(accounts.anna);
      const saved = (await sdk.getDoc(sdk.doc(accounts.anna, 'eintraege', e.id))).data();
      b.set(sdk.doc(accounts.anna, 'eintraege', id), { ...saved, slotId });
      b.set(sdk.doc(accounts.anna, 'slots', slotId), { kreisId: 'team', datum: date, start: '10:00', platz: 2, uid: 'anna' });
      b.set(sdk.doc(accounts.anna, 'sitzungen', e.sessionId), { ...old, seats: { ...old.seats, [id]: 'anna' }, aktionId: id });
      await assertFails(b.commit());
    });
    await check('a planner can move a booking and change its type atomically', async () => {
      const teacher = actor('teacher'), e = await teacher.reserviereTermin(circle, date, window('Automatik'), 'anna', true);
      await assert.rejects(teacher.reserviereTermin(circle, date, window('Automatik', 660), 'anna', true, e), /consent-required/);
      const first = await approveShift(e, 'Automatik', 660);
      const moved = await teacher.reserviereTermin(circle, date, window('Automatik', 660), 'anna', true, e, first.data, first.id);
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDoc(sdk.doc(c.firestore(), 'eintraege', e.id))).exists(), false));
      assert.equal(moved.participantUid, 'anna');
      const second = await approveShift(moved, 'Theorie', 660);
      const changed = await teacher.reserviereTermin(circle, date, window('Theorie', 660), 'anna', true, moved, second.data, second.id);
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDoc(sdk.doc(c.firestore(), 'eintraege', moved.id))).exists(), false));
      assert.equal(changed.artName, 'Theorie');
    });
    await check('a failed move leaves the original appointment and its seat intact', async () => {
      const teacher = actor('teacher'), e = await teacher.reserviereTermin(circle, date, window('Automatik'), 'anna', true);
      const privateEntry = { ownerId: 'teacher', typ: 'termin', datum: date, start: '11:00', ende: '12:00',
        wiederholung: 'einmal', kreisIds: [], teilnehmer: ['teacher'] }, b = teacher.geplanterBatch();
      b.set(sdk.doc(accounts.teacher, 'eintraege', 'private'), privateEntry);
      teacher.schreibeZeitSperren(b, 'private', privateEntry); await b.commit();
      const approval = await approveShift(e, 'Automatik', 660);
      await assert.rejects(teacher.reserviereTermin(circle, date, window('Automatik', 660), 'anna', true, e, approval.data, approval.id));
      assert.equal((await sdk.getDoc(sdk.doc(accounts.teacher, 'eintraege', e.id))).exists(), true);
      assert.equal((await sdk.getDoc(sdk.doc(accounts.teacher, 'slots', e.slotId))).exists(), true);
      assert.deepEqual((await sdk.getDoc(sdk.doc(accounts.teacher, 'sitzungen', e.sessionId))).data().seats, { [e.id]: 'anna' });
    });
    await check('planners edit booking details; students cannot change them', async () => {
      const e = await actor('teacher').reserviereTermin(circle, date, window('Theorie'), 'anna', true);
      await assertSucceeds(sdk.updateDoc(sdk.doc(accounts.teacher, 'eintraege', e.id), { ort: 'Treffpunkt Bahnhof' }));
      await assertFails(sdk.updateDoc(sdk.doc(accounts.anna, 'eintraege', e.id), { ort: 'Fremde Änderung' }));
    });
    await check('a lesson blocks another orbit for the same teacher', async () => {
      const other = { ...circle, id: 'other' }; const { id, ...data } = other;
      await env.withSecurityRulesDisabled(c => sdk.setDoc(sdk.doc(c.firestore(), 'kreise', id), data));
      await actor('anna').reserviereTermin(circle, date, window('Theorie'), 'anna');
      await assert.rejects(actor('ben', other).reserviereTermin(other, date, window('Automatik'), 'ben'));
    });
    await check('allowed types are enforced for readers at the database', async () => {
      const limited = { ...circle, rechte: { ...circle.rechte, anna: { terminarten: ['Theorie'] } } };
      await env.withSecurityRulesDisabled(c => sdk.updateDoc(sdk.doc(c.firestore(), 'kreise', 'team'), { rechte: limited.rechte }));
      // Pass stale client permissions to ensure the database denies the operation.
      await assert.rejects(actor('anna').reserviereTermin(circle, date, window('Automatik'), 'anna'));
    });
    await check('busy-time sharing reveals no private content and stops after removal', async () => {
      await actor('anna').reserviereTermin(circle, date, window('Theorie'), 'anna');
      await assertSucceeds(sdk.setDoc(sdk.doc(accounts.ben, 'zeitfreigaben', 'teacher_ben'), { uid: 'teacher', leserUid: 'ben', kreisId: 'team' }));
      const q = sdk.query(sdk.collection(accounts.ben, 'zeitstatus'), sdk.where('uid', '==', 'teacher'));
      const busy = await assertSucceeds(sdk.getDocs(q));
      assert.equal(busy.size, 1);
      assert.deepEqual(Object.keys(busy.docs[0].data()).sort(), ['uid', 'eintragId', 'datum', 'von', 'bis', 'token', 'wiederholung'].sort());
      const student = actor('ben'); student.zeitStatus = busy.docs.map(d => d.data());
      assert.equal(student.zeitKonflikt(circle, date, window('Automatik')), true);
      await sdk.updateDoc(sdk.doc(accounts.teacher, 'kreise', 'team'), { mitglieder: ['teacher', 'anna'] });
      await assertFails(sdk.getDocs(q));
    });
    await check('invitation grants only the intended rights in an atomic acceptance', async () => {
      await env.withSecurityRulesDisabled(async c => {
        const db = c.firestore();
        await sdk.setDoc(sdk.doc(db, 'kreise', 'new'), { ...circle, mitglieder: ['teacher'], rechte: {} });
        await sdk.setDoc(sdk.doc(db, 'einladungen', 'new_anna@example.com'), {
          kreisId: 'new', email: 'anna@example.com', art: 'stern', vollzugriff: true, darfKreiseAnlegen: true,
          rechte: { einladen: false, planen: false, terminarten: ['Theorie'] }, alsPlaner: false, alsVerwalter: false
        });
      });
      const b = sdk.writeBatch(accounts.anna);
      b.update(sdk.doc(accounts.anna, 'kreise', 'new'), { mitglieder: sdk.arrayUnion('anna'),
        'rechte.anna': { einladen: false, planen: false, terminarten: ['Theorie'] } });
      b.update(sdk.doc(accounts.anna, 'users', 'anna'), { vollzugriff: true, darfKreiseAnlegen: true, zugangEinladung: 'new_anna@example.com' });
      await assertSucceeds(b.commit());
      await assertFails(sdk.updateDoc(sdk.doc(accounts.anna, 'kreise', 'new'), { verwalter: ['teacher', 'anna'] }));
    });
    await check('uninvolved open orbit members and service readers cannot edit private details', async () => {
      await env.withSecurityRulesDisabled(async c => {
        const db = c.firestore();
        await sdk.setDoc(sdk.doc(db, 'kreise', 'open'), { ...circle, art: 'kreis' });
        await sdk.setDoc(sdk.doc(db, 'eintraege', 'common'), { ownerId: 'teacher', typ: 'termin', kreisIds: ['open'] });
        await sdk.setDoc(sdk.doc(db, 'eintraege', 'service'), { ownerId: 'teacher', typ: 'termin', kreisIds: ['team'] });
      });
      await assertFails(sdk.updateDoc(sdk.doc(accounts.anna, 'eintraege', 'common'), { titel: 'Gemeinsam geplant' }));
      await assertFails(sdk.updateDoc(sdk.doc(accounts.anna, 'eintraege', 'service'), { titel: 'Fremder Termin' }));
    });
    await check('shared requests reserve only after all yes; overlapping shift replaces the old reservation', async () => {
      await family();
      const teacher = joint('teacher'), anna = joint('anna');
      const data = { titel: 'Familie', typ: 'termin', datum: date, start: '10:00', ende: '12:00' };
      const id = await teacher.create(open, data, ['teacher', 'anna']);
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'zeitsperren'))).size, 0));
      await assertFails(sdk.updateDoc(sdk.doc(accounts.teacher, 'abstimmungen', id), { 'zusagen.anna': 'ja', phase: 'confirmed', basis: data }));
      await anna.respond(id, 'ja', 1);
      assert.equal((await sdk.getDoc(sdk.doc(accounts.anna, 'eintraege', id + '_anna'))).data().start, '10:00');
      await assertFails(sdk.deleteDoc(sdk.doc(accounts.teacher, 'eintraege', id + '_anna')));
      await assertFails(sdk.deleteDoc(sdk.doc(accounts.teacher, 'zeitsperren', 'anna_' + date + '_600')));
      await assertFails(sdk.getDoc(sdk.doc(accounts.ben, 'abstimmungen', id)));
      await assertFails(sdk.getDoc(sdk.doc(accounts.ben, 'eintraege', id + '_anna')));
      await teacher.shift(id, { ...data, start: '11:00', ende: '13:00' });
      assert.equal((await sdk.getDoc(sdk.doc(accounts.anna, 'eintraege', id + '_anna'))).data().start, '10:00');
      await anna.respond(id, 'ja', 2);
      assert.equal((await sdk.getDoc(sdk.doc(accounts.anna, 'eintraege', id + '_anna'))).data().start, '11:00');
      await teacher.withdraw(id);
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDoc(sdk.doc(c.firestore(), 'eintraege', id + '_teacher'))).exists(), false));
      assert.equal((await sdk.getDoc(sdk.doc(accounts.anna, 'eintraege', id + '_anna'))).exists(), true);
      await anna.withdraw(id);
      await env.withSecurityRulesDisabled(async c => {
        assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'eintraege'))).size, 0);
        assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'zeitsperren'))).size, 0);
      });
    });
    await check('declining a shift removes the old reservation too, without removing another participant', async () => {
      await family(); const teacher = joint('teacher'), anna = joint('anna');
      const data = { titel: 'Familie', typ: 'termin', datum: date, start: '10:00', ende: '11:00' };
      const id = await teacher.create(open, data, ['teacher', 'anna']); await anna.respond(id, 'ja', 1);
      await teacher.shift(id, { ...data, start: '11:00', ende: '12:00' }); await anna.respond(id, 'nein', 2);
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDoc(sdk.doc(c.firestore(), 'eintraege', id + '_anna'))).exists(), false));
      assert.equal((await sdk.getDoc(sdk.doc(accounts.teacher, 'eintraege', id + '_teacher'))).data().start, '11:00');
      await env.withSecurityRulesDisabled(async c => {
        const locks = await sdk.getDocs(sdk.collection(c.firestore(), 'zeitsperren'));
        assert.equal(locks.docs.some(d => d.data().uid === 'anna'), false);
      });
    });
    await check('a private conflict at final consent rolls back every copy and keeps the pending request', async () => {
      await family(); const teacher = joint('teacher'), anna = joint('anna');
      const data = { titel: 'Familie', typ: 'termin', datum: date, start: '10:00', ende: '11:00' };
      const id = await teacher.create(open, data, ['teacher', 'anna']);
      await actor('anna').reserviereTermin(circle, date, window('Automatik'), 'anna');
      await assert.rejects(anna.respond(id, 'ja', 1));
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDoc(sdk.doc(c.firestore(), 'eintraege', id + '_anna'))).exists(), false));
      assert.equal((await sdk.getDoc(sdk.doc(accounts.teacher, 'abstimmungen', id))).data().phase, 'pending');
    });
    await check('new accounts cannot grant themselves access and the app administrator cannot read private details', async () => {
      const newbie = env.authenticatedContext('newbie', { email: 'new@example.com', email_verified: true }).firestore();
      await assertSucceeds(sdk.setDoc(sdk.doc(newbie, 'users', 'newbie'), { name: 'Neu', betaVersion: 17 }));
      await assertFails(sdk.updateDoc(sdk.doc(newbie, 'users', 'newbie'), { vollzugriff: true }));
      await assertFails(sdk.setDoc(sdk.doc(newbie, 'kreise', 'mine'), { name: 'Meins', erstellerId: 'newbie', mitglieder: ['newbie'], verwalter: ['newbie'] }));
      await env.withSecurityRulesDisabled(c => sdk.setDoc(sdk.doc(c.firestore(), 'eintraege', 'private'), { ownerId: 'anna', titel: 'Geheim', kreisIds: [] }));
      const admin = env.authenticatedContext('root', { email: 'rabea.jabban.mrj@gmail.com', email_verified: true }).firestore();
      await assertFails(sdk.getDoc(sdk.doc(admin, 'eintraege', 'private')));
    });
    await check('an initial declined participant can be removed and the remaining yes votes reserve an untimed task', async () => {
      await family(); const teacher = joint('teacher'), anna = joint('anna'), ben = joint('ben');
      const data = { titel: 'Aufgabe', typ: 'task', datum: date, start: '', ende: '', frist: '2026-10-15' };
      const id = await teacher.create(open, data, ['teacher', 'anna', 'ben']);
      await anna.respond(id, 'ja', 1); await ben.respond(id, 'nein', 1);
      await teacher.removeDeclined(id, 'ben');
      const task = (await sdk.getDoc(sdk.doc(accounts.anna, 'eintraege', id + '_anna'))).data();
      assert.equal(task.typ, 'task'); assert.equal(task.frist, '2026-10-15');
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'zeitsperren'))).size, 0));
      await assertSucceeds(sdk.updateDoc(sdk.doc(accounts.anna, 'eintraege', id + '_anna'), { status: 'fertig' }));
      assert.equal((await sdk.getDoc(sdk.doc(accounts.teacher, 'eintraege', id + '_teacher'))).data().status, 'offen');
    });
    await check('service shifts wait for customer approval and cancellation frees only this customer seat', async () => {
      const e = await actor('teacher').reserviereTermin(circle, date, window('Theorie'), 'anna', true);
      const other = await actor('teacher').reserviereTermin(circle, date, window('Theorie'), 'ben', true);
      await serviceWorkflow('teacher').service(e, { titel: 'Theorie', typ: 'termin', datum: date, start: '11:00', ende: '12:00', artName: 'Theorie', ort: '', notiz: '' });
      assert.equal((await sdk.getDoc(sdk.doc(accounts.anna, 'eintraege', e.id))).data().start, '10:00');
      await serviceWorkflow('anna').respond('service_' + e.id, 'nein', 1);
      assert.equal((await sdk.getDoc(sdk.doc(accounts.ben, 'eintraege', other.id))).exists(), true);
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDoc(sdk.doc(c.firestore(), 'eintraege', e.id))).exists(), false));
    });
    await check('a customer confirms a service shift and the atomic move retains their original UID', async () => {
      const e = await actor('teacher').reserviereTermin(circle, date, window('Automatik'), 'anna', true);
      await serviceWorkflow('teacher').service(e, { titel: 'Automatik', typ: 'termin', datum: date, start: '11:00', ende: '12:00', artName: 'Automatik', ort: '', notiz: '' });
      await serviceWorkflow('anna').respond('service_' + e.id, 'ja', 1);
      const req = (await sdk.getDoc(sdk.doc(accounts.anna, 'abstimmungen', 'service_' + e.id))).data();
      assert.equal(req.phase, 'confirmed');
      const moved = (await sdk.getDoc(sdk.doc(accounts.anna, 'eintraege', req.newEntryId))).data();
      assert.equal(moved.start, '11:00'); assert.equal(moved.participantUid, 'anna');
    });
    await check('parallel tours reserve capacity and the customer, without reserving the owner calendar', async () => {
      const k = { ...circle, rechte: {}, angebote: { Tour: { plaetze: 2, dauer: 60, providerUid: '' } } };
      await env.withSecurityRulesDisabled(c => sdk.updateDoc(sdk.doc(c.firestore(), 'kreise', 'team'), { angebote: k.angebote, rechte: {} }));
      const f = { von: 600, bis: 660, plaetze: 2, art: { name: 'Tour', dauer: 60, belegung: 'parallel' } };
      const anna = await actor('teacher', k).reserviereTermin(k, date, f, 'anna', true);
      const ben = await actor('teacher', k).reserviereTermin(k, date, f, 'ben', true);
      assert.equal(anna.providerUid, ''); assert.deepEqual(Array.from(ben.teilnehmer), ['ben']);
      await env.withSecurityRulesDisabled(async c => {
        const locks = await sdk.getDocs(sdk.collection(c.firestore(), 'zeitsperren'));
        assert.equal(locks.docs.some(d => d.data().uid === 'teacher'), false);
      });
      await actor('teacher', k).weiseTourZu(anna, 'teacher');
      await assert.rejects(actor('teacher', k).weiseTourZu(ben, 'teacher'));
      assert.equal((await sdk.getDoc(sdk.doc(accounts.teacher, 'eintraege', anna.id))).data().executorUid, 'teacher');
      await actor('anna', k).storniereBuchung({ ...anna, executorUid: 'teacher', teilnehmer: ['anna', 'teacher'] });
      await env.withSecurityRulesDisabled(async c => {
        const locks = await sdk.getDocs(sdk.collection(c.firestore(), 'zeitsperren'));
        assert.equal(locks.docs.some(d => d.data().uid === 'teacher'), false);
      });
    });
    await check('standalone app invitations preserve existing access and cannot override an administrator ban', async () => {
      const admin = env.authenticatedContext('root', { email: 'rabea.jabban.mrj@gmail.com', email_verified: true }).firestore();
      await assertSucceeds(sdk.setDoc(sdk.doc(admin, 'einladungen', 'app_anna@example.com'), { email: 'anna@example.com', vonUid: 'root', appEinladung: true, vollzugriff: true, darfKreiseAnlegen: true }));
      await assertSucceeds(sdk.updateDoc(sdk.doc(accounts.anna, 'users', 'anna'), { vollzugriff: true, darfKreiseAnlegen: true, zugangEinladung: 'app_anna@example.com' }));
      await sdk.updateDoc(sdk.doc(admin, 'users', 'anna'), { vollzugriff: false, 'adminSperren.kalender': true });
      await assertFails(sdk.updateDoc(sdk.doc(accounts.anna, 'users', 'anna'), { vollzugriff: true, zugangEinladung: 'app_anna@example.com' }));
      await assertSucceeds(sdk.updateDoc(sdk.doc(accounts.anna, 'users', 'anna'), { vollzugriff: false, darfKreiseAnlegen: true, zugangEinladung: 'app_anna@example.com' }));
    });
    await check('timed tasks reserve participants only after approval and participant restrictions are enforced on consent', async () => {
      await family();
      const id = await joint('teacher').create(open, { titel: 'Arbeit', typ: 'task', datum: date, start: '10:00', ende: '11:00' }, ['teacher', 'anna']);
      await joint('anna').respond(id, 'ja', 1);
      await env.withSecurityRulesDisabled(async c => assert.equal((await sdk.getDocs(sdk.collection(c.firestore(), 'zeitsperren'))).size, 24));
      await sdk.updateDoc(sdk.doc(accounts.teacher, 'kreise', 'family'), { 'rechte.anna': { planenMit: 'verwalter' } });
      const next = await joint('teacher').create(open, { titel: 'Andere Aufgabe', typ: 'task', datum: date, start: '', ende: '' }, ['teacher', 'anna', 'ben']);
      await assert.rejects(joint('anna').respond(next, 'ja', 1));
    });
  } finally { await env.cleanup(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
