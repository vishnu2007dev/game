# Status and next step

Read this first when picking the project up in a new chat.

- **Repo branch:** `claude/confident-dijkstra-3xyum0`
- **Private preview link (owner's claude.ai account):** https://claude.ai/artifact/NHsUjhV9aKiV5tjWyV1ZC5
  To update it, run `node scripts/artifact-build.mjs <out-dir>`, then publish `<out-dir>/index.html` to that URL with the changed `assets/*` files.
- **Done:**
  - realistic control room
  - readable HMI screens with click-to-zoom
  - v1 preview (cold open, days 1 to 3 as calls), which the owner found too quiz-like
  - engine with tests
  - synthesized sound
  - automated playthrough script
- **Now:** v2 plan below. Next step is **1. Trailer and title**.
- **Checks:** `npm run build`, `npm test`, `node scripts/playthrough.mjs <url>` (needs `npx vite preview --port 4173`).
- **House rules:**
  - no em or en dashes anywhere (the build fails on them)
  - nothing that looks AI-generated (see the anti-vibecode rules)
  - the owner wants realistic, cinematic, interactive

---

# Helios Deep v2: from quiz to living station

## Context
The preview built so far (control room, cold open, days 1 to 3 as phone calls with choices) works, but the user finds it boring: "it is like a quiz". They want:
- life, people, interaction and drama
- a trailer
- a tutorial
- a memorable crew
- choosing who to call
- an impostor who misleads you
- an infection that turns crew into zombies, which you contain
- moving through rooms "like Among Us, but not the concept"

Decisions taken with the user:
- **Movement:** 3D cutaway of the whole station that you tap to zoom into rooms.
- **Crew:** realistic 3D people in suits.
- **Length:** 5 days, about 25 minutes.
- **Infection tone:** creepy, not gory.

What we keep: the realistic control room (it becomes the hub), the material and texture system, the HMI screens, the overlay style, the audio engine, the seeded engine, the tests, the dash check, and the private preview link workflow.

## The game in one line
You command a failing research station 3000 m down. A pipe bursts, something from the drill gets into the water, the crew start to turn, and one of them is lying to you. Keep as many alive as you can for 5 days until the rescue sub docks.

## Player journey
1. **Trailer (40 s, skippable, doubles as the launch clip).** The control room fails in sequence, cut to the beat of a hull groan:
   - the lights flicker
   - screens glitch to static
   - the split-flap board spins wildly
   - sparks burst from the panel in a blast of electric arcs
   - a pipe ruptures and water sprays
   - the porthole cracks
   - cut to black

   Then: **"FIVE DAYS UNTIL RESCUE. CAN YOU KEEP THEM ALIVE?"** with a [Begin] button.
2. **Tutorial (skippable, about 60 s).** A spotlight walk-through, one thing at a time:
   - "This is your station. Tap a room to go inside."
   - "This is the comms panel. Call anyone, any time."
   - "These are door controls. Doors stop water, and other things."
   - "Your crew's health is here."
3. **Meet the crew.** The camera visits each person at their post. They turn, say one line about their job, and their name card appears. There are five crew, each with a role, a suit colour and a helmet-light colour:

   | Crew | Role | Suit | What they handle |
   |---|---|---|---|
   | Mara Okafor | Hydraulics engineer | Orange | Pipes, pumps, valves |
   | Rook Adeyemi | Electrician | Blue | Power, doors, lights |
   | Ilya Venn | Medic | White | Health, infection tests |
   | Teo Ramires | Diver | Yellow | Outside repairs |
   | Hana Sato | Biologist | Green | What the drill found |

4. **Day 1, the routine check (teaching by doing).**
   - Walk the station room by room and run each system check as a small hands-on task: turn a valve, read a gauge, flip a breaker.
   - Everyone is fine and chatty, so the player gets attached.
   - At night something knocks on the hull.
5. **Day 2, the burst.**
   - A pipe bursts in the ballast room: red light, alarm, water rising live in the cutaway.
   - **You choose who to call.** Each person gives different advice. The right expert (Mara) fixes it best, but whoever goes into that water is **exposed**. That is the hidden cost.
   - The fix itself is hands-on. In the flooded room you spin the valve wheel and hold a patch in place, timed to the pressure surges.
6. **Day 3, the liar.**
   - One crew member, random each game, secretly works for the company. Their orders are to get a living sample to the surface whatever it costs.
   - They mislead you in chat ("open valve 3", which floods a room), blame others and quietly sabotage things.
   - You investigate by scrubbing CCTV footage, reading door logs and comparing stories.
   - Your options: lock them in a room, confront them in front of the crew, or keep trusting them.
7. **Day 4, the turn.**
   - The exposed crew start showing it: coughing on CCTV, soaked uniforms, staring at the water.
   - That night the first one turns into one of **the Drowned**: silent, slow, drawn to water, trying to pull others into flooded rooms.
   - Ilya can test people, but tests use up scarce kits.
8. **Day 5, containment and escape.** The Drowned move through the station in real time. You:
   - seal doors and cut lights (they avoid light)
   - flood or drain rooms to trap them
   - drag healthy crew from room to room to keep them safe
   - get the survivors to the dive bay when the rescue sub docks
9. **The ending and reveal.**
   - The endings depend on who survived, whether you exposed the liar, and whether the sample reaches the surface.
   - The reveal replays the key moments and shows who the liar was all along.
   - A share card shows the result, for example "4 of 5 survived. Rook was the liar."

## Systems
- **Station cutaway (the main view).**
  - A side-on 3D cross-section of 6 rooms: Command, Ballast, Power, Lab, Quarters and Dive Bay.
  - Crew walk the corridors with simple pathfinding between room waypoints.
  - Water level, lights and doors are shown live in every room.
  - Tap a room and the camera flies in. The Command room is the existing control room scene.
- **Rooms.** Each is a small interior with 2 or 3 interactive hotspots (valve, breaker box, terminal, locker, a crew member). Built with the existing procedural materials (`src/scene/textures.ts`).
- **Calls and chat.** Pick a crew member from the comms panel, then talk with branching dialogue. Lines change with trust, with whether they are the liar, and with infection. This reuses the call UI (`src/ui/overlays.ts`), redesigned as a chat with the person's face cam.
- **Hands-on tasks.** Each is a small, reusable minigame:
  - valve wheel (drag around in a circle)
  - rewire (connect matching wires)
  - patch hold (hold, release on the pressure beat)
  - door keypad
  - CCTV scrub (drag along the timeline to catch someone)
- **Hidden state.** Per crew member: trust, exposure (0 to 3), infected, turned, alive, location. Plus a global flag for whether the liar is identified. Extends the existing engine (`src/engine/`).
- **Containment, Day 5 real time.** The Drowned follow simple rules: they move toward water and the nearest crew member, they avoid lit rooms, and they cannot pass sealed doors. Crew move when you drag them to another room.
- **Difficulty.** Days 1 and 2 cannot be lost. Days 4 and 5 can be, but warnings are clear, and you can always save someone if you act fast. The liar is random each game, so replays play differently.

## Art and assets
- **Crew: realistic 3D people in diving or industrial suits.**
  - **Source:** rigged humans with walk, idle and talk animations. The candidates reachable from here are the Mixamo-rigged figures in the three.js repository (Soldier, Xbot, Michelle), and possibly CC0 bodies from Quaternius.
  - **Licence:** verified before any model is used, and every licence recorded in `CREDITS.md`.
  - **Suits:** dressed in code with role-coloured PBR materials, a helmet with a visor and a chest name plate. Dark lighting plus film post keeps them realistic.
  - **Faces:** visible through the visor in chat close-ups, with mood driven by lighting and animation.
- **The Drowned:** the same models with soaked dark materials, a cracked and fogged visor, a slow shuffle animation, dripping particles and a wet sound bed.
- **Trailer effects:** spark and arc particles, screen-glitch shaders, a water spray particle system and a crack decal on the porthole, all in the existing post stack (`src/scene/post.ts`).
- **Anti-vibecode rules and the no-long-dash rule carry over unchanged.**

## Technical approach
- **Reuse:**
  - `src/scene/textures.ts`, `decals.ts`, `post.ts`, `quality.ts` and `tween.ts`
  - the control room in `console.ts` and `room.ts`
  - the HMI screens in `src/hmi/`
  - `src/audio/audio.ts`
  - the engine pattern and tests in `src/engine/`
  - the overlay styling in `src/styles/overlays.css`
  - the scripts `scripts/playthrough.mjs` and `scripts/artifact-build.mjs`
- **New:**
  - `src/scene/station.ts`: cutaway, rooms, doors, water, lights
  - `src/scene/crew.ts`: models, suits, animation, pathing
  - `src/scene/fx.ts`: sparks, arcs, spray, glitch
  - `src/game/trailer.ts`
  - `src/game/tutorial.ts`
  - `src/game/days/day1.ts` to `day5.ts`
  - `src/game/tasks/`: valve, rewire, patch, keypad, cctv
  - `src/game/chat.ts`
  - `src/game/containment.ts`
  - `src/content/dialogue/`
- **Model loading:** GLTFLoader with Draco or meshopt compression. One shared skeleton with cloned skinned meshes for all five crew.

## Build order (each step ends on the private link for you to try)
0. **Handoff safety.** Commit this plan to the repo as `docs/PLAN.md`, with a short "current status and next step" section and the private preview link, then push. If this chat stops, a new chat can attach the repo, check out `claude/confident-dijkstra-3xyum0`, read `docs/PLAN.md` and continue. Update the status section and push after every step.
1. **Trailer and title.** The failure montage in the existing room.
2. **Station cutaway, room fly-in and walking crew.** Check that the realistic suits look right.
3. **Tutorial and meet the crew.**
4. **Day 1 and Day 2.** Routine checks as hands-on tasks, the burst, who to call, and the exposure system.
5. **Day 3, the liar.** Misleading chat, CCTV scrubbing, lock or confront.
6. **Day 4 and Day 5.** The Drowned, containment and escape.
7. **Endings, reveal, share card, sound pass, phone tuning, then launch.**

## Verification
- `npm run build` (dash check, typecheck, build) and `npm test` must stay green.
- Engine tests extended for exposure, infection, the liar's behaviour and containment rules.
- `scripts/playthrough.mjs` is extended to play every day automatically with different choices and different liars, checking for no errors and that every ending can be reached.
- Screenshots at desktop and phone size after each step.
- The user plays each step on the private link before the next one starts.
