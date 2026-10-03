# Für später: Orbyx über GitHub und Firebase veröffentlichen

**Firebase Hosting folgt erst nach den weiteren Verbesserungen.** Die aktuelle App ist bereits auf GitHub Pages erreichbar. Für Code-Änderungen gilt [GITHUB-DATEIEN.md](GITHUB-DATEIEN.md); das Repository bleibt öffentlich und die Arbeitsbranch heißt `entwicklung`. Die folgenden Schritte werden erst für die Veröffentlichung bei Firebase ausgeführt.

Die spätere Veröffentlichung benötigt keinen lokalen Webserver und kein Terminal auf deinem Laptop. GitHub Actions veröffentlicht die App bei Firebase, wenn du den Workflow manuell startest. Für die einmalige Übernahme der alten Daten gibt es eine separate Anleitung mit Google Cloud Shell im Browser. Der Laptop muss für den laufenden App-Betrieb nicht eingeschaltet bleiben.

Am 3. Oktober 2026 wurde geprüft: [RabeeJabban/Obryx](https://github.com/RabeeJabban/Obryx) ist öffentlich; `main` und `entwicklung` enthalten den hochgeladenen App-Code. Die [aktuelle Webseite](https://rabeejabban.github.io/Obryx/?v=16) liefert Version `orbyx-16` mit der Konfiguration für `orbyx-8d73c`. Der lokal vorbereitete Firebase-Workflow wurde beim Browser-Upload noch nicht auf GitHub übernommen. Für die späteren Schritte muss auch `.github/workflows/firebase-hosting.yml` hochgeladen werden.

## Vor der Veröffentlichung: neues Projekt und alte Daten

Prüfe im neuen Projekt, dass **Authentication → Google** aktiviert und die **Firestore-Standard-Datenbank (default)** eingerichtet ist. Eine bereits vorhandene Datenbank wird weiterverwendet.

Wenn du deine alten Daten übernehmen möchtest, führe **zuerst** [DATEN-UEBERTRAGEN.md](DATEN-UEBERTRAGEN.md) mit dem aktuellen ZIP aus. Die Sicherung und Kopie laufen einmalig in Google Cloud Shell im Browser. Die erste Anmeldung in der neuen Orbyx-App erfolgt nach dem Benutzerimport. Danach setzt du die Veröffentlichung mit den folgenden Schritten fort.

## 1. Zugang für die Veröffentlichung anlegen

Öffne [Google Cloud → Dienstkonten für orbyx-8d73c](https://console.cloud.google.com/iam-admin/serviceaccounts?project=orbyx-8d73c) mit deinem Projektinhaber-Konto.

1. Klicke **Dienstkonto erstellen / Create service account**.
2. Name: `orbyx-github`. Klicke **Erstellen und fortfahren**.
3. Gib diesem Dienstkonto diese Projektrollen; mit **Weitere Rolle hinzufügen** kannst du mehrere auswählen:

| Rolle | Technische Kennung |
| --- | --- |
| Firebase Hosting Admin | `roles/firebasehosting.admin` |
| API Keys Viewer | `roles/serviceusage.apiKeysViewer` |
| Service Usage Consumer | `roles/serviceusage.serviceUsageConsumer` |

4. Beende die Erstellung. Zusätzliche Personen im letzten Schritt sind nicht erforderlich.
5. Öffne das neue Dienstkonto, dann **Schlüssel → Schlüssel hinzufügen → Neuen Schlüssel erstellen → JSON → Erstellen**.

Die JSON-Datei wird heruntergeladen. Sie ist der Zugang für GitHub zur Veröffentlichung und gehört ausschließlich in das GitHub-Secret aus Schritt 2. Lade sie nicht als normale Datei in das Repository und sende sie nicht im Chat.

Die [offizielle Anleitung der Firebase-Hosting-Action](https://github.com/FirebaseExtended/action-hosting-deploy/blob/main/docs/service-account.md) beschreibt diesen Zugang. Wir veröffentlichen nur die Live-Seite, ohne Vorschaukanäle oder Cloud-Run-Anbindung.

## 2. Den Zugang als GitHub-Secret speichern

Öffne [Repository → Settings → Secrets and variables → Actions](https://github.com/RabeeJabban/Obryx/settings/secrets/actions).

1. Klicke **New repository secret**.
2. Name: `FIREBASE_SERVICE_ACCOUNT_ORBYX_8D73C`.
3. Öffne die heruntergeladene JSON-Datei mit dem Texteditor und kopiere ihren vollständigen Inhalt in **Secret**.
4. Klicke **Add secret**.

GitHub speichert den Zugang getrennt vom Quellcode. Die [GitHub-Anleitung für Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets) beschreibt diese Felder.

## 3. Die passenden Datenbankregeln veröffentlichen

Öffne [Firebase → Firestore → Regeln](https://console.firebase.google.com/project/orbyx-8d73c/firestore/rules).

Öffne `firestore.rules` aus dem aktuellen App-Ordner oder dem Update-Paket mit einem Texteditor. Kopiere den vollständigen Inhalt in den Regel-Editor der Firebase-Konsole und klicke **Veröffentlichen / Publish**. Diese Regeln wurden mit den neuen Buchungen und Rechten lokal geprüft. Neue App und neue Regeln gehören zusammen.

Gespeicherte Termine bleiben in Firestore; diese Aktion aktualisiert die Zugriffsregeln. Die [Firebase-Anleitung zu Regeln](https://firebase.google.com/docs/firestore/security/get-started) beschreibt das Veröffentlichen im Browser. Führe Schritt 4 anschließend direkt aus.

## 4. Den aktuellen Code auf GitHub hochladen

Das vorbereitete Paket heißt `Orbyx-GitHub-Update.zip`. Es enthält App, Symbole, Konfiguration, Tests und den Veröffentlichungsworkflow. Es enthält keine Zugangsschlüssel, Datenbankexporte, installierten Pakete oder Testlaufzeiten.

1. Entpacke die ZIP-Datei mit **Alle extrahieren**. Alternativ verwende den bereits vorbereiteten Ordner `C:\Users\rabia\Downloads\Orbyx\github-upload`.
2. Öffne [GitHub → Dateien hochladen](https://github.com/RabeeJabban/Obryx/upload/main).
3. Ziehe den **Inhalt** des Update-Ordners in das Upload-Feld: die Dateien und Unterordner einschließlich `.github`, `icons`, `tools` und `tests`. Ziehe nicht den äußeren Update-Ordner hinein. `index.html` muss direkt in der Wurzel des Repositorys liegen.
4. Kontrolliere, dass unter anderem `ui.css`, `startup.js`, `booking.js`, `firebase.json` und `.github/workflows/firebase-hosting.yml` hinzugefügt werden.
5. Schreibe als Commit-Nachricht: `Orbyx Version 17 und Firebase-Veröffentlichung`.
6. Speichere die fertigen Änderungen auf `main` mit **Commit changes**. Wenn der Code bereits in `entwicklung` liegt, führe stattdessen diese Branch per Pull Request nach `main` zusammen. Dieser Schritt gehört zur späteren Veröffentlichung, nicht zum jetzigen Speichern des Codes.

GitHub beschreibt den Upload unter [Dateien zu einem Repository hinzufügen](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository).

## 5. Veröffentlichung prüfen

Öffne [GitHub → Actions](https://github.com/RabeeJabban/Obryx/actions). Der Workflow **Orbyx auf Firebase veröffentlichen** startet ausschließlich manuell. Wähle **Run workflow → main → Run workflow**, wenn du die fertige App veröffentlichen möchtest. Er prüft die Buchungslogik, bereitet die App-Dateien vor und veröffentlicht sie auf Firebase Hosting.

Warte, bis der Lauf grün ist. Danach öffne [https://orbyx-8d73c.web.app/?v=17](https://orbyx-8d73c.web.app/?v=17).

Spätere Code-Uploads veröffentlichen keine neue Webseite. Für ein Update startest du denselben Workflow erneut, sobald die Änderungen fertig sind.

Prüfe in [Firebase Authentication](https://console.firebase.google.com/project/orbyx-8d73c/authentication/settings) unter **Einstellungen → Autorisierte Domains**, dass `orbyx-8d73c.web.app` und `orbyx-8d73c.firebaseapp.com` zugelassen sind. Ergänze fehlende Hostnamen ohne `https://`. Google muss unter **Anmeldemethode** aktiviert sein.

Teste Anmeldung, Anlegen und Löschen eines Termins sowie eine Einladung und eine Buchung mit einem zweiten Konto. Wenn noch eine alte Ansicht erscheint, lade mit **Strg + F5** neu.

Der Workflow veröffentlicht Hosting. Bei späteren Änderungen an `firestore.rules` wiederholst du Schritt 3 zusätzlich. Die Datenbank und Anmeldung verwenden dein neues Projekt `orbyx-8d73c`.

## 6. Optional später: das GitHub-Repository privat machen

Aktuell bleibt das Repository auf deinen Wunsch öffentlich. Falls du es später privat machen möchtest, öffne nach erfolgreicher Firebase-Veröffentlichung [Repository → Settings → General](https://github.com/RabeeJabban/Obryx/settings). Unten unter **Danger Zone → Change repository visibility** kannst du auf **Private** umstellen.

Teile anschließend den Firebase-Link mit deinen Nutzern. Bei GitHub Free setzt GitHub Pages ein öffentliches Repository voraus; der bisherige `github.io/Obryx`-Link ist deshalb bei einem privaten Repository unter diesem Tarif nicht mehr die Veröffentlichungsadresse. Siehe [GitHub Pages und verfügbare Tarife](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

GitHub Actions kann weiterhin aus dem privaten Repository zu Firebase veröffentlichen. Siehe [Firebase-GitHub-Anbindung](https://firebase.google.com/docs/hosting/github-integration).

Verwende für Firebase den kostenlosen Spark-Tarif und klassisches **Hosting**. Die kostenlose Nutzung hängt von den Kontingenten und tatsächlichen Zugriffen ab; 60 Konten allein garantieren nicht, dass der Verbrauch innerhalb der Grenzen bleibt. Siehe [Firebase-Tarife](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

