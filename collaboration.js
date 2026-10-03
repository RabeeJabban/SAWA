import { lockKeys, BookingError } from './booking.js?v=20';

export function participantsFor(circle, uid) {
  const rule = circle.rechte?.[uid] || {};
  if (rule.planenMit === 'verwalter') return circle.verwalter || [];
  if (rule.planenMit === 'auswahl') return rule.personen || [];
  return circle.mitglieder || [];
}

export function canMeet(circle, people) {
  return people.every(uid => people.every(other => uid === other || participantsFor(circle, uid).includes(other)));
}

export function proposal(data, people, actor, revision = 1) {
  const teilnehmer = [...new Set(people)];
  if (!teilnehmer.includes(actor) || teilnehmer.length > 20) throw new BookingError('permission-denied');
  const timed = !!data.start && !!data.ende;
  if (timed && data.ende <= data.start) throw new BookingError('invalid-time');
  return { daten: data, teilnehmer, zusagen: { [actor]: 'ja' }, revision, phase: 'pending' };
}

export function vote(request, actor, answer, revision) {
  if (revision !== request.revision) throw new BookingError('changed-request');
  if (!request.teilnehmer.includes(actor) || !['ja', 'nein'].includes(answer)) throw new BookingError('permission-denied');
  // Preserve Firestore Timestamp values; structuredClone would turn them into maps.
  const next = { ...request, teilnehmer: [...request.teilnehmer], zusagen: { ...request.zusagen } };
  next.zusagen[actor] = answer;
  // A rejection of a shift withdraws this participant from the original appointment too.
  if (answer === 'nein' && request.basis) {
    next.teilnehmer = next.teilnehmer.filter(uid => uid !== actor);
    delete next.zusagen[actor];
  }
  next.phase = next.teilnehmer.length && next.teilnehmer.every(uid => next.zusagen[uid] === 'ja') ? 'ready' : 'pending';
  return next;
}

export function personalCopy(id, request, uid) {
  const data = request.daten;
  const minutes = value => { const [hour, minute] = (value || '0:0').split(':').map(Number); return hour * 60 + minute; };
  return { ...data, ownerId: uid, workflowId: id, erstellerId: request.erstellerId,
    von: minutes(data.start), bis: minutes(data.ende),
    kreisIds: [request.kreisId], zugewiesen: [], zusagen: {}, teilnehmer: [uid], sichtbarFuer: [uid],
    status: data.typ === 'task' ? 'offen' : '', wiederholung: 'einmal',
    sperrenVersion: data.start && data.ende ? 1 : 0, zeitStatusVersion: data.start && data.ende ? 1 : 0 };
}

export function copyId(id, uid) { return `${id}_${uid}`; }

