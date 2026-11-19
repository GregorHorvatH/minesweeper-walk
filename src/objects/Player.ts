import Phaser from 'phaser';
import { CELL_SIZE as S, MOVE_MS } from '../config';
import type { Dir, Pos } from '../core/types';
import { DIR_DELTA } from '../core/types';

const SCALE = 0.68;

/** Кисть руки відносно центру текстури персонажа (40×48) і довжини факела в пікселях текстури. */
const HAND = { x: 15, y: 9 };
const TORCH_LEN = 22;
const EMBERS = 5;

interface Ember {
  sprite: Phaser.GameObjects.Image;
  age: number;
  life: number;
  vx: number;
  vy: number;
}

/** Персонаж стоїть у нижній частині клітинки, щоб не закривати цифру. */
export class Player {
  readonly image: Phaser.GameObjects.Image;
  private readonly torch: Phaser.GameObjects.Image;
  private readonly flame: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly embers: Ember[] = [];
  private grave: Phaser.GameObjects.Image | null = null;
  private candle: { base: Phaser.GameObjects.Image; flame: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image } | null = null;
  private candleClock = 0;
  private readonly dust: Phaser.GameObjects.Image[] = [];
  private dead = false;
  private lastX: number;
  private lean = 0;
  private clock = Math.random() * 1000;

