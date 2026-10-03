// Keep the sign-in screen readable even if the remote Firebase modules fail.
import { t, setzeSprache, holeSprache, spracheRaten, istRTL } from './i18n.js?v=17';
let gespeichert = '';
try { gespeichert = localStorage.getItem('orbyx.sprache') || ''; } catch {}
setzeSprache(gespeichert || spracheRaten());
document.documentElement.lang = holeSprache();
document.documentElement.dir = istRTL() ? 'rtl' : 'ltr';
document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
// Local development should always show the current files without an old app cache.
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  try {
    const scope = new URL('./', location.href).href;
    const registrations = await navigator.serviceWorker?.getRegistrations() || [];
    await Promise.all(registrations.filter(r => r.scope === scope).map(r => r.unregister()));
    const names = await window.caches?.keys() || [];
    await Promise.all(names.filter(name => name.startsWith('orbyx-')).map(name => caches.delete(name)));
  } catch (error) { console.warn('Lokale Vorschau aktualisieren:', error); }
}
try { await import('./app.js?v=17'); }
catch (error) {
  document.getElementById('loginFehler').textContent = t('startFehler');
  document.getElementById('loginBtn').disabled = true;
  console.error('Orbyx starten:', error);
}
