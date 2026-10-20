import manifest from '../../assets/pixel/expedition/v1/manifest.json';
import equipmentManifest from '../../assets/pixel/expedition/v2/manifest.json';
import siteManifest from '../../assets/pixel/expedition/v3/manifest.json';
import midManifest from '../../assets/pixel/expedition/v4/manifest.json';
import deepManifest from '../../assets/pixel/expedition/v5/manifest.json';
import warshipManifest from '../../assets/pixel/expedition/v6/manifest.json';
import equipmentV7 from '../../assets/pixel/expedition/v7/manifest.json';
import wildManifest from '../../assets/pixel/expedition/v8/manifest.json';
import treeManifest from '../../assets/pixel/village/v2/manifest.json';
import houseManifest from '../../assets/pixel/village/v1/manifest.json';
import { ctx2d, hash, makeCanvas } from './paint';
import { resample } from './resample';
import type { ExpeditionView } from '../app/expedition';
import { TILE, WORLD } from '../core/data';
import { EARLY_ENCOUNTERS, WEAPON_ART } from '../app/expedition-catalog';
import { landmarkArt, SITE_ENEMY_ART, sitePresentation } from '../app/expedition-art';
import { ARMOUR_RIGS, WEAPON_RIGS, projectilePosition, visibleWeapon } from '../app/expedition-equipment';
import { loadArtImage } from './loading';
import { loadPackedArt } from './runtime-art';

