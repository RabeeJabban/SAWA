# Orbyx – lokale Version 17

Kalender- und Aufgaben-App mit Google-Anmeldung und Firebase Firestore. Unterstützt Deutsch, Arabisch, helle und dunkle Darstellung sowie Smartphone und Desktop.

Diese Überarbeitung ist lokal vorbereitet und getestet. Sie wurde hier nicht auf GitHub oder Firebase veröffentlicht. Die bisherige Veröffentlichung verwendete Version 16. Firebase-Projekt: `orbyx-8d73c`. Die bereits übertragenen 3 Benutzerkonten und 79 Dokumente werden nicht neu importiert.

## Vereinbarte Funktionen

Die vollständige Beschreibung steht in [ABGESTIMMTE-LOGIK.md](ABGESTIMMTE-LOGIK.md).

- **Mein Orbit** und erstellte Orbits stehen als obere Reiter über Tag, Woche und Monat. Der Hintergrund übernimmt die Orbit-Farbe dezent. Eigene Termine und Aufgaben haben eine sichtbare Löschaktion.
- **Offene Orbits** benötigen nur Name und Farbe. Zuerst werden Beteiligte ausgewählt, dann gemeinsame freie Zeiten gesucht. Einladungen erlauben Planung mit Verwaltern, allen oder ausgewählten Personen.
- Gemeinsame Termine und Aufgaben reservieren Zeit erst nach allen Zusagen. Details sehen nur Beteiligte. Jede Person erhält einen eigenen Eintrag und kann ihre Teilnahme entfernen, ohne die Einträge der anderen zu löschen.
- Bei Verschiebungen bleibt die alte Reservierung bis zur Zustimmung erhalten. Die eigene alte Zeit wird bei der Prüfung ausgenommen; 10–12 auf 11–13 ist möglich. Ablehnende Personen werden bei einer Verschiebung automatisch entfernt.
- **Service-Orbits** haben Arbeitszeiten und Pausen je Wochentag, farbige Terminarten, ausdrückliche Speichern-Aktionen und eine letzte Rest-Art. Die erste Rest-Art erhält die ganze verfügbare Arbeitszeit.
- Gemeinsame Sitzungen teilen einen Anbieter. Unabhängige Touren reservieren Kapazität und Kunde; eine manuell zugewiesene ausführende Person wird zusätzlich reserviert. Parallele Touren derselben Person werden verhindert.
- Kunden buchen freie Service-Plätze direkt. Vom Planer vorgeschlagene Verschiebungen benötigen die Zustimmung des Kunden. Absagen entfernen nur den betreffenden Platz.
- Neue Konten erhalten keine globalen Rechte automatisch. Der Administrator kann ohne Orbit-Mitgliedschaft zur App einladen. Orbit-Verwalter können bei Einladungen persönliche Kalender und Orbit-Erstellung freigeben; ausdrückliche Administrator-Sperren bleiben wirksam.
- Der Administrator verwaltet Konten und Orbit-Rechte. Private Inhalte bleiben geschützt; Service-Buchungen benötigen ausdrücklich die entsprechende lokale Planerrolle.

## Start und Veröffentlichung

Mit Node.js: `node tools/serve.cjs`, anschließend `http://localhost:4173/?v=17` öffnen. Die Firebase-Module werden vom Google-CDN geladen. Google-Anmeldung benötigt eine autorisierte Domain im Firebase-Projekt.

Den Inhalt von `Orbyx-GitHub-Update.zip` zunächst in die vorhandene GitHub-Branch **entwicklung** hochladen. `index.html` muss direkt im Repository liegen. Details: [GITHUB-DATEIEN.md](GITHUB-DATEIEN.md).

**Bei der Aktivierung müssen neue App-Dateien und `firestore.rules` gemeinsam aktualisiert werden.** Die neue Sammlung `abstimmungen` entsteht automatisch. Firebase Hosting bleibt für später; der vorbereitete Workflow startet ausschließlich manuell. Ein Upload auf die von GitHub Pages verwendete Branch kann dagegen die Pages-Webseite aktualisieren.

`node tools/build-hosting.cjs` erzeugt ausschließlich öffentliche App-Dateien in `public/`. Bearbeitet werden die Originaldateien. Installierte Pakete, Testlaufzeiten, Datenbanksicherungen und private Schlüssel gehören nicht ins Repository.

## Prüfungen

- `npm test`: 36 Tests für Buchung, Zusagen, Teilnehmerrechte, Restzeiten, Pausen, Cache und Migration.
- `npm run test:browser`: Oberfläche mit Beispieldaten in Microsoft Edge, darunter Löschen, obere Orbit-Reiter, mobile und arabische Darstellung, offene Anfragen und Service-Verschiebungen.
- `npm run test:rules`: 24 Szenarien mit echten Firebase-SDK-Transaktionen und mehreren Konten im lokalen Firestore-Emulator `demo-orbyx`. Prüft auch konkurrierende Buchungen, Rollback, Datenschutz, Rechteentzug, Touren und Zusagen.

Abhängigkeiten: `pnpm install --frozen-lockfile`. Für den Emulator wird Java 21 benötigt, alternativ die portable Laufzeit unter `.test-runtime/java`. Die Tests verändern keine produktiven Daten. Screenshots entstehen unter `preview/`.

## Grenzen und bestehende Daten

Historische Einträge werden erhalten und weiterhin gelesen, aber nicht automatisch in das neue Zusagemodell umgewandelt. Ältere gemeinsame Einträge lassen sich nicht über den neuen Verschiebungsablauf bearbeiten; dafür wird eine neue Anfrage erstellt. Ihre ursprünglichen Lösch- und Zuweisungsregeln bleiben bestehen.

Persönliche Serien bleiben verfügbar; gemeinsame Anfragen sind einzelne Termine. Höchstens 20 Personen pro Anfrage, zusätzlich begrenzt durch die Größe der atomaren Transaktion. Lange Termine mit vielen Beteiligten können abgelehnt werden, ohne Teilreservierungen zu schreiben. Nicht alle Kombinationen nahe diesen Grenzen wurden getestet.

Kein separater Fahrzeugkalender, keine automatische Fahrzeugzuweisung, kein E-Mail-Versand für Einladungen und keine Abrechnung. Transaktionen benötigen eine Internetverbindung. Das Sperrmodell schreibt zusätzliche Dokumente pro Person und Zeitabschnitt; die Nutzung durch 60 Personen wurde nicht als Lasttest geprüft.

## Zentrale Dateien

| Datei | Aufgabe |
| --- | --- |
| `app.js` | Kalender, Oberfläche, Konten, Service-Buchung |
| `booking.js` | Kapazität und Zeitkonflikte |
| `collaboration.js` | Anfragen, Zusagen und persönliche Kopien |
| `firestore.rules` | Serverseitige Zugriffsregeln |
| `index.html`, `ui.css`, `i18n.js` | Ansicht und Sprachen |
| `startup.js`, `sw.js` | Start und versionierter App-Cache |
| `ABGESTIMMTE-LOGIK.md` | Vereinbarte Abläufe und Grenzen |
