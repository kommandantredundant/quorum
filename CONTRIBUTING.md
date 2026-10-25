# Beitragen zu Quorum

Danke für dein Interesse! So geht es los:

## Entwicklung

```bash
npm install
npm run build
npm test
```

Nützlich: `npm run typecheck`, `npm run sim` (Simulation) und `npm run sweep` (Parametervergleich).

## Ablauf

1. Issue eröffnen oder ein bestehendes kommentieren, bevor du größere Änderungen beginnst.
2. Fork anlegen, Branch erstellen, Änderung mit Tests umsetzen.
3. Pull Request gegen `main` öffnen. Die CI muss grün sein.

## Grundsätze

- `quorum-core` bleibt frei von Abhängigkeiten zu Diensten, und `quorum-mod` muss weglassbar bleiben.
- Änderungen am Reputationsverhalten (Gewichte, Belohnung, Strafe) bitte mit `npm run sim` belegen.
- Commit-Nachrichten im Stil `feat:`, `fix:`, `docs:`, `ci:`, `chore:`.

## Lizenz

Mit deinem Beitrag stimmst du zu, dass er unter der [MPL-2.0](LICENSE) veröffentlicht wird.
