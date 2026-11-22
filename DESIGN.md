# Design – Slate & Skill

Slate (Projekte) und Skill (Hobbys) sollen sich anfühlen wie zwei Apps aus einer Familie:
**gleich ist, was man anfasst – unterschiedlich ist, was drinsteht.** Diese Datei liegt in beiden
Projekten mit demselben Inhalt. Wer an einer App etwas am Aussehen oder an der Bedienung ändert,
ändert die andere mit oder trägt die Abweichung hier ein.

Slate ist die Vorlage. Neue Bausteine entstehen zuerst so, wie Slate sie hat.

---

## 1. Fundament – in beiden Apps gleich

### Design-Werte

Gleiche Werte, teils andere Namen. Definiert in `src/index.css`.

| Bedeutung | Slate | Skill | Hell | Dunkel |
|---|---|---|---|---|
| Fensterhintergrund (Seitenleiste) | `sidebar` | `panel` | `#fafafa` | `#111111` |
| Seitenhintergrund | `background` | `bg` | `#ffffff` | `#141414` |
| Karten, Fenster, Menüs | `card` / `popover` | `card` | `#ffffff` | `#191919` |
| Text | `foreground` | `fg` | `#262626` | `#f5f5f5` |
| Nebentext | `muted-foreground` | `muted` | `#686868` | `#818181` |
| Text in der Seitenleiste | `sidebar-foreground` | `sidebar-fg` | `#727272` | `#a3a3a3` |
| Hover / leichte Fläche | `accent` / `muted` | `elev` | schwarz 4 % | weiß 4 % |
| Rahmen | `border` | `line` | schwarz 8 % | weiß 6 % |
| Rahmen von Eingabefeldern | `input` | `input` | schwarz 10 % | weiß 8 % |
| Fokus-Ring | `ring` | `ring` | `#a3a3a3` | `#737373` |
| Hauptknopf | `primary` | `primary` | `#262626` | `#f5f5f5` |
| Löschen-Text | `destructive-foreground` | `bad-fg` | `#b91c1c` | `#f87171` |
| Erfolg | `success` | `ok` | `#10b981` | `#34d399` (HM) |
| Symbol-Knöpfe | `chip-icon` | `icon` | `#8a8a8a` | `#8a8a8a` |
| Etiketten-Rahmen / -Text | `chip-border` / `chip-foreground` | `chip-border` / `chip-fg` | | |
| Karten im Raster | `board-card*` | `tile*` | | dunkel: ohne Rahmen, mit Schatten |

Achtung: `muted` bedeutet in Slate eine **Fläche**, im Skill den **Nebentext**.

- **Akzentfarbe:** Slate bleibt neutral. Im Skill ist `accent` die Farbe des Hobbys – nur als
  kleiner Hinweis (Stand „Am Lernen“, Fortschritt), nie als große Fläche.
- **Schrift:** Geist / Geist Mono, Grundgröße 14 px. Überschriften halbfett, leicht enger.
- **Rundungen:** `--radius: 0.625rem` → sm 6 px, md 8 px, lg 10 px, xl 14 px.
  Knöpfe, Felder und Menüs `rounded-lg`, Menüeinträge `rounded-md`, Karten `rounded-xl`, Fenster `rounded-2xl`.
- **Schatten:** Felder `shadow-xs/5`, Menüs `shadow-lg/10`, Fenster `shadow-2xl/10`.
- **Hell/Dunkel:** über die Klasse `dark` auf `<html>`.

### Bausteine

| Baustein | Aussehen |
|---|---|
| Knopf | h-8, `rounded-lg`, Symbole leicht durchsichtig, drückt beim Klicken auf 97 %. Arten: Haupt (dunkel gefüllt), Umriss, Unauffällig (nur Hover-Fläche, normale Textfarbe), Löschen (roter Text) |
| Symbol-Knopf | 28 × 28, grau, beim Hover Fläche + heller Text |
| Eingabefeld | h-8, Rahmen `input`, beim Fokus Rahmen `ring` + 3 px Ring. Im Dunkelmodus etwas dunkler als Karten |
| Feld ohne Rahmen | in der Eigenschaften-Spalte: erst beim Hover sichtbar, h-7 |
| Auswahlfeld | eigenes Menü statt System-Dropdown, Auf-/Ab-Symbol rechts, aktive Wahl mit Haken |
| Datumsauswahl | eigener Kalender, Woche ab Montag, heute grau hinterlegt, gewählt dunkel gefüllt. Unten Schnellwahl: Heute, Morgen, Nächste Woche, Entfernen. ✕ im Feld beim Hover |
| Menü (Popover) | `rounded-lg`, 1 px Rahmen, `p-1`, Einträge mit Symbol links, Trennlinie `elev`. Öffnet unter dem Knopf oder an der Maus, klappt nach oben, wenn unten kein Platz ist |
| Etikett (Chip) | h-5.5, Schrift xs, Rahmen `chip-border`, optional farbiger Punkt |
| Filter-Chip | h-7 in der Werkzeugleiste, aktiv mit Fläche und stärkerem Rahmen |
| Umschalter (Segmented) | h-7 Leiste mit h-6 Einträgen, aktiver Eintrag mit Fläche und Schatten |
| Fenster | oben bei 10 % Höhe, Abdunklung 32 %, Kopfzeile mit Pfad/Titel, Aktionen und ✕ rechts |

