/**
 * Real-time combat. Port of the combat half of events.js with the same timings:
 * melee lands after one FIGHT_SPEED (100 ms) and resolves after a second, ranged lands after two.
 * Fighter state lives here instead of in DOM data attributes.
 */
import { EVENTS, WEAPONS, type Weapon } from '../data';
import type { Game } from '../game';
import type { TimerId, TimerSnapshot } from '../clock';
import type { EventScene } from '../types';
import type { EventRunner } from './runner';

export type Status = 'none' | 'shield' | 'energised' | 'venomous' | 'enraged' | 'meditation' | 'boost' | 'exploding';

export interface Fighter {
  id: 'wanderer' | 'enemy';
  chara: string;
  hp: number;
  maxHp: number;
  status: Status;
  stunned: boolean;
}

export interface CombatAction {
  id: string;
  text: string;
  enabled: boolean;
  cooldown: number;
  cost?: Record<string, number>;
}
type FighterId = Fighter['id'];
type CombatTask =
  | { type: 'strike'; attacker: FighterId; dmg: number | 'stun'; kind: 'melee' | 'ranged' | 'unarmed'; stage: 'impact' | 'finish' }
  | { type: 'status-clear'; fighter: FighterId; restartEnemy?: boolean }
  | { type: 'stun-clear'; fighter: FighterId }
  | { type: 'victory' }
  | { type: 'explode'; damage: number };
export interface CombatSnapshot {
  player: Fighter; enemy: Fighter; fought: boolean; won: boolean; lost: boolean; showFists: boolean;
  meditateDmg: number; lastSpecial?: string;
  enemyTimer: TimerSnapshot | null; specialTimers: (TimerSnapshot | null)[];
  dot: { target: FighterId; damage: number; timer: TimerSnapshot } | null;
  tasks: { task: CombatTask; timer: TimerSnapshot }[];
}

export class Combat {
  player: Fighter;
  enemy: Fighter;
  fought = false;
  won = false;
  lost = false;
  /** floating combat text for the renderer: newest last */
  floats: { target: 'wanderer' | 'enemy'; text: string; time: number }[] = [];
  private showFists = false;
  private enemyTimer: TimerId | null = null;
  private specialTimers: TimerId[] = [];
  private dotTimer: TimerId | null = null;
  private tasks = new Map<TimerId, CombatTask>();
  private dot: { target: FighterId; damage: number } | null = null;
  private meditateDmg = 0;
  /** last special used by the immortal wanderer (content reads Events._lastSpecial) */
  lastSpecial: string | undefined;

  constructor(private g: Game, private runner: EventRunner, readonly scene: EventScene) {
    this.player = { id: 'wanderer', chara: '@', hp: g.world.health, maxHp: g.world.getMaxHealth(), status: 'none', stunned: false };
    this.enemy = { id: 'enemy', chara: scene.chara ?? '?', hp: scene.health ?? 1, maxHp: scene.health ?? 1, status: 'none', stunned: false };
  }

  private get outfit(): Record<string, number> {
    return this.g.path.outfit;
  }

  start(): void {
    this.fought = false;
    this.won = false;
    let usable = 0;
    for (const k of this.carriedWeapons()) {
      const w = WEAPONS[k];
      if (typeof w.damage === 'number' && w.damage > 0 && this.hasAmmo(w)) usable++;
    }
    if (usable === 0) this.showFists = true;
    this.startEnemyAttacks();
    this.specialTimers = (this.scene.specials ?? []).map((s) => this.g.clock.setInterval(() => {
      const text = s.action(this.enemy);
      if (text) this.float('enemy', String(text));
      this.emitStatus(this.enemy);
    }, s.delay * 1000));
  }

  // ------------------------------------------------------------- options for the view

  private carriedWeapons(): string[] {
    return Object.keys(WEAPONS).filter((k) => k !== 'fists' && (this.outfit[k] ?? 0) > 0);
  }

  private hasAmmo(w: Weapon): boolean {
    return !w.cost || Object.entries(w.cost).every(([k, n]) => (this.outfit[k] ?? 0) >= n);
  }

  private cdId(id: string): string {
    return 'combat:' + id;
  }

