/* Orbyx – Service Worker
 *
 * Aufgabe: die App startet auch ohne Netz und laesst sich auf dem
 * Homescreen installieren.
 *
 * Bewusst einfach gehalten:
 *   - Eigene Dateien werden zuerst vom Server geladen. Ohne Netz
 *     springt der Cache ein, damit aktuelle Änderungen sichtbar sind.
 *   - Firebase und Google laufen NIE ueber den Cache. Termine muessen
 *     aktuell sein, und Firestore bringt seinen eigenen Zwischenspeicher
 *     mit.
 *
 * WICHTIG: Nach JEDER Aenderung an index.html, app.js oder i18n.js die
 * Zahl in VERSION erhoehen. Sonst zeigen schon installierte Handys
 * weiter die alte Fassung, egal was auf dem Server liegt.
 */

const VERSION = "orbyx-20";
const DATEIEN = [
  "./",
  "./index.html",
  "./app.js",
  "./startup.js",
  "./booking.js",
  "./collaboration.js",
  "./collaboration.js?v=20",
  "./ui.css",
  "./i18n.js",
  "./startup.js?v=20",
  "./app.js?v=20",
  "./booking.js?v=20",
  "./ui.css?v=20",
  "./i18n.js?v=20",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(DATEIEN))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(
        namen.filter((n) => n.startsWith("orbyx-") && n !== VERSION).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);

  // Nur eigene Dateien, nur normale Abrufe
  if (ev.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (!DATEIEN.some((datei) => new URL(datei, self.registration.scope).href === url.href)) return;

  const ausCache = caches.open(VERSION).then((cache) => cache.match(ev.request));
  const ausNetz = fetch(ev.request).then(async (antwort) => {
    if (antwort && antwort.status === 200) {
      const cache = await caches.open(VERSION);
      await cache.put(ev.request, antwort.clone());
    }
    return antwort;
  });
  // Die Hintergrundaktualisierung muss den Worker am Leben halten.
  ev.waitUntil(ausNetz.catch(() => {}));
  ev.respondWith(ausNetz.catch(() => ausCache).then(antwort => antwort ||
    new Response("Orbyx ist offline. Bitte erneut versuchen, sobald eine Verbindung besteht.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
    })
  ));
});

/* Die App fragt beim Tippen auf das Symbol nach, welche Fassung hier
   eingebaut ist. So steht die Zahl nur an EINER Stelle, naemlich oben. */
self.addEventListener("message", (ev) => {
  if (ev.data === "fassung" && ev.ports && ev.ports[0]) {
    ev.ports[0].postMessage({ fassung: VERSION });
  }
});
