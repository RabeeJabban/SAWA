/* Browser regression tests. Firebase is replaced with an in-memory double;
   no requests reach production and these tests do not validate security rules. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const firebase = `
const db = window.__db;
const user = window.__user;
const listeners = [];
export const initializeApp = () => ({}), getAuth = () => ({}), getFirestore = () => ({});
export class GoogleAuthProvider {};
export const signInWithPopup = async () => {}, signOut = async () => {};
export const onAuthStateChanged = (_, cb) => { setTimeout(() => cb(user), 0); };
export const collection = (_, name) => ({ name }), doc = (ref, name, id) => name ? ({ name, id }) : ({ name: ref.name, id: 'new-' + (++window.__seq) });
export const where = (key, op, value) => ({ key, op, value });
export const query = (ref, ...filters) => ({ ...ref, filters });
export const serverTimestamp = () => ({ seconds: Date.now()/1000 });
export const arrayUnion = (...values) => ({ union: values });
function snapshot(ref) {
  const docs = Object.entries(db[ref.name] || {}).filter(([id, data]) => !ref.id || ref.id === id)
    .filter(([id, data]) => (ref.filters || []).every(f => f.op === '==' ? JSON.stringify(data[f.key]) === JSON.stringify(f.value) : f.op === 'in' ? f.value.includes(data[f.key]) : (data[f.key] || []).includes(f.value)))
    .map(([id, data]) => ({ id, data: () => structuredClone(data), exists: () => true, metadata: {} }));
  return ref.id ? docs[0] || { exists: () => false, data: () => ({}) } : { docs };
}
export const getDoc = async ref => snapshot(ref), getDocs = async ref => snapshot(ref);
export function onSnapshot(ref, cb) { const l = { ref, cb }; listeners.push(l); queueMicrotask(() => cb(snapshot(ref))); return () => listeners.splice(listeners.indexOf(l), 1); }
function notify(name) { for (const l of [...listeners]) if (l.ref.name === name) queueMicrotask(() => l.cb(snapshot(l.ref))); }
export async function setDoc(ref, data, options = {}) {
  db[ref.name] ||= {}; let target = options.merge ? db[ref.name][ref.id] || {} : {};
  for (const [key, value] of Object.entries(data)) {
    if (key.includes('.')) { const [field, id] = key.split('.'); target[field] ||= {}; target[field][id] = value; }
    else target[key] = value?.union ? [...new Set([...(target[key] || []), ...value.union])] : structuredClone(value);
  }
  db[ref.name][ref.id] = target; notify(ref.name);
}
export const updateDoc = async (ref, data) => setDoc(ref, data, { merge: true });
export const addDoc = async (ref, data) => { const next = { ...ref, id: 'new-' + (++window.__seq) }; await setDoc(next, data); return next; };
export const deleteDoc = async ref => { delete db[ref.name]?.[ref.id]; notify(ref.name); };
let mutations = Promise.resolve();
function atomic(ops) {
  const result = mutations.then(async () => {
    if (window.__failDeletes && ops.some(([kind]) => kind === 'delete')) throw Object.assign(Error('delete rejected'), { code: 'permission-denied' });
    for (const [kind, ref, data] of ops) if (kind === 'set' && ref.name === 'zeitsperren') {
      const old = db[ref.name]?.[ref.id];
      if (old && old.sessionId !== data.sessionId) throw Object.assign(Error('occupied'), { code: 'permission-denied' });
    }
    for (const [kind, ...args] of ops) await ({ set: setDoc, update: updateDoc, delete: deleteDoc })[kind](...args);
  });
  mutations = result.catch(() => {}); return result;
}
export function writeBatch() { const ops = []; return { set: (...a) => ops.push(['set', ...a]), update: (...a) => ops.push(['update', ...a]), delete: (...a) => ops.push(['delete', ...a]), commit: () => atomic(ops) }; }
let transactions = Promise.resolve();
export function runTransaction(_, fn) {
  const result = transactions.then(async () => {
    const batch = writeBatch(); const value = await fn({ ...batch, get: async ref => snapshot(ref) });
    await batch.commit(); return value;
  });
  transactions = result.catch(() => {}); return result;
}
`;

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url === '/__firebase.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(firebase); return; }
    if (req.url === '/__old-worker.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`self.addEventListener('install', ev => ev.waitUntil(self.skipWaiting()));
self.addEventListener('activate', ev => ev.waitUntil(self.clients.claim()));
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (url.origin === self.location.origin && !url.search && ['/', '/startup.js', '/app.js', '/i18n.js', '/ui.css'].includes(url.pathname))
    ev.respondWith(caches.open('orbyx-old').then(c => c.match(ev.request)).then(hit => hit || fetch(ev.request)));
});`);
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'text/plain');
    let body = fs.readFileSync(file);
    if (file.endsWith('app.js')) body = body.toString().replace(/https:\/\/www.gstatic.com\/firebasejs\/10.12.2\/firebase-[a-z]+.js/g, '/__firebase.js');
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', locale: 'de-DE' });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const today = new Date().toLocaleDateString('en-CA');
  await context.addInitScript(({ today }) => {
    localStorage.setItem('orbyx.sprache', 'de');
    window.__seq = 0;
    window.__user = { uid: 'admin', email: 'rabea.jabban.mrj@gmail.com', emailVerified: true, displayName: 'Rabea' };
    const entry = (title, kreisIds, ownerId = 'admin') => ({ titel: title, typ: 'termin', datum: today, start: '10:00', ende: '11:00', dauer: 60, wiederholung: 'einmal', kreisIds, ownerId, sichtbarFuer: ['admin', 'member'], zugewiesen: [], zusagen: {} });
    window.__db = {
      users: { admin: { name: 'Rabea', vollzugriff: true }, member: { name: 'Mitarbeiter', vollzugriff: false } },
      users_privat: {},
      kreise: { team: { name: 'Team Nord', art: 'stern', farbe: '#485be6', erstellerId: 'admin', mitglieder: ['admin', 'member'], verwalter: ['admin'], planer: ['member'], info: { admin: { name: 'Rabea' }, member: { name: 'Mitarbeiter' } },
        zeiten: [{ tage: [0,1,2,3,4,5], von: '09:00', bis: '17:00' }], pausen: [], arten: [{ name: 'Beratung', dauer: 60, modus: 'rest', plaetze: 1, tage: [] }] } },
      eintraege: { group: entry('Teamtermin', ['team'], 'member'), private: entry('Privater Termin', []) },
      belegt: {}, slots: {}, einladungen: {}, nachrichten: {}
    };
    const role = new URLSearchParams(location.search).get('role');
    if (role) {
      window.__user = { uid: 'member', email: 'member@example.com', displayName: 'Mitarbeiter' };
      window.__db.eintraege.group.ownerId = 'admin';
      if (role === 'reader') window.__db.kreise.team.planer = [];
    }
  }, { today });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
  let confirmAction = 'accept';
  page.on('dialog', dialog => dialog[confirmAction]());
  const visible = async selector => assert.equal(await page.locator(selector).isVisible(), true, selector);
  try {
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForSelector('#appView:not(.versteckt)');
    await page.getByRole('tab', { name: 'Mein Orbit', exact: true }).click();
    assert.equal(await page.locator('#seiteOrbits').count(), 0, 'orbit selection is removed from the sidebar');
    const personalBackground = await page.locator('#appView').evaluate(el => getComputedStyle(el).backgroundColor);
    // Use the actual personal editor from each calendar view, including cancellation and write failure.
    for (const view of ['tag', 'woche', 'monat']) {
      await page.locator('#nav [data-v=' + view + ']').click();
      await page.locator('#kontextNeu').click();
      assert.equal(await page.locator('#eintragEntfernen').isVisible(), false);
      const title = 'Löschtest ' + view;
      await page.locator('#fTitel').fill(title);
      await page.locator('#fDatum').fill(today);
      await page.locator('#fStart').fill('13:00');
      await page.locator('#fEnde').fill('13:30');
      await page.locator('#formEintrag button[type=submit]').click();
      await page.waitForFunction(title => Object.values(window.__db.eintraege).some(e => e.titel === title), title);
      const id = await page.evaluate(title => Object.keys(window.__db.eintraege).find(id => window.__db.eintraege[id].titel === title), title);
      await page.locator(view === 'monat' ? '#monatTag .inhalt' : '.balken', { hasText: title }).click();
      assert.equal(await page.locator('#eintragLoeschenBtn').innerText(), 'Termin löschen');
      const deleteBox = await page.locator('#eintragLoeschenBtn').boundingBox();
      assert.ok(deleteBox.y >= 0 && deleteBox.y + deleteBox.height < 1000, 'delete button appears without scrolling');
      if (view === 'tag') {
        confirmAction = 'dismiss';
        await page.locator('#eintragLoeschenBtn').click();
        await visible('#dlgEintrag');
        assert.equal(await page.evaluate(id => !!window.__db.eintraege[id], id), true);
        confirmAction = 'accept';
        await page.evaluate(() => window.__failDeletes = true);
        await page.locator('#eintragLoeschenBtn').click();
        await visible('#dlgEintrag');
        assert.equal(await page.evaluate(id => !!window.__db.eintraege[id] && !!window.__db.belegt[id]
          && Object.values(window.__db.zeitsperren).some(s => s.entryId === id), id), true, 'failed deletion must preserve the appointment');
        await page.evaluate(() => window.__failDeletes = false);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#eintragLoeschenBtn').scrollIntoViewIfNeeded();
        fs.mkdirSync(path.join(root, 'preview'), { recursive: true });
        await page.screenshot({ path: path.join(root, 'preview/delete-mobile.png'), animations: 'disabled' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.locator('#eintragLoeschenBtn').click();
      await page.waitForFunction(id => !window.__db.eintraege[id], id);
      assert.equal(await page.evaluate(id => !window.__db.belegt[id]
        && !Object.values(window.__db.zeitstatus).some(s => s.eintragId === id)
        && !Object.values(window.__db.zeitsperren).some(s => s.entryId === id), id), true, 'deletion releases availability');
      assert.equal(await page.locator('#dlgEintrag').isVisible(), false);
    }
    await page.locator('#nav [data-v=tag]').click();
    await page.locator('#kontextNeu').click();
    await page.locator('#typTask').click();
    await page.locator('#fTitel').fill('Aufgabe löschen testen');
    await page.locator('#fStart').fill('');
    await page.locator('#formEintrag button[type=submit]').click();
    await page.locator('#nav [data-v=aufgaben]').click();
    await page.locator('.inhalt', { hasText: 'Aufgabe löschen testen' }).click();
    assert.equal(await page.locator('#eintragLoeschenBtn').innerText(), 'Aufgabe löschen');
    await page.locator('#eintragLoeschenBtn').click();
    await page.waitForFunction(() => !Object.values(window.__db.eintraege).some(e => e.titel === 'Aufgabe löschen testen'));
    await page.locator('#nav [data-v=tag]').click();
    await page.locator('#kontextNeu').click();
    await page.locator('#fTitel').fill('Wöchentlicher Löschtest');
    await page.locator('#fDatum').fill(today);
    await page.locator('#fStart').fill('14:00');
    await page.locator('#fEnde').fill('14:30');
    await page.locator('#fSerieAn').check();
    const nextWeek = new Date(today + 'T12:00:00Z'); nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
    const secondDay = nextWeek.toISOString().slice(0, 10);
    await page.locator('#fBis').fill(secondDay);
    await page.locator('#fFeiertage').uncheck();
    await page.locator('#formEintrag button[type=submit]').click();
    await page.locator('.balken', { hasText: 'Wöchentlicher Löschtest' }).click();
    assert.equal(await page.locator('#eintragLoeschenBtn').innerText(), 'Ganze Serie löschen');
    assert.ok((await page.locator('#absagenBtn').innerText()).startsWith('Nur am'));
    await page.locator('#absagenBtn').click();
    await page.waitForFunction(today => Object.values(window.__db.eintraege).find(e => e.titel === 'Wöchentlicher Löschtest')?.serie.ausnahmen.includes(today), today);
    assert.equal(await page.evaluate(today => Object.values(window.__db.zeitstatus).find(s => s.serie)?.serie.ausnahmen.includes(today)
      && !Object.values(window.__db.zeitsperren).some(s => s.datum === today && s.minute >= 840 && s.minute < 870), today), true);
    await page.locator('.miniTag:not(.fremd)').filter({ hasText: new RegExp('^' + nextWeek.getUTCDate() + '$') }).click();
    await page.locator('.balken', { hasText: 'Wöchentlicher Löschtest' }).click();
    await page.locator('#eintragLoeschenBtn').click();
    await page.waitForFunction(() => !Object.values(window.__db.eintraege).some(e => e.titel === 'Wöchentlicher Löschtest'));
    assert.equal(await page.evaluate(() => !Object.values(window.__db.zeitstatus).some(s => s.serie)
      && !Object.values(window.__db.zeitsperren).some(s => s.minute >= 840 && s.minute < 870)), true);
    await page.locator('#zeitleiste button', { hasText: 'Heute' }).click();
    await page.getByRole('tab', { name: 'Team Nord', exact: true }).click();
    const teamBackground = await page.locator('#appView').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(teamBackground, personalBackground, 'orbit color changes the background');
    assert.equal(await page.locator('#appView').evaluate(el => el.style.getPropertyValue('--orbit-farbe')), '#485be6');
    const tabBox = await page.locator('#orbitReiter').boundingBox(), sidebarBox = await page.locator('#seite').boundingBox();
    assert.ok(tabBox.y < sidebarBox.y, 'tabs appear above the sidebar and calendar');
    await page.getByRole('tab', { name: 'Team Nord', exact: true }).press('Home');
    assert.equal(await page.getByRole('tab', { name: 'Mein Orbit', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#appView').evaluate(el => getComputedStyle(el).backgroundColor), personalBackground);
    await page.getByRole('tab', { name: 'Mein Orbit', exact: true }).press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Team Nord', exact: true }).getAttribute('aria-selected'), 'true');
    await page.locator('#nav [data-v=woche]').click();
    assert.equal(await page.locator('#planTitel').textContent(), 'Team Nord');
    assert.ok((await page.locator('#buehne').innerText()).includes('Teamtermin'));
    assert.equal((await page.locator('#buehne').innerText()).includes('Privater Termin'), false);
    await page.locator('#nav [data-v=monat]').click();
    assert.equal(await page.locator('#planTitel').textContent(), 'Team Nord');
    await page.locator('#nav [data-v=tag]').click();
    fs.mkdirSync(path.join(root, 'preview'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'preview/desktop.png'), fullPage: true, animations: 'disabled' });
    await page.locator('.kreisWahl button', { hasText: 'Einstellungen' }).click();
    const saturday = page.locator('.arbeitsTag').nth(5);
    await saturday.locator('input[type=time]').first().fill('10:00');
    await saturday.locator('input[type=time]').nth(1).fill('13:00');
    await page.locator('#eArtName').fill('Kurzer Termin');
    await page.locator('#eArtDauer').fill('30');
    await page.locator('#eArtVon').fill('09:00');
    await page.locator('#eArtBis').fill('10:00');
    await page.locator('#artHinzu').click();
    await page.waitForFunction(() => window.__db.kreise.team.arten.length === 2);
    assert.equal(await page.evaluate(() => window.__db.kreise.team.zeiten.find(z => z.tage.includes(5)).bis), '13:00');
    assert.equal(await page.evaluate(() => window.__db.kreise.team.arten.at(-1).modus), 'rest');
    await page.screenshot({ path: path.join(root, 'preview/settings.png'), fullPage: true, animations: 'disabled' });
    await page.locator('#einstSpeichern').click();
    await page.locator('#kreiseBtn').click();
    await page.locator('#orbitNeuBtn').click();
    await page.locator('#kName').fill('Service Süd');
    await page.locator('#artStern').click();
    await page.locator('#kreisAnlegen').click();
    assert.equal(await page.evaluate(() => Object.values(window.__db.kreise).some(k => k.name === 'Service Süd')), false);
    await page.locator('#eArtName').fill('Erstgespräch');
    assert.equal(await page.locator('#eModusRest').getAttribute('class'), 'an');
    await page.locator('#eArtDauer').fill('30');
    await page.locator('#artHinzu').click();
    await page.waitForFunction(() => Object.values(window.__db.kreise).some(k => k.name === 'Service Süd'));
    await page.locator('#eArtName').fill('Restliche Termine');
    await page.locator('#einstSpeichern').click();
    const created = await page.evaluate(() => Object.values(window.__db.kreise).find(k => k.name === 'Service Süd'));
    assert.equal(created.arten.length, 2);
    assert.equal(created.arten.at(-1).modus, 'rest');
    assert.equal(await page.getByRole('tab', { name: 'Service Süd', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#appView').evaluate(el => el.style.getPropertyValue('--orbit-farbe')), created.farbe);
    assert.notEqual(await page.locator('#appView').evaluate(el => getComputedStyle(el).backgroundColor), teamBackground);
    await page.getByRole('tab', { name: 'Team Nord', exact: true }).click();
    await page.locator('#nav [data-v=woche]').click();
    await page.locator('.balken', { hasText: 'Teamtermin' }).click();
    await visible('#dlgEintrag');
    await page.locator('#fTitel').fill('Gemeinsam bearbeitet');
    await page.locator('#formEintrag button[type=submit]').click();
    await page.waitForFunction(() => window.__db.eintraege.group.titel === 'Gemeinsam bearbeitet');
    assert.equal(await page.evaluate(() => window.__db.eintraege.group.ownerId), 'member');
    const sourceId = await page.evaluate(async () => {
      const m = await import('/app.js?v=17'), k = { id: 'team', ...window.__db.kreise.team }, a = k.arten.find(a => a.name === 'Beratung');
      return (await m.reserviereTermin(k, '2026-10-05', { von: 600, bis: 660, plaetze: 1, art: a }, 'member', true)).id;
    });
    await page.locator('.miniTag:not(.fremd)').filter({ hasText: /^5$/ }).click();
    await page.locator('.balken:not(.slot)', { hasText: 'Beratung' }).click();
    await visible('#dlgEintrag');
    await page.locator('#fStart').fill('11:00');
    assert.equal(await page.locator('#fEnde').inputValue(), '12:00');
    await page.locator('#formEintrag button[type=submit]').click();
    await page.waitForFunction(id => window.__db.abstimmungen?.['service_' + id], sourceId);
    assert.equal(await page.evaluate(id => window.__db.eintraege[id].start, sourceId), '10:00', 'the original time remains reserved until the customer agrees');
    await page.evaluate(async id => {
      window.__user.uid = 'member';
      try { const m = await import('/app.js?v=17'); await m.beantworteAnfrage('service_' + id, 'ja', 1); }
      finally { window.__user.uid = 'admin'; }
    }, sourceId);
    await page.waitForFunction(id => !window.__db.eintraege[id], sourceId);
    const shifted = await page.evaluate(() => {
      const pair = Object.entries(window.__db.eintraege).find(([id, e]) => e.sessionId && e.datum === '2026-10-05');
      const result = { id: pair[0], ...pair[1] };
      return { id: result.id, start: result.start, person: result.participantUid };
    });
    assert.equal(shifted.start, '11:00'); assert.equal(shifted.person, 'member');
    await page.locator('.balken:not(.slot)', { hasText: 'Beratung' }).click();
    await visible('#eintragLoeschenBtn');
    assert.equal(await page.locator('#eintragLoeschenBtn').innerText(), 'Termin löschen');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: path.join(root, 'preview/delete-booking.png'), animations: 'disabled' });
    await page.locator('#eintragLoeschenBtn').click();
    await page.waitForFunction(id => !window.__db.eintraege[id], shifted.id);
    assert.equal(await page.evaluate(() => Object.keys(window.__db.sitzungen).length), 0);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.locator('#zeitleiste button', { hasText: 'Heute' }).click();
    await page.locator('#kreiseBtn').click();
    await page.locator('.kreisKarte', { hasText: 'Team Nord' }).getByRole('button', { name: 'Einladen', exact: true }).click();
    await page.locator('#eMail').fill('kunde@example.com');
    await page.locator('#eVollzugriff').uncheck();
    await page.locator('#ePlaner').check();
    await page.locator('#eEinladen').check();
    await page.locator('#eTerminarten input').last().uncheck();
    await page.locator('#formEinladen button[type=submit]').click();
    await page.waitForFunction(() => window.__db.einladungen['team_kunde@example.com']);
    assert.equal(await page.evaluate(() => window.__db.einladungen['team_kunde@example.com'].vollzugriff), false);
    assert.equal(await page.evaluate(() => window.__db.einladungen['team_kunde@example.com'].alsPlaner), true);
    assert.equal(await page.evaluate(() => window.__db.einladungen['team_kunde@example.com'].rechte.einladen), true);
    assert.equal(await page.evaluate(() => window.__db.einladungen['team_kunde@example.com'].rechte.terminarten.length), 1);
    await page.locator('#einladenZu').click();
    await page.locator('.kreisKarte', { hasText: 'Team Nord' }).locator('.rollenWahl').selectOption('mitglied');
    await page.waitForFunction(() => !window.__db.kreise.team.planer.includes('member'));
    await page.locator('#kreiseZu').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#nav [data-v=monat]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile overflow');
    await page.screenshot({ path: path.join(root, 'preview/mobile.png'), fullPage: true, animations: 'disabled' });
    await page.locator('#kreiseBtn').click();
    await page.locator('#orbitNeuBtn').click();
    await page.locator('#kName').fill('Familie');
    await page.locator('#kreisAnlegen').click();
    await page.waitForFunction(() => Object.values(window.__db.kreise).some(k => k.name === 'Familie'));
    assert.equal(await page.locator('#dlgKreisEinst').isVisible(), false, 'open orbit has no work time or type setup');
    const familyId = await page.evaluate(async () => {
      const id = Object.keys(window.__db.kreise).find(id => window.__db.kreise[id].name === 'Familie');
      const firebase = await import('/__firebase.js');
      await firebase.updateDoc(firebase.doc({}, 'kreise', id), { mitglieder: ['admin', 'member'], info: { admin: { name: 'Rabea' }, member: { name: 'Mitarbeiter' } } });
      return id;
    });
    await page.getByRole('tab', { name: 'Familie', exact: true }).click();
    await page.locator('#neuBtn').click();
    await visible('#dlgFinden');
    await page.locator('#findenPersonen button', { hasText: 'Mitarbeiter' }).click();
    await page.locator('#findenAufgabe').click();
    await visible('#dlgEintrag');
    await page.locator('#fTitel').fill('Familienaufgabe');
    await page.locator('#fFrist').fill('2026-10-15');
    await page.locator('#formEintrag button[type=submit]').click();
    await page.waitForFunction(() => Object.values(window.__db.abstimmungen).some(r => r.daten.titel === 'Familienaufgabe'));
    assert.equal(await page.evaluate(() => Object.values(window.__db.eintraege).some(e => e.titel === 'Familienaufgabe')), false);
    const requestId = await page.evaluate(() => Object.keys(window.__db.abstimmungen).find(id => window.__db.abstimmungen[id].daten.titel === 'Familienaufgabe'));
    await page.screenshot({ path: path.join(root, 'preview/open-request.png'), fullPage: true, animations: 'disabled' });
    await page.evaluate(async id => {
      window.__user.uid = 'member';
      try { const m = await import('/app.js?v=17'); await m.beantworteAnfrage(id, 'ja', 1); }
      finally { window.__user.uid = 'admin'; }
    }, requestId);
    assert.equal(await page.evaluate(id => Object.values(window.__db.eintraege).filter(e => e.workflowId === id).length, requestId), 2);
    assert.equal(await page.evaluate(id => Object.values(window.__db.zeitsperren).some(s => s.entryId.startsWith(id)), requestId), false);
    await page.locator('#michBtn').click();
    await page.locator('#sprachwahl2 button[lang=ar]').click();
    await page.locator('#michZu').click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    await page.screenshot({ path: path.join(root, 'preview/arabic.png'), fullPage: true, animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: path.join(root, 'preview/dark.png'), fullPage: true, animations: 'disabled' });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('http://127.0.0.1:' + server.address().port + '?role=planner');
    await page.waitForSelector('#appView:not(.versteckt)');
    await page.locator('#nav [data-v=woche]').click();
    assert.equal(await page.locator('#nav [data-v=aufgaben]').isVisible(), false);
    assert.equal(await page.locator('#kontextNeu').isVisible(), true);
    await page.locator('.balken', { hasText: 'Teamtermin' }).click();
    await visible('#dlgEintrag');
    await page.locator('#fTitel').fill('Vom Mitarbeiter geplant');
    await page.locator('#formEintrag button[type=submit]').click();
    await page.waitForFunction(() => window.__db.eintraege.group.titel === 'Vom Mitarbeiter geplant');
    assert.equal(await page.evaluate(() => window.__db.eintraege.group.ownerId), 'admin');
    await page.goto('http://127.0.0.1:' + server.address().port + '?role=reader');
    await page.waitForSelector('#appView:not(.versteckt)');
    assert.equal(await page.locator('#kontextNeu').isVisible(), false);
    assert.equal(await page.locator('#neuBtn').isVisible(), false);
    await page.locator('#nav [data-v=woche]').click();
    await page.locator('.kreisWahl button', { hasText: 'Suchen' }).click();
    await visible('#dlgSuchen');
    await page.locator('#suZu').click();
    const bookingResult = await page.evaluate(async () => {
      const m = await import('/app.js?v=17');
      const firebase = await import('/__firebase.js');
      const k = { id: 'team', ...window.__db.kreise.team };
      const f = { von: 540, bis: 600, plaetze: 1, art: { ...k.arten[0], ort: 'Campus A' } };
      const results = await Promise.allSettled([m.reserviereTermin(k, '2026-10-05', f, 'member'), m.reserviereTermin(k, '2026-10-05', f, 'member')]);
      const accepted = results.filter(r => r.status === 'fulfilled');
      if (accepted.length !== 1) throw Error('Expected exactly one seat: ' + results.map(r => r.reason?.message).join(', '));
      const e = accepted[0].value;
      // Turn the fixture into a teacher-assigned appointment before cancellation.
      await firebase.updateDoc(firebase.doc({}, 'eintraege', e.id), { ownerId: 'admin', zugewiesen: ['member'] });
      await m.storniereBuchung({ ...e, ownerId: 'admin', zugewiesen: ['member'] });
      const clean = !window.__db.eintraege[e.id] && !window.__db.slots[e.slotId] && !window.__db.sitzungen[e.sessionId]
        && !Object.values(window.__db.zeitstatus).some(s => s.eintragId === e.id)
        && Object.keys(window.__db.zeitsperren).length === 0;
      await firebase.setDoc(firebase.doc({}, 'zeitstatus', 'private-provider'), { uid: 'admin', eintragId: 'private-provider', datum: '2026-10-06', von: 540, bis: 600, wiederholung: 'einmal', token: 'private' });
      await new Promise(resolve => setTimeout(resolve, 30));
      let blocked = false;
      try { await m.reserviereTermin(k, '2026-10-06', f, 'member'); } catch (error) { blocked = error.code === 'time-conflict'; }
      return { accepted: accepted.length, clean, blocked, place: e.ort };
    });
    assert.deepEqual(bookingResult, { accepted: 1, clean: true, blocked: true, place: 'Campus A' });
    const failedStart = await context.newPage();
    await failedStart.route('**/app.js*', route => route.abort());
    await failedStart.goto('http://127.0.0.1:' + server.address().port);
    await failedStart.waitForFunction(() => document.getElementById('loginFehler').textContent.includes('Internetverbindung'));
    assert.equal(await failedStart.locator('#loginBtn').isDisabled(), true);
    assert.ok((await failedStart.locator('#loginBtn').innerText()).length > 0);
    await failedStart.close();
    // Reproduce an old installed app, then open the fresh preview and verify cache recovery.
    const cachedContext = await browser.newContext({ serviceWorkers: 'allow', locale: 'de-DE' });
    try {
      await cachedContext.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await cachedContext.addInitScript(() => {
        window.__seq = 0; window.__user = null;
        window.__db = { users: {}, kreise: {}, eintraege: {}, belegt: {}, slots: {}, einladungen: {}, nachrichten: {} };
      });
      const cachedPage = await cachedContext.newPage();
      const origin = 'http://127.0.0.1:' + server.address().port;
      await cachedPage.goto(origin + '/?v=17');
      await cachedPage.waitForSelector('#sprachwahl button[lang=de]');
      await cachedPage.evaluate(async () => {
        await navigator.serviceWorker.register('/__old-worker.js');
        await navigator.serviceWorker.ready;
        const old = await caches.open('orbyx-old');
        await old.put('/', new Response('<html><body>Alte Ansicht: Ich</body></html>', { headers: { 'Content-Type': 'text/html' } }));
        await old.put('/startup.js', new Response('document.body.textContent="Alte Ansicht: Ich"', { headers: { 'Content-Type': 'text/javascript' } }));
        await caches.open('other-app');
      });
      await cachedPage.waitForFunction(() => navigator.serviceWorker.controller);
      await cachedPage.goto(origin + '/');
      assert.equal(await cachedPage.locator('body').innerText(), 'Alte Ansicht: Ich');
      await cachedPage.goto(origin + '/?v=17');
      await cachedPage.waitForSelector('#sprachwahl button[lang=de]');
      assert.equal(await cachedPage.locator('#eintragLoeschenBtn').count(), 1);
      assert.equal(await cachedPage.locator('#seiteOrbits').count(), 0);
      assert.deepEqual(await cachedPage.evaluate(() => caches.keys()), ['other-app']);
      assert.equal(await cachedPage.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
    } finally { await cachedContext.close(); }
    assert.deepEqual(errors, []);
    console.log('PASS: visible personal/booking deletion, day/week/month, tasks, series/day deletion, cancellation/failure retain data, availability cleanup, top orbit tabs, keyboard switching, orbit background colors, stale app recovery, first type uses rest time, Saturday, saving, invitations/types/rights, shared edits, reader, booking contention, assigned cancellation, cross-orbit availability, failed startup, mobile, Arabic and dark mode.');
  } finally { await context.close(); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