  /** attack options: carried weapons (plus fists when nothing else can hurt) */
  attacks(): CombatAction[] {
    const list: CombatAction[] = [];
    const add = (k: string) => {
      const w = WEAPONS[k];
      list.push({
        id: k,
        text: this.g.t(w.verb),
        cost: w.cost,
        enabled: !this.isOver() && this.hasAmmo(w) && !this.g.cooldowns.isCooling(this.cdId(k)),
        cooldown: this.g.cooldowns.progress(this.cdId(k))
      });
    };
    if (this.showFists) add('fists');
    for (const k of this.carriedWeapons()) add(k);
    return list;
  }

  /** heal / utility options; available during and after the fight */
  utilities(): CombatAction[] {
    const t = this.g.t;
    const canHeal = this.g.world.health < this.g.world.getMaxHealth();
    const list: CombatAction[] = [];
    const add = (id: string, text: string, cost?: Record<string, number>, heals = true) => {
      list.push({
        id, text, cost,
        enabled: !this.lost && (!heals || canHeal) && (!cost || Object.entries(cost).every(([k, n]) => (this.outfit[k] ?? 0) >= n)) &&
          !this.g.cooldowns.isCooling(this.cdId(id)),
        cooldown: this.g.cooldowns.progress(this.cdId(id))
      });
    };
    add('eat', t('eat meat'), { 'cured meat': 1 });
    if ((this.outfit['medicine'] ?? 0) !== 0) add('meds', t('use meds'), { medicine: 1 });
    // the original wrote `?? 0 > 0` (= `hypo ?? false`); same result, written as intended
    if ((this.outfit['hypo'] ?? 0) > 0) add('hypo', t('use hypo'), { hypo: 1 });
    if (!this.isOver() && (this.outfit['stim'] ?? 0) > 0) add('stim', t('boost'), undefined, false);
    if (!this.isOver() && this.g.store.num('stores["kinetic armour"]') > 0) add('shield', t('shield'), undefined, false);
    return list;
  }

  isOver(): boolean {
    return this.won || this.lost || this.fought;
  }

  // ------------------------------------------------------------- player actions

  attack(weaponName: string): boolean {
    const action = this.attacks().find((a) => a.id === weaponName);
    if (!action || !action.enabled) return false;
    const weapon = WEAPONS[weaponName];
    const s = this.g.store;

    let cd = weapon.cooldown;
    if (weapon.type === 'unarmed' && this.g.hasPerk('unarmed master')) cd /= 2;
    if (this.player.status === 'boost') cd /= 2;
    this.g.cooldowns.start(this.cdId(weaponName), cd, false);

    if (weapon.type === 'unarmed') {
      s.set('character.punches', s.num('character.punches'));
      s.add('character.punches', 1);
      const punches = s.num('character.punches');
      if (punches === 50 && !this.g.hasPerk('boxer')) this.g.addPerk('boxer');
      else if (punches === 150 && !this.g.hasPerk('martial artist')) this.g.addPerk('martial artist');
      else if (punches === 300 && !this.g.hasPerk('unarmed master')) this.g.addPerk('unarmed master');
    }
    if (weapon.cost) {
      for (const [k, n] of Object.entries(weapon.cost)) this.outfit[k] = (this.outfit[k] ?? 0) - n;
      if (!this.hasAmmo(weapon)) {
        const anyOther = this.carriedWeapons().some((k) => {
          const w = WEAPONS[k];
          return typeof w.damage === 'number' && w.damage > 0 && this.hasAmmo(w);
        });
        if (!anyOther) this.showFists = true;
      }
    }

    let dmg: number | 'stun' = -1;
    if (this.g.rng.random() <= this.g.world.getHitChance()) {
      dmg = weapon.damage;
      if (typeof dmg === 'number') {
        if (weapon.type === 'unarmed' && this.g.hasPerk('boxer')) dmg *= 2;
        if (weapon.type === 'unarmed' && this.g.hasPerk('martial artist')) dmg *= 3;
        if (weapon.type === 'unarmed' && this.g.hasPerk('unarmed master')) dmg *= 2;
        if (weapon.type === 'melee' && this.g.hasPerk('barbarian')) dmg = Math.floor(dmg * 1.5);
      }
    }
    const r = Math.floor(this.g.rng.random() * 2) + 1;
    this.g.sfx(`WEAPON_${weapon.type.toUpperCase()}_${r}`);

    this.animate(this.player, dmg, weapon.type === 'ranged' ? 'ranged' : weapon.type === 'unarmed' ? 'unarmed' : 'melee');
    return true;
  }

