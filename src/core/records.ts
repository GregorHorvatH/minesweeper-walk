import type { GameMode } from './types';

export interface LevelRecord {
  steps: number;
  timeMs: number;
}

/** Прогрес в одному режимі гри. */
export interface ModeRecords {
  /** Найвищий рівень, до якого дійшли. */
  bestLevel: number;
  levels: Record<string, LevelRecord>;
}

export interface RecordsData {
  modes: Record<GameMode, ModeRecords>;
}

export interface RecordUpdate {
  newSteps: boolean;
  newTime: boolean;
  best: LevelRecord;
}

const KEY = 'minesweeper-walk.records.v1';

function emptyMode(): ModeRecords {
  return { bestLevel: 1, levels: {} };
}

function emptyData(): RecordsData {
  return { modes: { homerun: emptyMode(), minesweeper: emptyMode() } };
}

function isModeRecords(v: unknown): v is ModeRecords {
  const m = v as ModeRecords | undefined;
  return !!m && typeof m.bestLevel === 'number' && typeof m.levels === 'object' && m.levels !== null;
}

export function modeRecords(data: RecordsData, mode: GameMode): ModeRecords {
  return data.modes[mode];
}

export function loadRecords(storage: Pick<Storage, 'getItem'> | null = safeStorage()): RecordsData {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as { modes?: Partial<Record<GameMode, unknown>> } & Partial<ModeRecords>;
    const data = emptyData();
    if (parsed.modes) {
      if (isModeRecords(parsed.modes.homerun)) data.modes.homerun = parsed.modes.homerun;
      if (isModeRecords(parsed.modes.minesweeper)) data.modes.minesweeper = parsed.modes.minesweeper;
    } else if (isModeRecords(parsed)) {
      // Старий формат (до появи режимів) — це був «Додому».
      data.modes.homerun = parsed;
    }
    return data;
  } catch {
    return emptyData();
  }
}

/** Фіксує результат рівня; рекорд за кроками і за часом ведеться окремо для кожного режиму. */
export function submitResult(
  data: RecordsData,
  mode: GameMode,
  level: number,
  result: LevelRecord,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): RecordUpdate {
  const rec = data.modes[mode];
  const prev = rec.levels[String(level)];
  const best: LevelRecord = {
    steps: prev ? Math.min(prev.steps, result.steps) : result.steps,
    timeMs: prev ? Math.min(prev.timeMs, result.timeMs) : result.timeMs,
  };
  const update: RecordUpdate = {
    newSteps: !prev || result.steps < prev.steps,
    newTime: !prev || result.timeMs < prev.timeMs,
    best,
  };
  rec.levels[String(level)] = best;
  rec.bestLevel = Math.max(rec.bestLevel, level + 1);
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* приватний режим / переповнене сховище — гра працює й без рекордів */
  }
  return update;
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
