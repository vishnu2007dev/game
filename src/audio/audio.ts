/**
 * Procedural audio for the station game. Everything is synthesized with the
 * Web Audio API, no sample files. The goal is physical, slightly dull and
 * room-bound sounds (metal, plastic, air, hull), not arcade bleeps.
 */

export type Sfx =
  | 'click' // small mechanical button or key click
  | 'guard' // plastic switch guard flipped open: short snap
  | 'toggle' // heavy toggle switch thrown: sharp metallic clack with tiny ring
  | 'phoneRing' // one ring burst of an old sound powered ship phone: two bells, ~1.2 s
  | 'pickup' // handset lifted: thunk plus brief line hiss
  | 'printer' // dot matrix printer printing one line: rapid buzzy ticks, ~0.6 s
  | 'flap' // split flap display clatter: burst of 8 to 12 tiny plastic ticks, ~0.5 s
  | 'groan' // deep hull groan: low filtered noise + slowly bending low tone, ~3.5 s
  | 'thud' // distant heavy impact on the hull, low and muffled
  | 'confirm' // HMI acknowledge beep: single soft square-ish tone, 120 ms
  | 'deny' // HMI reject: two low short beeps
  | 'sonar' // sonar/scan ping: sine ping with long tail and slight delay echo
  | 'typing'; // one soft teletype character tick (used repeatedly, must be very short and quiet)

/** Shared things every voice needs. */
interface Kit {
  c: AudioContext;
  noise: AudioBuffer;
}

type Voice = (k: Kit, t: number, d: AudioNode) => void;

const MASTER_LEVEL = 0.6;
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Low level building blocks
// ---------------------------------------------------------------------------

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number; // optional pitch glide target
  dur: number; // total sounding time in seconds
  peak: number;
  attack?: number;
  lp?: number; // optional lowpass cutoff
  sweep?: number; // glide time, defaults to dur
}

/** One oscillator with a fast attack and exponential-ish decay. */
function tone(k: Kit, d: AudioNode, t: number, o: ToneOpts): void {
  const { c } = k;
  const attack = o.attack ?? 0.002;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.sweep ?? o.dur));
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.peak, t + attack);
  // Time constant of dur/6 leaves about 0.25 percent at the stop time, so no click.
  g.gain.setTargetAtTime(0, t + attack, Math.max(0.001, (o.dur - attack) / 6));
  let tail: AudioNode = osc;
  if (o.lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    osc.connect(f);
    tail = f;
  }
  tail.connect(g).connect(d);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}

interface BurstOpts {
  type: BiquadFilterType;
  f: number;
  f1?: number; // optional filter sweep target
  q?: number;
  dur: number;
  peak: number;
  attack?: number;
  sweep?: number;
}

/** Filtered noise burst taken from a random spot of the shared buffer. */
function burst(k: Kit, d: AudioNode, t: number, o: BurstOpts): void {
  const { c } = k;
  const attack = o.attack ?? 0.001;
  const src = c.createBufferSource();
  src.buffer = k.noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.f, t);
  if (o.f1 !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + (o.sweep ?? o.dur));
  }
  f.Q.value = o.q ?? 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, Math.max(0.001, (o.dur - attack) / 6));
  src.connect(f).connect(g).connect(d);
  src.start(t, Math.random() * (k.noise.duration - 0.05));
  src.stop(t + o.dur + 0.02);
}

/** Two seconds of white noise that loops without a seam (equal power crossfade at the join). */
function makeNoise(c: AudioContext): AudioBuffer {
  const sr = c.sampleRate;
  const n = Math.floor(sr * 2);
  const buf = c.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < fade; i++) {
    const x = i / fade;
    // End of the buffer blends toward the start so the loop point is continuous.
    d[n - fade + i] = d[n - fade + i] * Math.cos(x * Math.PI * 0.5) + d[i] * Math.sin(x * Math.PI * 0.5);
  }
  return buf;
}

/** Tiny pre-rendered key ticks so the typing sound costs one source and one gain. */
function makeTicks(c: AudioContext): AudioBuffer[] {
  const sr = c.sampleRate;
  const len = Math.floor(sr * 0.022);
  const out: AudioBuffer[] = [];
  for (let v = 0; v < 4; v++) {
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const tau = sr * (0.0016 + v * 0.0004);
    let prev = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const x = (Math.random() * 2 - 1) * Math.exp(-i / tau);
      // First difference gives a bright, clicky spectrum with a bit of body kept by the mix.
      d[i] = x - prev * 0.7;
      prev = x;
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < len; i++) d[i] /= peak || 1;
    d[len - 1] = 0;
    out.push(buf);
  }
  return out;
}

