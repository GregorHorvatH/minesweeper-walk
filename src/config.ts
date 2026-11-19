export const CELL_SIZE = 56;

/** Висота верхньої панелі HUD — камера залишає під нею місце, щоб персонаж не ховався. */
export const HUD_HEIGHT = 60;

/** Висота нижньої смуги з підказкою — камера теж залишає під нею місце. */
export const HELP_HEIGHT = 76;

/** Висота смуги інвентаря над підказкою (слоти предметів і кнопка «відкрити ящик»). */
export const INV_HEIGHT = 44;

/** Радіус «ліхтаря»: до R0 клітинки повністю видно, до R1 згасають до мінімуму. */
export const FOG_R0 = 2.6;
export const FOG_R1 = 6.5;
export const FOG_MIN_OPENED = 0.5;
export const FOG_MIN_CLOSED = 0.12;

export const MOVE_MS = 120;
export const LONG_PRESS_MS = 450;
export const SWIPE_MIN_PX = 28;

export const NUMBER_COLORS: readonly string[] = [
  '#000000',
  '#2f6fe4', // 1
  '#2e9b4a', // 2
  '#e04646', // 3
  '#2a3f9c', // 4
  '#a02d2d', // 5
  '#1d9aa6', // 6
  '#222222', // 7
  '#6b6b6b', // 8
];

export interface LevelParams {
  cols: number;
  rows: number;
  density: number;
}

/** Поле завжди більше за типовий екран, тому камера скролиться за персонажем. */
export function levelParams(level: number): LevelParams {
  const i = level - 1;
  return {
    cols: Math.min(30 + 2 * i, 70),
    rows: Math.min(20 + i, 45),
    density: Math.min(0.12 + 0.01 * i, 0.3),
  };
}

/** Кроки масштабу камери (клавіші − / +). */
export const ZOOM_STEPS: readonly number[] = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];
export const ZOOM_DEFAULT_INDEX = 3;
