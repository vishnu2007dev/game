import { describe, it, expect } from 'vitest';
import { newGame, apply, check, endDay, rescueIn, say, TRUTHS } from './state';
import { DAYS, COLD_OPEN } from '../content/days';
import { CREW } from '../content/crew';
import type { Effect, GameState, Text, Truth } from './types';

// Matches the two dash code points that the content must never contain.
const DASH = new RegExp("[\\u2013\\u2014]");
const CREW_IDS = new Set<string>(CREW.map((c) => c.id));

interface Item {
  where: string;
  value: string;
}

function buildState(truth: Truth, flags: string[]): GameState {
  return { ...newGame(1), truth, flags: [...flags] };
}

function effectOf(e: Effect | ((s: GameState) => Effect), s: GameState): Effect {
  return typeof e === 'function' ? e(s) : e;
}

/** Every flag string that appears in any effect in DAYS, found by evaluating each effect under every truth. */
function gatherEffectFlags(): string[] {
  const found = new Set<string>();
  for (const truth of TRUTHS) {
    const s = buildState(truth, []);
    for (const day of DAYS) {
      for (const call of day.calls) {
        for (const choice of call.choices) {
          for (const f of effectOf(choice.effect, s).flags ?? []) found.add(f);
        }
      }
      if (day.emergency) {
        for (const f of day.emergency.success.effect.flags ?? []) found.add(f);
        for (const f of day.emergency.missed.effect.flags ?? []) found.add(f);
      }
    }
  }
  return [...found].sort();
}

const EFFECT_FLAGS = gatherEffectFlags();

const FLAG_SETS: Array<{ label: string; flags: string[] }> = [
  { label: 'no flags', flags: [] },
  { label: 'every effect flag', flags: EFFECT_FLAGS },
];

const STATE_CASES = TRUTHS.flatMap((truth) =>
  FLAG_SETS.map(({ label, flags }) => ({ name: `truth ${truth}, ${label}`, truth, flags })),
);

/** Resolve every Text in the content for this state, and list every plain string separately. */
function collect(s: GameState): { texts: Item[]; plain: Item[] } {
  const texts: Item[] = [];
  const plain: Item[] = [];
  const text = (where: string, t: Text) => texts.push({ where, value: say(s, t) });
  const str = (where: string, v: string) => plain.push({ where, value: v });

  str('cold open alarm', COLD_OPEN.alarm);
  str('cold open instruction', COLD_OPEN.instruction);
  str('cold open hint', COLD_OPEN.hint);
  str('cold open success', COLD_OPEN.success);
  str('cold open missed', COLD_OPEN.missed);

  for (const day of DAYS) {
    const d = `day ${day.day}`;
    str(`${d} objective`, day.objective);
    day.report.forEach((r, i) => text(`${d} report ${i}`, r.text));
    day.calls.forEach((call, i) => {
      const where = `${d} call ${i} (${call.from})`;
      call.lines.forEach((l, j) => text(`${where} line ${j}`, l));
      if (call.claim) {
        str(`${where} claim text`, call.claim.text);
        const detail = call.claim.detail;
        if (detail !== undefined) text(`${where} claim detail`, detail);
      }
      call.choices.forEach((ch, j) => {
        str(`${where} choice ${j} label`, ch.label);
        if (ch.hint !== undefined) str(`${where} choice ${j} hint`, ch.hint);
        text(`${where} choice ${j} reply`, ch.reply);
      });
    });
    if (day.emergency) {
      str(`${d} emergency alarm`, day.emergency.alarm);
      str(`${d} emergency instruction`, day.emergency.instruction);
      text(`${d} emergency success`, day.emergency.success.line);
      text(`${d} emergency missed`, day.emergency.missed.line);
    }
    day.night.forEach((n, i) => {
      str(`${d} night ${i} time`, n.time);
      str(`${d} night ${i} who`, n.who);
      text(`${d} night ${i} text`, n.text);
    });
  }
  return { texts, plain };
}

describe('newGame', () => {
  it('is deterministic: the same seed gives the same truth and state', () => {
    for (const seed of [1, 2, 42, 999, 123456]) {
      expect(newGame(seed).truth).toBe(newGame(seed).truth);
      expect(newGame(seed)).toEqual(newGame(seed));
    }
  });

  it('draws all three truths across seeds 1 to 300', () => {
    const seen = new Set<Truth>();
    for (let seed = 1; seed <= 300; seed++) seen.add(newGame(seed).truth);
    expect([...seen].sort()).toEqual([...TRUTHS].sort());
  });

  it('starts on day 1 with no flags and every crew member alive and neutral', () => {
    const s = newGame(10);
    expect(s.day).toBe(1);
    expect(s.flags).toEqual([]);
    for (const c of Object.values(s.crew)) {
      expect(c.alive).toBe(true);
      expect(c.trust).toBe(0);
      expect(c.fatigue).toBe(0);
    }
  });
});

