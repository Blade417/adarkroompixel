/** World: the 61x61 wasteland map, movement, supplies, death and homecoming. Port of world.js rules. */
import { BLUEPRINTS, CRAFTABLES, TILE, TILE_PROBS, WEAPONS, WORLD, landmarks, type Landmark } from '../data';
import type { Game } from '../game';

export type Pos = [number, number];

export interface Expedition {
  map: string[][];
  mask: boolean[][];
  [flag: string]: any;
}

const DIRS = {
  north: [0, -1] as Pos,
  south: [0, 1] as Pos,
  west: [-1, 0] as Pos,
  east: [1, 0] as Pos
};
export type Direction = keyof typeof DIRS;

export class World {
  readonly id = 'world' as const;
  /** original constant names, used by the story content */
  readonly TILE = TILE;
  readonly RADIUS = WORLD.RADIUS;
  readonly VILLAGE_POS = WORLD.VILLAGE_POS;

  initialized = false;
  LANDMARKS: Record<string, Landmark> = {};
  /** temporary copy of the map while exploring; committed only when you get home */
  state: Expedition | null = null;
  curPos: Pos = [WORLD.RADIUS, WORLD.RADIUS];
  health = 0;
  water = 0;
  dead = false;
  danger = false;
  seenAll = false;
  dir = '';
  ship: { x: number; y: number }[] | null = null;
  private foodMove = 0;
  private waterMove = 0;
  private fightMove = 0;
  private starvation = false;
  private thirst = false;
  private usedOutposts: Record<string, boolean> = {};

  constructor(private g: Game) {}

  title(): string {
    return 'A Barren World';
  }

  // ------------------------------------------------------------- setup

  init(): void {
    const s = this.g.store;
    this.LANDMARKS = landmarks(Boolean(s.get('previous.stores')));
    if (s.get('features.location.world') === undefined) {
      s.set('features.location.world', true);
      s.set('features.executioner', true);
      s.setM('game.world', { map: this.generateMap(), mask: this.newMask() });
    } else if (!s.get('features.executioner')) {
      // place the Executioner in maps generated before the expansion
      const map = s.get('game.world.map');
      const l = this.LANDMARKS[TILE.EXECUTIONER];
      for (let i = 0; i < l.num; i++) this.placeLandmark(l.minRadius, l.maxRadius, TILE.EXECUTIONER, map);
      s.set('game.world.map', map);
      s.set('features.executioner', true);
    }
    this.ship = this.mapSearch(TILE.SHIP, s.get('game.world.map'), 1);
    this.dir = this.ship && this.ship.length ? this.compassDir(this.ship[0]) : '';
    this.initialized = true;
    this.testMap();
  }

  generateMap(): string[][] {
    const R = WORLD.RADIUS;
    const map: string[][] = Array.from({ length: R * 2 + 1 }, () => new Array(R * 2 + 1));
    map[R][R] = TILE.VILLAGE;
    // spiral out from the village
    for (let r = 1; r <= R; r++) {
      for (let t = 0; t < r * 8; t++) {
        let x: number, y: number;
        if (t < 2 * r) {
          x = R - r + t;
          y = R - r;
        } else if (t < 4 * r) {
          x = R + r;
          y = R - 3 * r + t;
        } else if (t < 6 * r) {
          x = R + 5 * r - t;
          y = R + r;
        } else {
          x = R - r;
          y = R + 7 * r - t;
        }
        map[x][y] = this.chooseTile(x, y, map);
      }
    }
    for (const k in this.LANDMARKS) {
      const l = this.LANDMARKS[k];
      for (let i = 0; i < l.num; i++) this.placeLandmark(l.minRadius, l.maxRadius, k, map);
    }
    return map;
  }

  isTerrain(tile: string | undefined): boolean {
    return tile === TILE.FOREST || tile === TILE.FIELD || tile === TILE.BARRENS;
  }

  chooseTile(x: number, y: number, map: string[][]): string {
    const R2 = WORLD.RADIUS * 2;
    const adjacent = [
      y > 0 ? map[x][y - 1] : null,
      y < R2 ? map[x][y + 1] : null,
      x < R2 ? map[x + 1][y] : null,
      x > 0 ? map[x - 1][y] : null
    ];
    const chances = new Map<string, number>();
    let nonSticky = 1;
    for (const a of adjacent) {
      if (a === TILE.VILLAGE) return TILE.FOREST; // the village is always in a forest
      if (typeof a === 'string') {
        chances.set(a, (chances.get(a) ?? 0) + WORLD.STICKINESS);
        nonSticky -= WORLD.STICKINESS;
      }
    }
    for (const tile of [TILE.FOREST, TILE.FIELD, TILE.BARRENS]) {
      chances.set(tile, (chances.get(tile) ?? 0) + TILE_PROBS[tile] * nonSticky);
    }
    const list = [...chances.entries()].sort((a, b) => b[1] - a[1]);
    let c = 0;
    const r = this.g.rng.random();
    for (const [tile, p] of list) {
      c += p;
      if (r < c) return tile;
    }
    return TILE.BARRENS;
  }

