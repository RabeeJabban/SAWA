# Orbyx 17: vereinbarte Logik

Diese Fassung ist lokal vorbereitet. GitHub und die produktive Datenbank wurden bei dieser Umsetzung nicht verändert. App-Dateien und Firestore-Regeln müssen gemeinsam auf diese Fassung umgestellt werden.

## Persönlicher Kalender und Navigation

„Mein Orbit“ und die erstellten Orbits stehen als Reiter über dem Kalender. Tag, Woche, Monat und Filter behalten den ausgewählten Orbit bei. Die Hintergrundfarbe ist eine dezente Variante seiner Farbe; Terminarten besitzen zusätzlich eigene Farben. Private Termine und Aufgaben lassen sich löschen.

Nur tatsächlich beteiligte Personen werden als beschäftigt behandelt. Bestätigte Termine blockieren auch Buchungen in anderen Orbits. Personen ohne persönlichen Kalender haben weiterhin Reservierungen aus ihren Orbit-Terminen.

## Offener Orbit

Ein offener Orbit benötigt nur Name und Farbe. Arbeitszeiten, Pausen und Terminarten gehören zum Service-Orbit.

Bei einem neuen gemeinsamen Eintrag werden zuerst die Personen gewählt. Die Suche verwendet ihre anonymen Verfügbarkeiten und zeigt gemeinsame freie Zeiten. Aufgaben können alternativ ohne Zeitfenster und mit optionaler Frist angefragt werden. Aufgaben mit Anfang und Ende reservieren nach Bestätigung Zeit.

Eine Anfrage blockiert noch keinen Kalender. Erst alle verbleibenden Zusagen erzeugen persönliche Kopien und Reservierungen in einer gemeinsamen Datenbanktransaktion. Wird inzwischen eine Person anderweitig belegt, scheitert die Bestätigung vollständig und lässt bestehende Termine bestehen.

Bei einer ersten Anfrage bleibt eine Ablehnung sichtbar. Der Ersteller kann die ablehnende Person entfernen; die anderen Zusagen bleiben gültig. Bei einer Verschiebung führt eine Ablehnung dagegen automatisch zum Entfernen dieser Person aus demselben Termin, einschließlich ihrer alten Reservierung.

Jede Person kann nur die eigene Teilnahme entfernen. Auch das Löschen durch den Ersteller lässt die Termine der anderen bestehen. Eine Verschiebung benötigt neue Zusagen; bis dahin bleiben die bisherigen Reservierungen bestehen. Die eigene alte Reservierung wird bei der Umbuchung berücksichtigt: 10–12 Uhr kann auf 11–13 Uhr verschoben werden, wenn alle sonstigen Zeiten frei sind.

Details erhalten nur die Beteiligten. Ein Orbit-Verwalter oder App-Administrator erhält dadurch keinen allgemeinen Zugriff auf private oder gemeinsame Termindetails.

## Service-Orbit

Ein Dienstleister richtet Arbeitszeiten und Pausen je Wochentag ein. Samstag kann andere Zeiten erhalten. Terminarten besitzen Name, Dauer, Farbe und Kapazität. Feste Arten nutzen definierte Tage und Zeiten. Die Rest-Art nutzt die verbleibende Arbeitszeit nach Pausen und bereits belegten Arten. Eine erste einzelne Rest-Art erhält damit sofort die gesamte verfügbare Arbeitszeit. Ein eigener Speichern-Knopf speichert auch die letzte eingegebene Art.

Der Anbieter und ausdrücklich berechtigte Planer verwalten den professionellen Plan. Kunden buchen freie Plätze direkt verbindlich und können ihre eigene Buchung absagen. Ein vergebener letzter Platz wird nicht erneut angeboten; konkurrierende Buchungen werden durch Transaktionen und Zeitsperren entschieden.

Eine vom Planer vorgeschlagene Verschiebung braucht die Zusage des Kunden. Die bisherige Buchung bleibt bis zur erfolgreichen Umbuchung bestehen. Eine Ablehnung hebt seine Buchung auf; weitere Plätze derselben Sitzung bleiben bestehen.

