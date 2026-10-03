# Jetzt: Code auf GitHub, Hosting später

Dein Repository bleibt vorerst öffentlich. GitHub speichert die App-Dateien und ihre Änderungen. Termine, Aufgaben, Mitglieder und Benutzerkonten bleiben in Firebase. Der vorbereitete Firebase-Workflow startet ausschließlich manuell; ein Code-Upload veröffentlicht damit keine neue Firebase-Webseite.

## So liegen die Dateien

```text
Obryx/                         ← Wurzel des GitHub-Repositorys
├── index.html                 ← Startseite
├── ui.css                     ← Gestaltung
├── app.js                     ← App und Firebase-Anbindung
├── booking.js                 ← Terminbuchung
├── collaboration.js           ← Gemeinsame Anfragen und Zusagen
├── i18n.js                    ← Sprachen
├── startup.js                 ← Start der App
├── sw.js                      ← App-Cache
├── manifest.webmanifest       ← Installation als App
├── icons/                     ← Symbole
├── tools/                     ← Entwicklungswerkzeuge
├── tests/                     ← Prüfungen
├── .github/workflows/         ← Manuelle Veröffentlichung für später
├── .gitignore
├── firebase.json
├── firestore.rules            ← Zugriffsregeln, keine Kalenderdaten
├── package.json
├── pnpm-lock.yaml
├── README.md
├── ABGESTIMMTE-LOGIK.md        ← Vereinbarte Abläufe
└── weitere .md-Dateien        ← Anleitungen
```

`index.html` liegt direkt im Repository. Beim Upload darf kein zusätzlicher äußerer Ordner wie `github-upload/` entstehen.

## Hochladen ohne die bisherige Webseite zu aktualisieren

1. Stoppe zuerst die Builds in Netlify, falls das alte Projekt noch mit GitHub verbunden ist: **Project configuration → Developer settings → Continuous deployment → Build settings → Configure → Build status: Stopped builds**. Laut [Netlify-Anleitung](https://docs.netlify.com/build/configure-builds/stop-or-activate-builds/) verhindert das auch Builds anderer Branches und Vorschau-Builds.
2. Entpacke `Orbyx-GitHub-Update.zip` mit **Alle extrahieren**. Alternativ verwende den vorbereiteten Ordner `github-upload` in deinem App-Ordner.
3. Öffne [RabeeJabban/Obryx](https://github.com/RabeeJabban/Obryx). Über der Dateiliste wählst du **Add file → Upload files**.
4. Ziehe den **gesamten Inhalt** des entpackten Ordners hinein, einschließlich `.github`, `.gitignore`, `icons`, `tools` und `tests`.
5. Commit-Nachricht: `Aktuellen Orbyx-Code speichern`. Wähle **Create a new branch**, Name: `entwicklung`, und **Propose changes**. Die Änderungen bleiben zunächst in dieser Arbeitsversion. Einen angebotenen Pull Request musst du jetzt nicht zusammenführen.
6. Für weitere Updates wähle oben in GitHub die Branch **entwicklung** und lade die geänderten Dateien dort hoch.

GitHub beschreibt diese Felder in der [Upload-Anleitung](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository). Die bisherige Branch `main` bleibt so unverändert. Wähle `entwicklung` nicht als neue Quelle in GitHub Pages; [Pages veröffentlicht Änderungen seiner ausgewählten Quellbranch](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

Das Paket enthält keine installierten Pakete, Vorschauen, Testlaufzeiten, Datenbanksicherungen oder privaten Dienstkonto-Schlüssel. Diese Dateien gehören nicht ins öffentliche Repository. `public/` wird erst für Firebase Hosting erzeugt und muss ebenfalls nicht hochgeladen werden. Die Firebase-Webkonfiguration in `app.js` gehört zum App-Code; der Zugriff auf Daten wird durch Authentication und Firestore-Regeln geregelt.

## Erst am Ende

Wenn die App fertig ist, führen wir die Änderungen nach `main` zusammen und richten das Hosting ein. Die Browser-Anleitung dafür steht in [GITHUB-ANLEITUNG.md](GITHUB-ANLEITUNG.md). Für das Speichern des Codes brauchst du jetzt keinen Hosting-Zugang und keinen lokalen Webserver.

Version 17 enthält auch collaboration.js. Bei der späteren Aktivierung die neuen App-Dateien und firestore.rules gemeinsam aktualisieren. Die neue Sammlung abstimmungen entsteht automatisch.