### Bedienung

- **Esc** schließt das oberste Menü oder Fenster – immer nur eins.
- **Klick daneben** schließt Menüs und Fenster.
- **Klick auf eine Zeile oder Karte** öffnet sie. Kleine Knöpfe in der Zeile (Haken, Stand) handeln direkt, ohne zu öffnen.
- **Rechtsklick** auf jedes Element einer Liste öffnet sein Menü: zuerst „Öffnen“ und die Hauptaktion, dann Bearbeiten, zuletzt rot „Löschen“.
  Das Browser-Menü (Neu laden, Untersuchen) erscheint nie. In Textfeldern bleibt Kopieren/Einfügen.
- **Strg+K** öffnet die Befehlssuche: ohne Eingabe Aktionen und Ziele zum Hinspringen, mit Eingabe gefundene Einträge zuerst.
- **Ziehen** startet erst nach ein paar Pixeln Bewegung, nie nach Zeit (Gedrückthalten funktioniert im App-Fenster nicht zuverlässig).
  Während des Ziehens zeigt der Mauszeiger überall die greifende Hand. Der Klick am Ende des Ziehens öffnet nichts.
- **Löschen** fragt immer nach.
- **Text** lässt sich nur in Feldern markieren (App, kein Dokument).
- **Speichern** passiert automatisch beim Verlassen eines Feldes. Es gibt keinen Speichern-Knopf.
- **Neu anlegen** öffnet das Fenster des neuen Elements. Ohne Namen geschlossen, wird es verworfen. „Weitere erstellen“ hält das Fenster für das nächste offen.
- **Keine Hilfetexte** in der Oberfläche. Beschriftungen kurz, Erklärungen nur als Tooltip, wenn nötig.

### Tastenkürzel

| Kürzel | Aktion | Slate | Skill |
|---|---|---|---|
| Strg+K | Befehlssuche | ✓ | ✓ |
| Esc | Schließen | ✓ | ✓ |
| Strg+, | Einstellungen | ✓ | ✓ |
| Strg+B | Seitenleiste ein/aus | ✓ | ✓ |
| Strg+D | Hell/Dunkel | ✓ | ✓ |
| N | Neues Element im aktuellen Bereich | ✓ (Aufgabe) | ✓ (Übung, Song, Routine, Plan, Thema, Eintrag) |
| / | Suchfeld der Werkzeugleiste | ✓ | ✓ |
| ? | Liste der Tastenkürzel | ✓ | ✓ |

---

## 2. Gleiches Muster, anderer Inhalt

| Muster | Slate | Skill |
|---|---|---|
| Seitenleiste | Projekte | Hobbys |
| Kopfzeile | Pfad + Umschalter der Ansichten | Pfad + Umschalter der Bereiche (Reihenfolge per Ziehen) |
| Werkzeugleiste (h-11) | Suche, Filter-Chips | Suche, Filter-Chips, Gruppieren |
| Tabelle | Aufgaben, Spaltenköpfe sortieren per Klick | Übungen, Themen, Merkliste; Plan-Tabelle: Klick auf Spaltenkopf auf → ab → eigene Reihenfolge |
| Karten-Raster | Board-Karten | Plan-Karten (ohne Status-Spalten) |
| Detail-Fenster | Aufgabe: links Titel, Beschreibung, Unteraufgaben; rechts Eigenschaften | Übung / Thema / Eintrag: gleicher Aufbau |
| Rechtsklick-Menü | Aufgabe | Übung, Song, Routine, Plan, Thema, Eintrag, Hobby |

---

## 3. Nur in einer App

- **Slate:** Board mit Status-Spalten, Backlog, Kalender, Gantt, Prioritäten, Fälligkeiten, Mehrfachauswahl, Archiv.
- **Skill:** Übungsmodus mit Timer und Metronom, Messwerte und Fortschritt, Lern-Stand von Themen
  (Neu / Am Lernen / Verstanden), Serien, Routinen, Ziele, Phasen.

Diese Teile dürfen eigen aussehen, bauen aber auf den Bausteinen aus Abschnitt 1 auf.
