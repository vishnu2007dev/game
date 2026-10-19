/** Minimal tween runner ticked from the render loop. */
type Ease = (t: number) => number;

export const ease = {
  out: (t: number) => 1 - (1 - t) ** 3,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // A toggle bat snaps past centre and settles, like a real over-centre spring.
  snap: (t: number) => {
    const c = 2.2;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
};

interface Tween {
  start: number;
  dur: number;
  step: (k: number) => void;
  ease: Ease;
  done: () => void;
}

export class Tweens {
  private list: Tween[] = [];
  private now = 0;

  run(dur: number, step: (k: number) => void, e: Ease = ease.out): Promise<void> {
    return new Promise((done) => this.list.push({ start: this.now, dur, step, ease: e, done }));
  }

  tick(now: number) {
    this.now = now;
    this.list = this.list.filter((tw) => {
      const k = Math.min(1, (now - tw.start) / tw.dur);
      tw.step(tw.ease(k));
      if (k >= 1) tw.done();
      return k < 1;
    });
  }
}
