import { describe, it, expect, beforeEach } from 'vitest';
import { newCrisis, apply, check, spread, endDay, save, load, CREW_KEYS, rescueIn } from './crisis';

describe('crisis engine', () => {
  it('starts everyone healthy at home with dry rooms and open doors', () => {
    const s = newCrisis(7);
    expect(s.day).toBe(1);
    for (const k of CREW_KEYS) {
      expect(s.crew[k]).toMatchObject({ trust: 0, exposure: 0, infected: false, alive: true });
    }
    expect(Object.values(s.water).every((w) => w === 0)).toBe(true);
    expect(Object.values(s.doors).every((d) => d === false)).toBe(true);
    expect(rescueIn(s)).toBe(5);
  });

  it('picks the same liar and hatch code for the same seed', () => {
    expect(newCrisis(42).liar).toBe(newCrisis(42).liar);
    expect(newCrisis(42).hatchCode).toBe(newCrisis(42).hatchCode);
    expect(newCrisis(42).hatchCode).toMatch(/^\d{4}$/);
    const liars = new Set(Array.from({ length: 40 }, (_, i) => newCrisis(i).liar));
    expect(liars.size).toBeGreaterThan(2);
  });

  it('never changes the state it is given', () => {
    const s = newCrisis(1);
    const before = JSON.stringify(s);
    apply(s, { trust: { mara: 2 }, exposure: { teo: 3 }, water: { ballast: 0.5 }, doors: { trunk: true }, flags: ['x'], log: 'y' });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('marks someone infected once exposure reaches 2', () => {
    let s = newCrisis(1);
    s = apply(s, { exposure: { mara: 1 } });
    expect(s.crew.mara.infected).toBe(false);
    s = apply(s, { exposure: { mara: 1 } });
    expect(s.crew.mara.infected).toBe(true);
    s = apply(s, { exposure: { mara: -2 } });
    expect(s.crew.mara.infected).toBe(true);
  });

  it('clamps trust, exposure, meters and water', () => {
    const s = apply(newCrisis(1), { trust: { rook: 9 }, exposure: { rook: 9 }, meters: { hull: 500 }, water: { power: 4 } });
    expect(s.crew.rook.trust).toBe(3);
    expect(s.crew.rook.exposure).toBe(3);
    expect(s.meters.hull).toBe(100);
    expect(s.water.power).toBe(1);
  });

  it('checks flags, trust and the liar', () => {
    const s = apply(newCrisis(3), { flags: ['a'], trust: { hana: 2 } });
    expect(check(s, { flag: 'a' })).toBe(true);
    expect(check(s, { notFlag: 'a' })).toBe(false);
    expect(check(s, { trustAtLeast: ['hana', 2] })).toBe(true);
    expect(check(s, { trustAtLeast: ['hana', 3] })).toBe(false);
    expect(check(s, { liar: s.liar })).toBe(true);
  });

  it('lets water through open doors and stops it at shut ones', () => {
    let s = apply(newCrisis(1), { water: { ballast: 0.8 } });
    const open = spread(s, 0.2);
    expect(open.water.power).toBeGreaterThan(0);
    expect(open.water.ballast).toBeLessThan(0.8);
    s = apply(s, { doors: { 'ballast-power': true } });
    const shut = spread(s, 0.2);
    expect(shut.water.power).toBe(0);
    expect(shut.water.ballast).toBe(0.8);
  });

  it('turns the day over and stops at the last day', () => {
    let s = newCrisis(1);
    for (let i = 0; i < 9; i++) s = endDay(s);
    expect(s.day).toBe(5);
    expect(s.meters.hull).toBeLessThan(82);
  });

  describe('saving', () => {
    beforeEach(() => {
      const store = new Map<string, string>();
      globalThis.localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      } as Storage;
    });

    it('loads back exactly what was saved', () => {
      const s = apply(newCrisis(99), { exposure: { teo: 2 }, flags: ['day1_done'], log: 'knock' });
      save(s);
      expect(load()).toEqual(s);
    });
  });
});
