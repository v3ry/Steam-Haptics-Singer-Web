# Steam Haptics Singer Web (Chrome)

A v3ry3D product.

Pure web MVP (no native backend) using WebHID, mainly targeting Steam Controller 2026.

## Prerequisites

- Recent Google Chrome (or Edge Chromium)
- Secure context for WebHID: `https://` or `http://localhost`

## Run Locally

From the repository root:

```powershell
cd web
python -m http.server 8080
```

Then open:

- `http://localhost:8080`

## MVP Features

- MIDI file import (`.mid`, `.midi`)
- WebHID connection for Steam Controller 2026 (or Steam Puck)
- Playback with channel mapping 0-3
- Core options: `-v`, `-u`, `-t`, `-s`
- Gain modifiers: `-l`, `-r`, `-n`, `-m`

## Notes

- This version does not yet support Steam Deck / Steam Controller 2015.
- The MIDI library is currently loaded via ESM CDN (`@tonejs/midi`).
- For offline use, the next step is local bundling of dependencies.
