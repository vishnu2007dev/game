import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/vt323/400.css';
import '@fontsource/caveat/700.css';
import './styles/base.css';
import './styles/overlays.css';
import { startScene } from './scene/app';
import { Overlays } from './ui/overlays';
import { playTrailer, smoulder, trailerStill } from './game/trailer';

// Canvas text is drawn once into textures, so every face has to be
// loaded before the scene is built.
const faces = [
  '500 30px "Barlow Condensed"',
  '600 30px "Barlow Condensed"',
  '700 30px "Barlow Condensed"',
  '400 30px "IBM Plex Mono"',
  '500 30px "IBM Plex Mono"',
  '600 30px "IBM Plex Mono"',
  '30px "VT323"',
  '700 30px "Caveat"',
];

await Promise.all(faces.map((f) => document.fonts.load(f)));
const root = document.getElementById('app')!;
const station = startScene(root);
(window as unknown as { __station: unknown }).__station = station;
// v2 is built in steps. This step is the intro: trailer and title.
// The v1 director (src/game/director.ts) stays in the repo for reuse.
root.classList.add('is-cinematic');
const ov = new Overlays(root);
const still = new URLSearchParams(location.search).get('still');
if (still) {
  await trailerStill(station, still);
  if (still === 'wreck') void ov.titleCard();
  window.__STILL = true;
  await new Promise(() => {});
}
await ov.pressStart();
for (;;) {
  await playTrailer(station, ov);
  const stop = smoulder(station);
  const pick = await ov.titleCard();
  stop();
  if (pick === 'begin') await ov.comingNext();
}
