export type SoundName = "timer-complete" | "goal-completed";

const files: Record<SoundName, string> = {
  "timer-complete": "/sounds/timer-complete.mp3",
  "goal-completed": "/sounds/goal-completed.wav",
};

export function playSound(name: SoundName, volume = 0.8) {
  const a = new Audio(files[name]);
  a.volume = volume;
  a.play().catch(() => {
    // autoplay blocked or file missing – not critical
  });
}

/**
 * Sample-accurate metronome on the Web Audio clock. Beats are scheduled
 * slightly ahead, so timer jitter in the UI thread doesn't affect timing.
 */
export class Metronome {
  private ctx: AudioContext | null = null;
  /** limiter in front of the speakers, so a raised volume gets louder instead of distorting */
  private out: AudioNode | null = null;
  private buffers: { accent: AudioBuffer; beat: AudioBuffer } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private beat = 0;
  private sub = 0;

  bpm = 100;
  /** Beats per bar; the first beat is accented. 0 = no accent. */
  beatsPerBar = 4;
  /** Beats that get a lighter accent, e.g. [3] for 5 = 3+2. */
  groupStarts: number[] = [];
  /** Clicks per beat: 1 = none, 2 = eighths, 3 = triplets … up to 8. */
  subdivision = 1;
  /** 1 = 100 %; the click samples are quiet (about −14 dB), so 100 % plays them three times as loud */
  volume = 1;
  onBeat?: (beatIndex: number) => void;

  get running() {
    return this.timer !== null;
  }

  private async load() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.05;
      limiter.connect(this.ctx.destination);
      this.out = limiter;
    }
    if (!this.buffers) {
      const get = async (url: string) => {
        const res = await fetch(url);
        return this.ctx!.decodeAudioData(await res.arrayBuffer());
      };
      const [accent, beat] = await Promise.all([
        get("/sounds/accent.wav"),
        get("/sounds/beat.wav"),
      ]);
      this.buffers = { accent, beat };
    }
  }

  async start() {
    await this.load();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") await ctx.resume();
    this.stop();
    this.beat = 0;
    this.sub = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  dispose() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.out = null;
    this.buffers = null;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.buffers) return;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const subdivision = Math.max(1, Math.min(8, Math.round(this.subdivision)));
      if (this.sub >= subdivision) this.sub = 0;
      const onBeat = this.sub === 0;
      const inBar = this.beatsPerBar > 0 ? this.beat % this.beatsPerBar : -1;
      const accent = onBeat && inBar === 0;
      const groupAccent = onBeat && !accent && this.groupStarts.includes(inBar);

      const src = ctx.createBufferSource();
      src.buffer = accent || groupAccent ? this.buffers.accent : this.buffers.beat;
      const gain = ctx.createGain();
      const level = this.volume * 3;
      gain.gain.value = !onBeat ? level * 0.35 : groupAccent ? level * 0.6 : level;
      src.connect(gain).connect(this.out ?? ctx.destination);
      src.start(this.nextTime);

      if (onBeat) {
        const index = this.beatsPerBar > 0 ? this.beat % this.beatsPerBar : 0;
        const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
        setTimeout(() => this.onBeat?.(index), delay);
      }

      this.nextTime += 60 / Math.max(20, Math.min(400, this.bpm)) / subdivision;
      this.sub++;
      if (this.sub >= subdivision) {
        this.sub = 0;
        this.beat++;
      }
    }
  }
}
