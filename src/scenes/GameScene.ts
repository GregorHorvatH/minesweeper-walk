import Phaser from 'phaser';
import { sfx } from '../audio';
import { bus, type EndInfo, type HudState } from '../bus';
import {
  CELL_SIZE as S,
  HELP_HEIGHT,
  HUD_HEIGHT,
  INV_HEIGHT,
  LONG_PRESS_MS,
  MOVE_MS,
  ZOOM_DEFAULT_INDEX,
  ZOOM_STEPS,
  SWIPE_MIN_PX,
  levelParams,
} from '../config';
import { computeMood } from '../core/analysis';
import { Board, type Knockback, type MoveResult } from '../core/board';
import { generateLevel } from '../core/generator';
import { loadRecords, modeRecords, submitResult, type RecordUpdate } from '../core/records';
import { t } from '../i18n';
import { settings } from '../settings';
import { levelSeed } from '../core/rng';
import { DIR_DELTA, FLAG_NONE, type Dir, type GameMode, type ItemKind, type Pos } from '../core/types';
import { FieldView } from '../objects/FieldView';
import { makePickerData } from '../objects/LevelPicker';
import { Player } from '../objects/Player';

/** Гарячі клавіші предметів: 1 — камінь, 2 — палка з чобітком, 3 — кірка. */
const ITEM_KEYS: Record<string, ItemKind> = {
  Digit1: 'stone',
  Numpad1: 'stone',
  Digit2: 'probe',
  Numpad2: 'probe',
  Digit3: 'pickaxe',
  Numpad3: 'pickaxe',
};

const PAD = 12;
const ZOOM_KEY = 'minesweeper-walk.zoom';
/** Лише стрілки: літера S тепер перемикає звук, тож WASD для руху не використовуємо. */
const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

interface PressInfo {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  long: boolean;
  timer: Phaser.Time.TimerEvent;
}

export class GameScene extends Phaser.Scene {
  private board!: Board;
  private field!: FieldView;
  private player!: Player;
  private deathCell: Pos | null = null;
  private facingMark!: Phaser.GameObjects.Rectangle;

  private level = 1;
  private mode: GameMode = settings.mode;
  private attempt = 0;
  private baseSeed = 0;
  private fixedSeed = false;
  private seed = 0;
  private records = loadRecords();
  /** Кількість життів, з якою стартував поточний рівень (береться з налаштувань). */
  private maxLives: number = settings.lives;
  /** Інвентар на початку поточного рівня — з ним же стартуємо повторну спробу після поразки чи `R`. */
  private startInventory: Record<ItemKind, number> = { stone: 0, probe: 0, pickaxe: 0 };
  /** Інвентар на момент перемоги — переходить на наступний рівень, якщо ввімкнено галочку в налаштуваннях. */
  private carry: Record<ItemKind, number> | null = null;
  private moodKey = '';

  /** Відкрите вікно вибору рівня: гра на паузі, ввід ігнорується. */
  private pickerOpen = false;
  private moving = false;
  private ended = false;
  private timerOn = false;
  private elapsed = 0;
  private runId = 0;

  private facing: Dir = 'right';
  /** Режим огляду: жовтий курсор вільно ходить полем, персонаж стоїть. */
  private zoomIndex = loadZoomIndex();
  private zoomTween: Phaser.Tweens.Tween | null = null;
  /** Предмет «в руці»: наступна стрілка (чи тап по сусідній клітинці) застосує його в цьому напрямку. */
  private aim: ItemKind | null = null;
  private aimMarks: Phaser.GameObjects.Rectangle[] = [];
  private look: Pos | null = null;
  private lookTween: Phaser.Tweens.Tween | null = null;
  private queuedDir: Dir | null = null;
  private walkQueue: Dir[] = [];
  private press: PressInfo | null = null;
  /** Камеру відсунули від персонажа (перетягування, два пальці, колесо): вона більше не слідує за ним, поки не зрушимо з місця. */
  private freeCam = false;
  /** Жест двома пальцями: щипок (масштаб) + перетягування (прокрутка). */
  private gesture: { startDist: number; startZoom: number; lastX: number; lastY: number; panned: number } | null = null;
  /** Перетягування мишею: остання позиція курсора. */
  private mousePan: { x: number; y: number } | null = null;
  private lastWheelZoom = 0;

