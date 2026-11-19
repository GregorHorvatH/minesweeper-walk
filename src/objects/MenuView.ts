import Phaser from 'phaser';
import { sfx } from '../audio';
import { LANG_NAMES, setLang, t } from '../i18n';
import { GAME_MODES, type GameMode } from '../core/types';
import { LIVES_OPTIONS, saveSettings, settings, type Lang, type Lives } from '../settings';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const BTN_H_MAX = 52;
const BTN_H_MIN = 36;
const BTN_GAP = 10;

export type MenuMode = 'start' | 'pause';

type Page = 'main' | 'settings' | 'help';

/** Розділи довідки; тексти — `help.sec.<id>` та `help.name.<id>` в i18n. */
const HELP_SECTIONS = ['rules', 'modes', 'flags', 'items', 'controls'] as const;

export interface MenuHooks {
  /** Рівень, з якого стартувати («Грати / Продовжити» у стартовому меню). */
  onPlay: (level: number) => void;
  onResume: () => void;
  onOpenLevels: () => void;
  onToggle: (open: boolean) => void;
  /** Звук/мова змінились — HUD має оновитись. */
  onChange: () => void;
  /** Найвищий рівень, до якого гравець уже дійшов. */
  highestLevel: () => number;
}

interface Item {
  label: () => string;
  /** Enter / клік. */
  activate: () => void;
  /** ← / → на пунктах-перемикачах. */
  adjust?: (dir: 1 | -1) => void;
}

/** Стартове / пауза-меню: грати, нова гра, вибір рівня, налаштування (мова, звук, життя). */
export class MenuView {
  private readonly container: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private rects: Phaser.GameObjects.Rectangle[] = [];
  private labels: Phaser.GameObjects.Text[] = [];