  placeLandmark(minRadius: number, maxRadius: number, landmark: string, map: string[][]): Pos {
    const R = WORLD.RADIUS;
    let x = R, y = R;
    const rng = this.g.rng;
    while (!this.isTerrain(map[x][y])) {
      const r = Math.floor(rng.random() * (maxRadius - minRadius)) + minRadius;
      let xDist = Math.floor(rng.random() * r);
      let yDist = r - xDist;
      if (rng.random() < 0.5) xDist = -xDist;
      if (rng.random() < 0.5) yDist = -yDist;
      x = Math.min(R * 2, Math.max(0, R + xDist));
      y = Math.min(R * 2, Math.max(0, R + yDist));
    }
    map[x][y] = landmark;
    return [x, y];
  }

  mapSearch(target: string, map: string[][], required?: number): { x: number; y: number }[] | null {
    let max = this.LANDMARKS[target]?.num;
    if (!max) return null;
    max = required ? Math.min(required, max) : max;
    const out: { x: number; y: number }[] = [];
    const R = WORLD.RADIUS;
    for (let i = 0; i <= R * 2; i++) {
      for (let j = 0; j <= R * 2; j++) {
        if (map[i][j].charAt(0) === target) {
          out.push({ x: i - R, y: j - R });
          if (out.length === max) return out;
        }
      }
    }
    return out;
  }

  compassDir(pos: { x: number; y: number }): string {
    const horz = pos.x < 0 ? 'west' : 'east';
    const vert = pos.y < 0 ? 'north' : 'south';
    if (Math.abs(pos.x) / 2 > Math.abs(pos.y)) return horz;
    if (Math.abs(pos.y) / 2 > Math.abs(pos.x)) return vert;
    return vert + horz;
  }

  newMask(): boolean[][] {
    const R = WORLD.RADIUS;
    const mask: boolean[][] = Array.from({ length: R * 2 + 1 }, () => new Array(R * 2 + 1));
    this.lightMap(R, R, mask);
    return mask;
  }

  lightMap(x: number, y: number, mask: boolean[][]): boolean[][] {
    const r = WORLD.LIGHT_RADIUS * (this.g.hasPerk('scout') ? 2 : 1);
    this.uncoverMap(x, y, r, mask);
    return mask;
  }

  uncoverMap(x: number, y: number, r: number, mask: boolean[][]): void {
    const R2 = WORLD.RADIUS * 2;
    mask[x][y] = true;
    for (let i = -r; i <= r; i++) {
      for (let j = -r + Math.abs(i); j <= r - Math.abs(i); j++) {
        if (y + j >= 0 && y + j <= R2 && x + i <= R2 && x + i >= 0) mask[x + i][y + j] = true;
      }
    }
  }

  testMap(): void {
    if (this.seenAll) return;
    const mask: boolean[][] = this.g.store.get('game.world.mask');
    if (!mask) return;
    this.seenAll = mask.every((col) => {
      for (let j = 0; j < col.length; j++) if (!col[j]) return false;
      return true;
    });
  }

  /** the scout's map: uncover a random dark area */
  applyMap(): void {
    if (!this.seenAll) {
      const mask: boolean[][] = this.g.store.get('game.world.mask');
      const size = WORLD.RADIUS * 2 + 1;
      let x: number, y: number;
      do {
        x = Math.floor(this.g.rng.random() * size);
        y = Math.floor(this.g.rng.random() * size);
      } while (mask[x][y]);
      this.uncoverMap(x, y, 5, mask);
    }
    this.testMap();
  }

  // ------------------------------------------------------------- expedition

  onArrival(): void {
    this.g.cooldowns.clear('embarkButton');
    this.g.keyLock = false;
    this.state = structuredClone(this.g.store.get('game.world')) as Expedition;
    this.setWater(this.getMaxWater());
    this.setHp(this.getMaxHealth());
    this.foodMove = 0;
    this.waterMove = 0;
    this.starvation = false;
    this.thirst = false;
    this.usedOutposts = {};
    this.curPos = [WORLD.VILLAGE_POS[0], WORLD.VILLAGE_POS[1]];
    this.dead = false;
    this.g.music('MUSIC_WORLD');
  }

