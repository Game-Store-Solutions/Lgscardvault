# Training tooling

Scripts for regenerating Training assets and running Playwright QA. Requires a local dev server (default `http://localhost:5174`) and Acme Store login.

| Command | Purpose |
|---------|---------|
| `npm run training:capture` | PNG per beat → `public/training/beats/` |
| `npm run training:audio` | WAV narration → `public/training/audio/` (uses `public/training/_generate-audio.html`) |
| `npm run training:validate-targets` | 82-beat target resolution check |
| `npm run training:validate-experience` | Lock, narration, demo fill, exit cleanup |
| `npm run training:test` | Unit checks (coords, mutation markers, workflow) |