describe('apply', () => {
  const base = (): GameState => ({ ...newGame(7), flags: ['existing'] });

  it('never mutates its input state', () => {
    const s = base();
    const before = JSON.stringify(s);
    const effect: Effect = {
      meters: { hull: 50, power: -90, air: 3, morale: -1 },
      trust: { mara: 2, ilya: -3, teo: 1 },
      fatigue: { hana: 2, rook: 1 },
      flags: ['new_flag', 'existing'],
      scans: 3,
    };
    const out = apply(s, effect);
    expect(JSON.stringify(s)).toBe(before);
    expect(out).not.toBe(s);
    expect(out.meters).not.toBe(s.meters);
    expect(out.crew).not.toBe(s.crew);
    expect(out.crew.mara).not.toBe(s.crew.mara);
    expect(out.flags).not.toBe(s.flags);
    expect(out.flags).toContain('new_flag');
  });

  it('applies plain deltas', () => {
    const out = apply(base(), { meters: { hull: 6, power: -8 }, trust: { mara: 1 }, fatigue: { teo: 2 }, scans: -1 });
    expect(out.meters.hull).toBe(78);
    expect(out.meters.power).toBe(58);
    expect(out.crew.mara.trust).toBe(1);
    expect(out.crew.teo.fatigue).toBe(2);
    expect(out.scans).toBe(3);
  });

  it('clamps meters to 0..100', () => {
    const s = base();
    const up = apply(s, { meters: { hull: 1000, air: 1000 } });
    expect(up.meters.hull).toBe(100);
    expect(up.meters.air).toBe(100);
    const down = apply(s, { meters: { power: -1000, morale: -1000 } });
    expect(down.meters.power).toBe(0);
    expect(down.meters.morale).toBe(0);
  });

  it('clamps trust to -3..3', () => {
    const s = base();
    expect(apply(s, { trust: { mara: 10 } }).crew.mara.trust).toBe(3);
    expect(apply(s, { trust: { ilya: -10 } }).crew.ilya.trust).toBe(-3);
  });

  it('clamps fatigue to 0..3', () => {
    const s = base();
    expect(apply(s, { fatigue: { teo: 10 } }).crew.teo.fatigue).toBe(3);
    expect(apply(s, { fatigue: { hana: -10 } }).crew.hana.fatigue).toBe(0);
  });

  it('clamps scans to 0..9', () => {
    const s = base();
    expect(apply(s, { scans: 20 }).scans).toBe(9);
    expect(apply(s, { scans: -20 }).scans).toBe(0);
  });

  it('does not duplicate flags', () => {
    const out = apply(base(), { flags: ['existing', 'a', 'a'] });
    expect(out.flags).toEqual(['existing', 'a']);
    const again = apply(out, { flags: ['a', 'existing'] });
    expect(again.flags).toEqual(['existing', 'a']);
  });
});

describe('check', () => {
  const withFlags = (flags: string[]) => ({ ...newGame(1), flags });

  it('returns true when there is no condition', () => {
    expect(check(newGame(1))).toBe(true);
    expect(check(newGame(1), undefined)).toBe(true);
    expect(check(newGame(1), {})).toBe(true);
  });

  it('checks flag and notFlag', () => {
    const s = withFlags(['x']);
    expect(check(s, { flag: 'x' })).toBe(true);
    expect(check(s, { flag: 'y' })).toBe(false);
    expect(check(s, { notFlag: 'x' })).toBe(false);
    expect(check(s, { notFlag: 'y' })).toBe(true);
  });

  it('checks truth with a single value and with an array', () => {
    const s = { ...newGame(1), truth: 'fault' as Truth };
    expect(check(s, { truth: 'fault' })).toBe(true);
    expect(check(s, { truth: 'saboteur' })).toBe(false);
    expect(check(s, { truth: ['saboteur', 'fault'] })).toBe(true);
    expect(check(s, { truth: ['saboteur', 'presence'] })).toBe(false);
  });

  it('checks below as a strict less-than on a meter', () => {
    const s = newGame(1); // air is 82
    expect(check(s, { below: ['air', 90] })).toBe(true);
    expect(check(s, { below: ['air', 82] })).toBe(false);
    expect(check(s, { below: ['air', 10] })).toBe(false);
  });
});

