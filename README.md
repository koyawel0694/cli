# Hermes — AI Experiment & Developer Assistant

Hermes lets you hand an AI a real task on a real codebase — it inspects files, reasons, and reports back.

Fork: `koyawel0694/cli` -> upstream `hdgg2429-star/cli` (latest `09c13cf`).

## Quick start
```bash
git clone https://github.com/koyawel0694/cli.git -b test/all-fixes cli-test
cd cli-test
cp backend/.env.example backend/.env  # add OPENAI_API_KEY / GEMINI_API_KEY
cp frontend/.env.example frontend/.env
cd backend && npm install && npm run dev  # :4000
# new terminal
cd frontend && npm install && npm run dev -- --port 5174  # :5174 if 5173 busy
# open http://localhost:5174
```

## Env
`backend/.env`: `CORS_ORIGINS`, `PUBLIC_URL`, provider keys
`frontend/.env`: `VITE_API_URL`, `VITE_WS_URL`
`CLI`: `HERMES_API`

## Scripts
`npm start` / `npm run dev` (backend), `frontend: npm run dev / build`

See `Hermes.txt` for roadmap.
## License
MIT — see LICENSE.
