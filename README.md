# Egress / EvacSim

Egress is a browser-based evacuation simulator for schools and other buildings. Upload or draw a floor plan, assign people to rooms, choose a disaster (fire, earthquake, flood, or gas leak), and run an agent-based simulation that shows how people evacuate in real time.

The project is designed to answer a practical question that ordinary drills do not: how long does evacuation actually take, where do the bottlenecks form, and what should be changed to improve safety. Every run produces a total evacuation time, congestion hotspots, exit load, room-by-room details, and plain-language recommendations.

No backend is required for the core app: the simulation, analysis, and persistence all run in the browser. AI plan reading is optional and uses the small `api/` service to keep provider keys off the client.

For the deeper technical write-up, see [Documentation.md](./Documentation.md) and the Bulgarian version [Documentation.bg.md](./Documentation.bg.md).

## What this project includes

- 2D floor-plan editor with drawing tools, room population, stairs, exits, and automatic room detection workflows
- user-defined exit names, shown consistently in simulation results and exported reports
- multi-floor editor with automatic floor alignment when possible, a direct 2D stair-correction action when movement cannot improve the match, a lower-floor stair overlay, partial-link warnings, and undo that also restores the hazard origin
- scenario setup for multiple disaster types with distinct mechanics
- live evacuation simulation in 2D and 3D
- results dashboard with total time, heatmap, room breakdown, recommendations, and comparisons only for identical plans and simulation inputs
- Monte Carlo analysis for running many simulations with different seeds
- optional AI-assisted plan interpretation via the `api/` service
- project import/export as JSON and local autosave with automatic plan-image optimization

## Quick start

Requirements: Node.js 20+

```bash
npm install
npm run dev
```

Then open the local Vite URL in the browser. The first run loads a demo school with a preconfigured building layout and population.

Production build:

```bash
npm run build
npm run preview
```

## Optional AI plan analysis

If you want to use the AI-assisted drawing workflow, create the environment file for the server:

```bash
cp api/.env.example api/.env
```

Set either provider in `api/.env`:

- Anthropic: set `ANTHROPIC_API_KEY`.
- Gemini: set `GEMINI_API_KEY` (or set `AI_PROVIDER=gemini` explicitly). The default model is `gemini-3.8-flash`; override it with `GEMINI_MODEL` if needed.

The key stays on the API server; do not put it in frontend code or in a `VITE_*` variable, because Vite embeds those values in the browser bundle. `api/.env` is ignored by Git. For deployment, configure the key as a secret on the `api` service instead of committing it.

Run the frontend and API in separate terminals:

```bash
npm run dev
```

```bash
npm run api
```

Open the frontend at the localhost origin allowed by `api/.env` (normally `http://localhost:5173`). Restart `npm run api` after changing the key or model. Provider quota or temporary availability errors (HTTP 429/503) must be resolved at the provider or retried later; restarting does not increase quota.

## Project structure

```text
src/            React app and browser-side simulation logic
api/            optional AI backend service
public/         static assets
Documentation.md         full architecture and product documentation
Documentation.bg.md      Bulgarian version of Documentation.md
documentationFinal.md    comprehensive Bulgarian project documentation (final)
PROJECT.md               project context and planning notes
STATUS.md                project status and feature checklist
README.md                project overview and onboarding
AGENTS.md                deployment instructions for this repo
```

## Deployment

This repository is configured for deployment on the self-hosted Kuso platform used by the project team. The main service should be named `git-happens`, and the API service is exposed as `git-happens-api.junioraccelerator.org`.

The repo-level deployment details, including the required commands and environment variables, are documented in [AGENTS.md](./AGENTS.md).

## Documentation index

- [Documentation.md](./Documentation.md) — full architecture and product documentation
- [Documentation.bg.md](./Documentation.bg.md) — Bulgarian version
- [documentationFinal.md](./documentationFinal.md) — comprehensive Bulgarian project documentation (final)
- [STATUS.md](./STATUS.md) — project status and feature checklist
- [PROJECT.md](./PROJECT.md) — project context and planning notes

## Stack

- React + TypeScript + Vite
- Canvas-based 2D editor
- Three.js via `@react-three/fiber` for the 3D viewer
- Zustand for state management
- Tailwind CSS for styling
- Optional AI backend in `api/` using Anthropic or Gemini

Test