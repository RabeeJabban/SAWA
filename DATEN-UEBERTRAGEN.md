# Alte Daten in das neue Firebase-Projekt übernehmen

Quelle: **sawa-82a09**. Ziel: **orbyx-8d73c**. Die Übernahme wurde am **3. Oktober 2026** vom Projektinhaber in Google Cloud Shell ausgeführt. Die von ihm übermittelten Prüfausgaben bestätigen **3 übereinstimmende Benutzerkonten** und **79 von 79 übereinstimmende Firestore-Dokumente**. Das Quellprojekt blieb unverändert. Die folgenden Schritte dokumentieren den abgeschlossenen Kopierlauf; er muss nicht erneut ausgeführt werden. Als Nächstes werden Anmeldung und Kalender in der App geprüft.

Übernommen werden die Firebase-Anmeldekonten und die Firestore-Dokumente mit ihren ursprünglichen IDs und Feldern. Dadurch bleiben Termine, Aufgaben, Orbits, Mitgliedschaften, Einladungen und Rechte den richtigen Personen zugeordnet. Die App verwendet Google-Anmeldung. Falls der Benutzerexport auch Passwortkonten enthält, stoppt die Prüfung, bis deren Hash-Konfiguration vorbereitet ist.

Die folgenden Befehle laufen einmalig in **Google Cloud Shell im Browser**. Dein Laptop hostet dabei keine App. Hosting bleibt bis zum Abschluss der Verbesserungen zurückgestellt. Die spätere manuelle Veröffentlichung beschreibt [GITHUB-ANLEITUNG.md](GITHUB-ANLEITUNG.md).

## 1. Neues Projekt vorbereiten

