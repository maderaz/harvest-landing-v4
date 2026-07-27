// Sound, synthesised. No audio files ship with this page - the harbour, the
// wind, the gulls, footsteps and the church bell are all made from noise
// buffers and oscillators at runtime.

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private gullTimer = 0;
  private started = false;
  enabled = false;

  /** Must be called from a user gesture. */
  async start() {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.started = true;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // Two seconds of white noise, reused by every effect.
    const length = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    // Surf: low-passed noise with a slow swell on the gain.
    const surf = this.ctx.createBufferSource();
    surf.buffer = this.noise;
    surf.loop = true;
    const surfFilter = this.ctx.createBiquadFilter();
    surfFilter.type = "lowpass";
    surfFilter.frequency.value = 420;
    const surfGain = this.ctx.createGain();
    surfGain.gain.value = 0.18;
    const swell = this.ctx.createOscillator();
    swell.frequency.value = 0.11;
    const swellDepth = this.ctx.createGain();
    swellDepth.gain.value = 0.09;
    swell.connect(swellDepth).connect(surfGain.gain);
    surf.connect(surfFilter).connect(surfGain).connect(this.master);
    surf.start();
    swell.start();

    // Wind: band-passed noise, drifting.
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 620;
    windFilter.Q.value = 0.7;
    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.05;
    const drift = this.ctx.createOscillator();
    drift.frequency.value = 0.07;
    const driftDepth = this.ctx.createGain();
    driftDepth.gain.value = 300;
    drift.connect(driftDepth).connect(windFilter.frequency);
    wind.connect(windFilter).connect(windGain).connect(this.master);
    wind.start();
    drift.start();

    this.setEnabled(this.enabled);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.6 : 0, now, 0.4);
    if (on) void this.ctx.resume();
  }

  private burst(duration: number, frequency: number, type: BiquadFilterType, gain: number, sweep = 0) {
    if (!this.ctx || !this.noise || !this.master || !this.enabled) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, now);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(60, frequency + sweep), now + duration);
    filter.Q.value = 1.1;
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0005, now + duration);
    source.connect(filter).connect(envelope).connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  footstep(surface: "ground" | "wood" | "water") {
    if (surface === "wood") this.burst(0.11, 1500, "bandpass", 0.3, -900);
    else if (surface === "water") this.burst(0.32, 900, "lowpass", 0.34, 1400);
    else this.burst(0.13, 700, "lowpass", 0.26, -320);
  }

  splash() {
    this.burst(0.6, 1600, "lowpass", 0.5, -1300);
  }

  land(impact: number) {
    this.burst(0.18, 260, "lowpass", Math.min(0.5, impact * 0.045), -140);
  }

  /** Two struck partials with a long decay: a small bronze bell. */
  bell() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const now = this.ctx.currentTime;
    for (const [ratio, gain, decay] of [
      [1, 0.24, 3.4],
      [2.76, 0.12, 2.2],
      [5.4, 0.05, 1.4],
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 392 * ratio;
      const envelope = this.ctx.createGain();
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(gain, now + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0005, now + decay);
      osc.connect(envelope).connect(this.master);
      osc.start(now);
      osc.stop(now + decay + 0.1);
    }
  }

  /** Occasional gull cry, called from the render loop. */
  tick(dt: number) {
    if (!this.ctx || !this.master || !this.enabled) return;
    this.gullTimer -= dt;
    if (this.gullTimer > 0) return;
    this.gullTimer = 6 + Math.random() * 14;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const base = 900 + Math.random() * 500;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, now + 0.22);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = base;
    filter.Q.value = 4;
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(0.06, now + 0.03);
    envelope.gain.exponentialRampToValueAtTime(0.0005, now + 0.35);
    osc.connect(filter).connect(envelope).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
