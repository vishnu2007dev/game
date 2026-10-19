import { audio } from '../audio/audio';
import { COLD_OPEN, DAYS } from '../content/days';
import { crewInfo } from '../content/crew';
import { apply, endDay, newGame, rescueIn, say, check } from '../engine/state';
import { randomSeed } from '../engine/rng';
import type { DayScript, GameState } from '../engine/types';
import type { Station } from '../scene/app';
import { Overlays } from '../ui/overlays';

const METER_LABELS = { hull: 'Hull', power: 'Power', air: 'Air', morale: 'Morale' } as const;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function seedFromUrl() {
  const q = Number(new URLSearchParams(location.search).get('seed'));
  return Number.isFinite(q) && q > 0 ? q : randomSeed();
}

/**
 * Runs a shift from the title screen to the end of the preview. Owns the
 * game state and keeps the room, screens and overlays in step with it.
 */
export class Director {
  private s: GameState;
  private ov: Overlays;
  private clues: string[] = [];

  constructor(
    private station: Station,
    root: HTMLElement,
  ) {
    this.s = newGame(seedFromUrl());
    this.ov = new Overlays(root);
  }

  private sync() {
    const m = this.s.meters;
    this.station.trends.setTargets(m);
    this.ov.setMeters(
      (Object.keys(METER_LABELS) as (keyof typeof METER_LABELS)[]).map((k) => ({ key: k, label: METER_LABELS[k], value: m[k] })),
    );
  }

  private get view() {
    return this.station.overview.view;
  }

  async run() {
    await this.ov.gate();
    audio.startAmbience();
    this.hullNoises();
    await this.coldOpen();
    for (const day of DAYS) {
      if (day.day > 1) await this.newDay(day);
      await this.playDay(day);
    }
    await this.finish();
  }

  /** The station creaks on its own every so often. */
  private hullNoises() {
    const next = () =>
      setTimeout(() => {
        audio.play(Math.random() < 0.7 ? 'groan' : 'thud', { volume: 0.55, pan: Math.random() * 2 - 1 });
        next();
      }, 22000 + Math.random() * 20000);
    next();
  }

  private async coldOpen() {
    this.station.setAlarm(false);
    await this.ov.coldOpen(['03:47', 'HELIOS DEEP RESEARCH STATION', '3012 METRES BELOW THE SURFACE', 'SIX CREW. ONE COMMANDER.']);
    audio.play('thud');
    this.station.shake(1.4, 1.2);
    this.ov.setObjective(1, COLD_OPEN.instruction);
    this.sync();
    const ok = await this.emergency({
      alarm: COLD_OPEN.alarm,
      instruction: COLD_OPEN.instruction,
      hint: COLD_OPEN.hint,
      switchIndex: COLD_OPEN.switchIndex,
      seconds: COLD_OPEN.seconds,
    });
    if (!ok) this.s = apply(this.s, { meters: { hull: -5 }, trust: { mara: 1 } });
    this.view.doorOpen = false;
    this.view.banner = { text: 'C2 FLOODING CONTAINED', level: 'warn' };
    this.view.rooms[1] = { status: 'CONTAINED', level: 'warn', crew: 0 };
    this.view.alarms = [
      { time: '03:48', level: 'LOW', text: 'DOOR BETWEEN C1 AND C2 CLOSED', state: 'CLEARED' },
      { time: '03:47', level: 'HIGH', text: 'C2 BALLAST ROOM IS FLOODING', state: 'SEEN' },
      { time: '03:46', level: 'MED', text: 'HULL STRESS ABOVE NORMAL', state: 'SEEN' },
    ];
    this.sync();
    await this.ov.radio('OKAFOR', ok ? COLD_OPEN.success : COLD_OPEN.missed, 2600);
  }