Öffne [orbyx-8d73c](https://console.firebase.google.com/project/orbyx-8d73c/overview). Aktiviere **Authentication → Google** und erstelle unter **Firestore Database** eine Standard-Datenbank mit der ID **(default)** im Produktionsmodus. Wähle den Datenbankstandort bewusst, möglichst entsprechend deinem bisherigen Projekt. Veröffentliche anschließend unsere `firestore.rules` im neuen Projekt.

Die erste Anmeldung in der neuen Orbyx-App erfolgt **nach** dem Benutzerimport. Das verhindert neue Benutzer-IDs vor der Übernahme.

Für diese Befehle muss dein angemeldetes Google-Konto beide Projekte verwalten dürfen. Ein Web-API-Schlüssel allein ist kein Administratorzugang. Die [Firestore-REST-Dokumentation](https://firebase.google.com/docs/firestore/use-rest-api) beschreibt den Zugriff über Google-Anmeldedaten und Projektberechtigungen.

## 2. Code in Cloud Shell bereitstellen

Öffne [Google Cloud Shell](https://console.cloud.google.com/?project=orbyx-8d73c&cloudshell=true) und bestätige bei Bedarf den Zugriff für dein Google-Konto.

Lade das aktuelle Update-ZIP über **Cloud-Shell-Menü → Upload** in dein Cloud-Shell-Home-Verzeichnis. Verwende die Version für `orbyx-8d73c`. Anschließend:

```bash
umask 077
mkdir -p "$HOME/orbyx-migration-code"
unzip "$HOME/Orbyx-GitHub-Update.zip" -d "$HOME/orbyx-migration-code"
cd "$HOME/orbyx-migration-code"
mkdir -p "$HOME/orbyx-migration-private"
```

Das Verzeichnis `orbyx-migration-private` liegt außerhalb des Codes und enthält später private Daten. Diese Sicherungen bleiben bei dir und werden nicht auf GitHub hochgeladen.

## 3. Sicherungen erstellen und Ziel prüfen

Während Sicherung und Kopie sollen Nutzer ihre Termine und Orbits im alten Projekt nicht ändern. Die Kopie wird seitenweise gelesen und ist keine atomare Momentaufnahme der gesamten Datenbank.

```bash
GOOGLE_CLOUD_QUOTA_PROJECT=sawa-82a09 firebase auth:export "$HOME/orbyx-migration-private/users-source.json" --format=json --project sawa-82a09
GOOGLE_CLOUD_QUOTA_PROJECT=orbyx-8d73c firebase auth:export "$HOME/orbyx-migration-private/users-target-before.json" --format=json --project orbyx-8d73c
node tools/check-auth-migration.cjs check "$HOME/orbyx-migration-private/users-source.json" "$HOME/orbyx-migration-private/users-target-before.json"
node tools/migrate-firestore.cjs export "$HOME/orbyx-migration-private/firestore-source.json"
node tools/migrate-firestore.cjs check "$HOME/orbyx-migration-private/firestore-source.json"
```

Führe die Befehle einzeln aus. Gehe erst weiter, wenn jeder Befehl erfolgreich endet. Falls die Firebase CLI eine Anmeldung verlangt, verwende `firebase login --no-localhost` und folge den angezeigten Schritten im Browser. Cloud Shell enthält die CLI bereits; siehe [Firebase Hosting und Cloud Shell](https://firebase.google.com/docs/hosting/quickstart).

Die vorgeschaltete Variable `GOOGLE_CLOUD_QUOTA_PROJECT` gilt jeweils nur für diesen Firebase-Befehl. Damit sendet die Firebase CLI das vorhandene Projekt als Quota-Projekt für die Auth-API; ohne diese Zuordnung kann Cloud Shell den Export mit HTTP 403 ablehnen. Das ist im [Firebase-CLI-Code für Version 15.32.0](https://github.com/firebase/firebase-tools/blob/v15.32.0/src/apiv2.ts) unterstützt. Der angemeldete Benutzer benötigt dafür `serviceusage.services.use` im jeweils angegebenen Projekt; siehe [Google: ADC und Quota-Projekte](https://docs.cloud.google.com/docs/authentication/troubleshoot-adc).

Wenn ein Benutzerexport fehlschlägt, kann seine JSON-Datei unvollständig sein. Wiederhole dann diesen Export nach der Fehlerbehebung und gehe erst nach einem erfolgreichen Lauf weiter. Eine bereits erfolgreich erstellte Firestore-Sicherung wird weiterverwendet; führe den Firestore-Export dafür nicht erneut aus.

`check` liest nur. Abweichende Benutzer oder Dokumente im neuen Projekt stoppen die Übernahme. Leere Ziele oder bereits identisch kopierte Teilmengen sind zulässig. Eine vorhandene Sicherungsdatei wird vom Firestore-Werkzeug nicht ersetzt.

Lade nach erfolgreicher Sicherung die beiden Quelldateien zusätzlich über die Download-Funktion von Cloud Shell auf deinen Rechner herunter. Es sind private Sicherungen, keine Dateien für den GitHub-Code-Upload.

## 4. Benutzerkonten mit gleichen IDs übernehmen

```bash
GOOGLE_CLOUD_QUOTA_PROJECT=orbyx-8d73c firebase auth:import "$HOME/orbyx-migration-private/users-source.json" --project orbyx-8d73c
GOOGLE_CLOUD_QUOTA_PROJECT=orbyx-8d73c firebase auth:export "$HOME/orbyx-migration-private/users-target-after.json" --format=json --project orbyx-8d73c
node tools/check-auth-migration.cjs verify "$HOME/orbyx-migration-private/users-source.json" "$HOME/orbyx-migration-private/users-target-after.json"
```

Die Prüfung verlangt gleiche Benutzer-IDs, E-Mail-Adressen, Google-Kennungen sowie den bisherigen Verifizierungs- und Sperrstatus. Firebase dokumentiert diesen Vorgang unter [Benutzer importieren und exportieren](https://firebase.google.com/docs/cli/auth).

## 5. Firestore kopieren und prüfen

```bash
node tools/migrate-firestore.cjs import "$HOME/orbyx-migration-private/firestore-source.json"
node tools/migrate-firestore.cjs verify "$HOME/orbyx-migration-private/firestore-source.json"
```

Das Werkzeug kopiert alle gefundenen Sammlungen und Unter-Sammlungen der Standard-Datenbank, einschließlich Unter-Sammlungen unter fehlenden Eltern-Dokumenten. Es erhält Dokument-IDs, Benutzer-IDs, Zeitstempel in Feldern und große Ganzzahlen. Echte Dokumentverweise ins alte Projekt werden auf das neue Projekt umgestellt. Allgemeine Textfelder werden nicht verändert.

Es löscht keine Dokumente und schreibt niemals in das alte Projekt. Vorhandene identische Zieldokumente werden übersprungen, abweichende Zieldaten stoppen die Kopie. Ein Schreibfehler stoppt den Lauf; eine identische Teilkopie lässt sich nach Behebung durch denselben Importbefehl fortsetzen. Abschließend werden alle Ziel-Dokumente erneut mit der Sicherung verglichen.

Die bisherigen technischen Erstellungs- und Änderungszeiten der Dokumenthülle werden beim Anlegen im Ziel neu vergeben. Zeitangaben, die die App in Feldern speichert, bleiben erhalten. Datenbankstandort, Regeln, Indizes, Auth-Anbietereinstellungen und Hosting-Konfiguration werden separat eingerichtet. Individuell angelegte Indizes im alten Projekt müssen bei Bedarf zusätzlich übernommen werden. Cloud-Storage-Dateien kopiert dieses Werkzeug nicht; die aktuelle App hat keine eigene Datei-Upload-Funktion.

Bestehende historische Kalenderdaten werden kopiert. Eine Bereinigung alter Überschneidungen oder eine vollständige Umstellung alter Buchungen auf neue Sperren ist eine zusätzliche Datenmigration; die in README.md dokumentierten Grenzen bleiben bestehen.

## 6. Anmeldung prüfen; Hosting später

Wenn beide Überprüfungen erfolgreich sind und die aktuelle App bereits auf GitHub Pages steht, öffne [die App](https://rabeejabban.github.io/Obryx/?v=16). Melde dich mit deinem bisherigen Google-Konto an und prüfe deine Orbits, Termine und Rechte. Prüfe zusätzlich die Buchung und die Sichtbarkeit mit einem zweiten bisherigen Mitglied. Änderungen in der Arbeitsbranch `entwicklung` werden erst nach dem Zusammenführen nach `main` auf der bisherigen Pages-Seite veröffentlicht.

Die spätere Veröffentlichung bei Firebase erfolgt nach [GITHUB-ANLEITUNG.md](GITHUB-ANLEITUNG.md). Danach verwendet die App die Firebase-Hosting-Adresse. Bis dahin wird kein Hosting-Workflow gestartet.

Im alten Projekt bleiben die Daten erhalten. Das neue Projekt übernimmt zukünftige Änderungen erst nach dem Wechsel; es findet keine laufende Synchronisierung zwischen beiden Projekten statt.

## Kontingente

Dieser Kopierweg verwendet normale Firestore-Lese- und Schreibvorgänge. Der verwaltete Export/Import, der Blaze verlangt, wird nicht verwendet. Das Werkzeug stoppt beim Export über **10.000 Dokumenten**, damit zunächst Umfang und Kontingente geplant werden können. Der gesamte Tagesverbrauch und Datentransfer müssen trotzdem in die kostenlosen Kontingente passen; ein erfolgreicher Lauf wird nicht allein durch die Anzahl von 60 Personen garantiert. Siehe [Firestore-Kontingente](https://firebase.google.com/docs/firestore/quotas).

Die automatisierten Tests für die Kopierlogik verwenden ausschließlich Beispieldaten. Der zusätzliche Lauf gegen die echten Projekte wurde vom Projektinhaber in Cloud Shell erfolgreich ausgeführt und mit den dortigen Benutzer- und Dokumentprüfungen bestätigt. Die privaten Sicherungen liegen außerhalb des Code-Verzeichnisses unter `~/orbyx-migration-private/`; sie gehören nicht auf GitHub.