describe('endDay', () => {
  it('advances the day, lowers fatigue by one and never below zero, without mutating input', () => {
    const s = apply(newGame(5), { fatigue: { mara: 2, ilya: 3, teo: 1 } });
    const before = JSON.stringify(s);
    const next = endDay(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(next.day).toBe(s.day + 1);
    expect(next.crew.mara.fatigue).toBe(1);
    expect(next.crew.ilya.fatigue).toBe(2);
    expect(next.crew.teo.fatigue).toBe(0);
    expect(next.crew.hana.fatigue).toBe(0);
  });
});

describe('rescueIn', () => {
  it('is 13 on day 1 and counts down', () => {
    expect(rescueIn({ ...newGame(1), day: 1 })).toBe(13);
    expect(rescueIn({ ...newGame(1), day: 2 })).toBe(12);
    expect(rescueIn({ ...newGame(1), day: 13 })).toBe(1);
  });

  it('never goes below zero', () => {
    for (const day of [14, 15, 30, 100]) {
      expect(rescueIn({ ...newGame(1), day })).toBe(0);
    }
  });
});

describe('content: flag gathering', () => {
  it('finds at least one flag in the effects of DAYS', () => {
    expect(EFFECT_FLAGS.length).toBeGreaterThan(0);
  });
});

describe('content: crew references', () => {
  it('every call from and every emergency missed.from is a CREW id', () => {
    const unknown: string[] = [];
    for (const day of DAYS) {
      day.calls.forEach((call, i) => {
        if (!CREW_IDS.has(call.from)) unknown.push(`day ${day.day} call ${i} from ${call.from}`);
      });
      if (day.emergency && !CREW_IDS.has(day.emergency.missed.from)) {
        unknown.push(`day ${day.day} emergency missed.from ${day.emergency.missed.from}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('every crew key in choice and emergency effects is a CREW id', () => {
    const unknown: string[] = [];
    const check = (where: string, e: Effect) => {
      for (const k of [...Object.keys(e.trust ?? {}), ...Object.keys(e.fatigue ?? {})]) {
        if (!CREW_IDS.has(k)) unknown.push(`${where} ${k}`);
      }
    };
    for (const truth of TRUTHS) {
      const s = buildState(truth, []);
      for (const day of DAYS) {
        day.calls.forEach((call, i) =>
          call.choices.forEach((ch, j) => check(`day ${day.day} call ${i} choice ${j}`, effectOf(ch.effect, s))),
        );
        if (day.emergency) {
          check(`day ${day.day} emergency success`, day.emergency.success.effect);
          check(`day ${day.day} emergency missed`, day.emergency.missed.effect);
        }
      }
    }
    expect(unknown).toEqual([]);
  });
});

describe('content: DAYS and COLD_OPEN per truth and flag set', () => {
  for (const c of STATE_CASES) {
    describe(c.name, () => {
      const s = buildState(c.truth, c.flags);

      it('every Text resolves via say() to a non-empty string', () => {
        const { texts } = collect(s);
        const empty = texts.filter((i) => typeof i.value !== 'string' || i.value.length === 0);
        expect(empty).toEqual([]);
      });

      it('no resolved string, label, hint or objective contains U+2013 or U+2014', () => {
        const { texts, plain } = collect(s);
        const bad = [...texts, ...plain].filter((i) => DASH.test(i.value));
        expect(bad).toEqual([]);
      });

      it('every call has at least 2 choices and every choice effect evaluates and apply() accepts it', () => {
        const problems: string[] = [];
        for (const day of DAYS) {
          day.calls.forEach((call, i) => {
            const where = `day ${day.day} call ${i}`;
            if (call.choices.length < 2) problems.push(`${where}: only ${call.choices.length} choice(s)`);
            call.choices.forEach((ch, j) => {
              try {
                const next = apply(s, effectOf(ch.effect, s));
                if (typeof next !== 'object' || next === null) problems.push(`${where} choice ${j}: apply returned ${next}`);
              } catch (err) {
                problems.push(`${where} choice ${j}: ${String(err)}`);
              }
            });
          });
          if (day.emergency) {
            for (const [label, e] of [
              ['emergency success', day.emergency.success.effect],
              ['emergency missed', day.emergency.missed.effect],
            ] as const) {
              try {
                apply(s, e);
              } catch (err) {
                problems.push(`day ${day.day} ${label}: ${String(err)}`);
              }
            }
          }
        }
        expect(problems).toEqual([]);
      });
    });
  }
});

describe('content: night clue lines', () => {
  it('every day has at least one night line with clue: true', () => {
    for (const day of DAYS) {
      expect(day.night.some((n) => n.clue === true), `day ${day.day}`).toBe(true);
    }
  });

  for (const { label, flags } of FLAG_SETS) {
    it(`each clue line resolves to a different string for each truth (${label})`, () => {
      const problems: string[] = [];
      for (const day of DAYS) {
        day.night.forEach((n, i) => {
          if (n.clue !== true) return;
          const lines = TRUTHS.map((truth) => say(buildState(truth, flags), n.text));
          if (new Set(lines).size !== TRUTHS.length) {
            problems.push(`day ${day.day} night ${i}: ${JSON.stringify(lines)}`);
          }
        });
      }
      expect(problems).toEqual([]);
    });
  }
});

describe('content: COLD_OPEN', () => {
  it('success and missed lines are non-empty', () => {
    expect(COLD_OPEN.success.length).toBeGreaterThan(0);
    expect(COLD_OPEN.missed.length).toBeGreaterThan(0);
  });

  it('contains no U+2013 or U+2014', () => {
    const strings = [COLD_OPEN.alarm, COLD_OPEN.instruction, COLD_OPEN.hint, COLD_OPEN.success, COLD_OPEN.missed];
    expect(strings.filter((s) => DASH.test(s))).toEqual([]);
  });
});