  constructor(
    private readonly scene: Phaser.Scene,
    cell: Pos,
  ) {
    const p = Player.worldPos(cell);
    this.image = scene.add.image(p.x, p.y, 'player').setScale(SCALE).setDepth(3);
    this.lastX = p.x;

    // Факел у правій руці: світіння позаду персонажа, держак і полум'я перед ним.
    this.glow = scene.add.image(p.x, p.y, 'glow').setDepth(2.9).setBlendMode(Phaser.BlendModes.ADD);
    this.torch = scene.add.image(p.x, p.y, 'torch').setOrigin(0.5, 24 / 28).setDepth(3.1);
    this.flame = scene.add.image(p.x, p.y, 'flame').setOrigin(0.5, 0.85).setDepth(3.2).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < EMBERS; i++) {
      const sprite = scene.add.image(p.x, p.y, 'spark').setDepth(3.3).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffb347).setVisible(false);
      this.embers.push({ sprite, age: 1, life: 1, vx: 0, vy: 0 });
    }
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
  }

  static worldPos(cell: Pos): Pos {
    return { x: cell.x * S + S / 2, y: cell.y * S + 38 };
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.scene.tweens.killTweensOf(this.image);
    this.image.destroy();
    this.torch.destroy();
    this.flame.destroy();
    this.glow.destroy();
    for (const e of this.embers) e.sprite.destroy();
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.candleTick, this);
    this.grave?.destroy();
    if (this.candle) for (const o of Object.values(this.candle)) o.destroy();
    for (const d of this.dust) d.destroy();
  }

  /** Загибель: персонаж зникає, факел гасне, а на клітинці з міною, де він підірвався, падає могилка зі свічкою. */
  die(cell: Pos): void {
    if (this.dead) return;
    this.dead = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    for (const o of [this.torch, this.flame, this.glow]) o.setVisible(false);
    for (const e of this.embers) e.sprite.setVisible(false);

    const img = this.image;
    this.scene.tweens.killTweensOf(img);
    const spot = Player.worldPos(cell);
    const x = spot.x;
    const footY = spot.y + (48 * SCALE) / 2; // «стопи» — як у персонажа, що стояв би на цій клітинці
    this.scene.tweens.add({ targets: img, alpha: 0, scaleY: SCALE * 0.4, duration: 220, ease: 'Quad.easeIn' });

    const grave = this.scene.add.image(x, footY - 70, 'grave').setOrigin(0.5, 1).setDepth(3).setAlpha(0);
    this.grave = grave;
    this.scene.tweens.add({
      targets: grave,
      y: footY,
      alpha: 1,
      duration: 420,
      delay: 160,
      ease: 'Bounce.easeOut',
      onComplete: () => {
        this.puff(x, footY);
        this.lightCandle(x, footY);
      },
    });
  }

  /** Свічка біля підніжжя надгробка — символ факела, який персонаж ніс за життя. */
  private lightCandle(x: number, footY: number): void {
    const cx = x - 8;
    const cy = footY - 4;
    const base = this.scene.add.image(cx, cy, 'candle').setOrigin(0.5, 1).setDepth(3.2).setAlpha(0);
    const flame = this.scene.add.image(cx, cy - 12, 'flame').setOrigin(0.5, 0.85).setDepth(3.3).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3).setAlpha(0);
    const glow = this.scene.add.image(cx, cy - 14, 'glow').setDepth(3.1).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setAlpha(0);
    this.candle = { base, flame, glow };
    this.scene.tweens.add({ targets: base, alpha: 1, duration: 250 });
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.candleTick, this);
  }

  /** Спокійніше, ніж факел: свічка ледь мерехтить. */
  private candleTick(_time: number, delta: number): void {
    const c = this.candle;
    if (!c) return;
    this.candleClock += Math.min(delta, 50);
    const t = this.candleClock;
    const k = Math.min(1, t / 400); // плавне розгоряння
    const flick = 0.92 + Math.sin(t / 95) * 0.05 + Math.sin(t / 41 + 0.7) * 0.04 + Math.random() * 0.03;
    c.flame
      .setRotation(Math.sin(t / 230) * 0.12)
      .setScale(0.3 * (0.96 + Math.sin(t / 140) * 0.05), 0.3 * flick * 1.15)
      .setAlpha(k * (0.9 + Math.random() * 0.1));
    c.glow.setScale(1.1 * flick).setAlpha(0.4 * k * flick);
  }

  /** Хмарка пилу, коли могилка приземлилась. */
  private puff(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const d = this.scene.add
        .image(x + side * 8, y - 2, 'spark')
        .setDepth(3.4)
        .setTint(0x9a8466)
        .setAlpha(0.8)
        .setScale(0.5 + Math.random() * 0.5);
      this.dust.push(d);
      this.scene.tweens.add({
        targets: d,
        x: d.x + side * (8 + Math.random() * 14),
        y: d.y - 4 - Math.random() * 8,
        alpha: 0,
        scale: d.scale * 1.8,
        duration: 380 + Math.random() * 220,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** Факел іде за персонажем (з урахуванням масштабу й повороту), полум'я мерехтить і відхиляється проти руху, летять іскри. */
  private tick(_time: number, delta: number): void {
    const img = this.image;
    const dt = Math.min(delta, 50);
    this.clock += dt;
    const cos = Math.cos(img.rotation);
    const sin = Math.sin(img.rotation);
    const hx = HAND.x * img.scaleX;
    const hy = HAND.y * img.scaleY;
    const gx = img.x + hx * cos - hy * sin;
    const gy = img.y + hx * sin + hy * cos;

    // Швидкість руху → нахил полум'я у протилежний бік.
    const vx = (img.x - this.lastX) / Math.max(dt, 1);
    this.lastX = img.x;
    this.lean += (Phaser.Math.Clamp(-vx * 0.9, -0.6, 0.6) - this.lean) * 0.2;

    const sway = Math.sin(this.clock / 260) * 0.05;
    this.torch.setPosition(gx, gy).setRotation(img.rotation + sway).setScale(SCALE);
    const tipLen = TORCH_LEN * SCALE;
    const tx = gx + Math.sin(img.rotation + sway) * tipLen;
    const ty = gy - Math.cos(img.rotation + sway) * tipLen;

    const flick = 0.9 + Math.sin(this.clock / 70) * 0.07 + Math.sin(this.clock / 37 + 1.3) * 0.06 + Math.random() * 0.04;
    this.flame
      .setPosition(tx, ty + 1)
      .setRotation(img.rotation + this.lean + Math.sin(this.clock / 90) * 0.1)
      .setScale(SCALE * (0.95 + Math.sin(this.clock / 110) * 0.08), SCALE * flick * 1.15)
      .setAlpha(0.9 + Math.random() * 0.1);
    this.glow.setPosition(tx, ty - 6).setScale(2.2 * flick).setAlpha(0.45 * flick);

    for (const e of this.embers) {
      e.age += dt;
      if (e.age >= e.life) {
        // перезапуск іскри: випадкова пауза, щоб вони не летіли синхронно
        if (Math.random() < 0.04) {
          e.age = 0;
          e.life = 500 + Math.random() * 500;
          e.vx = (Math.random() - 0.5) * 0.02 - this.lean * 0.01;
          e.vy = -(0.025 + Math.random() * 0.03);
          e.sprite.setPosition(tx + (Math.random() - 0.5) * 5, ty - 4).setVisible(true);
        } else {
          e.sprite.setVisible(false);
        }
        continue;
      }
      const k = e.age / e.life;
      e.sprite
        .setPosition(e.sprite.x + e.vx * dt, e.sprite.y + e.vy * dt)
        .setAlpha(1 - k)
        .setScale(0.5 * (1 - k * 0.7));
    }
  }

  moveTo(cell: Pos, done: () => void, duration = MOVE_MS): void {
    const p = Player.worldPos(cell);
    this.scene.tweens.killTweensOf(this.image);
    this.image.setScale(SCALE);
    this.scene.tweens.add({
      targets: this.image,
      x: p.x,
      y: p.y,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: done,
    });
    this.scene.tweens.add({
      targets: this.image,
      scaleY: SCALE * 0.88,
      duration: duration / 2,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  /** Вибухова хвиля: персонаж відлітає дугою в сусідню клітинку, перекидаючись у польоті. */
  blastTo(cell: Pos, done: () => void): void {
    const to = Player.worldPos(cell);
    const from = { x: this.image.x, y: this.image.y };
    this.scene.tweens.killTweensOf(this.image);
    this.image.setScale(SCALE);
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 340,
      ease: 'Quad.easeOut',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 1;
        this.image.setPosition(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 30);
        this.image.setAngle(360 * k);
      },
      onComplete: () => {
        this.image.setAngle(0);
        this.image.setPosition(to.x, to.y);
        done();
      },
    });
  }

  /** Невеличкий «стук» у бік перешкоди. */
  bump(dir: Dir): void {
    const d = DIR_DELTA[dir];
    this.scene.tweens.add({
      targets: this.image,
      x: this.image.x + d.x * 7,
      y: this.image.y + d.y * 7,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }
}
