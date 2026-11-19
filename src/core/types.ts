/** Режими гри: дійти додому або знайти й позначити всі міни. З часом можна додавати нові. */
export type GameMode = 'homerun' | 'minesweeper';
export const GAME_MODES: readonly GameMode[] = ['homerun', 'minesweeper'];

/** Прапорці: 0 — немає, далі цикл за натисканням F. Червоний і жовтий не пускають на клітинку, зелений — пускає. */
export const FLAG_NONE = 0;
export const FLAG_DANGER = 1; // червоний: небезпека
export const FLAG_SUSPECT = 2; // жовтий: підозра
export const FLAG_SAFE = 3; // зелений: безпека
export type FlagColor = 0 | 1 | 2 | 3;

/** Предмети з ящиків: камінь (кидати на сусідню клітинку), палка з чобітком (перевірка клітинки), кірка (тунель). */
export type ItemKind = 'stone' | 'probe' | 'pickaxe';
export const ITEM_KINDS: readonly ItemKind[] = ['stone', 'probe', 'pickaxe'];

/** Вміст ящика: для каміння amount — скільки каменів, для решти завжди 1. */
export interface Loot {
  kind: ItemKind;
  amount: number;
}

export interface Pos {
  x: number;
  y: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_DELTA: Record<Dir, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface LevelData {
  cols: number;
  rows: number;
  /** 1 — міна. Індекс клітинки: y * cols + x. */
  mines: Uint8Array;
  /** Кількість мін серед 8 сусідів. */
  numbers: Uint8Array;
  /** Гарантовано безпечний 4-напрямковий шлях start → home (у режимі minesweeper шляху немає — лише [start]). */
  path: Pos[];
  start: Pos;
  home: Pos;
  mineCount: number;
  /** Ящики зі скарбами: індекс клітинки → вміст. Лише на клітинках без мін. */
  chests: Map<number, Loot>;
}