  use(id: string): boolean {
    const action = this.utilities().find((a) => a.id === id);
    if (!action || !action.enabled) return false;
    const over = this.isOver();
    switch (id) {
      case 'eat':
        this.g.cooldowns.start(this.cdId(id), over ? 0 : EVENTS.EAT_COOLDOWN, false);
        this.heal('cured meat', this.g.world.meatHeal());
        this.g.sfx('EAT_MEAT');
        break;
      case 'meds':
        this.g.cooldowns.start(this.cdId(id), over ? 0 : EVENTS.MEDS_COOLDOWN, false);
        this.heal('medicine', this.g.world.medsHeal());
        this.g.sfx('USE_MEDS');
        break;
      case 'hypo':
        this.g.cooldowns.start(this.cdId(id), over ? 0 : EVENTS.HYPO_COOLDOWN, false);
        this.heal('hypo', this.g.world.hypoHeal());
        this.g.sfx('USE_MEDS');
        break;
      case 'shield':
        this.g.cooldowns.start(this.cdId(id), EVENTS.SHIELD_COOLDOWN, false);
        this.player.status = 'shield';
        this.emitStatus(this.player);
        break;
      case 'stim':
        this.g.cooldowns.start(this.cdId(id), EVENTS.STIM_COOLDOWN, false);
        this.setStatus(this.player, 'boost');
        this.dotDamage(this.player, EVENTS.BOOST_DAMAGE);
        break;
      default:
        return false;
    }
    this.g.bus.emit({ type: 'event:update' });
    return true;
  }

  private heal(item: string, amount: number): void {
    if ((this.outfit[item] ?? 0) <= 0) return;
    this.outfit[item]--;
    const hp = Math.min(this.g.world.getMaxHealth(), this.g.world.health + amount);
    this.g.world.setHp(hp);
    this.player.hp = hp;
    this.float('wanderer', '+' + amount);
  }

  // ------------------------------------------------------------- enemy

  private startEnemyAttacks(delay?: number): void {
    this.g.clock.clear(this.enemyTimer);
    this.enemyTimer = this.g.clock.setInterval(() => this.enemyAttack(), (delay ?? this.scene.attackDelay ?? 2) * 1000);
  }

  private enemyAttack(): void {
    if (this.isOver() || this.enemy.stunned || this.enemy.status === 'meditation') return;
    let toHit = this.scene.hit ?? 0.8;
    toHit *= this.g.hasPerk('evasive') ? 0.8 : 1;
    let dmg = -1;
    if (this.meditateDmg > 0) {
      dmg = this.meditateDmg;
      this.meditateDmg = 0;
    } else if (this.g.rng.random() <= toHit) {
      dmg = this.scene.damage ?? 0;
    }
    this.animate(this.enemy, dmg, this.scene.ranged ? 'ranged' : 'melee');
  }

  /** content hook (Events.setStatus) */
  setStatus(fighter: Fighter, status: Status): void {
    fighter.status = status;
    if (status === 'enraged' && fighter.id === 'enemy') {
      this.startEnemyAttacks(0.5);
      this.schedule({ type: 'status-clear', fighter: fighter.id, restartEnemy: true }, EVENTS.ENRAGE_DURATION, true);
    }
    if (status === 'meditation') {
      this.meditateDmg = 0;
      this.schedule({ type: 'status-clear', fighter: fighter.id }, EVENTS.MEDITATE_DURATION, true);
    }
    if (status === 'boost') {
      this.schedule({ type: 'status-clear', fighter: fighter.id }, EVENTS.BOOST_DURATION, true);
    }
    this.emitStatus(fighter);
  }

  // ------------------------------------------------------------- resolution

  private schedule(task: CombatTask, ms: number, exact = false): void {
    const id = this.g.clock.setTimeout(() => { this.tasks.delete(id); this.runTask(task); }, ms, exact);
    this.tasks.set(id, task);
  }

  private animate(attacker: Fighter, dmg: number | 'stun', kind: 'melee' | 'ranged' | 'unarmed'): void {
    this.schedule({ type: 'strike', attacker: attacker.id, dmg, kind, stage: 'impact' }, EVENTS.FIGHT_SPEED * (kind === 'ranged' ? 2 : 1));
  }

