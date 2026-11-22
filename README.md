<p align="center"><img src="src-tauri/icons/skill-logo.svg" width="96" alt="Skill"></p>

# Skill

Desktop-App, um Hobbys zu üben und zu lernen – wie ein Projekt gesteuert, nur für Fähigkeiten.
Gehört zur selben Familie wie [Slate](https://github.com/ItsDylan255/Slate) (Projekte) und
Self; gemeinsame Gestaltung siehe [DESIGN.md](DESIGN.md).

## Bereiche eines Hobbys

| Bereich | Wofür |
|---|---|
| **Übersicht** | Alles über das Hobby auf einen Blick |
| **Übungen** | Katalog einzelner Übungen in Kategorien, mit Messwerten (Tempo, Zeit, Wiederholungen) und Abschlusskriterien |
| **Songs** | Stücke mit Teilen und Ziel-Tempo je Teil |
| **Routinen** | Zusammenstellungen von Übungen, die man regelmäßig durchgeht |
| **Plan** | Je Plan ein Thema, das man lernen will, aufgeteilt in Schritte (Neu → Am Lernen → Verstanden) |
| **Merkliste** | Links, Bücher, Videos |
| **Ziele** | Langzeitziele mit Fortschritt und Deadline |
| **Phasen** | In welcher Phase man gerade steckt |

Dazu ein Übungsmodus mit Countdown/Stoppuhr und Metronom, nachgetragene Übungszeit,
Rechtsklick-Menüs und eine Befehlssuche (Strg+K).

## Starten

```bash
npm install
npm run tauri dev      # Desktop-App (Dev-Server auf Port 1430)
npm run tauri build    # Installer bauen (src-tauri/target/release/bundle)
npm test               # Tests der Domain-Logik
```

`npm run dev` startet nur die Oberfläche im Browser. Dort läuft dieselbe SQLite
als WASM und speichert im localStorage – gedacht für UI-Entwicklung. Anhänge
funktionieren nur in der Desktop-App.

Die Daten liegen unter `%APPDATA%\com.dylan.hobbymanager\hobby-manager.db`,
Anhänge im Unterordner `attachments` (Pfad stammt noch vom früheren Namen „Hobby Manager“).

## Aufbau

| Ordner | Inhalt |
|---|---|
| `src/db` | Schema-Migrationen, DB-Client (Tauri-SQL oder sql.js), Repository, Beispieldaten |
| `src/domain` | Reine Logik: Messwerte, Abschlusskriterien, Ziel-Fortschritt, Serien, Plan (mit Tests) |
| `src/lib` | Store (Neuladen nach Änderungen), Sounds & Metronom, Theme, Plattform-Funktionen, UI-Zustand |
| `src/components` | UI-Bausteine, Layout, Fenster, Rechtsklick-Menüs, Befehlssuche |
| `src/pages` | Übersicht, Übungen, Songs, Routinen, Plan, Merkliste, Ziele, Phasen, Übungsmodus |
| `src-tauri` | Rust-Hülle: SQL-, Dialog- und Opener-Plugin, Befehle für Anhänge |

Fortschritt wird nie gespeichert, sondern immer aus den Einträgen berechnet.
Schemaänderungen kommen als neuer Eintrag in `src/db/migrations.ts`.