Es gibt zwei Belegungsmodelle:

- **Gemeinsamer Termin:** Mehrere Teilnehmer teilen eine Sitzung; der Anbieter wird einmal reserviert, etwa für Theorieunterricht.
- **Unabhängige Touren:** Kapazität und Kunde werden reserviert. Der persönliche Kalender des Orbit-Erstellers wird erst betroffen, wenn er selbst als ausführende Person zugewiesen ist. Eine manuelle Zuweisung erfolgt im Bearbeitungsdialog der Tour. Dieselbe ausführende Person kann nicht gleichzeitig zwei Touren übernehmen.

Ein separater Kalender für Fahrzeuge und eine automatische Fahrzeugzuweisung gehören nicht zu dieser Fassung.

## Konten und Einladungen

Neue Google-Konten erhalten zunächst keinen persönlichen Kalender und kein Recht, Orbits zu erstellen. Der App-Administrator kann eine Person unabhängig von einem Orbit zur App einladen und die beiden Rechte getrennt freigeben.

Auch Orbit-Verwalter können diese Rechte bei einer Orbit-Einladung freigeben. Eine weitere eingeschränkte Einladung nimmt vorhandene globale Rechte nicht weg. Ein ausdrücklicher Rechteentzug des App-Administrators kann durch eine Orbit-Einladung nicht aufgehoben werden.

Beim Einladen werden lokale Rollen, erlaubte Service-Terminarten, Einladungsrecht und die Planungspartner festgelegt: nur Verwalter, alle Mitglieder oder ausgewählte Personen. Die Partnerbeschränkung wird für beide Seiten berücksichtigt. Ausdrücklich berechtigte Service-Planer sehen professionelle Buchungen; die globale Administratorrolle allein genügt dafür nicht.

Der App-Administrator verwaltet Konten, Sperren, Orbit-Metadaten und Rechte. Der Betreiber ist über eine verifizierte Google-Adresse festgelegt. Die spätere Bezahlphase ist nicht Bestandteil dieser Umsetzung.

## Bestehende Daten und technische Grenzen

Die bereits übertragenen Benutzer-IDs und Kalenderdaten werden nicht neu importiert, gelöscht oder automatisch in neue Anfragen umgewandelt. Historische Zuweisungen werden weiterhin gelesen. Ihr ursprüngliches Datenmodell bleibt bestehen; die neuen persönlichen Kopien und Zusageabläufe gelten für neue gemeinsame Anfragen. Alte Überschneidungen werden nicht automatisch bereinigt.

Persönliche Serien bleiben verfügbar. Gemeinsame Anfragen werden derzeit für einzelne Termine erstellt. Pro gemeinsamer Anfrage sind höchstens 20 Personen vorgesehen; lange Termine mit vielen Personen können zusätzlich an den Grenzen einer atomaren Firestore-Änderung scheitern. Die App meldet das und schreibt keine Teilreservierung. Nicht alle Kombinationen nahe diesen Grenzen wurden geprüft.

Einladungen werden in der App nach Anmeldung mit der angegebenen Google-Adresse angezeigt. Sie versenden keine E-Mail. Datenbanktransaktionen benötigen eine Verbindung; der App-Cache ersetzt keine Offline-Bestätigung.

## Prüfen und aktivieren

`npm test`, `npm run test:browser` und `npm run test:rules` prüfen die lokale Fassung. Die Browserdaten sind Testdaten, und Firebase-Tests verwenden ausschließlich `demo-orbyx` im lokalen Emulator.

Zum Speichern den Inhalt des aktualisierten ZIP-Pakets in die GitHub-Branch `entwicklung` hochladen. Erst bei der Aktivierung die neuen App-Dateien und `firestore.rules` zusammen umstellen. Die neue Sammlung `abstimmungen` wird von der App angelegt; eine manuelle Übertragung der bereits migrierten Daten ist nicht nötig.
