import Phaser from 'phaser';
import { t } from '../i18n';
import { modeRecords, type RecordsData } from '../core/records';
import type { GameMode } from '../core/types';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const CELL_W = 68;
const CELL_H = 48;
const GAP = 8;
const HEADER = 74;
const FOOTER = 36;

export interface PickerData {
  current: number;
  /** Найвищий рівень, до якого вже дійшли — усі рівні 1..unlocked доступні. */
  unlocked: number;
  completed: ReadonlySet<number>;
}

/** Дані для вікна: усі рівні 1..(найдалі, куди дійшли або де зараз гравець) доступні. */
export function makePickerData(records: RecordsData, mode: GameMode, current: number): PickerData {
  const rec = modeRecords(records, mode);
  return {
    current,
    unlocked: Math.max(rec.bestLevel, current),
    completed: new Set(Object.keys(rec.levels).map(Number)),
  };
}

/** Вікно вибору рівня: сітка кнопок 1..unlocked, клавіатура, миша, тач, прокрутка коліщатком. */
export class LevelPicker {
  private readonly container: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private cells: Phaser.GameObjects.GameObject[] = [];
  private rects = new Map<number, Phaser.GameObjects.Rectangle>();

  private data: PickerData | null = null;
  private sel = 1;
  private scroll = 0;
  private cols = 1;
  private visibleRows = 1;
  private w = 0;
  private h = 0;
  private panelX = 0;
  private panelY = 0;
  open = false;
  private dragY: number | null = null;
  private dragStartScroll = 0;
  private dragged = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSelect: (level: number) => void,
    private readonly onToggle: (open: boolean) => void,
  ) {
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.75).setOrigin(0, 0).setInteractive();
    this.dim.on('pointerup', () => {
      if (!this.dragged) this.hide();
    });
    this.panel = scene.add
      .rectangle(0, 0, 10, 10, 0x161b22, 1)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x30363d)
      .setInteractive(); // клік по панелі не закриває вікно
    this.title = scene.add
      .text(0, 0, t('picker.title'), { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5, 0);
    this.hint = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#8b949e', align: 'center' })
      .setOrigin(0.5, 1);
    this.container = scene.add
      .container(0, 0, [this.dim, this.panel, this.title, this.hint])
      .setDepth(20)
      .setVisible(false);

    // Перетягування — прокрутка на тачі; після перетягування «відпускання» не вибирає рівень.
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.open) return;
      this.dragY = p.y;
      this.dragStartScroll = this.scroll;
      this.dragged = false;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.open || this.dragY === null || !p.isDown) return;
      const dy = this.dragY - p.y;
      if (Math.abs(dy) > 12) this.dragged = true;
      if (this.dragged) this.setScroll(this.dragStartScroll + Math.round(dy / (CELL_H + GAP)));
    });

    scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (!this.open) return;
      this.setScroll(this.scroll + Math.sign(dy));
    });
  }

  show(data: PickerData): void {
    this.data = data;
    this.sel = data.current;
    this.open = true;
    this.container.setVisible(true);
    this.layout(this.w, this.h);
    this.revealSelected();
    this.render();
    this.onToggle(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.container.setVisible(false);
    this.onToggle(false);
  }

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.dim.setSize(w, h);
    this.dim.input?.hitArea.setSize(w, h);
    if (!this.data) return;

    const panelW = Math.min(w - 24, 620);
    this.cols = Math.max(1, Math.floor((panelW - 32 + GAP) / (CELL_W + GAP)));
    const rows = Math.ceil(this.data.unlocked / this.cols);
    const maxPanelH = h - 24;
    const wantH = HEADER + rows * (CELL_H + GAP) - GAP + FOOTER + 16;
    const panelH = Math.min(maxPanelH, wantH);
    this.visibleRows = Math.max(1, Math.floor((panelH - HEADER - FOOTER - 16 + GAP) / (CELL_H + GAP)));
    this.scroll = Phaser.Math.Clamp(this.scroll, 0, this.maxScroll());

    this.panelX = Math.round((w - panelW) / 2);
    this.panelY = Math.round((h - panelH) / 2);
    this.panel.setSize(panelW, panelH).setPosition(this.panelX, this.panelY);
    this.panel.input?.hitArea.setSize(panelW, panelH);
    this.title.setPosition(w / 2, this.panelY + 16);
    this.hint
      .setPosition(w / 2, this.panelY + panelH - 10)
      .setWordWrapWidth(panelW - 24)
      .setText(t('picker.hint', { n: this.data.unlocked }) + (this.maxScroll() > 0 ? t('picker.scroll') : ''));
    this.title.setText(t('picker.title'));
    if (this.open) this.render();
  }

  /** Повертає true, якщо клавішу з'їдено (поки вікно відкрите — з'їдаємо всі). */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.open || !this.data) return false;
    e.preventDefault();
    const step: Record<string, number> = {
      ArrowLeft: -1,
      KeyA: -1,
      ArrowRight: 1,
      KeyD: 1,
      ArrowUp: -this.cols,
      KeyW: -this.cols,
      ArrowDown: this.cols,
      KeyS: this.cols,
    };
    if (e.code === 'Escape') {
      this.hide();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      if (!e.repeat) this.choose(this.sel);
    } else if (step[e.code] !== undefined) {
      // Вийти за межі сітки не можна: на краю стрілка просто нічого не робить.
      const next = this.sel + step[e.code]!;
      if (next >= 1 && next <= this.data.unlocked) {
        this.sel = next;
        this.revealSelected();
        this.render();
      }
    }
    return true;
  }

  private choose(level: number): void {
    this.hide();
    this.onSelect(level);
  }

  private maxScroll(): number {
    if (!this.data) return 0;
    return Math.max(0, Math.ceil(this.data.unlocked / this.cols) - this.visibleRows);
  }

  private setScroll(v: number): void {
    const next = Phaser.Math.Clamp(v, 0, this.maxScroll());
    if (next === this.scroll) return;
    this.scroll = next;
    this.render();
  }

  private revealSelected(): void {
    const row = Math.floor((this.sel - 1) / this.cols);
    if (row < this.scroll) this.scroll = row;
    else if (row >= this.scroll + this.visibleRows) this.scroll = row - this.visibleRows + 1;
    this.scroll = Phaser.Math.Clamp(this.scroll, 0, this.maxScroll());
  }

  private render(): void {
    const data = this.data;
    if (!data) return;
    for (const c of this.cells) c.destroy();
    this.cells = [];
    this.rects.clear();

    const gridW = this.cols * (CELL_W + GAP) - GAP;
    const x0 = Math.round(this.w / 2 - gridW / 2);
    const y0 = this.panelY + HEADER;
    for (let r = 0; r < this.visibleRows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const n = (this.scroll + r) * this.cols + c + 1;
        if (n > data.unlocked) break;
        const x = x0 + c * (CELL_W + GAP);
        const y = y0 + r * (CELL_H + GAP);
        const done = data.completed.has(n);
        const fill = n === data.current ? 0x1f6feb : done ? 0x196c2e : 0x30363d;
        const rect = this.scene.add.rectangle(x, y, CELL_W, CELL_H, fill).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        rect.on('pointerover', () => {
          this.sel = n;
          this.styleCells();
        });
        rect.on('pointerup', () => {
          if (!this.dragged) this.choose(n);
        });
        const label = this.scene.add
          .text(x + CELL_W / 2, y + CELL_H / 2, `${n}${done ? ' ✓' : ''}`, {
            fontFamily: FONT,
            fontSize: '18px',
            fontStyle: 'bold',
            color: '#ffffff',
          })
          .setOrigin(0.5);
        this.container.add([rect, label]);
        this.cells.push(rect, label);
        this.rects.set(n, rect);
      }
    }
    this.styleCells();
  }

  private styleCells(): void {
    for (const [n, rect] of this.rects) {
      if (n === this.sel) rect.setStrokeStyle(3, 0xffe066);
      else rect.setStrokeStyle(0);
    }
  }
}
