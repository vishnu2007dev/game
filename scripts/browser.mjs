// Finds a Chromium to drive for the test and screenshot scripts, on the
// cloud machine or on a laptop.
//
// Order: CHROME_PATH if set; the cloud machine's preinstalled Chromium;
// Chrome or Chromium installed on this computer; otherwise the browser
// Playwright downloads with `npx playwright install chromium`.
import { chromium } from 'playwright-core';
import { existsSync, globSync } from 'node:fs';

const LOCAL = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findChrome() {
  if (process.env.CHROME_PATH) return { path: process.env.CHROME_PATH, cloud: false };
  const cloud = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
  if (cloud) return { path: cloud, cloud: true };
  const local = LOCAL.find((p) => existsSync(p));
  return { path: local, cloud: false };
}

/**
 * Launch the browser. On the cloud machine there is no GPU, so WebGL runs
 * in software (SwiftShader); on a laptop the real GPU is used.
 */
export function launchBrowser(extraArgs = []) {
  const { path, cloud } = findChrome();
  const gpu = cloud ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist'];
  return chromium.launch({ executablePath: path, headless: process.env.HEADED ? false : true, args: [...gpu, ...extraArgs] });
}
