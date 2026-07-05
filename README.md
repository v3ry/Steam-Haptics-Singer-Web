# Steam Haptics Singer Web (Chrome)

MVP web pur (sans backend natif) avec WebHID, cible principale: Steam Controller 2026.

## Prerequis

- Google Chrome (ou Edge Chromium) recent
- Contexte securise pour WebHID: `https://` ou `http://localhost`

## Lancer localement

Depuis la racine du repo:

```powershell
cd web
python -m http.server 8080
```

Puis ouvre:

- `http://localhost:8080`

## Fonctionnalites MVP

- Import de fichier MIDI (`.mid`, `.midi`)
- Connexion WebHID du Steam Controller 2026 (ou Steam Puck)
- Playback avec mapping des canaux 0-3
- Options de base: `-v`, `-u`, `-t`, `-s`
- Gain modifiers: `-l`, `-r`, `-n`, `-m`

## Notes

- Cette version ne couvre pas encore Steam Deck / Steam Controller 2015.
- La bibliotheque MIDI est chargee via ESM CDN (`@tonejs/midi`).
- Pour une utilisation hors-ligne, prochaine etape: bundler local des dependances.
