/**
 * Space: the ascent. Dodge asteroids for 60 seconds. Port of space.js rules, simulated in the
 * original's 700x700 logical units so any renderer (2D or 3D) can map it onto its own view.
 */
import { ASTEROID_CHARS, SPACE, altitudeName } from '../data';
import type { Game } from '../game';
import type { TimerId, TimerSnapshot } from '../clock';

export interface Asteroid {
  id: number;
  char: string;
  x: number;
  /** top edge */
  y: number;
  width: number;
  height: number;
  /** ms to fall from -40 to HEIGHT + 40 */
  duration: number;
  born: number;
}

export interface SpaceSnapshot {
  version: 1;
  hull: number; altitude: number; shipX: number; shipY: number;
  asteroids: (Omit<Asteroid, 'born'> & { age: number })[];
  nextAsteroidId: number;
  lastMoveAge: number | null;
  timers: TimerSnapshot[];
  spawn: TimerSnapshot | null;
}

export class Space {
  readonly id = 'space' as const;
  hull = 0;
  altitude = 0;
  done = true;
  shipX = SPACE.WIDTH / 2;
  shipY = SPACE.HEIGHT / 2;
  /** directional input (keyboard / stick) */
  input = { up: false, down: false, left: false, right: false };
  /** pointer steering target, overrides directional input while set */
  target: { x: number; y: number } | null = null;
  asteroids: Asteroid[] = [];
  private nextAsteroidId = 1;
  private timers: TimerId[] = [];
  private spawnTimer: TimerId | null = null;
  private lastMove: number | null = null;

  constructor(private g: Game) {}

  title(): string {
    return altitudeName(this.altitude);
  }

  speed(): number {
    return SPACE.SHIP_SPEED + this.g.ship.thrusters;
  }

  /** 0 at lift-off, 1 when the sky has turned fully dark (end of the ascent) */
  progress(): number {
    return Math.min(1, this.altitude / 60);
  }

  onArrival(): void {
    this.stopTimers();
    this.done = false;
    this.g.keyLock = false;
    this.hull = this.g.ship.hull;
    this.altitude = 0;
    this.input = { up: false, down: false, left: false, right: false };
    this.target = null;
    this.asteroids = [];
    this.shipX = SPACE.WIDTH / 2;
    this.shipY = SPACE.HEIGHT / 2;
    this.lastMove = null;
    this.g.music('MUSIC_SPACE');
    this.g.bus.emit({ type: 'space:start' });
    const clock = this.g.clock;
    // the original ends the ascent when its 60 s background fade completes (not affected by hyper)
    this.timers.push(clock.setTimeout(() => this.endGame(), SPACE.FTB_SPEED, true));
    this.timers.push(clock.setInterval(() => {
      if (this.altitude <= 60) this.altitude += 1;
    }, 1000, true));
    this.timers.push(clock.setInterval(() => this.frame(), SPACE.FRAME_MS, true));
    this.createAsteroid();
  }

  snapshot(): SpaceSnapshot | null {
    if (this.done) return null;
    return {
      version: 1, hull: this.hull, altitude: this.altitude, shipX: this.shipX, shipY: this.shipY,
      asteroids: this.asteroids.map(({ born, ...a }) => ({ ...a, age: this.g.clock.now - born })),
      nextAsteroidId: this.nextAsteroidId,
      lastMoveAge: this.lastMove === null ? null : this.g.clock.now - this.lastMove,
      timers: this.timers.map(id => this.g.clock.snapshot(id)!), spawn: this.g.clock.snapshot(this.spawnTimer)
    };
  }

  /** Restore residual timers and falling rocks without spawning a new wave or resetting hull. */
  resume(saved: SpaceSnapshot): void {
    this.stopTimers();
    this.done = false;
    this.hull = saved.hull; this.altitude = saved.altitude;
    this.shipX = saved.shipX; this.shipY = saved.shipY;
    this.asteroids = saved.asteroids.map(({ age, ...a }) => ({ ...a, born: this.g.clock.now - age }));
    this.nextAsteroidId = saved.nextAsteroidId;
    this.lastMove = saved.lastMoveAge === null ? null : this.g.clock.now - saved.lastMoveAge;
    this.clearInput();
    const actions = [() => this.endGame(), () => { if (this.altitude <= 60) this.altitude++; }, () => this.frame()];
    this.timers = saved.timers.map((timer, i) => this.g.clock.resume(actions[i], timer));
    if (saved.spawn) this.spawnTimer = this.g.clock.resume(() => this.createAsteroid(), saved.spawn);
    this.g.music('MUSIC_SPACE');
  }

