# CLAUDE.md - EvacSim

## What we're building
EvacSim is a web platform that replaces (or prepares for) real building evacuation drills with a simulation. A school admin uploads the building's evacuation plan, marks rooms, exits and stairs, sets how many children and staff are in each room, picks a disaster, and watches a live agent-based simulation of everyone getting out.

The output is not just an animation. It answers: **How long does it take? Where are the bottlenecks? Which room is in danger? What should we change?**

This is a **one-day hackathon** project. Working demo > clean architecture. Ship the core loop first, then add polish.

## Pitch (one line)
"Every school does a fire drill once a year and learns nothing measurable. EvacSim runs 100 drills in a minute - for fire, earthquake or flood - and shows exactly where children get stuck."

## Core user flow (MUST work for the demo)
1. **Upload plan** - user uploads an image (PNG/JPG) of the evacuation plan. It becomes the background of the editor.
2. **Draw the building** - on a grid overlay, user paints: walls, rooms, exits, stairs, assembly point. Simple paint tools, not CAD.
3. **Populate** - click a room → set number of children, teachers, and people with reduced mobility. Age group (e.g. 1st–4th grade = slower).
4. **Choose disaster** - Fire / Earthquake / Flood / Gas leak. User clicks where it starts.
5. **Run** - agents move to the nearest safe exit in real time. Hazard spreads and can block corridors and exits mid-simulation.
6. **Results** - total evacuation time, per-room time, heatmap of congestion, people not evacuated, 3 plain-language recommendations.

## Disaster rules (keep simple, make them feel different)
| Disaster | Behaviour |
|---|---|
| Fire | Spreads cell by cell from origin. Burning cells are impassable. Smoke ring around fire slows agents by 50%. |
| Earthquake | Agents first "drop, cover, hold" for N seconds, then evacuate. Random corridor cells become debris (blocked). Elevators disabled. |
| Flood | Water rises from lowest/marked cells. Agents prefer upward routes (stairs up / roof) instead of exits. |
| Gas leak | Invisible zone spreading slowly; exits inside it become unsafe. Tests whether people reroute. |

## Simulation model
- **Grid-based**, ~0.5 m per cell. Plan image scaled to fit.
- **Flow field** pathfinding: BFS/Dijkstra from all exits → every cell knows its direction to the nearest exit. Recompute when a hazard blocks cells (cheap, fine at hackathon scale).
- **Agents**: position, speed, type. Base speeds - adult 1.3 m/s, child 1.0 m/s, young child 0.8 m/s, reduced mobility 0.5 m/s. Teachers start last from their room (they wait for the class).
- **Congestion**: max agents per cell (e.g. 2). If the next cell is full, wait. This creates realistic bottlenecks at doors and stairs.
- **Tick**: fixed time step (0.1 s), with a speed multiplier slider (1x / 5x / 20x).
- **Monte Carlo mode** (stretch): run 50 headless sims with randomized start delays, show average and worst case.

## Results screen
- Total evacuation time + comparison to the target (e.g. Bulgarian schools typically aim for under 3 min - show as a configurable target, don't hardcode a claim).
- Heatmap of where agents waited the longest.
- Table: room → number of people → time to exit → exit used.
- Recommendations generated from rules, e.g. "Exit B handles 70% of people - redirect rooms 204–206 to Exit C", "Room 112 depends on one corridor that fire can block".
- "Re-run with changes" button - the main loop for the jury.

## Building visualization (P0 - the wow factor)
The simulation is shown as a **3D model of the building**, generated from the 2D plan the user painted. The 2D editor is for drawing; the 3D view is for watching and presenting.

- **Auto-generated from the grid:** wall cells are extruded into 3D walls (~3 m high), floor cells become the floor slab, exits are marked with green glowing door frames, stairs as ramps/steps.
- **Floors stacked vertically** for multi-storey buildings; "explode" slider separates floors so you can see inside every level at once.
- **Camera:** orbit / zoom / pan, plus presets - isometric overview, top-down, and "follow a room" (camera tracks one class).
- **Cutaway walls:** walls facing the camera become semi-transparent so agents are always visible.
- **Agents:** small capsules colored by type (child / teacher / reduced mobility), rendered with instancing so 500+ agents stay smooth.
- **Hazards in 3D:** fire as glowing orange cells with simple particle flames and grey smoke volume; flood as a rising translucent blue plane; earthquake as camera shake + debris blocks in corridors; gas as a green fog volume.
- **Room labels** floating above rooms: name + live counter "18/24 out".
- **Heatmap overlay** on the floor after the run (green → red by waiting time).
- **Toggle 2D ⇄ 3D** at any time; both views read the same simulation state.
- Visualization must never drive the sim - it only reads state from `src/sim` each frame.

## Campus map (P1, after core works)
A school often has several buildings. Add an interactive map (Leaflet + OpenStreetMap) where the user places buildings as markers, sets children per building, and clicks one to open its floor plan editor. Shows overall campus status during a run.

## Tech stack
- **Vite + React + TypeScript**
- **HTML Canvas 2D** for the plan editor
- **Three.js via react-three-fiber + @react-three/drei** for the 3D building view (OrbitControls, Instances, Html labels)
- **Zustand** for state
- **Tailwind CSS** for UI
- **Leaflet** (react-leaflet) for the campus map - P1 only
- **No project backend.** Save projects to localStorage + export/import as JSON. Optional `api/` service keeps AI provider keys server-side for plan reading.
- Deploy: Kuso (see `AGENTS.md` for the repo-specific setup).

## Project structure
```
src/
  editor/        # canvas painting tools, plan upload, grid
  sim/           # pure TS: grid, flowField, agents, hazards, engine - NO React here
  hazards/       # fire.ts, earthquake.ts, flood.ts, gas.ts (same interface)
  viz3d/         # grid → 3D meshes, agents, hazard effects, camera presets
  results/       # metrics, heatmap, recommendations
  campus/        # Leaflet map (P1)
  store/         # zustand stores
  components/    # shared UI
  demo/          # preloaded demo school JSON
```

## Conventions
- Simulation code in `src/sim` is pure and deterministic given a seed - easy to test and run headless.
- Every hazard implements: `init(grid, origin)`, `step(grid, dt)`, `isBlocked(cell)`, `speedFactor(cell)`.
- Keep components small; no premature abstraction.
- UI text in **Bulgarian**, code and comments in English.
- Prefer working code over perfect code. If something takes > 30 min, cut scope and tell me.

## Priorities
- **P0 (must demo):** upload plan, paint walls/exits/rooms, set people per room, fire scenario, live simulation in the 3D building view, total time + heatmap.
- **P1:** earthquake + flood, results table, recommendations, demo school preloaded, campus map.
- **P2:** gas leak, Monte Carlo mode, multi-floor with stairs between floors, PDF report export, compare two scenarios side by side.
- **Out of scope:** auth, project synchronization across devices, real CAD/DWG import.

## Demo script (3 min)
1. Open the preloaded demo school - 2 floors' worth of rooms, 320 children.
2. Rotate the 3D building, explode the floors. Start a fire near the main staircase → watch children reroute, one exit jams.
3. Results: 4:10 min, heatmap shows the jam.
4. Apply one recommendation (open side exit for 3 rooms) → re-run → 2:40 min.
5. Switch to earthquake in one click to show it's a platform, not a single scenario.

## Visual style
Calm, trustworthy, readable at a glance - this is a safety tool for schools. Neutral background, one strong accent for hazards (red/orange for fire, blue for water). Agents as small dots colored by type. Large, clear numbers on the results screen.
