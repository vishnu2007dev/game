# Helios Deep

Rescue is 13 days away. Someone on your crew is lying.

A deep sea survival thriller that runs in the browser. You command a
research habitat 3000 m down. Keep six crew alive, keep the station
together, and find out what really happened.

## Run it locally

Needs Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173

To try it on a phone on the same Wi-Fi network:

```bash
npm run dev -- --host
```

Then open the Network URL that Vite prints.

## Useful flags

- `?q=high`, `?q=medium` or `?q=low` forces a rendering quality tier.

## Scripts

- `npm run build`: dash check, typecheck and production build
- `npm run shot`: desktop and phone screenshots of a running dev server
