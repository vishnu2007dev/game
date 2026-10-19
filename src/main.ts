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
import { Director } from './game/director';

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
new Director(station, root).run();
