// High performance HMI palette (after ISA-101). Normal states are gray.
// Colour only appears when something needs the operator.
export const HMI = {
  bg: '#2b2f33',
  bgDeep: '#222629',
  panel: '#33383d',
  line: '#7d848b',
  lineDim: '#4c5359',
  text: '#c7ccd1',
  textDim: '#7f878e',
  white: '#e8ebee',
  water: '#4f6578',
  waterHi: '#6c8296',
  select: '#46b3c4',
  warn: '#f2a900',
  alarm: '#d7261e',
};

export const HMI_FONT = {
  mono: '"IBM Plex Mono", ui-monospace, monospace',
  label: '"Barlow Condensed", "Arial Narrow", sans-serif',
};

export function pad(n: number, len = 2) {
  return String(Math.floor(n)).padStart(len, '0');
}

/** Station clock as HH:MM:SS, starting at 03:47:00 when the alarm fires. */
export function clock(t: number) {
  const s = 3 * 3600 + 47 * 60 + 2 + t;
  return `${pad((s / 3600) % 24)}:${pad((s / 60) % 60)}:${pad(s % 60)}`;
}