// ---------------------------------------------------------------------------
// One shot voices
// ---------------------------------------------------------------------------

const voices: Record<Exclude<Sfx, 'typing'>, Voice> = {
  click(k, t, d) {
    burst(k, d, t, { type: 'bandpass', f: 3200, q: 1.2, dur: 0.02, peak: 0.35, attack: 0.0008 });
    tone(k, d, t, { f0: 2200, f1: 900, dur: 0.015, peak: 0.1 });
    tone(k, d, t, { f0: 260, f1: 140, dur: 0.03, peak: 0.14 });
  },

  guard(k, t, d) {
    // Plastic flexes, then snaps against its stop.
    burst(k, d, t, { type: 'bandpass', f: 2600, q: 0.8, dur: 0.03, peak: 0.32 });
    tone(k, d, t + 0.003, { type: 'triangle', f0: 900, f1: 420, dur: 0.04, peak: 0.16 });
    burst(k, d, t + 0.045, { type: 'bandpass', f: 4200, q: 1.5, dur: 0.012, peak: 0.14 });
  },

  toggle(k, t, d) {
    burst(k, d, t, { type: 'bandpass', f: 2000, q: 0.7, dur: 0.03, peak: 0.45, attack: 0.0006 });
    tone(k, d, t, { type: 'square', f0: 160, f1: 70, dur: 0.08, peak: 0.28, lp: 600 });
    // Small metallic ring from the lever and plate.
    tone(k, d, t, { f0: 1470, dur: 0.22, peak: 0.045 });
    tone(k, d, t, { f0: 2350, dur: 0.3, peak: 0.055 });
    tone(k, d, t, { f0: 3640, dur: 0.18, peak: 0.035 });
    // Detent settling.
    burst(k, d, t + 0.07, { type: 'bandpass', f: 3000, q: 1, dur: 0.015, peak: 0.16 });
  },

  phoneRing(k, t, d) {
    const { c } = k;
    const dur = 1.2;
    // Two bells with inharmonic partials, struck rapidly by a clapper (AM at ~24 Hz).
    const bus = c.createGain();
    const am = c.createGain();
    am.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 24;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(am.gain);
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(0.5, t + 0.015);
    bus.gain.setValueAtTime(0.5, t + dur - 0.12);
    bus.gain.linearRampToValueAtTime(0.0001, t + dur);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    am.connect(hp).connect(bus).connect(d);
    const partials: Array<[number, number]> = [
      [1, 0.5],
      [2.01, 0.28],
      [2.76, 0.2],
      [4.17, 0.1],
    ];
    for (const base of [1180, 1262]) {
      for (const [m, a] of partials) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = base * m;
        const g = c.createGain();
        g.gain.value = a * 0.5;
        o.connect(g).connect(am);
        o.start(t);
        o.stop(t + dur + 0.02);
      }
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
    // Dull thump of the clapper body.
    tone(k, d, t, { f0: 140, dur: 0.06, peak: 0.12 });
  },

  pickup(k, t, d) {
    tone(k, d, t, { f0: 120, f1: 55, dur: 0.12, peak: 0.45 });
    burst(k, d, t, { type: 'lowpass', f: 500, dur: 0.08, peak: 0.3 });
    burst(k, d, t + 0.02, { type: 'bandpass', f: 1800, q: 1, dur: 0.02, peak: 0.16 });
    // Open line hiss that fades in and out.
    burst(k, d, t + 0.08, { type: 'bandpass', f: 3500, q: 0.5, dur: 0.5, peak: 0.05, attack: 0.08 });
  },

  printer(k, t, d) {
    const { c } = k;
    const dur = 0.6;
    const main = c.createGain();
    main.gain.setValueAtTime(0.0001, t);
    main.gain.linearRampToValueAtTime(0.4, t + 0.02);
    main.gain.setValueAtTime(0.4, t + dur - 0.06);
    main.gain.linearRampToValueAtTime(0.0001, t + dur);
    main.connect(d);

    // Pin strikes: band limited noise chopped by a fast square gate.
    const src = c.createBufferSource();
    src.buffer = k.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(3000, t + dur);
    bp.Q.value = 1.4;
    const gate = c.createGain();
    gate.gain.value = 0.5;
    const lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 66;
    const depth = c.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(gate.gain);
    src.connect(bp).connect(gate).connect(main);

    // Carriage motor buzz underneath.
    const motor = c.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(95, t);
    motor.frequency.linearRampToValueAtTime(110, t + dur);
    const mlp = c.createBiquadFilter();
    mlp.type = 'lowpass';
    mlp.frequency.value = 700;
    const mg = c.createGain();
    mg.gain.value = 0.12;
    motor.connect(mlp).connect(mg).connect(main);

    src.start(t, Math.random() * 1.5);
    lfo.start(t);
    motor.start(t);
    for (const n of [src, lfo, motor]) n.stop(t + dur + 0.02);
    // Carriage stops at the end of the line.
    burst(k, d, t + dur - 0.02, { type: 'lowpass', f: 900, dur: 0.05, peak: 0.18 });
  },

  flap(k, t, d) {
    const n = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const at = t + ((i + Math.random() * 0.6) / n) * 0.45;
      burst(k, d, at, { type: 'bandpass', f: rnd(3000, 6500), q: 2, dur: 0.012, peak: rnd(0.1, 0.2), attack: 0.0005 });
      tone(k, d, at, { type: 'triangle', f0: rnd(1500, 2700), f1: 800, dur: 0.008, peak: 0.04 });
    }
  },

  groan(k, t, d) {
    const { c } = k;
    const dur = 3.5;
    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(0.9, t + 1.1);
    bus.gain.setTargetAtTime(0, t + 1.6, 0.4);
    bus.connect(d);

    // Rumbling noise body with a resonant sweep, like steel under load.
    const src = c.createBufferSource();
    src.buffer = k.noise;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(320, t);
    lp.frequency.exponentialRampToValueAtTime(130, t + dur);
    lp.Q.value = 2;
    const ng = c.createGain();
    ng.gain.value = 0.55;
    src.connect(lp).connect(ng).connect(bus);

    // Resonant creak band that wanders.
    const res = c.createBiquadFilter();
    res.type = 'bandpass';
    res.frequency.setValueAtTime(170, t);
    res.frequency.exponentialRampToValueAtTime(95, t + dur);
    res.Q.value = 9;
    const rg = c.createGain();
    rg.gain.value = 0.9;
    src.connect(res).connect(rg).connect(bus);

    // Slowly bending low tone, two detuned voices for a beating, structural feel.
    const tlp = c.createBiquadFilter();
    tlp.type = 'lowpass';
    tlp.frequency.value = 220;
    const tg = c.createGain();
    tg.gain.value = 0.28;
    tlp.connect(tg).connect(bus);
    const vib = c.createOscillator();
    vib.frequency.value = 3.1;
    const vibDepth = c.createGain();
    vibDepth.gain.value = 1.6;
    vib.connect(vibDepth);
    const oscs: OscillatorNode[] = [vib];
    for (const det of [1, 1.013]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(58 * det, t);
      o.frequency.linearRampToValueAtTime(46 * det, t + dur * 0.55);
      o.frequency.linearRampToValueAtTime(63 * det, t + dur);
      vibDepth.connect(o.frequency);
      o.connect(tlp);
      oscs.push(o);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.1);
    for (const o of oscs) {
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  },

  thud(k, t, d) {
    const { c } = k;
    // Everything goes through a lowpass so it sounds like it travels through water and steel.
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.value = 1;
    lp.connect(g).connect(d);
    tone(k, lp, t, { f0: 70, f1: 32, dur: 0.6, peak: 0.85, attack: 0.004 });
    burst(k, lp, t, { type: 'lowpass', f: 160, dur: 0.3, peak: 0.7, attack: 0.003 });
    // Hollow rumble that follows the hit.
    burst(k, lp, t + 0.05, { type: 'lowpass', f: 90, dur: 1.4, peak: 0.35, attack: 0.12 });
  },

  confirm(k, t, d) {
    tone(k, d, t, { type: 'square', f0: 880, dur: 0.12, peak: 0.1, attack: 0.006, lp: 2200 });
    tone(k, d, t, { f0: 1760, dur: 0.1, peak: 0.02, attack: 0.006 });
  },

  deny(k, t, d) {
    tone(k, d, t, { type: 'square', f0: 220, dur: 0.09, peak: 0.12, attack: 0.006, lp: 1100 });
    tone(k, d, t + 0.15, { type: 'square', f0: 196, dur: 0.12, peak: 0.12, attack: 0.006, lp: 1000 });
  },

  sonar(k, t, d) {
    const { c } = k;
    const ping = (to: AudioNode, at: number, level: number): void => {
      tone(k, to, at, { f0: 1250, f1: 1232, dur: 2.6, peak: 0.3 * level, attack: 0.004 });
      tone(k, to, at, { f0: 2500, dur: 0.7, peak: 0.04 * level, attack: 0.004 });
    };
    ping(d, t, 1);
    // Two softened echoes, as if bouncing off distant walls.
    const e1 = c.createBiquadFilter();
    e1.type = 'lowpass';
    e1.frequency.value = 2400;
    e1.connect(d);
    ping(e1, t + 0.42, 0.34);
    const e2 = c.createBiquadFilter();
    e2.type = 'lowpass';
    e2.frequency.value = 1500;
    e2.connect(d);
    ping(e2, t + 0.86, 0.13);
  },
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface AlarmRig {
  gain: GainNode;
  oscs: OscillatorNode[];
  timer: ReturnType<typeof setInterval>;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private kit: Kit | null = null;
  private ticks: AudioBuffer[] = [];
  private _muted = false;

  // Intent flags, so calls made before unlock() start once audio is available.
  private wantAmbience = false;
  private ambienceOn = false;
  private ambienceTimer: ReturnType<typeof setTimeout> | null = null;
  private ambienceBus: GainNode | null = null;
  private wantAlarm = false;
  private alarm: AlarmRig | null = null;
  private tension = 0;
  private pulseBus: AudioNode | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;

  /** Must be called from a user gesture handler. Creates/resumes the AudioContext. Safe to call more than once. */
  async unlock(): Promise<void> {
    try {
      if (!this.ctx) this.init();
      const c = this.ctx;
      if (!c) return;
      if (c.state === 'suspended') await c.resume();
      this.flushPending();
    } catch {
      // Audio is optional, never let it break the game.
    }
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    try {
      if (this.ctx && this.master) {
        this.master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, this.ctx.currentTime, 0.02);
      }
    } catch {
      // ignore
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  play(sfx: Sfx, opts?: { volume?: number; pan?: number }): void {
    try {
      const c = this.ctx;
      const kit = this.kit;
      const master = this.master;
      if (!c || !kit || !master || this._muted || c.state !== 'running') return;
      const vol = Math.max(0, Math.min(2, opts?.volume ?? 1));
      const pan = opts?.pan;
      const out = this.makeBus(c, master, vol, pan);
      if (sfx === 'typing') {
        this.typingTick(c, out);
        return;
      }
      voices[sfx](kit, c.currentTime + 0.005, out);
    } catch {
      // ignore
    }
  }

  /** Continuous room tone: low air handling hum + faint bubbling/creaks. Fades in over 2 s. */
  startAmbience(): void {
    this.wantAmbience = true;
    this.flushPending();
  }

  /** Two-tone industrial alarm, loops until stopAlarm. */
  startAlarm(): void {
    this.wantAlarm = true;
    this.flushPending();
  }

  stopAlarm(): void {
    this.wantAlarm = false;
    const rig = this.alarm;
    const c = this.ctx;
    if (!rig || !c) return;
    this.alarm = null;
    try {
      clearInterval(rig.timer);
      const now = c.currentTime;
      // About 300 ms fade (four time constants of 75 ms).
      rig.gain.gain.cancelScheduledValues(now);
      rig.gain.gain.setValueAtTime(rig.gain.gain.value, now);
      rig.gain.gain.setTargetAtTime(0, now, 0.075);
      for (const o of rig.oscs) o.stop(now + 0.4);
    } catch {
      // ignore
    }
  }

  /** Slow heartbeat-like pulse used during countdowns. 0 = off, 1 = full. */
  setTension(level: number): void {
    this.tension = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
    this.flushPending();
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private init(): void {
    const Ctor: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined'
        ? AudioContext
        : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const c = new Ctor({ latencyHint: 'interactive' });
    const master = c.createGain();
    master.gain.value = this._muted ? 0 : MASTER_LEVEL;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp).connect(c.destination);
    this.ctx = c;
    this.master = master;
    this.kit = { c, noise: makeNoise(c) };
    this.ticks = makeTicks(c);
  }

  /** Per sound bus: volume and optional stereo position. */
  private makeBus(c: AudioContext, master: GainNode, vol: number, pan?: number): GainNode {
    const bus = c.createGain();
    bus.gain.value = vol;
    if (pan !== undefined && Number.isFinite(pan) && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      bus.connect(p).connect(master);
    } else {
      bus.connect(master);
    }
    return bus;
  }

  /** Very cheap: one pre-rendered tick, one source, no filters. */
  private typingTick(c: AudioContext, out: GainNode): void {
    const src = c.createBufferSource();
    src.buffer = this.ticks[Math.floor(Math.random() * this.ticks.length)];
    src.playbackRate.value = rnd(0.85, 1.25);
    out.gain.value *= 0.1;
    src.connect(out);
    src.start();
  }

  /** Start anything that was requested before the context existed or while it was suspended. */
  private flushPending(): void {
    const c = this.ctx;
    if (!c) return;
    try {
      if (this.wantAmbience && !this.ambienceOn) this.buildAmbience();
      if (this.wantAlarm && !this.alarm) this.buildAlarm();
      this.updatePulse();
    } catch {
      // ignore
    }
  }

  // -------------------------------------------------------------------------
  // Ambience
  // -------------------------------------------------------------------------

  private buildAmbience(): void {
    const c = this.ctx;
    const kit = this.kit;
    const master = this.master;
    if (!c || !kit || !master) return;
    this.ambienceOn = true;
    const t = c.currentTime;

    const bus = c.createGain();
    bus.gain.setValueAtTime(0, t);
    bus.gain.linearRampToValueAtTime(0.5, t + 2);
    bus.connect(master);
    this.ambienceBus = bus;

    const loopNoise = (): AudioBufferSourceNode => {
      const s = c.createBufferSource();
      s.buffer = kit.noise;
      s.loop = true;
      s.start(t, Math.random() * 1.9);
      return s;
    };
    const lfo = (freq: number, depth: number, target: AudioParam): void => {
      const o = c.createOscillator();
      o.frequency.value = freq;
      const g = c.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start(t);
    };

    // Deep room rumble: lowpassed noise whose cutoff and level drift slowly.
    const rumbleLp = c.createBiquadFilter();
    rumbleLp.type = 'lowpass';
    rumbleLp.frequency.value = 150;
    rumbleLp.Q.value = 0.7;
    const rumbleGain = c.createGain();
    rumbleGain.gain.value = 0.3;
    loopNoise().connect(rumbleLp).connect(rumbleGain).connect(bus);
    lfo(0.06, 40, rumbleLp.frequency);
    lfo(0.11, 0.08, rumbleGain.gain);

    // Air handling: broad, quiet band of moving air.
    const airBp = c.createBiquadFilter();
    airBp.type = 'bandpass';
    airBp.frequency.value = 650;
    airBp.Q.value = 0.6;
    const airGain = c.createGain();
    airGain.gain.value = 0.035;
    loopNoise().connect(airBp).connect(airGain).connect(bus);
    lfo(0.045, 250, airBp.frequency);
    lfo(0.083, 0.012, airGain.gain);

    // Electrical and fan hum, slightly detuned pairs so they beat slowly.
    const humLp = c.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 300;
    humLp.connect(bus);
    const hum: Array<[number, number]> = [
      [50, 0.06],
      [50.4, 0.04],
      [100.1, 0.03],
      [150.2, 0.012],
    ];
    for (const [f, a] of hum) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = a;
      o.connect(g).connect(humLp);
      o.start(t);
    }

    this.scheduleAmbienceEvent();
  }

  /** Occasional bubbles and structural creaks, at random intervals. */
  private scheduleAmbienceEvent(): void {
    this.ambienceTimer = setTimeout(() => {
      try {
        const c = this.ctx;
        const kit = this.kit;
        const bus = this.ambienceBus;
        if (c && kit && bus && c.state === 'running') {
          const t = c.currentTime + 0.02;
          if (Math.random() < 0.7) this.bubbles(kit, bus, t);
          else this.creak(kit, bus, t);
        }
      } catch {
        // ignore
      }
      this.scheduleAmbienceEvent();
    }, rnd(2500, 8000));
  }

  private bubbles(k: Kit, d: AudioNode, t: number): void {
    const n = 3 + Math.floor(Math.random() * 4);
    let at = t;
    for (let i = 0; i < n; i++) {
      const f = rnd(220, 650);
      tone(k, d, at, { f0: f, f1: f * rnd(1.5, 2.1), dur: rnd(0.04, 0.08), peak: rnd(0.02, 0.05), attack: 0.004 });
      at += rnd(0.04, 0.16);
    }
  }

  private creak(k: Kit, d: AudioNode, t: number): void {
    const dur = rnd(0.5, 1.1);
    const f = rnd(180, 360);
    burst(k, d, t, { type: 'bandpass', f, f1: f * rnd(0.6, 0.85), q: 14, dur, peak: 0.06, attack: dur * 0.3, sweep: dur });
    tone(k, d, t, { type: 'sawtooth', f0: f * 0.5, f1: f * 0.4, dur, peak: 0.008, attack: dur * 0.3, lp: 300 });
  }

  // -------------------------------------------------------------------------
  // Alarm
  // -------------------------------------------------------------------------

  private buildAlarm(): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    const now = c.currentTime;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.03);

    // Soft clipping for a harsh, slightly overdriven speaker character.
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    shaper.curve = curve;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    shaper.connect(hp).connect(lp).connect(gain).connect(master);

    const oscs: OscillatorNode[] = [];
    for (const [type, det, level] of [
      ['square', 1, 0.6],
      ['sawtooth', 1.006, 0.35],
    ] as const) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = 550 * det;
      const g = c.createGain();
      g.gain.value = level;
      o.connect(g).connect(shaper);
      o.start(now);
      oscs.push(o);
    }

    // Look ahead scheduling of the alternating tones, 0.5 s each.
    let step = 0;
    let next = now;
    const schedule = (): void => {
      try {
        while (next < c.currentTime + 1.0) {
          const base = step % 2 === 0 ? 550 : 440;
          oscs[0].frequency.setTargetAtTime(base, next, 0.005);
          oscs[1].frequency.setTargetAtTime(base * 1.006, next, 0.005);
          step++;
          next += 0.5;
        }
      } catch {
        // ignore
      }
    };
    schedule();
    const timer = setInterval(schedule, 250);
    this.alarm = { gain, oscs, timer };
  }

  // -------------------------------------------------------------------------
  // Tension pulse
  // -------------------------------------------------------------------------

  private updatePulse(): void {
    const c = this.ctx;
    const master = this.master;
    if (!c || !master) return;
    if (this.tension <= 0) {
      if (this.pulseTimer !== null) {
        clearInterval(this.pulseTimer);
        this.pulseTimer = null;
      }
      return;
    }
    if (!this.pulseBus) {
      // Keep the pulse low and rounded so it is felt more than heard.
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 150;
      const bus = c.createGain();
      bus.gain.value = 1;
      lp.connect(bus).connect(master);
      this.pulseBus = lp;
    }
    if (this.pulseTimer === null) {
      this.nextBeat = c.currentTime + 0.05;
      this.pulseTimer = setInterval(() => this.pulseTick(), 100);
      this.pulseTick();
    }
  }

  private pulseTick(): void {
    try {
      const c = this.ctx;
      const kit = this.kit;
      const bus = this.pulseBus;
      if (!c || !kit || !bus) return;
      if (c.state !== 'running') {
        this.nextBeat = c.currentTime + 0.05;
        return;
      }
      while (this.nextBeat < c.currentTime + 0.25) {
        const lvl = this.tension;
        if (lvl <= 0) return;
        const bps = 0.9 + 1.3 * lvl;
        const period = 1 / bps;
        const t = this.nextBeat;
        const amp = 0.25 + 0.55 * lvl;
        // Lub then dub.
        tone(kit, bus, t, { f0: 64, f1: 40, dur: 0.16, peak: amp, attack: 0.006 });
        burst(kit, bus, t, { type: 'lowpass', f: 120, dur: 0.07, peak: amp * 0.4, attack: 0.004 });
        const gap = Math.min(0.24, period * 0.3);
        tone(kit, bus, t + gap, { f0: 54, f1: 36, dur: 0.14, peak: amp * 0.65, attack: 0.006 });
        this.nextBeat += period;
      }
    } catch {
      // ignore
    }
  }
}

export const audio = new AudioEngine();