  constructor() {
    super('Game');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.fixedSeed = seedParam !== null && seedParam !== '' && Number.isFinite(Number(seedParam));
    this.baseSeed = this.fixedSeed ? Number(seedParam) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
    const lvl = Number(params.get('level'));
    this.level = Number.isInteger(lvl) && lvl >= 1 ? lvl : 1;

    this.input.mouse?.disableContextMenu();
    this.setupInput();
    this.scene.launch('UI');

    const onContinue = () => this.onContinue();
    // UIScene піднімається після нас — коли готова, повторюємо їй початковий стан.
    const onUiReady = () => {
      bus.emit('start', this.level);
      this.emitHud();
    };
    const onRequestLevels = () => this.openLevelPicker();
    const onPicker = (open: boolean) => {
      this.pickerOpen = open;
      if (open) {
        this.setLook(false);
        this.setAim(null);
        this.walkQueue.length = 0;
        this.queuedDir = null;
      }
    };
    const onSelectItem = (kind: ItemKind) => this.setAim(this.aim === kind ? null : kind);
    const onOpenChest = () => this.openChest();
    const onRecenter = () => this.followPlayer();
    const onSelectLevel = (level: number) => {
      this.level = Math.max(1, level);
      if (!this.fixedSeed) this.attempt++;
      this.startLevel();
    };
    bus.on('continue', onContinue);
    bus.on('ui-ready', onUiReady);
    bus.on('request-levels', onRequestLevels);
    bus.on('picker', onPicker);
    bus.on('select-level', onSelectLevel);
    bus.on('select-item', onSelectItem);
    bus.on('open-chest', onOpenChest);
    bus.on('recenter', onRecenter);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off('continue', onContinue);
      bus.off('ui-ready', onUiReady);
      bus.off('request-levels', onRequestLevels);
      bus.off('picker', onPicker);
      bus.off('select-level', onSelectLevel);
      bus.off('select-item', onSelectItem);
      bus.off('open-chest', onOpenChest);
      bus.off('recenter', onRecenter);
    });

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.cameras.resize(size.width, size.height);
      this.fitCamera();
    });
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.emitHud() });

    this.startLevel();
  }

  update(_time: number, delta: number): void {
    if (this.timerOn && !this.ended && !this.pickerOpen) this.elapsed += delta;
    if (this.ended || this.moving || this.pickerOpen) return;

    const dir: Dir | undefined = this.queuedDir ?? this.walkQueue.shift();
    this.queuedDir = null;
    if (dir) this.followPlayer(); // зрушили з місця — камера знову за персонажем
    if (dir && !this.step(dir)) this.walkQueue.length = 0;
  }

  // ───────────────────────── рівень ─────────────────────────

  /** `inventory` — предмети на старті рівня (за замовчуванням порожньо). */
  private startLevel(inventory?: Partial<Record<ItemKind, number>>): void {
    this.runId++;
    this.deathCell = null;
    this.moodKey = '';
    this.tweens.killAll();
    this.field?.destroy();
    this.player?.destroy();
    this.facingMark?.destroy();
    this.look = null;
    this.lookTween = null;
    this.gesture = null;
    this.mousePan = null;
    this.freeCam = false;
    bus.emit('pan', false);
    this.aim = null;
    for (const m of this.aimMarks) m.destroy();
    this.aimMarks = [];
    this.press?.timer.remove();
    this.press = null;

    const { cols, rows, density } = levelParams(this.level);
    this.seed = this.fixedSeed
      ? levelSeed(this.baseSeed, this.level)
      : levelSeed(this.baseSeed, this.level, this.attempt);
    this.mode = settings.mode;
    const data = generateLevel({ cols, rows, density, seed: this.seed, safePath: this.mode === 'homerun' });

    this.maxLives = settings.lives;
    this.board = new Board(data, this.maxLives, this.mode, settings.blastOnlyOpened, inventory);
    this.startInventory = { ...this.board.inventory };
    this.board.begin();
    this.field = new FieldView(this, this.board);
    this.field.syncAll();
    this.field.setOccupied(this.board.player);
    this.field.applyFog(this.board.player.x, this.board.player.y, false);
    this.player = new Player(this, this.board.player);

    this.facingMark = this.add
      .rectangle(0, 0, S - 8, S - 8)
      .setStrokeStyle(3, 0xffe066, 0.9)
      .setDepth(4)
      .setVisible(false);

    this.aimMarks = [0, 1, 2, 3].map(() =>
      this.add.rectangle(0, 0, S - 8, S - 8).setStrokeStyle(3, 0x4fc3f7, 1).setDepth(4).setVisible(false),
    );

    this.moving = false;
    this.ended = false;
    this.timerOn = false;
    this.elapsed = 0;
    this.facing = 'right';
    this.queuedDir = null;
    this.walkQueue = [];

    const cam = this.cameras.main;
    this.zoomTween = null;
    cam.setZoom(ZOOM_STEPS[this.zoomIndex]);
    cam.stopFollow();
    this.fitCamera();
    cam.centerOn(this.player.image.x, this.player.image.y);
    cam.startFollow(this.player.image, true, 0.12, 0.12);

    this.updateFacing();
    bus.emit('look', false);
    bus.emit('start', this.level);
    this.emitHud();
  }

  private onContinue(): void {
    if (!this.ended) return;
    const won = this.board.status === 'won';
    if (won) this.level++;
    else if (!this.fixedSeed) this.attempt++;
    // Після перемоги — інвентар переходить (якщо ввімкнено); після поразки повторна спроба стартує з тим, що було на початку рівня.
    this.startLevel(won ? (settings.carryInventory ? (this.carry ?? undefined) : undefined) : this.startInventory);
  }

  /** `deathCell` — клітинка, де підірвався гравець (там ставимо могилку). */
  private finish(kind: 'won' | 'lost', deathCell?: Pos): void {
    this.ended = true;
    this.timerOn = false;
    this.walkQueue.length = 0;
    this.setLook(false);
    this.setAim(null);
    this.facingMark.setVisible(false);
    this.field.revealMines(); // і після перемоги, і після поразки показуємо всі міни
    this.field.liftFog();

    let update: RecordUpdate | null = null;
    if (kind === 'won') {
      this.carry = { ...this.board.inventory };
      update = submitResult(this.records, this.mode, this.level, { steps: this.board.steps, timeMs: this.elapsed });
      sfx.play('win');
      this.confetti();
    } else {
      sfx.play('lose');
      this.deathCell = deathCell ?? { ...this.board.player };
      this.player.die(this.deathCell);
    }
    this.emitHud();

    const info: EndInfo = {
      mode: this.mode,
      kind,
      level: this.level,
      steps: this.board.steps,
      timeMs: this.elapsed,
      lives: this.board.lives,
      maxLives: this.maxLives,
      update,
      bestLevel: Math.max(modeRecords(this.records, this.mode).bestLevel, this.level),
      seed: this.seed,
    };
    const run = this.runId;
    this.time.delayedCall(kind === 'won' ? 900 : 1100, () => {
      if (run !== this.runId) return;
      const cam = this.cameras.main;
      if (this.deathCell) info.focusY = (Player.worldPos(this.deathCell).y - cam.midPoint.y) * cam.zoom + cam.centerY;
      bus.emit('end', info);
    });
  }

  /** Рівні 1..(найдалі, куди дійшли) — будь-який можна пройти знову. */
  private openLevelPicker(): void {
    if (this.pickerOpen) return;
    // Рівні беруться з прогресу режиму, що обраний у налаштуваннях, — саме в ньому стартуватиме вибраний рівень.
    const current = this.mode === settings.mode ? this.level : 1;
    bus.emit('levels', makePickerData(this.records, settings.mode, current));
  }

  /**
   * Настрій музики: піднесений, коли відкрилась дорога до хатинки; похмурий, коли гравцеві лишається лише вгадувати.
   * Аналіз не дешевий, тому рахуємо його лише коли змінився стан, що на нього впливає.
   */
  private updateMood(): void {
    const b = this.board;
    let opened = 0;
    for (let i = 0; i < b.opened.length; i++) opened += b.opened[i]!;
    const key = [opened, b.player.x, b.player.y, b.status, b.flagCount, b.lives, b.level.mineCount, b.inventory.stone, b.inventory.probe].join(',');
    if (key === this.moodKey) return;
    this.moodKey = key;
    sfx.setMood(computeMood(b));
  }

  private emitHud(): void {
    if (!this.board) return;
    this.updateMood();
    const hud: HudState = {
      mode: this.mode,
      level: this.level,
      cols: this.board.cols,
      rows: this.board.rows,
      lives: this.board.lives,
      maxLives: this.maxLives,
      steps: this.board.steps,
      flags: this.board.flagCount,
      mines: this.board.level.mineCount,
      timeMs: this.elapsed,
      zoom: ZOOM_STEPS[this.zoomIndex]!,
      inventory: { ...this.board.inventory },
      aim: this.aim,
      chestHere: this.board.chestHere() !== undefined,
      best: modeRecords(this.records, this.mode).levels[String(this.level)] ?? null,
    };
    bus.emit('hud', hud);
  }

  // ───────────────────────── камера ─────────────────────────

  /** Поле більше за вікно — камера скролиться; менше — центрується. Усе рахуємо у світових одиницях з поправкою на зум. */
  private fitCamera(): void {
    const cam = this.cameras.main;
    const z = cam.zoom;
    const vw = cam.width / z;
    const vh = cam.height / z;
    const padX = PAD / z;
    const padTop = HUD_HEIGHT / z;
    const contentW = this.board.cols * S + padX * 2;
    const contentH = this.board.rows * S + padTop + (HELP_HEIGHT + INV_HEIGHT) / z;
    const bx = contentW >= vw ? -padX : -padX - (vw - contentW) / 2;
    const by = contentH >= vh ? -padTop : -padTop - (vh - contentH) / 2;
    cam.setBounds(bx, by, Math.max(contentW, vw), Math.max(contentH, vh));
  }

  /** Клавіші − / +: плавно змінює масштаб на один крок і запам'ятовує його. */
  private changeZoom(delta: number): void {
    this.applyZoomIndex(Phaser.Math.Clamp(this.zoomIndex + delta, 0, ZOOM_STEPS.length - 1));
  }

  /** Плавно виставляє крок масштабу `next` (`force` — навіть якщо індекс той самий, а зум після щипка десь посередині). */
  private applyZoomIndex(next: number, force = false): void {
    if (next === this.zoomIndex && !force) return;
    this.zoomIndex = next;
    try {
      localStorage.setItem(ZOOM_KEY, String(next));
    } catch {
      /* масштаб просто не запам'ятається */
    }
    const cam = this.cameras.main;
    this.zoomTween?.stop();
    this.zoomTween = this.tweens.addCounter({
      from: cam.zoom,
      to: ZOOM_STEPS[next]!,
      duration: 160,
      ease: 'Sine.easeOut',
      onUpdate: (tw) => {
        cam.setZoom(tw.getValue() ?? 1);
        this.fitCamera();
      },
      onComplete: () => {
        cam.setZoom(ZOOM_STEPS[next]!);
        this.fitCamera();
        this.zoomTween = null;
      },
    });
    bus.emit('toast', t('zoom', { n: Math.round(ZOOM_STEPS[next]! * 100) }));
    this.emitHud();
  }

  // ───────────────────────── ввід ─────────────────────────

  private setupInput(): void {
    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      sfx.unlock();
      if (this.pickerOpen) return;
      const dir = KEY_DIRS[e.code];
      if (dir && (this.look || e.shiftKey)) {
        // Shift + стрілка — огляд: рухаємо курсор (автоповтор доречний — це лише погляд, не крок).
        e.preventDefault();
        if (!this.look) this.setLook(true);
        if (this.look) {
          const d = DIR_DELTA[dir];
          this.moveLook(d.x, d.y);
        }
      } else if (dir && this.aim) {
        // Предмет «в руці»: стрілка задає напрямок застосування (а не крок).
        e.preventDefault();
        if (!e.repeat) this.useAim(dir);
      } else if (dir) {
        e.preventDefault();
        // Одне натискання — одна клітинка: автоповтор при утримуванні клавіші ігноруємо,
        // щоб гравець випадково не пройшов кілька клітинок і не підірвався.
        if (e.repeat) return;
        this.walkQueue.length = 0;
        this.facing = dir;
        this.queuedDir = dir;
        this.updateFacing();
      } else if (e.code === 'KeyF' && !e.repeat) {
        if (this.look) {
          this.toggleFlag(this.look.x, this.look.y);
        } else {
          const d = DIR_DELTA[this.facing];
          this.toggleFlag(this.board.player.x + d.x, this.board.player.y + d.y);
        }
        this.updateFacing();
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        this.changeZoom(-1);
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        this.changeZoom(1);
      } else if (e.code === 'KeyO' && !e.repeat) {
        this.openChest();
      } else if (ITEM_KEYS[e.code] && !e.repeat) {
        const kind = ITEM_KEYS[e.code]!;
        this.setAim(this.aim === kind ? null : kind);
      } else if (e.code === 'KeyL' && !e.repeat) {
        this.openLevelPicker();
      } else if (e.code === 'KeyR' && !e.repeat) {
        if (!this.fixedSeed) this.attempt++;
        this.startLevel(this.startInventory);
      } else if (e.code === 'KeyS' && !e.repeat) {
        sfx.toggleAll();
        this.emitHud();
      }
    });

    // Відпустили Shift — огляд вимикається, камера повертається до персонажа.
    kb?.on('keyup', (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.setLook(false);
    });
    this.game.events.on(Phaser.Core.Events.BLUR, () => this.setLook(false));

    this.input.addPointer(1); // другий палець для щипка / прокрутки
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _over: unknown, dx: number, dy: number, _dz: number, e?: WheelEvent) =>
      this.onWheel(dx, dy, e),
    );
  }

  // ───────────────────────── камера: прокрутка і масштаб ─────────────────────────

  /** Відсуває камеру від персонажа; кнопка «повернутись» у HUD з'являється через подію 'pan'. */
  private freeCamera(): void {
    if (this.freeCam) return;
    this.setLook(false);
    this.freeCam = true;
    this.cameras.main.stopFollow();
    bus.emit('pan', true);
  }

  /** Камера знову слідує за персонажем (після кроку, тапу по персонажу чи кнопки в HUD). */
  private followPlayer(): void {
    if (!this.freeCam) return;
    this.freeCam = false;
    this.cameras.main.startFollow(this.player.image, true, 0.12, 0.12);
    bus.emit('pan', false);
  }

  /** Зсув у пікселях екрана → зсув камери у світових одиницях. */
  private panBy(dx: number, dy: number): void {
    this.freeCamera();
    const cam = this.cameras.main;
    cam.scrollX -= dx / cam.zoom;
    cam.scrollY -= dy / cam.zoom;
  }

  private startGesture(): void {
    const { pointer1: a, pointer2: b } = this.input;
    this.press?.timer.remove();
    this.press = null; // два пальці — це не тап, не довге натискання і не свайп
    this.mousePan = null;
    this.zoomTween?.stop();
    this.zoomTween = null;
    this.freeCamera();
    this.gesture = {
      startDist: Math.max(1, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)),
      startZoom: this.cameras.main.zoom,
      lastX: (a.x + b.x) / 2,
      lastY: (a.y + b.y) / 2,
      panned: 0,
    };
  }

  private updateGesture(): void {
    const g = this.gesture;
    if (!g) return;
    const { pointer1: a, pointer2: b } = this.input;
    const cam = this.cameras.main;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dist = Math.max(1, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y));

    // Масштаб навколо точки між пальцями: світова точка під ними лишається на місці.
    const z0 = cam.zoom;
    const z1 = Phaser.Math.Clamp((g.startZoom * dist) / g.startDist, ZOOM_STEPS[0]!, ZOOM_STEPS[ZOOM_STEPS.length - 1]!);
    const wx = (mx - cam.x - cam.width / 2) / z0 + cam.scrollX + cam.width / 2;
    const wy = (my - cam.y - cam.height / 2) / z0 + cam.scrollY + cam.height / 2;
    cam.setZoom(z1);
    cam.scrollX = wx - (mx - cam.x - cam.width / 2) / z1 - cam.width / 2;
    cam.scrollY = wy - (my - cam.y - cam.height / 2) / z1 - cam.height / 2;
    this.fitCamera();

    // Перетягування двома пальцями — прокрутка.
    const dx = mx - g.lastX;
    const dy = my - g.lastY;
    g.lastX = mx;
    g.lastY = my;
    g.panned += Math.hypot(dx, dy);
    cam.scrollX -= dx / cam.zoom;
    cam.scrollY -= dy / cam.zoom;
  }

  /** Палець підняли: масштаб липне до найближчого кроку; якщо це був лише щипок — камера повертається до персонажа. */
  private endGesture(): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    const z = this.cameras.main.zoom;
    let best = 0;
    for (let i = 1; i < ZOOM_STEPS.length; i++) {
      if (Math.abs(Math.log(ZOOM_STEPS[i]! / z)) < Math.abs(Math.log(ZOOM_STEPS[best]! / z))) best = i;
    }
    this.applyZoomIndex(best, true);
    if (g.panned < 24) this.followPlayer();
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (this.pickerOpen) return;
    if (this.gesture) {
      this.updateGesture();
      return;
    }
    if (this.mousePan) {
      if (!p.isDown) {
        this.mousePan = null;
        return;
      }
      this.panBy(p.x - this.mousePan.x, p.y - this.mousePan.y);
      this.mousePan = { x: p.x, y: p.y };
      return;
    }
    if (this.press && Math.hypot(p.x - this.press.x, p.y - this.press.y) > 12) {
      this.press.timer.remove();
      // Мишею перетягування — це прокрутка карти (пальцем таке рух — свайп-крок).
      if (!p.wasTouch && p.leftButtonDown() && !this.press.long) {
        this.mousePan = { x: this.press.x, y: this.press.y };
        this.press = null;
        this.panBy(p.x - this.mousePan.x, p.y - this.mousePan.y);
        this.mousePan = { x: p.x, y: p.y };
      }
    }
  }

  /** Колесо / тачпад: прокрутка карти (Shift — по горизонталі); Ctrl + колесо (і щипок на тачпаді) — масштаб. */
  private onWheel(dx: number, dy: number, e?: WheelEvent): void {
    if (this.pickerOpen || this.gesture) return;
    if (e?.ctrlKey) {
      // Щипок на тачпаді шле десятки подій на секунду — один крок масштабу не частіше, ніж раз на 180 мс.
      if (this.time.now - this.lastWheelZoom > 180) {
        this.lastWheelZoom = this.time.now;
        this.changeZoom(dy < 0 ? 1 : -1);
      }
      return;
    }
    const horizontal = e?.shiftKey && dx === 0;
    this.panBy(horizontal ? -dy : -dx, horizontal ? 0 : -dy);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    sfx.unlock();
    if (this.pickerOpen) return;
    if (this.input.pointer1.isDown && this.input.pointer2.isDown && !this.gesture) {
      this.startGesture();
      return;
    }
    if (this.gesture || this.ended || p.y < HUD_HEIGHT || p.y > this.scale.height - HELP_HEIGHT - INV_HEIGHT) return;
    this.setLook(false);
    this.updateFacing();

    if (p.rightButtonDown()) {
      this.flagAtWorld(p.worldX, p.worldY);
      return;
    }
    this.press?.timer.remove();
    const press: PressInfo = {
      x: p.x,
      y: p.y,
      worldX: p.worldX,
      worldY: p.worldY,
      long: false,
      timer: this.time.delayedCall(LONG_PRESS_MS, () => {
        press.long = true;
        this.flagAtWorld(press.worldX, press.worldY);
        navigator.vibrate?.(25);
      }),
    };
    this.press = press;
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    sfx.unlock(); // на мобільних жестом-активацією вважається саме відпускання
    if (this.gesture) {
      this.endGesture();
      return;
    }
    this.mousePan = null;
    const press = this.press;
    if (!press) return;
    this.press = null;
    press.timer.remove();
    if (press.long || this.ended) return;

    const dx = p.x - press.x;
    const dy = p.y - press.y;
    if (p.wasTouch && Math.hypot(dx, dy) >= SWIPE_MIN_PX) {
      const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      this.walkQueue.length = 0;
      this.facing = dir;
      if (this.aim) this.useAim(dir);
      else this.queuedDir = dir;
    } else if (Math.hypot(dx, dy) < 12) {
      this.tapAt(press.worldX, press.worldY);
    }
  }

  /** Тап по сусідній клітинці — крок; по відкритій далекій — автоматична хода відкритими клітинками. */
  private tapAt(wx: number, wy: number): void {
    const cell = this.field.cellAt(wx, wy);
    if (!cell) return;
    const me = this.board.player;
    const dx = cell.x - me.x;
    const dy = cell.y - me.y;
    this.walkQueue.length = 0;
    if (dx === 0 && dy === 0 && !this.aim) {
      this.followPlayer(); // тап по персонажу — камера до нього
      return;
    }
    if (this.aim) {
      // Предмет «в руці»: тап по підсвіченій клітинці застосовує його, будь-який інший тап скасовує вибір.
      const reach = this.aim === 'pickaxe' ? 2 : 1;
      const straight = (dx === 0) !== (dy === 0);
      if (straight && Math.abs(dx) + Math.abs(dy) === reach) {
        this.useAim(dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up');
      } else {
        this.setAim(null);
      }
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      this.queuedDir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    } else {
      this.walkQueue = this.board.walkPath(cell.x, cell.y);
    }
  }

  private flagAtWorld(wx: number, wy: number): void {
    const cell = this.field.cellAt(wx, wy);
    if (cell) this.toggleFlag(cell.x, cell.y);
  }

  /** F / права кнопка / довгий тап: наступний колір прапорця (червоний → жовтий → зелений → зняти). */
  private toggleFlag(x: number, y: number): void {
    const color = this.board.cycleFlag(x, y);
    if (color === null) {
      if (this.board.inBounds(x, y)) sfx.play('bump'); // прапорець на відкриту клітинку не ставиться
      return;
    }
    this.field.syncCell(y * this.board.cols + x);
    sfx.play(color === FLAG_NONE ? 'unflag' : 'flag');
    this.emitHud();
    if (this.board.status === 'won') this.finish('won'); // minesweeper: усі міни позначено без зайвих прапорців
  }

  /** Жовтий квадрат показуємо лише в режимі огляду — поза ним він збивав би з пантелику. */
  private updateFacing(): void {
    if (!this.facingMark) return;
    if (this.look) {
      this.facingMark.setVisible(true).setPosition(this.look.x * S + S / 2, this.look.y * S + S / 2);
    } else {
      this.facingMark.setVisible(false);
    }
  }

  /** Вмикає/вимикає режим огляду; камера слідує за курсором, а потім повертається до персонажа. */
  private setLook(on: boolean): void {
    if (on === (this.look !== null)) return;
    const cam = this.cameras.main;
    if (on) {
      if (this.ended) return;
      this.walkQueue.length = 0;
      this.queuedDir = null;
      this.look = { ...this.board.player };
      this.updateFacing();
      this.facingMark.setStrokeStyle(4, 0xffe066, 1);
      this.lookTween = this.tweens.add({
        targets: this.facingMark,
        alpha: 0.45,
        duration: 450,
        yoyo: true,
        repeat: -1,
      });
      cam.startFollow(this.facingMark, true, 0.18, 0.18);
      if (this.freeCam) {
        this.freeCam = false;
        bus.emit('pan', false);
      }
      this.field.applyFog(this.look.x, this.look.y, true);
    } else {
      this.look = null;
      this.lookTween?.stop();
      this.lookTween = null;
      this.facingMark.setAlpha(1).setStrokeStyle(3, 0xffe066, 0.9);
      cam.startFollow(this.player.image, true, 0.12, 0.12);
      this.field.applyFog(this.board.player.x, this.board.player.y, true);
      this.updateFacing();
    }
    bus.emit('look', on);
  }

  private moveLook(dx: number, dy: number): void {
    if (!this.look) return;
    const x = Phaser.Math.Clamp(this.look.x + dx, 0, this.board.cols - 1);
    const y = Phaser.Math.Clamp(this.look.y + dy, 0, this.board.rows - 1);
    this.look = { x, y };
    // «Ліхтар» світить там, куди дивимось, — інакше прапорець у темряві не видно.
    this.field.applyFog(x, y, true);
    this.updateFacing();
  }

  // ───────────────────────── хід ─────────────────────────

  /** true — хід відбувся (гравець перейшов), false — перешкода або міна. */
  private step(dir: Dir): boolean {
    this.facing = dir;
    this.board.blastOnlyOpened = settings.blastOnlyOpened; // налаштування діє одразу, без перезапуску рівня
    return this.applyMove(this.board.move(dir), dir);
  }

  /** Показує результат ходу (кроку чи виходу з тунелю). `duration` — тривалість переходу. */
  private applyMove(res: MoveResult, dir: Dir, duration = MOVE_MS): boolean {
    switch (res.kind) {
      case 'ignored':
        return false;

      case 'blocked':
        this.lock(140);
        this.player.bump(dir);
        sfx.play('bump');
        this.updateFacing();
        return false;

      case 'mine': {
        if (!res.knockback) this.lock(260); // з відкидом ввід блокує сам політ (knockPlayer)
        // Міни вже немає: оновлюємо кратер, перераховані цифри та клітинки, відкриті каскадом.
        this.field.syncCells(res.changed);
        this.field.syncCells(res.opened);
        this.field.pop(res.opened);
        this.field.applyFog(this.board.player.x, this.board.player.y, true);
        this.explode(res.at);
        sfx.play('boom');
        this.cameras.main.shake(260, 0.012);
        bus.emit('hurt');
        this.emitHud();
        if (res.lost) this.finish('lost', res.at);
        else if (res.won) this.finish('won');
        else this.knockPlayer(res.knockback);
        this.updateFacing();
        return false;
      }

      case 'moved':
      case 'won': {
        this.moving = true;
        this.timerOn = true;
        this.field.syncCell(this.board.idx(res.from.x, res.from.y));
        this.field.syncCell(this.board.idx(res.to.x, res.to.y));
        this.field.syncCells(res.opened);
        this.field.pop(res.opened);
        this.field.setOccupied(res.to);
        this.field.applyFog(res.to.x, res.to.y, true);
        sfx.play(res.opened.length > 3 ? 'open' : 'step');
        this.emitHud();
        const won = res.kind === 'won';
        this.player.moveTo(
          res.to,
          () => {
            this.moving = false;
            if (won) this.finish('won');
            this.updateFacing();
          },
          duration,
        );
        return true;
      }
    }
  }

  // ───────────────────────── ящики та предмети ─────────────────────────

  /** O: відкриває ящик, на якому стоїть персонаж. */
  private openChest(): void {
    if (this.ended || this.moving || this.pickerOpen) return;
    const i = this.board.idx(this.board.player.x, this.board.player.y);
    const loot = this.board.openChest();
    if (!loot) {
      sfx.play('bump');
      bus.emit('toast', t('toast.noChest'));
      return;
    }
    this.timerOn = true;
    this.field.syncCell(i);
    sfx.play('open');
    const p = this.board.player;
    this.burst(p.x * S + S / 2, p.y * S + S / 2, 16, [0xffd23f, 0xf2c14e, 0xfff0a8], 60);
    bus.emit('toast', t(`toast.found.${loot.kind}`, { n: loot.amount }), 1400);
    this.emitHud();
  }

  /** Вибір предмета «в руку» (1/2/3 або слот у HUD); повторний вибір — скасування. */
  private setAim(kind: ItemKind | null): void {
    if (kind && this.board.inventory[kind] <= 0) {
      sfx.play('bump');
      bus.emit('toast', t('toast.noItem'));
      kind = null;
    }
    if (this.aim === kind) {
      this.updateAimMarks();
      return;
    }
    this.aim = kind;
    this.updateAimMarks();
    this.emitHud();
  }

  /** Підсвічує клітинки, куди можна застосувати предмет у руці (для кірки — через одну від персонажа). */
  private updateAimMarks(): void {
    for (const m of this.aimMarks) m.setVisible(false);
    if (!this.aim) return;
    const reach = this.aim === 'pickaxe' ? 2 : 1;
    const me = this.board.player;
    (['up', 'down', 'left', 'right'] as Dir[]).forEach((dir, k) => {
      const d = DIR_DELTA[dir];
      const x = me.x + d.x * reach;
      const y = me.y + d.y * reach;
      if (!this.board.inBounds(x, y)) return;
      this.aimMarks[k]!.setPosition(x * S + S / 2, y * S + S / 2).setVisible(true);
    });
  }

  /** Застосовує предмет у руці в напрямку `dir`. */
  private useAim(dir: Dir): void {
    const kind = this.aim;
    if (!kind || this.moving || this.ended) return;
    this.facing = dir;
    this.board.blastOnlyOpened = settings.blastOnlyOpened;
    const res = this.board.useItem(kind, dir);

    if (res.kind === 'invalid') {
      if (res.reason !== 'ignored') {
        sfx.play('bump');
        this.player.bump(dir);
        bus.emit('toast', t(`toast.${res.reason}`));
      }
      return;
    }

    this.timerOn = true;
    const run = this.runId;
    const me = this.board.player;
    this.setAim(null);

    if (res.kind === 'stone') {
      this.moving = true;
      this.flyStone(me, res.at, () => {
        if (run !== this.runId) return;
        this.moving = false;
        this.field.syncCell(this.board.idx(res.at.x, res.at.y));
        this.field.syncCells(res.changed);
        this.field.syncCells(res.opened);
        this.field.pop(res.opened);
        this.field.applyFog(this.board.player.x, this.board.player.y, true);
        if (res.hit === 'mine') {
          this.explode(res.at);
          sfx.play('boom');
          this.cameras.main.shake(200, 0.008);
        } else {
          sfx.play('open');
        }
        this.emitHud();
        if (res.won) this.finish('won');
        else this.knockPlayer(res.knockback);
      });
      sfx.play('step');
    } else if (res.kind === 'probe') {
      this.moving = true;
      this.dropProbe(res.at, () => {
        if (run !== this.runId) return;
        this.moving = false;
        this.field.syncCell(this.board.idx(res.at.x, res.at.y));
        this.field.syncCells(res.changed);
        this.field.syncCells(res.opened);
        this.field.pop(res.opened);
        this.field.applyFog(this.board.player.x, this.board.player.y, true);
        if (res.broke) {
          this.explode(res.at);
          sfx.play('boom');
          this.cameras.main.shake(200, 0.008);
          bus.emit('toast', t('toast.probeBroke'), 1600);
        } else {
          sfx.play('open');
        }
        this.emitHud();
        if (res.won) this.finish('won');
        else this.knockPlayer(res.knockback);
      });
    } else {
      // Кірка: пил землі над сусідньою клітинкою, а персонаж «виринає» через одну.
      this.burst(res.mid.x * S + S / 2, res.mid.y * S + S / 2, 14, [0x8b5a2b, 0x5b3a1e, 0xb98443], 45);
      sfx.play('step');
      this.applyMove(res.move, dir, MOVE_MS * 2);
    }
    this.emitHud();
  }

  /** Камінь летить дугою від персонажа до клітинки-цілі. */
  private flyStone(from: Pos, to: Pos, done: () => void): void {
    const a = Player.worldPos(from);
    const stone = this.add.image(a.x, a.y, 'stone').setDepth(6);
    const bx = to.x * S + S / 2;
    const by = to.y * S + S / 2;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 240,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 1;
        stone.setPosition(a.x + (bx - a.x) * k, a.y + (by - a.y) * k - Math.sin(k * Math.PI) * 34);
        stone.setScale(1 + Math.sin(k * Math.PI) * 0.5);
      },
      onComplete: () => {
        stone.destroy();
        done();
      },
    });
  }

  /** Палка з чобітком опускається на клітинку, «торкається» землі й піднімається. */
  private dropProbe(at: Pos, done: () => void): void {
    const cx = at.x * S + S / 2;
    const cy = at.y * S + S / 2;
    const probe = this.add.image(cx, cy - 40, 'probe').setOrigin(0.5, 1).setDepth(6).setScale(0.8);
    sfx.play('step');
    this.tweens.add({
      targets: probe,
      y: cy + 12,
      duration: 180,
      ease: 'Quad.easeIn',
      onComplete: () => {
        done();
        this.tweens.add({
          targets: probe,
          y: cy - 44,
          alpha: 0,
          delay: 120,
          duration: 220,
          onComplete: () => probe.destroy(),
        });
      },
    });
  }

  private lock(ms: number): void {
    this.moving = true;
    this.time.delayedCall(ms, () => (this.moving = false));
  }

  // ───────────────────────── ефекти ─────────────────────────

  private explode(cell: Pos): void {
    const cx = cell.x * S + S / 2;
    const cy = cell.y * S + S / 2;
    const flash = this.add.circle(cx, cy, S * 0.4, 0xffa530, 0.9).setDepth(5);
    this.tweens.add({
      targets: flash,
      scale: 3,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    this.burst(cx, cy, 18, [0xffd23f, 0xff7a1a, 0xe03a3a, 0x444444], 90);
    // Вибухова хвиля: біле кільце розбігається від міни.
    const ring = this.add.circle(cx, cy, S * 0.35).setStrokeStyle(5, 0xffffff, 0.85).setDepth(5);
    ring.setFillStyle();
    this.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * Хвиля відкинула гравця: він відлітає в сусідню клітинку. Поки летить, ввід заблоковано; при приземленні
   * відкривається клітинка (та каскад), а якщо там була міна — вона вибухає (і гра може закінчитись).
   * `runId` — захист від рестарту рівня посеред польоту.
   */
  private knockPlayer(kb: Knockback | null): void {
    if (!kb) return;
    const run = this.runId;
    const to = kb.to;
    this.moving = true;
    this.field.setOccupied(to);
    this.field.applyFog(to.x, to.y, true);
    this.time.delayedCall(70, () => {
      if (run !== this.runId) return;
      this.player.blastTo(to, () => {
        if (run !== this.runId) return;
        this.moving = false;
        this.field.syncCell(this.board.idx(to.x, to.y));
        this.field.syncCells(kb.opened);
        this.field.syncCells(kb.changed);
        this.field.pop(kb.opened);
        if (kb.mineLanded) {
          this.explode(to);
          sfx.play('boom');
          this.cameras.main.shake(260, 0.012);
          bus.emit('hurt');
        }
        this.updateFacing();
        this.emitHud();
        if (kb.lost) this.finish('lost', to);
        else if (kb.won) this.finish('won');
      });
    });
    this.emitHud();
  }

  private confetti(): void {
    // «Додому» — салют над хатинкою, «Сапер» — над персонажем.
    const spot = this.mode === 'homerun' ? this.board.level.home : this.board.player;
    this.burst(spot.x * S + S / 2, spot.y * S + S / 2, 46, [0xffd23f, 0x4fc3f7, 0x81c784, 0xe57373, 0xba68c8], 170);
  }

  private burst(cx: number, cy: number, count: number, colors: number[], radius: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.4 + Math.random() * 0.6);
      const spark = this.add
        .image(cx, cy, 'spark')
        .setDepth(6)
        .setTint(colors[i % colors.length]!)
        .setScale(0.6 + Math.random() * 0.8);
      this.tweens.add({
        targets: spark,
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r + radius * 0.25,
        alpha: 0,
        duration: 450 + Math.random() * 450,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }
}

function loadZoomIndex(): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isInteger(n) && n >= 0 && n < ZOOM_STEPS.length) return n;
  } catch {
    /* ігноруємо */
  }
  return ZOOM_DEFAULT_INDEX;
}
