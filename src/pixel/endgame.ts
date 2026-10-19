import type { Game } from '../core/game';
import { SPACE } from '../core/data';
import type { Ending } from '../app/endgame';
import { endgameScene, flightShipRect, type EndgameScene } from '../app/endgame-visuals';
import { loadEndgameArt, type EndgameArt } from './endgame-art';
import type { SampleMode } from './resample';

/** Original art with per-piece diagram fallbacks. Rules and collision remain in the core. */
export class EndgameRenderer {
  private readonly buffer = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly display: CanvasRenderingContext2D;
  private art: EndgameArt = {};
  private started = false;
  private loaded = false;
  private effect: { scene: EndgameScene; at: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly sample: SampleMode = 'mode') {
    this.buffer.width = 350; this.buffer.height = 350;
    this.g = this.buffer.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    this.display = canvas.getContext('2d')!;
  }

  pulse(game: Game): void { this.effect = { scene: endgameScene(game.active, null), at: game.clock.now }; }

  source(scene: EndgameScene): 'loading' | 'art' | 'fallback' {
    if (!this.loaded) return 'loading';
    return scene === 'ascent'
      ? this.art['flight-ship'] && [0, 1, 2].every(i => this.art[`asteroid-${i}` as keyof EndgameArt]) ? 'art' : 'fallback'
      : this.art[scene] ? 'art' : 'fallback';
  }

