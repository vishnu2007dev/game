export type Tier = 'high' | 'medium' | 'low';

/**
 * Pick a rendering tier. `?q=high|medium|low` overrides detection so
 * any tier can be checked on any device.
 */
export function detectTier(): Tier {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (memory <= 2) return 'low';
  if (coarse || small || memory < 4) return 'medium';
  return 'high';
}

export function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