  private finishStrike(task: Extract<CombatTask, { type: 'strike' }>): void {
    if (this.isOver()) return;
    if (task.attacker === 'enemy') { this.checkPlayerDeath(); return; }
    const enemyHp = this.enemy.hp, hit = typeof task.dmg === 'number' && task.dmg > 0 ? task.dmg : 0;
    for (const [k, act] of Object.entries(this.scene.atHealth ?? {})) {
      const threshold = Number(k);
      if (enemyHp <= threshold && enemyHp + hit > threshold) { act(this.enemy); this.emitStatus(this.enemy); }
    }
    if (enemyHp <= 0 && !this.won) {
      this.won = true;
      if (this.scene.explosion) this.explode(this.scene.explosion);
      else this.winFight();
    }
  }

  private runTask(task: CombatTask): void {
    if (task.type === 'strike') {
      if (this.isOver()) return;
      if (task.stage === 'finish') this.finishStrike(task);
      else {
        const attacker = this[task.attacker === 'wanderer' ? 'player' : 'enemy'];
        const target = this[task.attacker === 'wanderer' ? 'enemy' : 'player'];
        this.damage(attacker, target, task.dmg, task.kind);
        if (task.kind === 'ranged') this.finishStrike(task);
        else this.schedule({ ...task, stage: 'finish' }, EVENTS.FIGHT_SPEED);
      }
    } else if (task.type === 'status-clear' || task.type === 'stun-clear') {
      const fighter = this[task.fighter === 'wanderer' ? 'player' : 'enemy'];
      if (task.type === 'stun-clear') fighter.stunned = false;
      else { fighter.status = 'none'; if (task.restartEnemy && !this.isOver()) this.startEnemyAttacks(); }
      this.emitStatus(fighter);
    } else if (task.type === 'explode') {
      this.enemy.status = 'none'; this.enemy.chara = '*';
      this.damage(this.enemy, this.player, task.damage, 'ranged');
      if (!this.checkPlayerDeath()) this.winFight();
    } else if (!this.fought) {
      this.fought = true; this.clearTimeouts();
      const ev = this.runner.active();
      if (!ev || ev.combat !== this) return;
      ev.afterCombat = true;
      ev.loot = this.runner.rollLoot(this.scene.loot ?? {});
      if (this.scene.buttons) this.runner.startButtonCooldowns(this.scene.buttons);
      else this.g.cooldowns.start('event:leaveBtn', EVENTS.LEAVE_COOLDOWN, false);
      this.g.bus.emit({ type: 'combat:end', won: true });
      this.g.bus.emit({ type: 'event:update' });
    }
  }

  damage(fighter: Fighter, target: Fighter, dmg: number | 'stun', type: string): void {
    let msg = '';
    const shielded = target.status === 'shield';
    const energised = fighter.status === 'energised';
    const venomous = fighter.status === 'venomous';
    const meditating = target.status === 'meditation';
    if (typeof dmg === 'number') {
      if (dmg < 0) {
        msg = this.g.t('miss');
        dmg = 0;
      } else {
        if (energised) dmg *= EVENTS.ENERGISE_MULTIPLIER;
        if (meditating) {
          this.meditateDmg += dmg;
          msg = String(dmg);
        } else {
          msg = (shielded ? '+' : '-') + dmg;
          target.hp = Math.min(target.maxHp, Math.max(0, target.hp + (shielded ? dmg : -dmg)));
          if (target.id === 'wanderer') this.g.world.setHp(target.hp);
        }
        if (venomous && !shielded) {
          this.g.clock.clear(this.dotTimer);
          const tick = Math.floor(dmg / 2);
          this.dot = { target: target.id, damage: tick };
          this.dotTimer = this.g.clock.setInterval(() => this.dotDamage(target, tick), EVENTS.DOT_TICK, true);
        }
        if (shielded) target.status = 'none';
        const r = Math.floor(this.g.rng.random() * 2) + 1;
        if (type === 'unarmed' || type === 'melee' || type === 'ranged') this.g.sfx(`WEAPON_${type.toUpperCase()}_${r}`);
      }
    } else if (dmg === 'stun') {
      msg = this.g.t('stunned');
      target.stunned = true;
      this.schedule({ type: 'stun-clear', fighter: target.id }, EVENTS.STUN_DURATION, true);
    }
    if (energised || venomous) fighter.status = 'none';
    this.float(target.id, msg);
    this.g.bus.emit({ type: 'combat:attack', attacker: fighter.id, kind: type as 'melee', result: msg });
    this.g.bus.emit({ type: 'event:update' });
  }

