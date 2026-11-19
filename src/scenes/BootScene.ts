import Phaser from 'phaser';
import { CELL_SIZE } from '../config';

const S = CELL_SIZE;

/** Усі текстури малюємо кодом — зовнішніх асетів немає. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cellClosed();
    this.cellOpen();
    this.mine();
    this.crater();
    this.flag();
    this.player();
    this.torch();
    this.grave();
    this.candle();
    this.home();
    this.chest();
    this.stone();
    this.probe();
    this.spark();
    this.scene.start('Game');
  }

  private bake(key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private cellClosed(): void {
    this.bake('cell-closed', S, S, (g) => {
      g.fillStyle(0x2f3f5e).fillRect(0, 0, S, S);
      g.fillStyle(0x465b82).fillRect(0, 0, S, 4).fillRect(0, 0, 4, S);
      g.fillStyle(0x1c2740).fillRect(0, S - 4, S, 4).fillRect(S - 4, 0, 4, S);
      g.fillStyle(0x3a4d72).fillRect(4, 4, S - 8, S - 8);
    });
  }

  private cellOpen(): void {
    this.bake('cell-open', S, S, (g) => {
      g.fillStyle(0xb7c0cf).fillRect(0, 0, S, S);
      g.fillStyle(0xdde3ec).fillRect(1, 1, S - 2, S - 2);
    });
  }

  private mine(): void {
    this.bake('mine', S, S, (g) => {
      const c = S / 2;
      g.lineStyle(3, 0x1a1a1a);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.lineBetween(c + Math.cos(a) * 8, c + Math.sin(a) * 8, c + Math.cos(a) * 15, c + Math.sin(a) * 15);
      }
      g.fillStyle(0x1a1a1a).fillCircle(c, c, 11);
      g.fillStyle(0xffffff).fillCircle(c - 4, c - 4, 3);
    });
  }

  private crater(): void {
    this.bake('crater', S, S, (g) => {
      const c = S / 2;
      g.fillStyle(0x7a5a4a).fillCircle(c, c, 17);
      g.fillStyle(0x2b1d17).fillCircle(c, c, 13);
      g.fillStyle(0x4a352a).fillCircle(c + 2, c + 2, 7);
    });
  }

  /** Три прапорці: червоний — небезпека, жовтий — підозра, зелений — безпека. */
  private flag(): void {
    const flags: [string, number][] = [
      ['flag', 0xe03a3a],
      ['flag-suspect', 0xf2c14e],
      ['flag-safe', 0x3fb950],
    ];
    for (const [key, color] of flags) {
      this.bake(key, S, S, (g) => {
        const c = S / 2;
        g.fillStyle(0x222222).fillRect(c - 10, S - 14, 20, 4).fillRect(c - 2, 10, 4, S - 22);
        g.fillStyle(color).fillTriangle(c + 2, 10, c + 2, 28, c - 14, 19);
      });
    }
  }

  private player(): void {
    this.bake('player', 40, 48, (g) => {
      // ноги
      g.fillStyle(0x3a2f2a).fillRect(11, 36, 7, 10).fillRect(22, 36, 7, 10);
      // тулуб
      g.fillStyle(0x2f7de1).fillRoundedRect(8, 20, 24, 20, 5);
      g.fillStyle(0xf2c14e).fillRect(8, 30, 24, 3);
      // права рука (з факелом) і кисть
      g.fillStyle(0x2468bd).fillRoundedRect(29, 22, 7, 12, 3);
      g.fillStyle(0xf5cfa0).fillCircle(35, 33, 3.6);
      // голова
      g.fillStyle(0xf5cfa0).fillCircle(20, 13, 10);
      // капелюх
      g.fillStyle(0xc0392b).fillRect(8, 8, 24, 4).fillRoundedRect(12, 0, 16, 10, 4);
      // очі
      g.fillStyle(0x222222).fillCircle(16, 14, 1.6).fillCircle(24, 14, 1.6);
    });
  }

  /** Факел: держак, обмотка, полум'я-краплина і м'яке світіння (малюється адитивно). */
  private torch(): void {
    this.bake('torch', 8, 28, (g) => {
      g.fillStyle(0x6b4423).fillRect(2, 7, 4, 21);
      g.fillStyle(0x8b5a2b).fillRect(2, 7, 1.5, 21);
      g.fillStyle(0x2d1d0e).fillRoundedRect(0, 3, 8, 8, 2); // обмотка
      g.fillStyle(0x4a2f14).fillRect(0, 6, 8, 2);
    });
    this.bake('flame', 18, 26, (g) => {
      g.fillStyle(0xe8541a).fillCircle(9, 17, 8).fillTriangle(2, 15, 16, 15, 9, 0);
      g.fillStyle(0xffb02e).fillCircle(9, 18, 5.5).fillTriangle(4.5, 16, 13.5, 16, 9, 5);
      g.fillStyle(0xfff3b0).fillCircle(9, 19, 3).fillTriangle(6.5, 18, 11.5, 18, 9, 10);
    });
    this.bake('glow', 64, 64, (g) => {
      for (let r = 32; r > 0; r -= 4) g.fillStyle(0xffa640, 0.035).fillCircle(32, 32, r);
    });
  }

  /** Маленька могилка: горбок землі, надгробок із хрестом, трава й квіточка. */
  private grave(): void {
    this.bake('grave', 32, 40, (g) => {
      g.fillStyle(0x3b2e20).fillEllipse(16, 35, 31, 11); // тінь/контур горбка
      g.fillStyle(0x5b4630).fillEllipse(16, 34, 28, 9);
      g.fillStyle(0x735a3c).fillEllipse(14, 32.5, 16, 4);
      g.fillStyle(0x30363d).fillRoundedRect(6, 4, 20, 30, { tl: 10, tr: 10, bl: 0, br: 0 }); // контур каменя
      g.fillStyle(0x6b7580).fillRoundedRect(8, 6, 16, 28, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.fillStyle(0x8b95a1).fillRoundedRect(8, 6, 6, 26, { tl: 8, tr: 0, bl: 0, br: 0 }); // світла грань
      g.fillStyle(0x3d444d).fillRect(15, 11, 3, 13).fillRect(11, 15, 11, 3); // хрест
      g.fillStyle(0x5b4630).fillEllipse(16, 36, 22, 6); // земля поверх основи каменя
      g.fillStyle(0x4c8c3f).fillTriangle(4, 36, 6, 30, 9, 36).fillTriangle(22, 36, 25, 30, 28, 36); // трава
      g.fillStyle(0x6bb35a).fillTriangle(6, 36, 8, 31, 11, 36);
      g.fillStyle(0xff8fa3).fillCircle(26, 31, 2); // квіточка
      g.fillStyle(0xfff3b0).fillCircle(26, 31, 0.8);
    });
  }

  /** Свічка на могилці: блюдечко, віск і ґніт (полум'я — текстура `flame`, зменшена). */
  private candle(): void {
    this.bake('candle', 10, 14, (g) => {
      g.fillStyle(0x6b7580).fillRoundedRect(0, 11, 10, 3, 1.5); // блюдечко
      g.fillStyle(0xf2ead3).fillRect(2, 4, 6, 8); // віск
      g.fillStyle(0xd8cfb4).fillRect(6, 4, 2, 8);
      g.fillStyle(0xf2ead3).fillRect(7, 6, 1.5, 4); // патьок
      g.fillStyle(0x2d1d0e).fillRect(4.5, 1.5, 1, 3); // ґніт
    });
  }

  private home(): void {
    this.bake('home', S, S, (g) => {
      // стіни
      g.fillStyle(0xd9a45b).fillRect(9, 24, 38, 24);
      g.fillStyle(0xb98443).fillRect(9, 44, 38, 4);
      // дах
      g.fillStyle(0xb5362b).fillTriangle(4, 26, 52, 26, 28, 4);
      // димар
      g.fillStyle(0x7a4a2a).fillRect(37, 8, 6, 12);
      // двері та вікно
      g.fillStyle(0x6b3f1e).fillRoundedRect(22, 32, 12, 16, { tl: 6, tr: 6, bl: 0, br: 0 });
      g.fillStyle(0xfff3b0).fillRect(12, 29, 7, 7).fillRect(37, 29, 7, 7);
    });
  }

  private chest(): void {
    this.bake('chest', S, S, (g) => {
      g.fillStyle(0x4a2f14).fillRoundedRect(7, 18, 42, 30, 4); // контур
      g.fillStyle(0x8b5a2b).fillRect(9, 28, 38, 18); // корпус
      g.fillStyle(0xa86f35).fillRoundedRect(9, 20, 38, 12, { tl: 8, tr: 8, bl: 0, br: 0 }); // віко
      g.fillStyle(0xf2c14e).fillRect(9, 30, 38, 3).fillRect(25, 20, 6, 26); // оковка
      g.fillStyle(0xfff0a8).fillRect(25, 29, 6, 7); // замок
      g.fillStyle(0x4a2f14).fillRect(27, 31, 2, 3);
    });
  }

  private stone(): void {
    this.bake('stone', 14, 14, (g) => {
      g.fillStyle(0x6e7681).fillCircle(7, 7, 6);
      g.fillStyle(0x9aa4af).fillCircle(5, 5, 2.5);
    });
  }

  /** Палка з чобітком на мотузці. */
  private probe(): void {
    this.bake('probe', 40, 60, (g) => {
      g.lineStyle(4, 0x9a6b3a).lineBetween(8, 4, 8, 34); // палка
      g.lineBetween(8, 4, 30, 4);
      g.lineStyle(2, 0xd6c08a).lineBetween(30, 4, 30, 40); // мотузка
      g.fillStyle(0x5b3a1e).fillRoundedRect(22, 40, 18, 12, 3); // чобіток
      g.fillRect(25, 32, 9, 10);
      g.fillStyle(0x2d1d0e).fillRect(22, 50, 18, 3);
    });
  }

  private spark(): void {
    this.bake('spark', 8, 8, (g) => {
      g.fillStyle(0xffffff).fillCircle(4, 4, 4);
    });
  }
}