  /** Timed switch task. Never fatal: returns false if time ran out. */
  private emergency(e: { alarm: string; instruction: string; hint: string; switchIndex: number; seconds: number }) {
    const st = this.station;
    st.setAlarm(true);
    st.setLamp(e.switchIndex, 'flash');
    st.leanToPanel(true);
    audio.setTension(0.6);
    const sw = st.switches[e.switchIndex];
    const box = this.ov.emergency(e.alarm, e.instruction, sw.open ? 'Guard is open. Throw the switch.' : `${e.hint.replace(/\.$/, '')}. Keyboard: press Space.`, e.seconds);
    const start = performance.now();
    return new Promise<boolean>((resolve) => {
      let over = false;
      const finish = async (ok: boolean) => {
        if (over) return;
        over = true;
        clearInterval(timer);
        removeEventListener('keydown', onKey);
        st.onSwitch = () => {};
        st.setAlarm(false);
        st.setLamp(e.switchIndex, ok ? 'steady' : 'off');
        audio.setTension(0);
        audio.play(ok ? 'confirm' : 'deny');
        await box.close(ok ? 'done' : 'missed');
        st.leanToPanel(false);
        resolve(ok);
      };
      // Keyboard and switch access: Space or Enter works the right switch.
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === ' ' || ev.key === 'Enter') {
          ev.preventDefault();
          st.operate(e.switchIndex);
        }
      };
      addEventListener('keydown', onKey);
      st.onSwitch = (i, action) => {
        if (i !== e.switchIndex) {
          audio.play('deny');
          box.hint('Wrong switch. Use the one with the flashing lamp.');
          return;
        }
        if (action === 'guard') box.hint('Guard open. Now throw the switch.');
        else finish(true);
      };
      const timer = setInterval(() => {
        const left = e.seconds - (performance.now() - start) / 1000;
        box.update(left);
        audio.setTension(left < 6 ? 1 : 0.6);
        if (left <= 0) finish(false);
      }, 100);
      box.update(e.seconds);
    });
  }

  private async newDay(day: DayScript) {
    this.s = endDay(this.s);
    this.station.setNight(true);
    await this.ov.dayCard(day.day, rescueIn(this.s));
    this.station.setNight(false);
    this.dressRoom(day.day);
    this.sync();
    await this.station.setRescueDays(rescueIn(this.s));
    await wait(400);
  }

  /** What the overview screen shows at the start of each morning. */
  private dressRoom(day: number) {
    const v = this.view;
    const has = (f: string) => this.s.flags.includes(f);
    v.day = day;
    this.station.overview.clockOffset = 3 * 3600 + 13 * 60;
    v.rooms[3] = has('lab_dark') && day === 2 ? { status: 'NO POWER', level: 'warn', crew: 2 } : { status: 'NORMAL', level: 'normal', crew: 2 };
    v.pump2 = has('pump2_rebuilt') ? 'ON' : 'FAILED';
    v.pump1 = 'ON';
    if (day === 2) {
      v.water = has('lab_dark') ? 0.18 : 0.31;
      v.rooms[1] = { status: 'DRAINING', level: 'warn', crew: 0 };
      v.banner = { text: 'CO2 FILTER CLOGGED', level: 'warn' };
      v.alarms = [
        { time: '06:10', level: 'MED', text: 'CO2 FILTER CLOGGED', state: 'NEW' },
        { time: '05:52', level: 'LOW', text: 'OXYGEN SLOWLY FALLING', state: 'NEW' },
        { time: '03:47', level: 'HIGH', text: 'C2 BALLAST ROOM IS FLOODING', state: 'CLEARED' },
      ];
    } else if (day === 3) {
      v.water = has('lab_dark') ? 0.04 : 0.14;
      v.rooms[1] = { status: v.water < 0.08 ? 'DRAINED' : 'DRAINING', level: v.water < 0.08 ? 'normal' : 'warn', crew: 0 };
      v.banner = { text: 'UNKNOWN CONTACTS ON HYDROPHONE', level: 'warn' };
      v.alarms = [
        { time: '02:10', level: 'LOW', text: 'C4 LAB DOOR OPENED AT NIGHT', state: 'NEW' },
        { time: '01:58', level: 'MED', text: 'POWER DIP IN C3', state: 'SEEN' },
        { time: '00:40', level: 'MED', text: 'HYDROPHONE CONTACT', state: 'SEEN' },
      ];
    }
  }

  private async playDay(day: DayScript) {
    const st = this.station;
    this.ov.setObjective(day.day, day.objective);
    this.sync();

    const report = day.report.filter((r) => check(this.s, r.when)).map((r) => ({ text: say(this.s, r.text), certainty: r.certainty }));
    const printing = st.printReport(report.map((r) => `${r.text.padEnd(26)} ${r.certainty}`));
    await wait(600);
    await this.ov.report(day.day, report);
    await printing;

    for (const call of day.calls) {
      if (!check(this.s, call.when)) continue;
      await this.phoneCall(call);
      this.sync();
    }

    if (day.emergency) {
      const e = day.emergency;
      await wait(800);
      if (day.day === 2) this.view.pump1 = 'HOT';
      this.view.banner = { text: e.alarm, level: 'alarm' };
      audio.play('thud');
      st.shake(0.8, 0.8);
      const ok = await this.emergency({
        alarm: e.alarm,
        instruction: e.instruction,
        hint: 'Lift the red guard on the flashing switch, then throw it.',
        switchIndex: e.switchIndex,
        seconds: e.seconds,
      });
      this.s = apply(this.s, ok ? e.success.effect : e.missed.effect);
      this.view.pump1 = ok ? 'OFF' : 'ON';
      this.view.banner = null;
      this.sync();
      await this.ov.radio(crewInfo(ok ? 'mara' : e.missed.from).call, say(this.s, ok ? e.success.line : e.missed.line), 2600);
    }

    // Night: the room dims and the comms log plays back.
    await wait(600);
    st.setNight(true);
    const night = day.night
      .filter((l) => check(this.s, l.when))
      .map((l) => ({ time: l.time, who: l.who, text: say(this.s, l.text), clue: l.clue }));
    for (const l of night) if (l.clue) this.clues.push(l.text);
    await this.ov.nightLog(day.day, night);
  }

  private async phoneCall(call: DayScript['calls'][number]) {
    const who = crewInfo(call.from);
    this.station.ring(true);
    const byHand = new Promise<void>((r) => (this.station.onPhone = r));
    await this.ov.incoming(who.name, who.role, byHand);
    this.station.onPhone = () => {};
    this.station.ring(false);
    const choices = call.choices.filter((c) => check(this.s, c.when) && !(c.label.includes('scan') && this.s.scans <= 0));
    const claim = call.claim;
    const { panel, index } = await this.ov.call({
      callsign: who.call,
      role: who.role,
      lines: call.lines.map((l) => say(this.s, l)),
      claim: claim && {
        text: claim.text,
        scansLeft: this.s.scans,
        run: async () => {
          this.s = apply(this.s, { scans: -1 });
          const isTrue = claim.isTrue(this.s);
          const detail = claim.detail ? say(this.s, claim.detail) : '';
          this.clues.push(`${who.name.split(' ')[0]} said "${claim.text}". Scan: ${isTrue ? 'true' : 'not true'}. ${detail}`);
          return { isTrue, detail };
        },
      },
      choices: choices.map((c) => ({ label: c.label, hint: c.hint })),
    });
    const choice = choices[index];
    const effect = typeof choice.effect === 'function' ? choice.effect(this.s) : choice.effect;
    this.s = apply(this.s, effect);
    this.sync();
    const reply = say(this.s, choice.reply);
    if (effect.flags?.some((f) => f.startsWith('clue_'))) this.clues.push(`${who.name.split(' ')[0]}: ${reply}`);
    await this.ov.reply(panel, reply);
  }

  private async finish() {
    const m = this.s.meters;
    await this.ov.end({
      meters: (Object.keys(METER_LABELS) as (keyof typeof METER_LABELS)[]).map((k) => ({ key: k, label: METER_LABELS[k], value: m[k] })),
      clues: this.clues,
      survived: 3,
    });
    location.search = `?seed=${randomSeed()}`;
  }
}
