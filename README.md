# Helios Deep

Five days until rescue. Can you keep them alive?

A deep sea survival story that runs in the browser. You command a
research station 3000 m down with five crew. Something came up with the
drill cores, something knocks on the hull at night, and one of the crew
is not telling you the truth.

Built with Three.js, TypeScript and Vite. No backend: it is a static
site, so it can be hosted anywhere (Vercel, Netlify, GitHub Pages).

## Run it on your computer

You need:

- **Node.js 22** (20.19 or newer works). Check with `node -v`.
  Install from https://nodejs.org or with `nvm install 22`.
- **Git**.

```bash
git clone https://github.com/vishnu2007dev/game.git
cd game
git checkout claude/confident-dijkstra-3xyum0
npm install
npm run dev
```

Open http://localhost:5173

To try it on your phone on the same Wi-Fi network:

```bash
npm run dev -- --host
```

Then open the Network URL that Vite prints.

## Handy links while developing

| Add to the URL | What it does |
|---|---|
| `?station` | Skip the trailer and title, go straight to the station |
| `?tutorial` | Show the crew introductions and tutorial again |
| `?q=high`, `?q=medium`, `?q=low` | Force a rendering quality tier |
| `?snap` | Camera cuts instead of easing (used by tests) |
| `?still=calm` (and `alarm`, `panel`, `screens`, `pipe`, `porthole`, `blast`, `wreck`) | Freeze a trailer frame |

The tutorial is remembered in the browser (`localStorage`, key
`helios.onboarded`). Clear site data or use a private window to see it again.

Dev only pages on the dev server:

- http://localhost:5173/crewlab.html shows the five crew up close.
- http://localhost:5173/tasklab.html is a blank page for trying task panels.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Dash check, type check and production build into `dist/` |
| `npm run preview` | Serve the production build on http://localhost:4173 |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Type check only |
| `npm run e2e:day1` | Plays Day 1 in a real browser, start to finish |
| `npm run e2e:onboarding` | Plays the crew introductions and tutorial |

The `e2e` scripts and the `scripts/shot-*.mjs` screenshot scripts drive a
real browser with Playwright. They look for Google Chrome or Chromium on
your computer. If you have neither, run `npx playwright install chromium`
once. Set `CHROME_PATH` to use a specific browser, and `HEADED=1` to watch
it play. Run them against the production build:

```bash
npm run build
npm run preview            # leave this running
npm run e2e:day1           # in a second terminal
```

Screenshots go to `screenshots/` (not committed).

## Deploying

`npm run build` produces a static site in `dist/`. Any static host works.
On Vercel: import the repository, framework preset Vite, build command
`npm run build`, output directory `dist`.

## Credits

See [CREDITS.md](CREDITS.md). Character models and animations are CC0
(Quaternius). Fonts are under the SIL Open Font License.