  getDistance(from: Pos = this.curPos, to: Pos = WORLD.VILLAGE_POS): number {
    return Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]);
  }

  getTerrain(): string {
    return this.state!.map[this.curPos[0]][this.curPos[1]];
  }

  getDamage(thing: string): number | 'stun' {
    return WEAPONS[thing].damage;
  }

  canMove(): boolean {
    return this.g.active === 'world' && !this.dead && !this.g.events.active() && !this.g.keyLock && this.state !== null;
  }

  move(direction: Direction): boolean {
    if (!this.canMove()) return false;
    const d = DIRS[direction];
    const R2 = WORLD.RADIUS * 2;
    const nx = this.curPos[0] + d[0];
    const ny = this.curPos[1] + d[1];
    if (nx < 0 || ny < 0 || nx > R2 || ny > R2) return false;
    const state = this.state!;
    const oldTile = state.map[this.curPos[0]][this.curPos[1]];
    this.curPos = [nx, ny];
    this.narrateMove(oldTile, state.map[nx][ny]);
    this.lightMap(nx, ny, state.mask);
    this.g.bus.emit({ type: 'world:move', pos: [nx, ny], tile: state.map[nx][ny] });
    this.g.sfx('FOOTSTEPS_' + (Math.floor(this.g.rng.random() * 5) + 1));
    this.doSpace();
    if (this.state && this.checkDanger()) {
      this.g.notify('world', this.g.t(this.danger ? 'dangerous to be this far from the village without proper protection' : 'safer here'));
    }
    return true;
  }

  narrateMove(oldTile: string, newTile: string): void {
    const msgs: Record<string, string> = {
      [TILE.FOREST + TILE.FIELD]: 'the trees yield to dry grass. the yellowed brush rustles in the wind.',
      [TILE.FOREST + TILE.BARRENS]: 'the trees are gone. parched earth and blowing dust are poor replacements.',
      [TILE.FIELD + TILE.FOREST]: 'trees loom on the horizon. grasses gradually yield to a forest floor of dry branches and fallen leaves.',
      [TILE.FIELD + TILE.BARRENS]: 'the grasses thin. soon, only dust remains.',
      [TILE.BARRENS + TILE.FIELD]: 'the barrens break at a sea of dying grass, swaying in the arid breeze.',
      [TILE.BARRENS + TILE.FOREST]: 'a wall of gnarled trees rises from the dust. their branches twist into a skeletal canopy overhead.'
    };
    const msg = msgs[oldTile + newTile];
    if (msg) this.g.notify('world', this.g.t(msg));
  }

  /** bug fix: the original compared the getDistance function itself with 18 */
  checkDanger(): boolean {
    const s = this.g.store;
    const dist = this.getDistance();
    if (!this.danger) {
      if (s.num('stores["i armour"]') === 0 && dist >= 8) {
        this.danger = true;
        return true;
      }
      if (s.num('stores["s armour"]') === 0 && dist >= 18) {
        this.danger = true;
        return true;
      }
    } else {
      if (dist < 8) {
        this.danger = false;
        return true;
      }
      if (dist < 18 && s.num('stores["i armour"]') > 0) {
        this.danger = false;
        return true;
      }
    }
    return false;
  }

  doSpace(): void {
    const tile = this.getTerrain();
    if (tile === TILE.VILLAGE) {
      this.goHome();
    } else if (tile === TILE.EXECUTIONER) {
      this.g.events.startEvent(this.g.events.content.Executioner[this.state!.executioner ? 'executioner-antechamber' : 'executioner-intro']);
    } else if (this.LANDMARKS[tile] !== undefined) {
      if (tile !== TILE.OUTPOST || !this.outpostUsed()) {
        this.g.events.startEvent(this.g.events.content.Setpieces[this.LANDMARKS[tile].scene]);
      }
    } else if (this.useSupplies()) {
      this.checkFight();
    }
  }

  private useSupplies(): boolean {
    const s = this.g.store;
    const t = this.g.t;
    const outfit = this.g.path.outfit;
    this.foodMove++;
    this.waterMove++;
    const movesPerFood = WORLD.MOVES_PER_FOOD * (this.g.hasPerk('slow metabolism') ? 2 : 1);
    if (this.foodMove >= movesPerFood) {
      this.foodMove = 0;
      let num = (outfit['cured meat'] ?? 0) - 1;
      if (num === 0) {
        this.g.notify('world', t('the meat has run out'));
      } else if (num < 0) {
        num = 0;
        if (!this.starvation) {
          this.g.notify('world', t('starvation sets in'));
          this.starvation = true;
        } else {
          s.set('character.starved', s.num('character.starved'));
          s.add('character.starved', 1);
          if (s.num('character.starved') >= 10 && !this.g.hasPerk('slow metabolism')) this.g.addPerk('slow metabolism');
          this.die();
          return false;
        }
      } else {
        this.starvation = false;
        this.setHp(this.health + this.meatHeal());
      }
      outfit['cured meat'] = num;
    }
    const movesPerWater = WORLD.MOVES_PER_WATER * (this.g.hasPerk('desert rat') ? 2 : 1);
    if (this.waterMove >= movesPerWater) {
      this.waterMove = 0;
      let water = this.water - 1;
      if (water === 0) {
        this.g.notify('world', t('there is no more water'));
      } else if (water < 0) {
        water = 0;
        if (!this.thirst) {
          this.g.notify('world', t('the thirst becomes unbearable'));
          this.thirst = true;
        } else {
          s.set('character.dehydrated', s.num('character.dehydrated'));
          s.add('character.dehydrated', 1);
          if (s.num('character.dehydrated') >= 10 && !this.g.hasPerk('desert rat')) this.g.addPerk('desert rat');
          this.die();
          return false;
        }
      } else {
        this.thirst = false;
      }
      this.setWater(water);
    }
    return true;
  }

  private checkFight(): void {
    this.fightMove++;
    if (this.fightMove > WORLD.FIGHT_DELAY) {
      const chance = WORLD.FIGHT_CHANCE * (this.g.hasPerk('stealthy') ? 0.5 : 1);
      if (this.g.rng.random() < chance) {
        this.fightMove = 0;
        this.g.events.triggerFight();
      }
    }
  }

  meatHeal(): number {
    return WORLD.MEAT_HEAL * (this.g.hasPerk('gastronome') ? 2 : 1);
  }

  medsHeal(): number {
    return WORLD.MEDS_HEAL;
  }

  hypoHeal(): number {
    return WORLD.HYPO_HEAL;
  }

  getMaxHealth(): number {
    const s = this.g.store;
    if (s.num('stores["kinetic armour"]') > 0) return WORLD.BASE_HEALTH + 75;
    if (s.num('stores["s armour"]') > 0) return WORLD.BASE_HEALTH + 35;
    if (s.num('stores["i armour"]') > 0) return WORLD.BASE_HEALTH + 15;
    if (s.num('stores["l armour"]') > 0) return WORLD.BASE_HEALTH + 5;
    return WORLD.BASE_HEALTH;
  }

  getHitChance(): number {
    return this.g.hasPerk('precise') ? WORLD.BASE_HIT_CHANCE + 0.1 : WORLD.BASE_HIT_CHANCE;
  }

  getMaxWater(): number {
    const s = this.g.store;
    if (s.num('stores["fluid recycler"]') > 0) return WORLD.BASE_WATER + 100;
    if (s.num('stores["water tank"]') > 0) return WORLD.BASE_WATER + 50;
    if (s.num('stores.cask') > 0) return WORLD.BASE_WATER + 20;
    if (s.num('stores.waterskin') > 0) return WORLD.BASE_WATER + 10;
    return WORLD.BASE_WATER;
  }

  setWater(w: number): void {
    this.water = Math.min(w, this.getMaxWater());
  }

  setHp(hp: number): void {
    if (typeof hp === 'number' && !isNaN(hp)) this.health = Math.min(hp, this.getMaxHealth());
  }

  outpostUsed(x = this.curPos[0], y = this.curPos[1]): boolean {
    return this.usedOutposts[x + ',' + y] === true;
  }

  useOutpost(): void {
    this.g.notify(null, this.g.t('water replenished'));
    this.setWater(this.getMaxWater());
    this.usedOutposts[this.curPos[0] + ',' + this.curPos[1]] = true;
  }

  markVisited(x: number, y: number): void {
    this.state!.map[x][y] = this.state!.map[x][y] + '!';
  }

  clearDungeon(): void {
    this.state!.map[this.curPos[0]][this.curPos[1]] = TILE.OUTPOST;
    this.drawRoad();
  }

  /** lay a road from here to the nearest road / outpost / the village */
  drawRoad(): void {
    const state = this.state!;
    const R2 = WORLD.RADIUS * 2;
    const findClosestRoad = (start: Pos): Pos => {
      let x = 0, y = 0, dx = 1, dy = -1;
      const limit = Math.pow(this.getDistance(start, WORLD.VILLAGE_POS) + 2, 2);
      for (let i = 0; i < limit; i++) {
        const sx = start[0] + x;
        const sy = start[1] + y;
        if (sx > 0 && sx < R2 && sy > 0 && sy < R2) {
          const tile = state.map[sx][sy];
          if (tile === TILE.ROAD || (tile === TILE.OUTPOST && !(x === 0 && y === 0)) || tile === TILE.VILLAGE) return [sx, sy];
        }
        if (x === 0 || y === 0) {
          const tmp = dx;
          dx = -dy;
          dy = tmp;
        }
        if (x === 0 && y <= 0) x++;
        else {
          x += dx;
          y += dy;
        }
      }
      return [WORLD.VILLAGE_POS[0], WORLD.VILLAGE_POS[1]];
    };
    const closest = findClosestRoad(this.curPos);
    const xDist = this.curPos[0] - closest[0];
    const yDist = this.curPos[1] - closest[1];
    const xDir = Math.abs(xDist) / xDist;
    const yDir = Math.abs(yDist) / yDist;
    let xIntersect: number, yIntersect: number;
    if (Math.abs(xDist) > Math.abs(yDist)) {
      xIntersect = closest[0];
      yIntersect = closest[1] + yDist;
    } else {
      xIntersect = closest[0] + xDist;
      yIntersect = closest[1];
    }
    for (let x = 0; x < Math.abs(xDist); x++) {
      const cx = closest[0] + xDir * x;
      if (this.isTerrain(state.map[cx][yIntersect])) state.map[cx][yIntersect] = TILE.ROAD;
    }
    for (let y = 0; y < Math.abs(yDist); y++) {
      const cy = closest[1] + yDir * y;
      if (this.isTerrain(state.map[xIntersect][cy])) state.map[xIntersect][cy] = TILE.ROAD;
    }
  }

  // ------------------------------------------------------------- death & home

  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.g.keyLock = true;
    this.g.notify('world', this.g.t('the world fades'));
    this.state = null;
    this.g.path.outfit = {};
    this.g.store.remove('outfit');
    this.g.sfx('DEATH');
    this.g.bus.emit({ type: 'world:died' });
    this.g.keyLock = false;
    this.g.tabNavigation = true;
    this.g.setActive('room');
    this.g.cooldowns.start('embarkButton', WORLD.DEATH_COOLDOWN);
  }

  goHome(): void {
    const s = this.g.store;
    const state = this.state!;
    s.setM('game.world', state);
    this.testMap();
    for (const mine of ['sulphur', 'iron', 'coal']) {
      if (state[mine + 'mine'] && s.num(`game.buildings["${mine} mine"]`) === 0) s.add(`game.buildings["${mine} mine"]`, 1);
    }
    if (state.ship && !s.get('features.location.spaceShip')) this.g.ship.init();
    if (state.executioner && !s.get('features.location.fabricator')) {
      this.g.fabricator.init();
      this.g.notify(null, this.g.t('builder knows the strange device when she sees it. takes it for herself real quick. doesn’t ask where it came from.'));
    }
    this.redeemBlueprints();
    this.state = null;
    this.returnOutfit();
    this.g.bus.emit({ type: 'world:home' });
    this.g.tabNavigation = true;
    this.g.setActive('path');
  }

  private redeemBlueprints(): void {
    const outfit = this.g.path.outfit;
    let redeemed = false;
    for (const [blueprint, item] of Object.entries(BLUEPRINTS)) {
      if (outfit[blueprint]) {
        this.g.store.set(`character.blueprints['${item}']`, true);
        delete outfit[blueprint];
        redeemed = true;
      }
    }
    if (redeemed) this.g.notify(null, this.g.t('blueprints feed into the fabricator data port. possibilities grow.'));
  }

  private returnOutfit(): void {
    const outfit = this.g.path.outfit;
    for (const k in outfit) {
      this.g.store.add(`stores["${k}"]`, outfit[k]);
      if (this.leaveItAtHome(k)) outfit[k] = 0;
    }
    this.g.store.set('outfit', { ...outfit }, true);
  }

  leaveItAtHome(thing: string): boolean {
    return !['cured meat', 'bullets', 'energy cell', 'charm', 'medicine', 'stim', 'hypo'].includes(thing) &&
      WEAPONS[thing] === undefined && CRAFTABLES[thing] === undefined;
  }

  /** content compatibility: the original redrew the map; the renderer reads state directly */
  drawMap(): void {}
  updateSupplies(): void {}
}
