import { GAME_MODES, type GameMode } from './core/types';

export type Lang = 'uk' | 'en';

export const LIVES_OPTIONS = [1, 3, 5] as const;
export type Lives = (typeof LIVES_OPTIONS)[number];

const KEY = 'minesweeper-walk.settings.v1';

interface Stored {
  lang: Lang;
  lives: Lives;
  mode: GameMode;
  /** true — вибухова хвиля кидає лише на відкриту клітинку. */
  blastOnlyOpened: boolean;
  /** true — предмети з інвентаря переходять на наступний рівень. */
  carryInventory: boolean;
  /** Фонова музика. */
  music: boolean;
  /** Звукові ефекти. */
  sfx: boolean;
}

function detectLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en';
}

/** Раніше був один перемикач «звук»: якщо він був вимкнений, лишаємо вимкненими і музику, і ефекти. */
function legacyAudio(): Pick<Stored, 'music' | 'sfx'> {
  try {
    const off = localStorage.getItem('minesweeper-walk.muted') === '1';
    return { music: !off, sfx: !off };
  } catch {
    return { music: true, sfx: true };
  }
}

function load(): Stored {
  const fallback: Stored = { lang: detectLang(), lives: 3, mode: 'homerun', blastOnlyOpened: true, carryInventory: false, ...legacyAudio() };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      lang: parsed.lang === 'uk' || parsed.lang === 'en' ? parsed.lang : fallback.lang,
      lives: LIVES_OPTIONS.includes(parsed.lives as Lives) ? (parsed.lives as Lives) : fallback.lives,
      mode: GAME_MODES.includes(parsed.mode as GameMode) ? (parsed.mode as GameMode) : fallback.mode,
      blastOnlyOpened: typeof parsed.blastOnlyOpened === 'boolean' ? parsed.blastOnlyOpened : fallback.blastOnlyOpened,
      carryInventory: typeof parsed.carryInventory === 'boolean' ? parsed.carryInventory : fallback.carryInventory,
      music: typeof parsed.music === 'boolean' ? parsed.music : fallback.music,
      sfx: typeof parsed.sfx === 'boolean' ? parsed.sfx : fallback.sfx,
    };
  } catch {
    return fallback;
  }
}

/** Налаштування гравця (мова, життя, режим гри, хвиля, інвентар, музика, ефекти). Звук зберігається в audio.ts. */
export const settings: Stored = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* приватний режим — налаштування діють до перезавантаження */
  }
}