  render(game: Game, ending: Ending | null, reduced: boolean): void {
    // No late-game downloads or baking on the initial room's startup path.
    if (!this.started) {
      this.started = true;
      void loadEndgameArt(this.sample).then(art => { this.art = art; this.loaded = true; });
    }
    const g = this.g;
    const scene = endgameScene(game.active, ending);
    this.canvas.dataset.scene = scene; this.canvas.dataset.art = this.source(scene);
    const flying = game.active === 'space' && !ending;
    const p = ending ? 1 : flying ? game.space.progress() : 0;
    g.fillStyle = p > .7 ? '#070e19' : p > .3 ? '#111d2b' : '#202b32'; g.fillRect(0, 0, 350, 350);
    for (let i = 0; i < 74; i++) {
      const x = (i * 73 + 17) % 350, y = (i * 137 + 43) % 350;
      g.fillStyle = i % 4 ? '#485661' : '#a7aeab';
      g.fillRect(x, Math.floor((y + (flying && !reduced ? game.clock.now / 80 : 0)) % 350), 1, i % 4 ? 1 : 2);
    }
    if (flying) {
      const s = game.space;
      const scale = 350 / SPACE.WIDTH;
      g.save(); g.scale(scale, scale);
      for (const a of s.asteroids) {
        const rock = this.art[`asteroid-${a.id % 3}` as keyof EndgameArt];
        if (rock) {
          // Fill the complete original hazard rectangle; never stretch past its bounds.
          g.fillStyle = '#555950'; g.fillRect(Math.floor(a.x), Math.floor(a.y), a.width, a.height);
          g.drawImage(rock.canvas, Math.floor(a.x), Math.floor(a.y), a.width, a.height);
          continue;
        }
        g.fillStyle = '#8d8980'; g.fillRect(Math.floor(a.x), Math.floor(a.y), a.width, a.height);
        g.fillStyle = '#b0a595'; g.fillRect(Math.floor(a.x) + 3, Math.floor(a.y) + 3, a.width - 6, 7);
        g.fillStyle = '#575951'; g.fillRect(Math.floor(a.x) + 5, Math.floor(a.y) + 19, 8, 9);
      }
      const ship = this.art['flight-ship'];
      if (ship) {
        const r = flightShipRect(Math.round(s.shipX), Math.round(s.shipY));
        g.drawImage(ship.canvas, r.x, r.y, r.w, r.h);
        g.fillStyle = '#c6a35e';
        const length = reduced ? 4 : 4 + Math.floor(game.clock.now / 100) % 3;
        g.fillRect(r.x + 3, r.y + r.h - 1, 2, length); g.fillRect(r.x + r.w - 5, r.y + r.h - 1, 2, length);
        g.fillStyle = '#eedbb0'; g.fillRect(Math.round(s.shipX) - 1, Math.round(s.shipY) - 1, 2, 2);
      } else this.ship(Math.round(s.shipX), Math.round(s.shipY), 1, true, reduced ? 0 : game.clock.now);
      g.restore();
    } else if (ending) {
      // The fleet stays a quiet silhouette so the ending copy carries the reveal.
      if (ending.expansion) for (const [x, y, size] of [[65, 112, 2], [270, 88, 2], [166, 72, 1]]) this.ship(x, y, size, false, 0);
      this.ship(175, 215, 4, true, 0);
      g.fillStyle = '#a9b7bd'; g.fillRect(172, 294, 6, 1);
    } else {
      g.fillStyle = '#303d3c';
      g.beginPath(); g.moveTo(0, 211); g.lineTo(39, 177); g.lineTo(88, 204); g.lineTo(148, 165); g.lineTo(230, 218); g.lineTo(292, 181); g.lineTo(350, 207); g.lineTo(350, 350); g.lineTo(0, 350); g.fill();
      g.fillStyle = '#222b2b'; g.fillRect(0, 252, 350, 98);
      for (let i = 0; i < 80; i++) { g.fillStyle = i % 3 ? '#38403a' : '#4c4d40'; g.fillRect((i * 53) % 350, 257 + (i * 29) % 93, 2 + i % 4, 1); }
      if (game.active === 'fabricator') this.fabricator();
      else {
        g.fillStyle = '#141e22'; g.fillRect(82, 284, 190, 8);
        this.ship(175, 214, 6, false, 0);
        g.fillStyle = '#968a6b'; g.fillRect(119, 267, 5, 20); g.fillRect(226, 267, 5, 20);
        g.strokeStyle = '#59645a'; g.strokeRect(57, 100, 236, 207);
        g.fillStyle = '#c3af7a'; g.fillRect(55, 98, 12, 2); g.fillRect(283, 305, 12, 2);
      }
    }
    const background = scene === 'ascent' ? undefined : this.art[scene];
    if (background) g.drawImage(background.canvas, 0, 0);
    // A brief, restrained rim after a successful action, never an idle animation or a new item.
    if (this.effect?.scene === scene) {
      const age = game.clock.now - this.effect.at;
      if (age >= 0 && age < 700) {
        g.strokeStyle = '#c4b07d'; g.lineWidth = 1;
        g.strokeRect(.5, .5, 349, 349);
      } else this.effect = null;
    }
    this.display.imageSmoothingEnabled = false;
    this.display.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  private ship(x: number, y: number, size: number, flame: boolean, time: number): void {
    const g = this.g;
    g.save(); g.translate(x, y); g.scale(size, size);
    g.fillStyle = '#687b7b'; g.fillRect(-7, -2, 14, 12); g.fillRect(-10, 3, 20, 7);
    g.fillStyle = '#a7ae9c'; g.fillRect(-4, -11, 8, 18); g.fillRect(-2, -15, 4, 4);
    g.fillStyle = '#d0c7a0'; g.fillRect(-2, -11, 2, 12);
    g.fillStyle = '#30474e'; g.fillRect(-2, -7, 4, 5);
    g.fillStyle = '#d9b96e'; g.fillRect(-1, -6, 2, 2);
    g.fillStyle = '#243439'; g.fillRect(-7, 8, 4, 4); g.fillRect(3, 8, 4, 4);
    if (flame) {
      g.fillStyle = '#bb8050'; g.fillRect(-6, 12, 2, 4 + Math.floor(time / 80) % 3); g.fillRect(4, 12, 2, 4 + Math.floor(time / 80) % 3);
      g.fillStyle = '#e2c88c'; g.fillRect(-5, 12, 1, 3); g.fillRect(4, 12, 1, 3);
    }
    g.restore();
  }

  private fabricator(): void {
    const g = this.g;
    g.fillStyle = '#162126'; g.fillRect(83, 145, 186, 146);
    g.fillStyle = '#65736a'; g.fillRect(99, 130, 151, 17); g.fillRect(99, 279, 151, 12);
    g.fillStyle = '#455754'; g.fillRect(111, 149, 15, 127); g.fillRect(224, 149, 15, 127);
    g.fillStyle = '#ad9c6a'; g.fillRect(126, 166, 98, 4); g.fillRect(162, 170, 26, 17);
    g.fillStyle = '#bac6a9'; g.fillRect(170, 187, 10, 13);
    g.fillStyle = '#83998b'; g.fillRect(139, 235, 71, 4);
    g.fillStyle = '#d3bd7a'; g.fillRect(167, 220, 16, 15);
    g.fillStyle = '#728d80'; g.fillRect(95, 190, 7, 39);
    g.fillStyle = '#b8b687'; g.fillRect(96, 194, 4, 4); g.fillRect(96, 205, 4, 4);
    g.strokeStyle = '#a89a69'; g.strokeRect(128, 174, 94, 87);
  }
}
