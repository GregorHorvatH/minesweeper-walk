import Phaser from 'phaser';
import type { Board } from '../core/board';
import type { Pos } from '../core/types';
import {
  CELL_SIZE as S,
  FOG_MIN_CLOSED,
  FOG_MIN_OPENED,
  FOG_R0,
  FOG_R1,
  MOVE_MS,
  NUMBER_COLORS,
} from '../config';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Текстура прапорця за кольором: червоний, жовтий, зелений (індекс 0 — немає прапорця). */
const FLAG_TEXTURES = ['', 'flag', 'flag-suspect', 'flag-safe'];
const VISITED_TINT = 0xc4e6c9;
const EXPLODED_TINT = 0xf3a0a0;

/** Малює поле: клітинки, цифри, прапорці, міни, хатинку і «туман» навколо гравця. */
export class FieldView {
  private readonly bases: Phaser.GameObjects.Image[] = [];
  private readonly texts: (Phaser.GameObjects.Text | null)[];
  private readonly markers: (Phaser.GameObjects.Image | null)[];
  private readonly chestImages = new Map<number, Phaser.GameObjects.Image>();
  private readonly alpha: Float32Array;
  private readonly revealed: Uint8Array;
  private readonly homeImage: Phaser.GameObjects.Image;
  private occupied = -1;
  private fogOff = false;
  private fogTween: Phaser.Tweens.Tween | null = null;
  private lastFog: Pos = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly board: Board,
  ) {
    const n = board.cols * board.rows;
    this.texts = new Array(n).fill(null);
    this.markers = new Array(n).fill(null);
    this.alpha = new Float32Array(n).fill(1);
    this.revealed = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      const x = i % board.cols;
      const y = (i / board.cols) | 0;
      this.bases.push(scene.add.image(x * S, y * S, 'cell-closed').setOrigin(0, 0).setDepth(0));
    }
    const home = board.level.home;
    this.homeImage = scene.add
      .image(home.x * S + S / 2, home.y * S + S / 2, 'home')
      .setDepth(2)
      .setVisible(board.mode === 'homerun'); // у режимі minesweeper хатинки немає
  }

  destroy(): void {
    this.fogTween?.stop();
    this.fogTween = null;
    for (const o of this.bases) o.destroy();
    for (const o of this.texts) o?.destroy();
    for (const o of this.markers) o?.destroy();
    for (const o of this.chestImages.values()) o.destroy();
    this.homeImage.destroy();
  }

  index(p: Pos): number {
    return p.y * this.board.cols + p.x;
  }

  /** Клітинка під світовою точкою або null. */
  cellAt(wx: number, wy: number): Pos | null {
    const x = Math.floor(wx / S);
    const y = Math.floor(wy / S);
    return this.board.inBounds(x, y) ? { x, y } : null;
  }

  syncAll(): void {
    for (let i = 0; i < this.bases.length; i++) this.syncCell(i);
  }

  syncCell(i: number): void {
    const b = this.board;
    const base = this.bases[i]!;
    const opened = b.opened[i] === 1;
    const exploded = b.exploded[i] === 1;
    const num = b.level.numbers[i]!;

    if (opened || exploded) {
      base.setTexture('cell-open');
      base.setTint(exploded ? EXPLODED_TINT : b.visited[i] ? VISITED_TINT : 0xffffff);
    } else {
      base.setTexture('cell-closed');
      base.setTint(0xffffff);
    }

    // Ящик видно лише на відкритій клітинці — інакше сам факт ящика видавав би, що там немає міни.
    const chestVisible = b.chests.has(i) && opened;
    let chest = this.chestImages.get(i);
    if (chestVisible && !chest) {
      const x = i % b.cols;
      const y = (i / b.cols) | 0;
      chest = this.scene.add
        .image(x * S + S / 2, y * S + S / 2 + 6, 'chest')
        .setScale(0.72)
        .setDepth(1)
        .setAlpha(this.alpha[i]!);
      this.chestImages.set(i, chest);
    }
    chest?.setVisible(chestVisible);

    const showNumber = opened && num > 0;
    let text = this.texts[i];
    if (showNumber && !text) text = this.texts[i] = this.makeText(i, num);
    if (text) {
      // Цифри змінюються, коли поруч вибухає міна.
      if (showNumber) text.setText(String(num)).setColor(NUMBER_COLORS[num] ?? '#000000');
      text.setVisible(showNumber);
      this.placeText(i);
    }

    let want: string | null = null;
    if (this.revealed[i] && b.level.mines[i]) want = 'mine';
    else if (b.flags[i]) want = FLAG_TEXTURES[b.flags[i]!]!;
    else if (exploded && !opened) want = 'crater';
    let marker = this.markers[i];
    if (want) {
      const x = i % b.cols;
      const y = (i / b.cols) | 0;
      if (!marker) {
        marker = this.markers[i] = this.scene.add
          .image(x * S + S / 2, y * S + S / 2, want)
          .setDepth(1)
          .setAlpha(this.alpha[i]!);
      } else {
        marker.setTexture(want);
      }
      marker.setVisible(true);
    } else if (marker) {
      marker.setVisible(false);
    }
  }

  syncCells(cells: readonly Pos[]): void {
    for (const p of cells) this.syncCell(this.index(p));
  }

  /** Короткий «поп» цифри при відкритті — лише для невеликої кількості клітинок. */
  pop(cells: readonly Pos[]): void {
    if (cells.length > 60) return;
    for (const p of cells) {
      const t = this.texts[this.index(p)];
      if (!t?.visible) continue;
      const to = t.scaleX;
      t.setScale(to * 0.4);
      this.scene.tweens.add({ targets: t, scale: to, duration: 160, ease: 'Back.easeOut' });
    }
  }

  /** Цифра клітинки, на якій стоїть гравець, переїжджає вгору, щоб персонаж її не закривав. */
  setOccupied(p: Pos): void {
    const prev = this.occupied;
    this.occupied = this.index(p);
    if (prev >= 0) this.placeText(prev);
    this.placeText(this.occupied);
  }

  revealMines(): void {
    const m = this.board.level.mines;
    for (let i = 0; i < m.length; i++) {
      if (m[i]) {
        this.revealed[i] = 1;
        this.syncCell(i);
      }
    }
  }

  /** Знімає туман (кінець гри) — усе поле стає видимим. */
  liftFog(): void {
    this.fogOff = true;
    this.applyFog(this.lastFog.x, this.lastFog.y, true);
  }

  /** Прозорість клітинок залежить від відстані до гравця: біля нього світло, далі — темрява. */
  applyFog(px: number, py: number, animate: boolean): void {
    this.lastFog = { x: px, y: py };
    this.fogTween?.stop();
    this.fogTween = null;

    const cols = this.board.cols;
    const idx: number[] = [];
    const from: number[] = [];
    const to: number[] = [];
    for (let i = 0; i < this.alpha.length; i++) {
      const target = this.targetAlpha(i, px, py, cols);
      if (Math.abs(target - this.alpha[i]!) < 0.01) continue;
      idx.push(i);
      from.push(this.alpha[i]!);
      to.push(target);
    }
    if (idx.length === 0) return;

    if (!animate) {
      for (let k = 0; k < idx.length; k++) this.setCellAlpha(idx[k]!, to[k]!);
      return;
    }
    this.fogTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: MOVE_MS + 80,
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 1;
        for (let k = 0; k < idx.length; k++) this.setCellAlpha(idx[k]!, from[k]! + (to[k]! - from[k]!) * t);
      },
      onComplete: () => {
        for (let k = 0; k < idx.length; k++) this.setCellAlpha(idx[k]!, to[k]!);
        this.fogTween = null;
      },
    });
  }

  private targetAlpha(i: number, px: number, py: number, cols: number): number {
    if (this.fogOff) return 1;
    const x = i % cols;
    const y = (i / cols) | 0;
    const t = Phaser.Math.Clamp((Math.hypot(x - px, y - py) - FOG_R0) / (FOG_R1 - FOG_R0), 0, 1);
    const seen = this.board.opened[i] === 1 || this.board.exploded[i] === 1;
    const min = seen ? FOG_MIN_OPENED : FOG_MIN_CLOSED;
    return 1 - (1 - min) * t;
  }

  private setCellAlpha(i: number, a: number): void {
    this.alpha[i] = a;
    this.bases[i]!.setAlpha(a);
    this.texts[i]?.setAlpha(a);
    this.markers[i]?.setAlpha(a);
    this.chestImages.get(i)?.setAlpha(a);
    if (i === this.index(this.board.level.home)) this.homeImage.setAlpha(Math.max(a, 0.85));
  }

  private makeText(i: number, num: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, String(num), {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: 'bold',
        color: NUMBER_COLORS[num] ?? '#000000',
      })
      .setOrigin(0.5)
      .setDepth(1)
      .setAlpha(this.alpha[i]!);
  }

  private placeText(i: number): void {
    const t = this.texts[i];
    if (!t) return;
    const x = i % this.board.cols;
    const y = (i / this.board.cols) | 0;
    const occ = i === this.occupied;
    if (this.chestImages.get(i)?.visible) {
      // Ящик посеред клітинки — цифра переїжджає в куток.
      t.setPosition(x * S + 13, y * S + 13);
      t.setScale(0.55);
      return;
    }
    t.setPosition(x * S + S / 2, y * S + (occ ? 13 : S / 2));
    t.setScale(occ ? 0.62 : 1);
  }
}