  private page: Page = 'main';
  private helpSection = 0;
  private mode: MenuMode = 'start';
  private sel = 0;
  private w = 0;
  private h = 0;
  open = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: MenuHooks,
  ) {
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x05080d, 0.95).setOrigin(0, 0).setInteractive();
    this.title = scene.add
      .text(0, 0, 'Minesweeper Walk', { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    this.subtitle = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: '#8b949e', align: 'center' })
      .setOrigin(0.5);
    this.hint = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#6e7681', align: 'center' })
      .setOrigin(0.5, 0);
    this.body = scene.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: '#c9d1d9', align: 'left', lineSpacing: 4 })
      .setOrigin(0.5, 0)
      .setVisible(false);
    this.container = scene.add
      .container(0, 0, [this.dim, this.title, this.subtitle, this.hint, this.body])
      .setDepth(15)
      .setVisible(false);
  }

  show(mode: MenuMode): void {
    this.mode = mode;
    this.page = 'main';
    this.sel = 0;
    const wasOpen = this.open;
    this.open = true;
    this.container.setVisible(true);
    this.rebuild();
    if (!wasOpen) this.hooks.onToggle(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.container.setVisible(false);
    this.hooks.onToggle(false);
  }

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.dim.setSize(w, h);
    this.dim.input?.hitArea.setSize(w, h);
    if (this.open) this.rebuild();
  }

  /** Перебудовує пункти (мова змінилась, змінилась сторінка тощо). */
  rebuild(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.rects = [];
    this.labels = [];
    this.body.setVisible(false);
    if (!this.w) return;

    const items = this.items();
    this.sel = Phaser.Math.Clamp(this.sel, 0, items.length - 1);
    if (this.page === 'help') {
      this.rebuildHelp(items);
      return;
    }
    const compact = this.w < 520;
    const btnW = Math.min(this.w - 32, 360);
    const headerH = this.page === 'main' ? 110 : 60;
    // Кнопок на сторінці налаштувань багато — на низьких екранах вони стають нижчими, щоб усе вмістилось.
    const btnH = Math.max(BTN_H_MIN, Math.min(BTN_H_MAX, Math.floor((this.h - headerH - 100) / items.length) - BTN_GAP));
    const total = headerH + items.length * (btnH + BTN_GAP) - BTN_GAP;
    const top = Math.max(16, Math.round((this.h - total) / 2));

    this.title
      .setText(this.page === 'main' ? 'Minesweeper Walk' : t('settings.title'))
      .setFontSize(this.page === 'main' ? (compact ? 32 : 44) : 32)
      .setPosition(this.w / 2, top + (this.page === 'main' ? 28 : 20));
    this.subtitle.setText(this.page === 'main' ? t(`mode.desc.${settings.mode}`) : '').setPosition(this.w / 2, top + 76);

    items.forEach((item, i) => {
      const x = Math.round(this.w / 2 - btnW / 2);
      this.addButton(item, i, x, top + headerH + i * (btnH + BTN_GAP), btnW, btnH);
    });

    const touch = this.scene.sys.game.device.input.touch;
    let hintText = touch ? t('menu.hintTouch') : t('menu.hint') + (this.mode === 'pause' ? t('menu.hintPause') : '');
    if (this.page === 'settings') hintText = t(touch ? 'settings.livesNoteTouch' : 'settings.livesNote') + '\n' + hintText;
    // Підказка під кнопками, а не внизу екрана — там видно нижню смугу HUD, і тексти налізали б один на одного.
    this.hint
      .setText(hintText)
      .setPosition(this.w / 2, top + total + 24)
      .setWordWrapWidth(Math.max(240, this.w - 24));
    this.style();
  }

  private addButton(item: Item, i: number, x: number, y: number, w: number, h: number): void {
    const rect = this.scene.add.rectangle(x, y, w, h, 0x21262d).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => {
      this.sel = i;
      this.style();
    });
    rect.on('pointerup', () => {
      this.sel = i;
      this.activate();
    });
    const label = this.scene.add
      .text(this.w / 2, y + h / 2, item.label(), {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#e6edf3',
      })
      .setOrigin(0.5);
    // Довгий напис (галочка в налаштуваннях) переноситься на два рядки дрібнішим шрифтом.
    if (label.width > w - 24) label.setFontSize(15).setAlign('center').setWordWrapWidth(w - 24);
    this.container.add([rect, label]);
    this.objects.push(rect, label);
    this.rects.push(rect);
    this.labels.push(label);
  }

  /** Довідка: текст розділу зверху, внизу кнопки «розділ ◀ ▶» і «Назад»; шрифт підлаштовується під висоту екрана. */
  private rebuildHelp(items: Item[]): void {
    const btnW = Math.min(this.w - 32, 360);
    const btnH = 40;
    const backY = this.h - 16 - btnH;
    const tabY = backY - BTN_GAP - btnH;
    const x = Math.round(this.w / 2 - btnW / 2);
    items.forEach((item, i) => this.addButton(item, i, x, i === 0 ? tabY : backY, btnW, btnH));

    const compact = this.w < 520;
    this.title.setText(t('help.title')).setFontSize(compact ? 26 : 32).setPosition(this.w / 2, 30);
    this.subtitle.setText('');
    this.hint.setText('');

    const top = 62;
    const avail = tabY - 12 - top;
    this.body
      .setVisible(true)
      .setText(t(`help.sec.${HELP_SECTIONS[this.helpSection]}`))
      .setWordWrapWidth(Math.min(this.w - 32, 620))
      .setPosition(this.w / 2, top);
    for (let size = compact ? 15 : 17; size >= 10; size--) {
      this.body.setFontSize(size);
      if (this.body.height <= avail) break;
    }
    this.style();
  }

  /** true — клавішу з'їдено (поки меню відкрите — з'їдаємо всі). */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.open) return false;
    e.preventDefault();
    const count = this.rects.length;
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.sel = (this.sel - 1 + count) % count;
        this.style();
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.sel = (this.sel + 1) % count;
        this.style();
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.items()[this.sel]?.adjust?.(-1);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.items()[this.sel]?.adjust?.(1);
        break;
      case 'Enter':
      case 'Space':
        if (!e.repeat) this.activate();
        break;
      case 'Escape':
      case 'KeyM':
        if (e.repeat) break;
        if (this.page !== 'main') this.goTo('main');
        else if (this.mode === 'pause') this.hooks.onResume();
        break;
    }
    return true;
  }

  private activate(): void {
    this.items()[this.sel]?.activate();
  }

  private goTo(page: Page): void {
    this.page = page;
    this.sel = 0;
    this.rebuild();
  }

  private items(): Item[] {
    if (this.page === 'settings') return this.settingsItems();
    if (this.page === 'help') return this.helpItems();

    const highest = this.hooks.highestLevel();
    const list: Item[] = [];
    if (this.mode === 'pause') {
      list.push({ label: () => t('menu.resume'), activate: () => this.hooks.onResume() });
    } else {
      list.push({
        label: () => (highest > 1 ? t('menu.continue', { n: highest }) : t('menu.play')),
        activate: () => this.hooks.onPlay(highest),
      });
    }
    const cycleMode = (dir: 1 | -1) => {
      const i = GAME_MODES.indexOf(settings.mode);
      settings.mode = GAME_MODES[(i + dir + GAME_MODES.length) % GAME_MODES.length] as GameMode;
      saveSettings();
      this.hooks.onChange();
      this.rebuild();
    };
    list.push(
      { label: () => t('menu.newGame'), activate: () => this.hooks.onPlay(1) },
      { label: () => t('menu.levels'), activate: () => this.hooks.onOpenLevels() },
      {
        label: () => t('menu.mode', { v: t(`mode.${settings.mode}`) }),
        activate: () => cycleMode(1),
        adjust: cycleMode,
      },
      { label: () => t('menu.help'), activate: () => this.goTo('help') },
      { label: () => t('menu.settings'), activate: () => this.goTo('settings') },
    );
    return list;
  }

  private helpItems(): Item[] {
    const cycle = (dir: 1 | -1) => {
      this.helpSection = (this.helpSection + dir + HELP_SECTIONS.length) % HELP_SECTIONS.length;
      this.rebuild();
    };
    return [
      {
        label: () =>
          t('help.tab', {
            name: t(`help.name.${HELP_SECTIONS[this.helpSection]}`),
            i: this.helpSection + 1,
            n: HELP_SECTIONS.length,
          }),
        activate: () => cycle(1),
        adjust: cycle,
      },
      { label: () => t('menu.back'), activate: () => this.goTo('main') },
    ];
  }

  private settingsItems(): Item[] {
    const langs: Lang[] = ['uk', 'en'];
    const cycleLang = (dir: 1 | -1) => {
      const i = langs.indexOf(settings.lang);
      setLang(langs[(i + dir + langs.length) % langs.length]!);
      this.hooks.onChange();
      this.rebuild();
    };
    // Музика і ефекти — дві окремі галочки. Клік — це жест користувача, тож заодно «розблоковуємо» звук у браузері.
    const toggleMusic = () => {
      settings.music = !settings.music;
      saveSettings();
      sfx.unlock();
      sfx.syncMusic();
      this.hooks.onChange();
      this.rebuild();
    };
    const toggleSfx = () => {
      settings.sfx = !settings.sfx;
      saveSettings();
      sfx.unlock();
      this.hooks.onChange();
      this.rebuild();
      sfx.play('flag'); // коли ефекти щойно ввімкнено — одразу чути приклад
    };
    const cycleLives = (dir: 1 | -1) => {
      const i = LIVES_OPTIONS.indexOf(settings.lives);
      settings.lives = LIVES_OPTIONS[(i + dir + LIVES_OPTIONS.length) % LIVES_OPTIONS.length] as Lives;
      saveSettings();
      this.rebuild();
    };
    const toggleCarry = () => {
      settings.carryInventory = !settings.carryInventory;
      saveSettings();
      this.rebuild();
    };
    const toggleBlast = () => {
      settings.blastOnlyOpened = !settings.blastOnlyOpened;
      saveSettings();
      this.rebuild();
    };
    return [
      {
        label: () => t('settings.language', { v: LANG_NAMES[settings.lang] }),
        activate: () => cycleLang(1),
        adjust: cycleLang,
      },
      {
        label: () => t('settings.music', { v: settings.music ? '☑' : '☐' }),
        activate: toggleMusic,
        adjust: toggleMusic,
      },
      {
        label: () => t('settings.sfx', { v: settings.sfx ? '☑' : '☐' }),
        activate: toggleSfx,
        adjust: toggleSfx,
      },
      {
        label: () => t('settings.lives', { v: settings.lives }),
        activate: () => cycleLives(1),
        adjust: cycleLives,
      },
      {
        label: () => t('settings.carry', { v: settings.carryInventory ? '☑' : '☐' }),
        activate: toggleCarry,
        adjust: toggleCarry,
      },
      {
        // Галочка: знята — хвиля може закинути на закриту клітинку, навіть із міною.
        label: () => t('settings.blast', { v: settings.blastOnlyOpened ? '☑' : '☐' }),
        activate: toggleBlast,
        adjust: toggleBlast,
      },
      { label: () => t('menu.back'), activate: () => this.goTo('main') },
    ];
  }

  private style(): void {
    this.rects.forEach((rect, i) => {
      rect.setFillStyle(i === this.sel ? 0x1f6feb : 0x21262d);
      rect.setStrokeStyle(i === this.sel ? 3 : 0, 0xffe066);
    });
  }
}
