import Phaser from 'phaser';
import type { LevelRecord, RecordUpdate } from './core/records';
import type { GameMode, ItemKind } from './core/types';

export interface HudState {
  mode: GameMode;
  level: number;
  cols: number;
  rows: number;
  lives: number;
  maxLives: number;
  steps: number;
  flags: number;
  mines: number;
  timeMs: number;
  /** Масштаб камери (1 = 100%). */
  zoom: number;
  inventory: Record<ItemKind, number>;
  /** Який предмет «в руці» (чекає напрямку), якщо є. */
  aim: ItemKind | null;
  /** Під персонажем стоїть непочатий ящик. */
  chestHere: boolean;
  best: LevelRecord | null;
}

export interface EndInfo {
  mode: GameMode;
  kind: 'won' | 'lost';
  level: number;
  steps: number;
  timeMs: number;
  lives: number;
  maxLives: number;
  update: RecordUpdate | null;
  bestLevel: number;
  seed: number;
  /** Екранна Y-координата персонажа (там з'явиться могилка) — оверлей поразки не повинен її закривати. */
  focusY?: number;
}

/** Зв'язок GameScene ↔ UIScene. Події: 'hud', 'end', 'hurt', 'continue', 'toast'. */
export const bus = new Phaser.Events.EventEmitter();
