import Phaser from 'phaser';
import { sfx } from '../audio';
import { bus, type EndInfo, type HudState } from '../bus';
import { HELP_HEIGHT, HUD_HEIGHT, INV_HEIGHT } from '../config';
import { ITEM_KINDS, type ItemKind } from '../core/types';
import { loadRecords, modeRecords } from '../core/records';
import { onLangChange, t } from '../i18n';
import { settings } from '../settings';
import { LevelPicker, makePickerData, type PickerData } from '../objects/LevelPicker';
import { MenuView } from '../objects/MenuView';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const COMPACT_W = 520;

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function hearts(lives: number, max: number): string {
  return '♥'.repeat(Math.max(lives, 0)) + '♡'.repeat(Math.max(max - lives, 0));
}

/** HUD, підказки, екрани перемоги/поразки. Накладається поверх GameScene. */
export class UIScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Rectangle;
  private barLine!: Phaser.GameObjects.Rectangle;
  private levelText!: Phaser.GameObjects.Text;
  private levelHit!: Phaser.GameObjects.Rectangle;
  private picker!: LevelPicker;
  private infoText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private heartsText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private flagsText!: Phaser.GameObjects.Text;
  private muteBtn!: Phaser.GameObjects.Text;
  private menuBtn!: Phaser.GameObjects.Text;
  private menu!: MenuView;
  /** Скільки модальних вікон (меню, вибір рівня) відкрито: поки > 0, гра на паузі. */
  private modalCount = 0;
  private lastEnd: EndInfo | null = null;
  private invBg!: Phaser.GameObjects.Rectangle;
  private slots: { kind: ItemKind; rect: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
  private chestBtn!: Phaser.GameObjects.Container;
  private chestBtnRect!: Phaser.GameObjects.Rectangle;
  private chestBtnLabel!: Phaser.GameObjects.Text;
  /** «Повернути камеру до персонажа» — з'являється, коли карту відсунули. */
  private recenterBtn!: Phaser.GameObjects.Container;
  private panOn = false;
  private helpBg!: Phaser.GameObjects.Rectangle;
  private helpText!: Phaser.GameObjects.Text;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private toastText!: Phaser.GameObjects.Text;

  private overlay!: Phaser.GameObjects.Container;
  private dim!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  /** Свічка біля заголовка «Життя скінчились» — така сама, як на могилці. */
  private endCandle!: { base: Phaser.GameObjects.Image; flame: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image };
  private endCandleScale = 1;
  private overlayShownAt = 0;
  private overlayOn = false;

  private hud: HudState | null = null;
  private lookOn = false;

  constructor() {
    super('UI');
  }

  create(): void {
    const text = (size: number, color = '#e6edf3', bold = false) =>
      this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' });

    this.bar = this.add.rectangle(0, 0, 10, HUD_HEIGHT, 0x0d1117, 0.85).setOrigin(0, 0);
    this.barLine = this.add.rectangle(0, HUD_HEIGHT, 10, 2, 0x30363d).setOrigin(0, 0.5);
    this.levelText = text(18, '#e6edf3', true);
    this.levelHit = this.add
      .rectangle(0, 0, 10, 10, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    this.levelHit.on('pointerup', () => bus.emit('request-levels'));
    this.infoText = text(14, '#8b949e');
    this.bestText = text(13, '#8b949e');
    this.heartsText = text(26, '#ff5c6c');
    this.statsText = text(18, '#e6edf3', true).setOrigin(1, 0);
    this.flagsText = text(13, '#8b949e').setOrigin(1, 0);
    this.muteBtn = text(20).setPadding(8, 4, 8, 4).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerup', () => {
      sfx.toggleAll();
      this.refresh();
    });
    this.menuBtn = text(22).setPadding(8, 2, 8, 2).setOrigin(1, 0.5).setText('☰').setInteractive({ useHandCursor: true });
    this.menuBtn.on('pointerup', () => this.openMenu());

    this.invBg = this.add.rectangle(0, 0, 10, INV_HEIGHT, 0x0d1117, 0.85).setOrigin(0, 0);
    for (const kind of ITEM_KINDS) {
      const rect = this.add
        .rectangle(0, 0, 84, 32, 0x21262d)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      rect.on('pointerup', () => bus.emit('select-item', kind));
      const label = text(16, '#e6edf3', true).setOrigin(0.5);
      this.slots.push({ kind, rect, label });
    }
    this.chestBtnRect = this.add
      .rectangle(0, 0, 112, 32, 0xb8860b)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffe066)
      .setInteractive({ useHandCursor: true });
    this.chestBtnRect.on('pointerup', () => bus.emit('open-chest'));
    this.chestBtnLabel = text(16, '#ffffff', true).setOrigin(0.5);
    this.chestBtn = this.add.container(0, 0, [this.chestBtnRect, this.chestBtnLabel]).setVisible(false);
    this.tweens.add({ targets: this.chestBtn, alpha: 0.65, duration: 600, yoyo: true, repeat: -1 });
    const recenterRect = this.add
      .rectangle(0, 0, 40, 32, 0x1f6feb)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x9ec1ff)
      .setInteractive({ useHandCursor: true });
    recenterRect.on('pointerup', () => bus.emit('recenter'));
    const recenterLabel = text(18, '#ffffff', true).setOrigin(0.5).setText('🎯').setPosition(20, 16);
    this.recenterBtn = this.add.container(0, 0, [recenterRect, recenterLabel]).setVisible(false);

    this.helpBg = this.add.rectangle(0, 0, 10, HELP_HEIGHT, 0x0d1117, 0.85).setOrigin(0, 0);
    this.helpText = text(14, '#c9d1d9').setOrigin(0.5).setAlign('center');
    this.hurtFlash = this.add.rectangle(0, 0, 10, 10, 0xff2030, 0).setOrigin(0, 0);

    this.toastText = text(18, '#ffffff', true).setOrigin(0.5, 0).setAlpha(0).setDepth(5);
    this.buildOverlay();
    this.picker = new LevelPicker(
      this,
      (level) => {
        this.menu.hide();
        bus.emit('select-level', level);
      },
      (open) => this.setModal(open),
    );
    this.menu = new MenuView(this, {
      onPlay: (level) => {
        this.menu.hide();
        bus.emit('select-level', level);
      },
      onResume: () => this.menu.hide(),
      onOpenLevels: () => {
        const records = loadRecords();
        const best = modeRecords(records, settings.mode).bestLevel;
        const current =
          this.menuMode === 'start' ? best : this.hud && this.hud.mode === settings.mode ? this.hud.level : 1;
        this.picker.show(makePickerData(records, settings.mode, current));
      },
      onToggle: (open) => this.setModal(open),
      onChange: () => this.refresh(),
      highestLevel: () => modeRecords(loadRecords(), settings.mode).bestLevel,
    });

    bus.on('hud', this.onHud, this);
    bus.on('start', this.onStart, this);
    bus.on('end', this.onEnd, this);
    bus.on('hurt', this.onHurt, this);
    bus.on('look', this.onLook, this);
    bus.on('toast', this.onToast, this);
    bus.on('levels', this.onLevels, this);
    bus.on('pan', this.onPan, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      ['hud', 'start', 'end', 'hurt', 'look', 'toast', 'levels', 'pan'].forEach((name) => bus.removeAllListeners(name)),
    );

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.picker.handleKey(e)) return;
      if (this.menu.handleKey(e)) return;
      if ((e.code === 'Escape' || e.code === 'KeyM') && !e.repeat) {
        this.openMenu();
        return;
      }
      if (this.overlayOn && (e.code === 'Space' || e.code === 'Enter')) this.continueGame();
    });

    const onResize = () => this.layout();
    this.scale.on('resize', onResize);
    const offLang = onLangChange(() => this.onLanguageChanged());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', onResize);
      offLang();
    });
    this.layout();
    bus.emit('ui-ready');

    // Пряме посилання (?seed= / ?level=) пропускає стартове меню.
    const params = new URLSearchParams(window.location.search);
    if (!params.has('seed') && !params.has('level')) this.openMenu('start');
  }

  // ───────────────────────── меню та модальні вікна ─────────────────────────

  private menuMode: 'start' | 'pause' = 'start';

  private openMenu(mode: 'start' | 'pause' = 'pause'): void {
    if (this.menu.open || this.picker.open) return;
    this.menuMode = mode;
    this.menu.show(mode);
  }

  /** Лічильник модальних вікон: гра ставиться на паузу при першому відкритті й знімається після останнього закриття. */
  private setModal(open: boolean): void {
    const wasOpen = this.modalCount > 0;
    this.modalCount = Math.max(0, this.modalCount + (open ? 1 : -1));
    const isOpen = this.modalCount > 0;
    if (wasOpen !== isOpen) bus.emit('picker', isOpen);
  }

  private onLanguageChanged(): void {
    this.refresh();
    if (this.overlayOn && this.lastEnd) this.renderEnd(this.lastEnd);
    this.layout();
    this.menu.rebuild();
  }

  // ───────────────────────── події ─────────────────────────

  private onHud(hud: HudState): void {
    this.hud = hud;
    this.refresh();
  }

  private onToast(msg: string, holdMs = 700): void {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.toastText, alpha: 0, delay: holdMs, duration: 400 });
  }

  private onLevels(data: PickerData): void {
    this.picker.show(data);
  }

  private onPan(on: boolean): void {
    this.panOn = on;
    this.recenterBtn.setVisible(on);
    this.positionInventory();
  }

  private onLook(on: boolean): void {
    this.lookOn = on;
    this.updateHelp();
  }

  private onStart(): void {
    this.hideOverlay();
  }

  private onHurt(): void {
    this.tweens.killTweensOf(this.hurtFlash);
    this.hurtFlash.setAlpha(0.35);
    this.tweens.add({ targets: this.hurtFlash, alpha: 0, duration: 380 });
  }

  private onEnd(info: EndInfo): void {
    this.lastEnd = info;
    this.renderEnd(info);
    this.overlayOn = true;
    this.overlayShownAt = this.time.now;
    this.overlay.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.overlay, alpha: 1, duration: 250 });
    this.layout();
  }

  private renderEnd(info: EndInfo): void {
    const won = info.kind === 'won';
    this.title.setText(t(won ? (info.mode === 'minesweeper' ? 'end.wonMs' : 'end.won') : 'end.lost'));
    this.title.setColor(won ? '#7ee787' : '#ff7b72');

    const record = '  ' + t('end.record');
    const lines: string[] = [t('level', { n: info.level }), t('end.mode', { v: t(`mode.${info.mode}`) })];
    if (won) {
      lines.push(
        t('end.steps', { n: info.steps }) + (info.update?.newSteps ? record : ''),
        t('end.time', { t: fmtTime(info.timeMs) }) + (info.update?.newTime ? record : ''),
        t('end.lives', { a: info.lives, b: info.maxLives }),
      );
      if (info.update) {
        lines.push(t('end.best', { s: info.update.best.steps, t: fmtTime(info.update.best.timeMs) }));
      }
    } else {
      lines.push(t('end.lostSteps', { n: info.steps }), t('end.furthest', { n: info.bestLevel }));
    }
    lines.push('', `seed ${info.seed}`);
    this.body.setText(lines.join('\n'));
    this.hint.setText(t(won ? 'end.hintWon' : 'end.hintLost'));
  }

  private continueGame(): void {
    if (!this.overlayOn || this.time.now - this.overlayShownAt < 350) return;
    bus.emit('continue');
  }

  private hideOverlay(): void {
    this.overlayOn = false;
    this.tweens.killTweensOf(this.overlay);
    this.overlay.setVisible(false);
  }

  // ───────────────────────── вигляд ─────────────────────────

  private buildOverlay(): void {
    this.dim = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.68).setOrigin(0, 0);
    this.dim.setInteractive();
    this.dim.on('pointerup', () => this.continueGame());
    this.title = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    this.body = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '20px', color: '#e6edf3', align: 'center', lineSpacing: 8 })
      .setOrigin(0.5, 0);
    this.hint = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '18px', color: '#ffe066' })
      .setOrigin(0.5);
    this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    const base = this.add.image(0, 0, 'candle').setOrigin(0.5, 1).setVisible(false);
    const flame = this.add.image(0, 0, 'flame').setOrigin(0.5, 0.85).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.endCandle = { base, flame, glow };
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1000,
      repeat: -1,
      onUpdate: () => this.flickerEndCandle(),
    });
    this.overlay = this.add
      .container(0, 0, [this.dim, glow, base, flame, this.title, this.body, this.hint])
      .setDepth(10)
      .setVisible(false);
  }

  private refresh(): void {
    const h = this.hud;
    this.muteBtn.setText(sfx.allMuted ? '🔇' : '🔊');
    if (!h) return;
    this.levelText.setText(`${t('level', { n: h.level })} ▾`);
    const modeIcon = h.mode === 'homerun' ? '🏠' : '🚩';
    // На вузькому екрані значок режиму не вміщається поруч зі статистикою.
    this.infoText.setText(`${this.scale.width < COMPACT_W ? '' : modeIcon + ' '}${h.cols}×${h.rows} · 💣 ${h.mines}`);
    this.heartsText.setText(hearts(h.lives, h.maxLives));
    const rec = t(this.scale.width < COMPACT_W ? 'bestShort' : 'best');
    this.bestText.setText(
      h.best ? `${rec} ${h.best.steps} ${t('stepsUnit')} · ${fmtTime(h.best.timeMs)}` : `${rec} —`,
    );
    this.statsText.setText(`${t('steps', { n: h.steps })} · ${fmtTime(h.timeMs)}`);
    this.flagsText.setText(`🚩 ${h.flags} · 🔍 ${Math.round(h.zoom * 100)}%`);
    this.refreshInventory();
    this.updateHelp();
    this.positionHud();
  }

  private refreshInventory(): void {
    const h = this.hud;
    const icons: Record<ItemKind, string> = { stone: '🪨', probe: '🥾', pickaxe: '⛏' };
    this.slots.forEach(({ kind, rect, label }, i) => {
      const count = h?.inventory[kind] ?? 0;
      const active = h?.aim === kind;
      label.setText(`${i + 1} ${icons[kind]}×${count}`);
      label.setAlpha(count > 0 ? 1 : 0.4);
      rect.setFillStyle(active ? 0x1f6feb : 0x21262d);
      rect.setStrokeStyle(active ? 3 : 0, 0xffe066);
    });
    const touch = this.sys.game.device.input.touch;
    this.chestBtnLabel.setText(`📦 ${t('chest.open')}${touch ? '' : ' (O)'}`);
    this.chestBtn.setVisible(!!h?.chestHere);
    this.positionInventory();
  }

  /** Кнопка «відкрити ящик» підлаштовується під довжину напису і прилипає до правого краю. */
  private positionInventory(): void {
    const { width: w, height: h } = this.scale;
    const btnW = Math.ceil(this.chestBtnLabel.width) + 24;
    this.chestBtnRect.setSize(btnW, 32);
    this.chestBtnRect.input?.hitArea.setSize(btnW, 32);
    this.chestBtnLabel.setPosition(btnW / 2, 16);
    const y = h - HELP_HEIGHT - INV_HEIGHT + 6;
    this.recenterBtn.setPosition(w - 8 - 40, y);
    this.chestBtn.setPosition(w - 8 - btnW - (this.panOn ? 48 : 0), y);
  }

  private layout(): void {
    const { width: w, height: h } = this.scale;
    this.cameras.main.setSize(w, h);
    this.bar.setSize(w, HUD_HEIGHT);
    this.barLine.setSize(w, 2).setPosition(0, HUD_HEIGHT);
    this.hurtFlash.setSize(w, h);
    this.dim.setSize(w, h);
    this.dim.input?.hitArea.setSize(w, h);

    const compact = w < COMPACT_W;
    this.layoutEnd(w, h, compact);
    this.helpBg.setSize(w, HELP_HEIGHT).setPosition(0, h - HELP_HEIGHT);
    // Смуга інвентаря над підказкою: слоти предметів зліва, кнопка «відкрити ящик» справа.
    const invY = h - HELP_HEIGHT - INV_HEIGHT;
    this.invBg.setSize(w, INV_HEIGHT).setPosition(0, invY);
    this.slots.forEach(({ rect, label }, i) => {
      const x = 8 + i * (84 + 8);
      rect.setPosition(x, invY + 6);
      label.setPosition(x + 42, invY + 6 + 16);
      rect.input?.hitArea.setSize(84, 32);
    });
    this.positionInventory();
    this.helpText
      .setFontSize(compact ? 12 : 14)
      .setPosition(w / 2, h - HELP_HEIGHT / 2)
      .setWordWrapWidth(Math.max(240, w - 24));
    this.toastText.setPosition(w / 2, HUD_HEIGHT + 12);
    this.picker.layout(w, h);
    this.menu.layout(w, h);
    this.updateHelp();
    this.positionHud();
  }

  /**
   * Результат рівня. Після перемоги — по центру. Після поразки на місці персонажа стоїть могилка зі свічкою,
   * тому текст відсувається в більшу вільну смугу над нею чи під нею, а затемнення слабшає.
   */
  private layoutEnd(w: number, h: number, compact: boolean): void {
    const focusY = this.overlayOn && this.lastEnd?.kind === 'lost' ? this.lastEnd.focusY : undefined;
    if (focusY === undefined) {
      this.dim.setFillStyle(0x000000, 0.68);
      this.title.setFontSize(compact ? 30 : 40).setPosition(w / 2, h / 2 - 150);
      this.placeEndCandle(false);
      this.body.setFontSize(20).setLineSpacing(8).setPosition(w / 2, h / 2 - 105);
      // Підказка йде під текстом результатів — його висота залежить від режиму та кількості рядків.
      this.hint.setPosition(w / 2, this.body.y + this.body.height + 28);
      return;
    }

    this.dim.setFillStyle(0x000000, 0.5);
    const GRAVE_CLEAR = 56; // півтора клітинки навколо могилки лишаємо чистими
    const above = { from: HUD_HEIGHT + 8, to: focusY - GRAVE_CLEAR };
    const belowTo = h - HELP_HEIGHT - INV_HEIGHT - 8;
    const below = { from: focusY + GRAVE_CLEAR, to: belowTo };
    const zone = above.to - above.from >= below.to - below.from ? above : below;

    const place = (titleSize: number, bodySize: number, spacing: number): number => {
      this.title.setFontSize(titleSize);
      this.body.setFontSize(bodySize).setLineSpacing(spacing);
      const top = zone.from;
      this.title.setPosition(w / 2, top + this.title.height / 2);
      this.body.setPosition(w / 2, top + this.title.height + 6);
      this.hint.setPosition(w / 2, this.body.y + this.body.height + 8 + this.hint.height / 2);
      return this.hint.y + this.hint.height / 2 - top;
    };
    for (const [ts, bs, sp] of compact ? [[26, 15, 3], [22, 13, 2], [20, 11, 1]] : [[32, 17, 5], [26, 15, 3], [22, 13, 2], [20, 11, 1]] as const) {
      if (place(ts, bs, sp) <= zone.to - zone.from) break;
    }
    this.placeEndCandle(true);
  }

  /** Свічка зліва від заголовка поразки; сам заголовок трохи зсувається вправо, щоб пара лишалась по центру. */
  private placeEndCandle(show: boolean): void {
    const { base, flame, glow } = this.endCandle;
    for (const o of [base, flame, glow]) o.setVisible(show);
    if (!show) return;
    const k = this.title.height * 0.055;
    this.endCandleScale = k;
    const gap = 10;
    const candleW = base.width * k;
    this.title.setX(this.title.x + (candleW + gap) / 2);
    const cx = this.title.x - this.title.width / 2 - gap - candleW / 2;
    const bottom = this.title.y + this.title.height / 2 - 2;
    base.setScale(k).setPosition(cx, bottom);
    flame.setPosition(cx, bottom - 12.5 * k);
    glow.setPosition(cx, bottom - 14 * k);
    this.flickerEndCandle();
  }

  private flickerEndCandle(): void {
    const { flame, glow } = this.endCandle;
    if (!flame.visible) return;
    const k = this.endCandleScale;
    const t = this.time.now;
    const flick = 0.92 + Math.sin(t / 95) * 0.05 + Math.sin(t / 41 + 0.7) * 0.04 + Math.random() * 0.03;
    flame
      .setRotation(Math.sin(t / 230) * 0.12)
      .setScale(0.3 * k * (0.96 + Math.sin(t / 140) * 0.05), 0.3 * k * flick * 1.15)
      .setAlpha(0.9 + Math.random() * 0.1);
    glow.setScale(0.45 * k * flick).setAlpha(0.4 * flick);
  }

  private updateHelp(): void {
    const touch = this.sys.game.device.input.touch;
    const aim = this.hud?.aim;
    const key = aim ? `help.aim.${aim}` : this.lookOn ? 'help.look' : touch ? 'help.touch' : 'help.desktop';
    this.helpText.setText(t(key)).setColor(aim || this.lookOn ? '#ffe066' : '#c9d1d9');
  }

  private positionHud(): void {
    const w = this.scale.width;
    const compact = w < COMPACT_W;
    // На вузькому екрані шрифти дрібніші, інакше «Рівень… розмір… міни» налазить на «Кроки».
    this.levelText.setFontSize(compact ? 16 : 18);
    this.infoText.setFontSize(compact ? 12 : 14);
    this.statsText.setFontSize(compact ? 16 : 18);
    // Кнопки меню та звуку стоять одна над одною в правому куті, щоб не відбирати місце в рядках зі статистикою.
    const btnW = Math.max(this.muteBtn.width, this.menuBtn.width);
    this.menuBtn.setPosition(w - 12, 17);
    this.muteBtn.setPosition(w - 12, 44);
    const right = w - 12 - btnW - 10;
    this.statsText.setPosition(right, 10);
    this.flagsText.setPosition(right, 34);
    this.levelText.setPosition(12, 8);
    this.infoText.setPosition(12 + this.levelText.width + 8, 12);
    this.levelHit.setSize(this.levelText.width + 20, 34).setPosition(2, 2);
    this.levelHit.input?.hitArea.setSize(this.levelText.width + 20, 34);
    if (compact) {
      // На вузькому екрані серця переїжджають у другий рядок, щоб не налізти на кроки/час.
      this.heartsText.setFontSize(18).setOrigin(0, 0).setPosition(12, 33);
      this.bestText.setPosition(12 + this.heartsText.width + 10, 36);
    } else {
      this.heartsText.setFontSize(26).setOrigin(0.5, 0).setPosition(w / 2, 14);
      this.bestText.setPosition(12, 34);
    }
  }
}
