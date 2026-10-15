/**
 * Audio, with the original engine's mixing rules:
 * background music loops and crossfades over 1 s; event music fades in over 2 s and ducks the
 * background to 20%; a sound effect is not restarted while the same one is still playing.
 */
import type { GameEvent } from '../core/types';

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  key: string;
}

const FADE = 1;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private music: Voice | null = null;
  private eventMusic: Voice | null = null;
  private sfx: Voice | null = null;
  private wantedMusic: string | null = null;
  private enabled = true;
  private volume = 0.8;

  constructor(private resolve: (key: string) => string | undefined) {}

  /** must be called from a user gesture */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantedMusic) this.playMusic(this.wantedMusic);
  }

  setEnabled(on: boolean, volume = this.volume): void {
    this.enabled = on;
    this.volume = volume;
    if (this.master && this.ctx) {
      const g = this.master.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(on ? volume : 0, this.ctx.currentTime, 0.15);
    }
  }

  handle(e: GameEvent): void {
    if (e.type !== 'audio') return;
    switch (e.channel) {
      case 'music':
        if (e.key) this.playMusic(e.key);
        break;
      case 'eventMusic':
        if (e.key) this.playEventMusic(e.key);
        break;
      case 'stopEventMusic':
        this.stopEventMusic();
        break;
      case 'sfx':
        if (e.key) this.playSfx(e.key);
        break;
    }
  }

  private load(key: string): Promise<AudioBuffer | null> {
    const url = this.resolve(key);
    if (!url || !this.ctx) return Promise.resolve(null);
    let p = this.buffers.get(url);
    if (!p) {
      const ctx = this.ctx;
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  private start(buffer: AudioBuffer, key: string, loop: boolean, from: number, to: number, fade: number): Voice {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(from, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(to, ctx.currentTime + fade);
    source.connect(gain).connect(this.master!);
    source.start();
    return { source, gain, key };
  }

  private fadeOut(v: Voice | null, fade: number): void {
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(0, t + fade);
    try {
      v.source.stop(t + fade + 0.3);
    } catch {
      /* already stopped */
    }
  }

  private ramp(v: Voice | null, to: number, fade: number): void {
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.linearRampToValueAtTime(to, t + fade);
  }

  private playMusic(key: string): void {
    this.wantedMusic = key;
    if (!this.ctx || (this.music && this.music.key === key)) return;
    void this.load(key).then((buffer) => {
      if (!buffer || this.wantedMusic !== key || (this.music && this.music.key === key)) return;
      this.fadeOut(this.music, FADE);
      this.music = this.start(buffer, key, true, 0, this.eventMusic ? 0.2 : 1, FADE);
    });
  }

  private playEventMusic(key: string): void {
    if (!this.ctx) return;
    void this.load(key).then((buffer) => {
      if (!buffer) return;
      this.fadeOut(this.eventMusic, FADE);
      this.ramp(this.music, 0.2, FADE * 2);
      this.eventMusic = this.start(buffer, key, true, 0, 1, FADE * 2);
    });
  }

  private stopEventMusic(): void {
    this.fadeOut(this.eventMusic, FADE * 2);
    this.eventMusic = null;
    this.ramp(this.music, 1, FADE * 2);
  }

  private playSfx(key: string): void {
    if (!this.ctx || (this.sfx && this.sfx.key === key)) return;
    void this.load(key).then((buffer) => {
      if (!buffer) return;
      const v = this.start(buffer, key, false, 1, 1, 0.001);
      this.sfx = v;
      v.source.onended = () => {
        if (this.sfx === v) this.sfx = null;
      };
    });
  }
}
