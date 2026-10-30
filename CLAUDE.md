# Helios Deep: notes for Claude Code

Read `docs/PLAN.md` first: its top section is the current status and the
next step, with the full story plan below it.

## What this is
A browser game: a 3D cutaway of a deep sea research station with five
suited crew. Five days until rescue. It plays as a story told through
scenes (crew talk on camera with subtitles), calls with a live suit
camera, short hands-on jobs, watertight doors, and branching choices
that change trust, exposure and what happens next. Static site, no
backend.

Stack: Three.js 0.186, postprocessing, TypeScript (strict), Vite 8,
Vitest. Playwright (`playwright-core`) only for test and screenshot
scripts.

## The owner's rules (do not break these)
- **No em dashes or en dashes anywhere**, in code, comments, text or
  docs. `npm run build` fails on them (`scripts/check-dashes.mjs`).
- It must not look AI-generated or "vibecoded": realistic, cinematic,
  industrial. No emoji, no gradients for decoration, no generic card UI.
- It should play like a **story**, not a list of chores. Each moment
  should lead to the next.
- Similar to Among Us in spirit is fine; **copying its tasks is not**
  (the wire task was removed for that reason).
- The owner reviews each step in the browser before the next is built.
  Keep steps small enough to try.

## Layout
- `src/main.ts`: startup and the top level flow (trailer, title,
  onboarding, then the days). Builds the shared `Ctx`.
- `src/scene/`
  - `app.ts`: renderer, render loop, camera, input, the `Station` API
    the game drives (rooms, crew close ups, doors, markers, face cam,
    scene camera `frameCast`, crew orders `sendCrew`/`act`/`placeCrew`).
  - `station.ts`: the cutaway, rooms and props, doors, markers, the
    crew list `CREW`, room list `ROOMS`, `SPOTS`, crew AI (`Agent`) and
    route planning through doors and the ladder trunk.
  - `crew.ts`: suited crew built on the CC0 mannequin, animation clips.
  - `console.ts`, `room.ts`, `porthole.ts`: the control room (Command).
  - `panels.ts`, `textures.ts`, `decals.ts`: procedural materials.
  - `fx.ts`: sparks, arcs, spray. `post.ts`: post effects.
- `src/engine/crisis.ts`: the v2 run state (trust, exposure, infected,
  water, doors, flags, seeded liar and gate code), pure and tested in
  `crisis.test.ts`. (`state.ts`/`types.ts` are the old v1 engine.)
- `src/game/`
  - `run.ts`: `Ctx`, `change()`, `runChat()` (calls), `exclusive()`.
  - `story.ts`: scene helpers `stage()`, `lines()`, `ask()`, `end()`.
  - `days/day1.ts`: Day 1 as a story. `onboarding.ts`: meet the crew
    and tutorial. `trailer.ts`: the intro trailer.
- `src/content/v2/`: all words. `day1.ts` holds the beats, scene lines,
  small talk and night log; `types.ts` the content types.
- `src/ui/`: DOM interface. `subtitles.ts`, `chat.ts`, `objectives.ts`
  ("Now:" line), `roster.ts` (crew list), `coach.ts` (tutorial
  prompts), `stationHud.ts`, `overlays.ts` (day cards, radio, night log,
  emergency banner), `tasks/` (valve, generator sync, keypad).
- `src/styles/overlays.css`: almost all interface styling.
- `public/models/`: crew model and animation clips (GLB).
- `scripts/`: Playwright tests and screenshot scripts; `browser.mjs`
  finds a browser on any machine.

## How to work
- `npm run dev`, open http://localhost:5173/?station to skip the intro.
- After changes: `npm run build` and `npm test` must pass.
- For gameplay changes, also run the browser playthrough against the
  production build: `npm run build`, `npm run preview`, then
  `npm run e2e:day1` (and `npm run e2e:onboarding` if the start changed).
- Keep comments in the existing style: short, plain, explaining why.
- Text the player sees lives in `src/content/v2/`, not in flow code.
- Use the `Station` API from `app.ts` to drive the scene; do not reach
  into `station.ts` from game code.
- Test hooks: `window.__station` (Station API) and `window.__ctx` (run
  state) exist for scripts.

## Publishing
- The previous cloud sessions published a private preview at
  https://claude.ai/artifact/NHsUjhV9aKiV5tjWyV1ZC5 using
  `scripts/artifact-build.mjs` (it packs the GLB models as base64 JSON
  because that host does not serve `.glb`). Locally you do not need
  this: `npm run dev` or `npm run build` + any static host.
- Work branch: `claude/confident-dijkstra-3xyum0`.