  clearInput(): void {
    this.input = { up: false, down: false, left: false, right: false };
    this.target = null;
  }

  /** Used when the owning game is disposed; it must not leave ascent timers alive. */
  stop(): void { this.stopTimers(); this.clearInput(); }

  private frame(): void {
    if (this.done) return;
    this.moveShip();
    this.updateAsteroids();
  }

  private moveShip(): void {
    const now = this.g.clock.now;
    const step = this.lastMove != null ? (now - this.lastMove) / 33 : 1;
    let x = this.shipX;
    let y = this.shipY;
    if (this.target) {
      const vx = this.target.x - x;
      const vy = this.target.y - y;
      const dist = Math.hypot(vx, vy);
      const move = this.speed() * step;
      if (dist > 0.5) {
        x += (vx / dist) * Math.min(move, dist);
        y += (vy / dist) * Math.min(move, dist);
      }
    } else {
      let dx = 0, dy = 0;
      if (this.input.up) dy -= this.speed();
      else if (this.input.down) dy += this.speed();
      if (this.input.left) dx -= this.speed();
      else if (this.input.right) dx += this.speed();
      if (dx !== 0 && dy !== 0) {
        dx /= Math.SQRT2;
        dy /= Math.SQRT2;
      }
      x += dx * step;
      y += dy * step;
    }
    this.shipX = Math.min(SPACE.WIDTH - 10, Math.max(10, x));
    this.shipY = Math.min(SPACE.HEIGHT - 10, Math.max(10, y));
    this.lastMove = now;
  }

  createAsteroid(noNext?: boolean): void {
    if (this.done) return;
    const rng = this.g.rng;
    const r = rng.random();
    const char = ASTEROID_CHARS[Math.min(4, Math.floor(r / 0.2))];
    const x = Math.floor(rng.random() * SPACE.WIDTH);
    const duration = SPACE.BASE_ASTEROID_SPEED - Math.floor(rng.random() * (SPACE.BASE_ASTEROID_SPEED * 0.65));
    this.asteroids.push({
      id: this.nextAsteroidId++, char, x, y: -40,
      width: SPACE.ASTEROID_W, height: SPACE.ASTEROID_H, duration, born: this.g.clock.now
    });
    if (!noNext) {
      if (this.altitude > 10) this.createAsteroid(true);
      if (this.altitude > 20) {
        this.createAsteroid(true);
        this.createAsteroid(true);
      }
      if (this.altitude > 40) {
        this.createAsteroid(true);
        this.createAsteroid(true);
      }
      if (!this.done) {
        this.spawnTimer = this.g.clock.setTimeout(() => this.createAsteroid(), 1000 - this.altitude * 10, true);
        this.g.requestSave();
      }
    }
  }

  private updateAsteroids(): void {
    const now = this.g.clock.now;
    const travel = SPACE.HEIGHT + 80;
    for (const a of [...this.asteroids]) {
      const t = (now - a.born) / a.duration;
      if (t >= 1) {
        this.asteroids.splice(this.asteroids.indexOf(a), 1);
        continue;
      }
      a.y = -40 + travel * t;
      if (a.x <= this.shipX && a.x + a.width >= this.shipX && a.y <= this.shipY && a.y + a.height >= this.shipY) {
        this.asteroids.splice(this.asteroids.indexOf(a), 1);
        this.hit();
        if (this.done) return;
      }
    }
  }

  private hit(): void {
    this.hull--;
    let r = Math.floor(this.g.rng.random() * 2);
    if (this.altitude > 40) r += 6;
    else if (this.altitude > 20) r += 4;
    else r += 1;
    this.g.sfx('ASTEROID_HIT_' + r);
    this.g.bus.emit({ type: 'space:hit', hull: this.hull });
    if (this.hull === 0) this.crash();
  }

  private stopTimers(): void {
    for (const id of this.timers) this.g.clock.clear(id);
    this.timers = [];
    this.g.clock.clear(this.spawnTimer);
    this.spawnTimer = null;
  }

  crash(): void {
    if (this.done) return;
    this.done = true;
    this.stopTimers();
    this.asteroids = [];
    this.g.bus.emit({ type: 'space:crash' });
    this.g.setActive('ship');
    this.g.cooldowns.start('liftoffButton', 120);
    this.g.sfx('CRASH');
  }

  private endGame(): void {
    if (this.done) return;
    this.done = true;
    this.stopTimers();
    this.asteroids = [];
    this.g.finish();
  }
}