// The final voter commits copies and reservations together. Conflicting lock writes
// are rejected by Firestore, so a failed confirmation never releases the old time.
export function collaboration(ctx) {
  const { db, doc, collection, runTransaction, onSnapshot, query, where, setDoc, serverTimestamp } = ctx;
  const current = () => ctx.user().uid;
  let unsubscribe = null;
  const ref = id => doc(db, 'abstimmungen', id);
  function stop() { unsubscribe?.(); unsubscribe = null; }
  function start(callback) {
    stop();
    unsubscribe = onSnapshot(query(collection(db, 'abstimmungen'), where('teilnehmer', 'array-contains', current())),
      snapshot => callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))), ctx.error);
  }
  function removeCopy(tx, id, request, uid) {
    const entryId = copyId(id, uid), data = personalCopy(id, { ...request, daten: request.basis || request.daten }, uid);
    ctx.removeLocks(tx, entryId, data);
    ctx.removeStatus(tx, entryId, data);
    tx.delete(doc(db, 'eintraege', entryId));
    tx.delete(doc(db, 'belegt', entryId));
  }
  function confirm(tx, id, request) {
    const writes = new Set();
    for (const uid of request.teilnehmer) {
      for (const data of [request.basis, request.daten].filter(Boolean)) {
        if (data.start && data.ende) lockKeys(uid, data.datum, ctx.minutes(data.start), ctx.minutes(data.ende)).forEach(key => writes.add(key));
      }
    }
    if (writes.size + request.teilnehmer.length * 5 > 470) throw new BookingError('too-many-locks');
    for (const uid of request.teilnehmer) {
      const entryId = copyId(id, uid), data = personalCopy(id, request, uid);
      if (request.basis) removeCopy(tx, id, request, uid);
      tx.set(doc(db, 'eintraege', entryId), data);
      ctx.writeLocks(tx, entryId, data);
      ctx.writeStatus(tx, entryId, data);
      tx.set(doc(db, 'belegt', entryId), { ownerId: uid, typ: data.typ, datum: data.datum,
        start: data.start || '', ende: data.ende || '', wiederholung: 'einmal', teilnehmer: [uid], sichtbarFuer: request.leser });
    }
    tx.set(ref(id), { ...request, phase: 'confirmed', basis: request.daten });
  }
  async function create(circle, data, people) {
    if (!canMeet(circle, people)) throw new BookingError('permission-denied');
    const target = doc(collection(db, 'abstimmungen'));
    const draft = { ...proposal(data, people, current()), erstellerId: current(), kreisId: circle.id,
      basis: null, kind: 'open', leser: circle.mitglieder, erstelltAm: serverTimestamp() };
    await setDoc(target, draft);
    await ctx.notify(draft, target.id, 'Neue Terminanfrage');
    return target.id;
  }
  async function shift(id, data) {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref(id));
      if (!snap.exists()) throw new BookingError('missing-booking');
      const old = snap.data();
      if (!old.teilnehmer.includes(current())) throw new BookingError('permission-denied');
      tx.set(ref(id), { ...old, ...proposal(data, old.teilnehmer, current(), old.revision + 1) });
    });
  }
  async function respond(id, answer, revision) {
    let result;
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref(id));
      if (!snap.exists()) throw new BookingError('missing-booking');
      const old = snap.data(), next = vote(old, current(), answer, revision);
      if (old.kind === 'service') {
        if (answer === 'nein') {
          const entry = await tx.get(doc(db, 'eintraege', old.entryId));
          const session = entry.exists() ? await tx.get(doc(db, 'sitzungen', entry.data().sessionId)) : null;
          if (entry.exists()) ctx.releaseService(tx, { id: entry.id, ...entry.data() }, session?.data(), false);
          next.phase = 'rejected';
        }
        tx.set(ref(id), next);
      } else {
        if (answer === 'nein' && old.basis) removeCopy(tx, id, old, current());
        if (next.phase === 'ready') confirm(tx, id, next); else tx.set(ref(id), next);
      }
      result = next;
    });
    if (result.kind === 'service' && result.phase === 'ready') await ctx.confirmService(id, result);
    await ctx.notify(result, id, answer === 'ja' ? 'Zusage' : 'Absage');
  }
  async function removeDeclined(id, uid) {
    await runTransaction(db, async tx => {
      const snapshot = await tx.get(ref(id)), old = snapshot.data();
      if (old.erstellerId !== current() || old.basis || old.zusagen[uid] !== 'nein') throw new BookingError('permission-denied');
      const next = { ...old, entfernterUid: uid, teilnehmer: old.teilnehmer.filter(person => person !== uid), zusagen: { ...old.zusagen } };
      delete next.zusagen[uid];
      if (next.teilnehmer.every(person => next.zusagen[person] === 'ja')) confirm(tx, id, next);
      else tx.set(ref(id), next);
    });
  }
  async function withdraw(id) {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref(id));
      if (!snap.exists()) return;
      const old = snap.data(), next = { ...old, teilnehmer: old.teilnehmer.filter(uid => uid !== current()), zusagen: { ...old.zusagen } };
      if (!old.teilnehmer.includes(current())) throw new BookingError('permission-denied');
      delete next.zusagen[current()];
      if (!next.teilnehmer.length) next.phase = 'cancelled';
      if (old.basis) removeCopy(tx, id, old, current());
      tx.set(ref(id), next);
    });
  }
  async function service(entry, data) {
    data = { ...data, executorUid: entry.executorUid || '' };
    const id = `service_${entry.id}`;
    let next;
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref(id));
      const revision = snap.exists() ? snap.data().revision + 1 : 1;
      next = { ...proposal(data, [current(), entry.participantUid], current(), revision),
        erstellerId: current(), kreisId: entry.kreisIds[0], kind: 'service', entryId: entry.id,
        basis: { datum: entry.datum, start: entry.start, ende: entry.ende }, leser: [] };
      tx.set(ref(id), next);
    });
    await ctx.notify(next, id, 'Verschiebung angefragt');
    if (next.teilnehmer.length === 1) await respond(id, 'ja', next.revision);
  }
  return { start, stop, create, shift, respond, withdraw, removeDeclined, service };
}