  private dotDamage(target: Fighter, dmg: number): void {
    target.hp = Math.max(0, target.hp - dmg);
    if (target.id === 'wanderer') {
      this.g.world.setHp(target.hp);
      this.checkPlayerDeath();
    } else if (target.hp <= 0 && !this.won) {
      this.won = true;
      this.winFight();
    }
    this.float(target.id, '-' + dmg);
    this.g.bus.emit({ type: 'event:update' });
  }

  private explode(dmg: number): void {
    this.clearTimeouts();
    this.enemy.status = 'exploding';
    this.emitStatus(this.enemy);
    this.schedule({ type: 'explode', damage: dmg }, EVENTS.EXPLOSION_DURATION);
  }

  checkPlayerDeath(): boolean {
    if (this.player.hp <= 0 && !this.lost) {
      this.lost = true;
      this.clearTimeouts();
      this.g.bus.emit({ type: 'combat:end', won: false });
      this.runner.endEvent();
      this.g.world.die();
      return true;
    }
    return false;
  }

  private winFight(): void {
    this.schedule({ type: 'victory' }, EVENTS.FIGHT_SPEED);
  }

  clearTimeouts(): void {
    this.g.clock.clear(this.enemyTimer);
    this.specialTimers.forEach((t) => this.g.clock.clear(t));
    this.specialTimers = [];
    this.g.clock.clear(this.dotTimer);
    for (const id of this.tasks.keys()) this.g.clock.clear(id);
    this.tasks.clear();
  }

  snapshot(): CombatSnapshot {
    const clock = this.g.clock, dotTimer = clock.snapshot(this.dotTimer);
    return structuredClone({ player: this.player, enemy: this.enemy, fought: this.fought, won: this.won, lost: this.lost,
      showFists: this.showFists, meditateDmg: this.meditateDmg, lastSpecial: this.lastSpecial,
      enemyTimer: clock.snapshot(this.enemyTimer), specialTimers: this.specialTimers.map(id => clock.snapshot(id)),
      dot: this.dot && dotTimer ? { ...this.dot, timer: dotTimer } : null,
      tasks: [...this.tasks].flatMap(([id, task]) => { const timer = clock.snapshot(id); return timer ? [{ task, timer }] : []; }) });
  }

  resume(saved: CombatSnapshot): void {
    this.clearTimeouts();
    this.player = structuredClone(saved.player); this.enemy = structuredClone(saved.enemy);
    this.fought = saved.fought; this.won = saved.won; this.lost = saved.lost;
    this.showFists = saved.showFists; this.meditateDmg = saved.meditateDmg; this.lastSpecial = saved.lastSpecial;
    const clock = this.g.clock;
    if (saved.enemyTimer) this.enemyTimer = clock.resume(() => this.enemyAttack(), saved.enemyTimer);
    this.specialTimers = saved.specialTimers.flatMap((timer, i) => {
      const special = this.scene.specials?.[i];
      return special && timer ? [clock.resume(() => {
        const text = special.action(this.enemy); if (text) this.float('enemy', String(text)); this.emitStatus(this.enemy);
      }, timer)] : [];
    });
    if (saved.dot) {
      this.dot = { target: saved.dot.target, damage: saved.dot.damage };
      this.dotTimer = clock.resume(() => this.dotDamage(this[this.dot!.target === 'wanderer' ? 'player' : 'enemy'], this.dot!.damage), saved.dot.timer);
    }
    for (const { task, timer } of saved.tasks) {
      const id = clock.resume(() => { this.tasks.delete(id); this.runTask(task); }, timer);
      this.tasks.set(id, task);
    }
  }

  // ------------------------------------------------------------- view helpers

  private float(target: 'wanderer' | 'enemy', text: string): void {
    if (!text) return;
    this.floats.push({ target, text, time: this.g.clock.now });
    if (this.floats.length > 20) this.floats.shift();
  }

  private emitStatus(f: Fighter): void {
    this.g.bus.emit({ type: 'combat:status', fighter: f.id, status: f.status });
  }
}
