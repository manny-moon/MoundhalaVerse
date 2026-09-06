/**
 * Scene audio. Experimental.
 *
 * Every sound here is synthesised at runtime from oscillators and filtered
 * noise. Nothing is downloaded, which keeps the whole feature at zero bytes of
 * assets and matches how the rest of the scene works: the planets are shaded
 * procedurally rather than textured from files.
 *
 * Three rules shape the design.
 *
 * Off by default, always. People read portfolios in open offices and on public
 * transport, and unsolicited audio is the fastest way to get a tab closed.
 *
 * Nothing can start without a gesture. Browsers create an AudioContext in a
 * suspended state and only allow it to run after a real interaction, so the
 * context is not even constructed until the reader turns sound on. That is a
 * platform rule, not a limitation worth fighting.
 *
 * Quiet enough to be missed. Every gain here is deliberately low; the ambient
 * bed sits near the threshold of noticing. A sound that draws attention to
 * itself is worse than no sound.
 */

import { isActive, onActivityChange } from './activity';

/** Master ceiling. Nothing in here should ever approach unity gain. */
const MASTER_GAIN = 0.32;

export class SceneAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bed: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private releaseActivity: (() => void) | null = null;
  private on = false;

  get enabled(): boolean {
    return this.on;
  }

  /**
   * Starts audio. Must be called from a user gesture or the context will be
   * created suspended and never produce a sound.
   */
  async enable(): Promise<void> {
    if (this.on) return;

    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return; // No Web Audio: stay silent rather than throw.
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }

    // Resuming is what the gesture actually buys; on some browsers a context
    // constructed outside one starts suspended and stays that way.
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.on = true;
    this.fadeMaster(MASTER_GAIN, 1.2);
    this.startBed();

    // A page nobody can see should not be making noise.
    this.releaseActivity ??= onActivityChange((active) => {
      if (!this.ctx || !this.on) return;
      if (active) void this.ctx.resume();
      else void this.ctx.suspend();
    });
  }

  disable(): void {
    if (!this.on || !this.ctx) return;
    this.on = false;
    this.fadeMaster(0, 0.4);
    // Let the fade finish before tearing the bed down, or it clicks. Then
    // suspend, so a switched-off scene is not still running an audio graph.
    window.setTimeout(() => {
      if (this.on) return;
      this.stopBed();
      void this.ctx?.suspend();
    }, 500);
  }

  /**
   * A rising, filtered-noise swell for the length of a camera flight, panned
   * gently across so the move has a direction.
   */
  flight(seconds: number): void {
    const ctx = this.readyContext();
    if (!ctx || !this.master) return;

    const noise = this.noiseSource(ctx, seconds + 0.4);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.1;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();

    const now = ctx.currentTime;
    // Sweeping the band upward as the camera accelerates, then back down as it
    // settles, is what makes it read as movement rather than as hiss.
    band.frequency.setValueAtTime(190, now);
    band.frequency.linearRampToValueAtTime(1250, now + seconds * 0.45);
    band.frequency.exponentialRampToValueAtTime(240, now + seconds);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + seconds * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);

    pan.pan.setValueAtTime(-0.5, now);
    pan.pan.linearRampToValueAtTime(0.5, now + seconds);

    noise.connect(band).connect(gain).connect(pan).connect(this.master);
    noise.start(now);
    noise.stop(now + seconds + 0.3);
  }

  /** A short two-tone blip when a section is chosen. */
  select(): void {
    this.blip([523.25, 783.99], 0.16, 0.09);
  }

  /** The same shape, lower and softer, on the way back out. */
  close(): void {
    this.blip([392.0, 261.63], 0.2, 0.055);
  }

  dispose(): void {
    this.releaseActivity?.();
    this.releaseActivity = null;
    this.stopBed();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.on = false;
  }

  // --- Internals -----------------------------------------------------------

  private readyContext(): AudioContext | null {
    if (!this.on || !this.ctx || this.ctx.state !== 'running' || !isActive()) return null;
    return this.ctx;
  }

  private fadeMaster(to: number, seconds: number): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  /**
   * The ambient bed: three detuned sines low in the register. Detuning is what
   * makes it drift and beat slowly instead of sitting still as a dead tone.
   */
  private startBed(): void {
    if (!this.ctx || !this.master || this.bed) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;

    const osc = [55, 82.41, 110].map((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.detune.value = (i - 1) * 7;
      o.connect(gain);
      o.start();
      return o;
    });

    gain.connect(filter).connect(this.master);
    this.bed = { osc, gain };
  }

  private stopBed(): void {
    if (!this.bed) return;
    for (const o of this.bed.osc) {
      try {
        o.stop();
      } catch {
        // Already stopped; nothing to do.
      }
    }
    this.bed = null;
  }

  private blip(freqs: number[], seconds: number, peak: number): void {
    const ctx = this.readyContext();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const at = now + i * seconds * 0.45;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      o.connect(g).connect(this.master!);
      o.start(at);
      o.stop(at + seconds + 0.05);
    });
  }

  /** White noise in a short looping buffer, cheaper than generating per frame. */
  private noiseSource(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
    const frames = Math.ceil(ctx.sampleRate * Math.max(seconds, 1));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}