export type ExpeditionArt = Record<string, HTMLCanvasElement>;
type SpriteSpec = { file: string; sourceRect: number[]; drawSize: number[]; hasAlpha: boolean };
const urls = import.meta.glob([
  '../../assets/pixel/expedition/v1/forest-battle.png',
  '../../assets/pixel/expedition/v1/beast.png', '../../assets/pixel/village/v2/trees.png',
  '../../assets/pixel/expedition/v2/*.png',
  '../../assets/pixel/expedition/v3/*.png',
  '../../assets/pixel/expedition/v4/*.png',
  '../../assets/pixel/expedition/v5/*.png',
  '../../assets/pixel/expedition/v6/*.png',
  '../../assets/pixel/expedition/v7/*.png',
  '../../assets/pixel/expedition/v8/*.png',
  '!../../assets/pixel/expedition/v8/wild-feral-terror.png',
  '../../assets/pixel/village/v1/hearth-house.png'
], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const expeditionAssetUrls = Object.values(urls);

export async function loadExpeditionArt(packed = true): Promise<ExpeditionArt> {
  const ready = packed ? await loadPackedArt('expedition') : null;
  if (ready) return Object.fromEntries(Object.entries(ready.sprites).map(([id, s]) => [id, s.canvas]));
  const specs: Record<string, SpriteSpec> = {
    ...Object.fromEntries(Object.entries(manifest.assets).filter(([id]) => id === 'background' || id.startsWith('beast-'))),
    ...equipmentManifest.assets,
    ...siteManifest.assets,
    ...midManifest.assets,
    ...deepManifest.assets,
    ...warshipManifest.assets,
    ...equipmentV7.assets,
    ...wildManifest.assets,
    tree: { ...treeManifest.assets.tree0, drawSize: [13, 25] },
    village: { ...houseManifest.assets.hearth, drawSize: [27, 19] }
  };
  const sources = new Map<string, Promise<HTMLImageElement>>();
  return Object.fromEntries(await Promise.all(Object.entries(specs).map(async ([id, spec]) => {
    if (!sources.has(spec.file)) sources.set(spec.file, (async () => {
      const source = Object.entries(urls).find(([path]) => path.endsWith('/' + spec.file))?.[1];
      if (!source) throw Error(`Missing expedition art: ${spec.file}`);
      return loadArtImage(source);
    })());
    const image = await sources.get(spec.file)!;
    const [x, y, w, h] = spec.sourceRect, [dw, dh] = spec.drawSize;
    const crop = makeCanvas(w, h), cg = ctx2d(crop);
    cg.drawImage(image, x, y, w, h, 0, 0, w, h);
    const pixels = resample(cg.getImageData(0, 0, w, h), dw, dh, { mode: spec.hasAlpha ? 'box' : 'mode', alphaCut: spec.hasAlpha ? 0.5 : null });
    const canvas = makeCanvas(dw, dh), g = ctx2d(canvas), output = g.createImageData(dw, dh);
    output.data.set(pixels.data); g.putImageData(output, 0, 0);
    return [id, canvas];
  })));
}

export class ExpeditionRenderer {
  private readonly scene = makeCanvas(576, 324);
  private readonly g = ctx2d(this.scene);
  private readonly display: CanvasRenderingContext2D;
  private enemyAction = -Infinity;
  private playerHit = -Infinity;
  private enemyHit = -Infinity;
  private unlisten: (() => void) | null = null;
  private bound: ExpeditionView | null = null;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly art: ExpeditionArt) {
    this.display = ctx2d(canvas);
  }
  private bind(slice: ExpeditionView): void {
    if (this.bound === slice) return;
    this.unlisten?.(); this.bound = slice;
    this.enemyAction = this.playerHit = this.enemyHit = -Infinity;
    this.unlisten = slice.game.bus.on(event => {
      if (event.type !== 'combat:attack') return;
      const now = slice.game.clock.now;
      if (event.attacker === 'wanderer') { if (event.result.startsWith('-')) this.enemyHit = now; }
      else { this.enemyAction = now; if (event.result.startsWith('-')) this.playerHit = now; }
    });
  }
  render(slice: ExpeditionView, reduced: boolean): void {
    this.bind(slice);
    const combat = slice.game.events.active()?.combat;
    if (combat) this.battle(slice, reduced);
    else if (sitePresentation(slice.game)) this.site(slice);
    else if (slice.game.active === 'world') this.map(slice);
    else {
      this.g.drawImage(this.art[slice.phase === 'pack' ? slice.encounter.background : 'background'], 0, 0);
      this.g.save();
      if (slice.phase === 'dead') this.g.globalAlpha = .2;
      this.drawPlayer(282, 252, 'idle', slice.displayWeapon, slice.game.path.armour());
      this.g.restore();
    }
    this.display.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.display.drawImage(this.scene, 0, 0, this.canvas.width, this.canvas.height);
  }
  private site(slice: ExpeditionView): void {
    const place = sitePresentation(slice.game)!;
    this.g.drawImage(this.art[place.background], 0, 0);
    if (place.overlay) {
      const landmark = this.art[place.overlay];
      this.g.drawImage(landmark, Math.round(420 - landmark.width / 2), 257 - landmark.height);
    }
    this.drawPlayer(145, 257, 'idle', slice.displayWeapon, slice.game.path.armour());
    if (place.resident) {
      const resident = this.art[place.resident];
      this.g.drawImage(resident, Math.round(420 - resident.width / 2), 257 - resident.height);
    }
  }
  private drawPlayer(x: number, ground: number, pose: 'idle' | 'attack' | 'hurt', weapon: string, armour: string, throwing = false): { x: number; y: number } {
    const rig = ARMOUR_RIGS[armour] ?? 'body';
    const g = this.g, sprite = this.art[rig + '-' + pose];
    const left = Math.round(x - sprite.width / 2), top = ground - sprite.height;
    g.drawImage(sprite, left, top);
    const anchor = rig === 'body' ? equipmentManifest.hands[pose]
      : equipmentV7.hands[armour as keyof typeof equipmentV7.hands][pose];
    const hand = { x: left + sprite.width * anchor[0], y: top + sprite.height * anchor[1] };
    const equipment = this.art[WEAPON_ART[weapon]];
    if (!equipment || throwing) return hand;
    g.save(); g.translate(Math.round(hand.x), Math.round(hand.y));
    const weaponRig = WEAPON_RIGS[weapon];
    const angle = pose === 'attack' ? 0 : weaponRig.restAngle;
    g.rotate(angle);
    g.drawImage(equipment, -Math.round(equipment.width * weaponRig.grip), -Math.round(equipment.height * weaponRig.gripY));
    g.restore();
    return hand;
  }
  private map(slice: ExpeditionView): void {
    const g = this.g, game = slice.game;
    const pos = game.active === 'world' ? game.world.curPos : WORLD.VILLAGE_POS;
    const mask = game.world.state?.mask ?? game.store.get('game.world.mask');
    const walkedCells = new Set(slice.trail.map(p => p.join(',')));
    g.fillStyle = '#10191c'; g.fillRect(0, 0, 576, 324);
    g.save(); g.translate(-288, -162); g.scale(2, 2);
    for (let dy = -7; dy <= 7; dy++) for (let dx = -12; dx <= 12; dx++) {
      const x = pos[0] + dx, y = pos[1] + dy, sx = 276 + dx * 24, sy = 150 + dy * 24;
      if (x < 0 || y < 0 || x > WORLD.RADIUS * 2 || y > WORLD.RADIUS * 2) continue;
      const revealed = mask?.[x]?.[y];
      const shade = hash(x, y);
      if (!revealed) {
        g.fillStyle = '#142025'; g.fillRect(sx, sy, 24, 24);
        g.fillStyle = '#1c292b'; if (shade > .5) g.fillRect(sx + 9, sy + 9, 2, 2);
        continue;
      }
      const terrain = (game.world.state?.map ?? game.store.get('game.world.map'))[x][y];
      const forest = terrain === TILE.FOREST, field = terrain === TILE.FIELD;
      g.fillStyle = forest ? shade > .6 ? '#323a32' : '#2b342e' : field ? shade > .6 ? '#4e5140' : '#434938' : shade > .6 ? '#544c42' : '#49443c'; g.fillRect(sx, sy, 24, 24);
      g.fillStyle = forest ? '#45483a' : field ? '#777354' : '#786a56'; for (let dot = 0; dot < 7; dot++) g.fillRect(sx + Math.floor(hash(x, y, dot) * 23), sy + Math.floor(hash(y, x, dot) * 23), field ? 1 : 2, field ? 3 : 1);
      const walked = walkedCells.has(`${x},${y}`);
      if (walked) {
        g.fillStyle = '#665c43'; g.fillRect(sx + 9, sy + 10, 6, 4);
      }
      if (x === WORLD.RADIUS && y === WORLD.RADIUS) {
        g.fillStyle = '#777057'; g.fillRect(sx + 2, sy + 6, 20, 15);
        g.drawImage(this.art.village, sx - 2, sy - 2);
        continue;
      }
      const visited = terrain.endsWith('!');
      const landmark = game.world.LANDMARKS[terrain.replace(/!$/, '')];
      if (landmark || terrain === TILE.OUTPOST) {
        const iconId = landmarkArt(terrain), icon = iconId ? this.art[iconId] : null;
        if (icon) {
          g.save(); if (visited) g.globalAlpha = .65;
          g.drawImage(icon, sx + Math.round((24 - icon.width) / 2), sy + 23 - icon.height);
          g.restore();
        } else {
          g.fillStyle = visited ? '#747a6b' : '#b8a17b';
          g.fillRect(sx + 3, sy + 3, 18, 18);
          g.fillStyle = '#172024'; g.font = 'bold 14px monospace'; g.textAlign = 'center';
          g.fillText(terrain[0], sx + 12, sy + 17);
        }
        if (visited) { g.fillStyle = '#c5cea0'; g.fillRect(sx + 18, sy + 18, 3, 3); }
      } else if (terrain === TILE.ROAD) {
        g.fillStyle = '#99815c'; g.fillRect(sx + 9, sy, 6, 24); g.fillRect(sx, sy + 9, 24, 6);
      } else if (forest && !walked && (dx !== 0 || dy !== 0) && shade > .24) g.drawImage(this.art.tree, sx - 2 + Math.floor(hash(y, x) * 6), sy - 7);
      g.strokeStyle = '#53604d35'; g.strokeRect(sx, sy, 24, 24);
    }
    const dir = slice.direction;
    const armour = game.path.armour(), prefix = armour === 'none' ? '' : (ARMOUR_RIGS[armour] + '-');
    const sprite = this.art[prefix + (dir === 'north' ? 'map-north' : dir === 'south' ? 'map-south' : 'map-east')];
    g.save(); if (dir === 'west') { g.translate(576, 0); g.scale(-1, 1); }
    g.fillStyle = '#d2b47e'; g.fillRect(285, 170, 6, 2);
    g.drawImage(sprite, 288 - Math.floor(sprite.width / 2), 171 - sprite.height);
    g.restore();
    g.restore();
    // Compass and fog are intentionally code-native UI, not raster assets.
    g.fillStyle = '#bcb49a'; g.font = '10px serif'; g.textAlign = 'center'; g.fillText('N', 543, 41);
    g.strokeStyle = '#9f9e83'; g.beginPath(); g.moveTo(543, 48); g.lineTo(543, 65); g.moveTo(538, 55); g.lineTo(543, 48); g.lineTo(548, 55); g.stroke();
  }
  private battle(slice: ExpeditionView, reduced: boolean): void {
    const g = this.g, game = slice.game, combat = game.events.active()!.combat!, now = game.clock.now;
    const catalog = EARLY_ENCOUNTERS.find(e => e.id === combat.scene.enemy);
    const place = sitePresentation(game);
    g.drawImage(this.art[place?.background ?? catalog?.background ?? slice.encounter.background], 0, 0);
    g.fillStyle = '#0c14172b'; g.fillRect(0, 0, 576, 324);
    const pAttack = now - (slice.lastStrike?.time ?? -Infinity) < 320, eAttack = now - this.enemyAction < 220;
    const pHurt = now - this.playerHit < 250, eHurt = now - this.enemyHit < 250;
    const rig = SITE_ENEMY_ART[combat.scene.enemy ?? ''] ?? catalog?.art;
    const enemy = rig ? this.art[`${rig}-${eHurt ? 'hurt' : eAttack ? 'attack' : 'idle'}`] : null;
    g.fillStyle = '#050a0d80';
    g.beginPath(); g.ellipse(145, 258, 23, 5, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(420, 258, 34, 6, 0, 0, Math.PI * 2); g.fill();
    const pOffset = !reduced && pAttack ? 9 : 0, eOffset = !reduced && eAttack ? -13 : 0;
    const weapon = visibleWeapon(slice);
    const weaponRig = WEAPON_RIGS[weapon];
    const hand = this.drawPlayer(145 + pOffset, 257, pHurt ? 'hurt' : pAttack ? 'attack' : 'idle', weapon, game.path.armour(), pAttack && weaponRig?.thrown);
    if (combat.player.status === 'shield') {
      // A restrained static shield remains readable with reduced motion.
      g.save(); g.strokeStyle = '#c4a46d'; g.lineWidth = 2; g.setLineDash([4, 3]);
      g.beginPath(); g.ellipse(145 + pOffset, 220, 34, 43, 0, 0, Math.PI * 2); g.stroke(); g.restore();
    }
    if (pAttack && weaponRig?.projectile) {
      const progress = Math.min(1, (now - (slice.lastStrike?.time ?? now)) / 320);
      const effect = projectilePosition(progress, weaponRig.projectile, reduced);
      g.save(); g.translate(hand.x + 30 + (365 - hand.x) * effect.x, hand.y + effect.y); g.rotate(effect.angle);
      if (weapon === 'rifle' || weaponRig.thrown) {
        const shot = this.art[weapon === 'rifle' ? 'bullet' : WEAPON_ART[weapon]];
        g.drawImage(shot, 0, -shot.height / 2);
      } else {
        // Code-native combat feedback: no flashes, trails or gameplay timers.
        g.fillStyle = weaponRig.projectile === 'laser' ? '#e1a098' : weaponRig.projectile === 'plasma' ? '#e8be76' : '#8cc6be';
        if (weaponRig.projectile === 'disruptor') {
          g.lineWidth = 2; g.strokeStyle = g.fillStyle; g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.stroke();
        } else g.fillRect(0, -2, weaponRig.projectile === 'plasma' ? 13 : 21, 4);
      }
      g.restore();
    }
    g.save(); if (combat.won) g.globalAlpha = .3;
    if (enemy) g.drawImage(enemy, Math.round(420 - enemy.width / 2 + eOffset), 257 - enemy.height);
    else { g.fillStyle = '#c3b59b'; g.font = '36px monospace'; g.textAlign = 'center'; g.fillText(combat.enemy.chara, 420, 255); }
    g.restore();
    if (combat.enemy.stunned) {
      g.fillStyle = '#e7d2a1'; g.font = 'bold 12px serif'; g.textAlign = 'center';
      g.fillText('✦  ✦  ✦', 420, 246 - (enemy?.height ?? 50));
    }
    g.font = 'bold 13px system-ui'; g.textAlign = 'center';
    for (const entry of combat.floats) {
      const age = now - entry.time;
      if (age > 850) continue;
      g.fillStyle = entry.text.startsWith('+') ? '#d5cc9c' : entry.text.startsWith('-') ? '#e0ac7d' : '#c8c5b4';
      g.fillText(slice.game.t(entry.text), entry.target === 'wanderer' ? 145 : 420, (entry.target === 'wanderer' ? 169 : 194) - (reduced ? 0 : Math.floor(age / 45)));
    }
  }
}
