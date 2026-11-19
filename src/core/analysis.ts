import type { Board } from './board';

/** Настрій музики: −1 — похмурий, 0 — звичайний, +1 — піднесений. */
export type Mood = -1 | 0 | 1;

function neighbors(b: Board, i: number): number[] {
  const x = i % b.cols;
  const y = (i / b.cols) | 0;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if ((dx || dy) && b.inBounds(nx, ny)) out.push(ny * b.cols + nx);
    }
  }
  return out;
}

/** Чи відкрита дорога від гравця до хатинки: суцільний ланцюжок ВІДКРИТИХ клітинок (4 напрямки), що закінчується хатинкою. */
export function roadToHome(b: Board): boolean {
  const home = b.idx(b.level.home.x, b.level.home.y);
  if (!b.opened[home]) return false;
  const start = b.idx(b.player.x, b.player.y);
  const seen = new Uint8Array(b.cols * b.rows);
  const queue = [start];
  seen[start] = 1;
  for (let h = 0; h < queue.length; h++) {
    const cur = queue[h]!;
    if (cur === home) return true;
    const x = cur % b.cols;
    const y = (cur / b.cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!b.inBounds(nx, ny)) continue;
      const ni = ny * b.cols + nx;
      if (seen[ni] || !b.opened[ni] || b.level.mines[ni]) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return false;
}

export interface Frontier {
  /** Є закриті клітинки, що межують з відкритими (є куди ступати). */
  exists: boolean;
  /** Чи можна ЛОГІЧНО (за цифрами) визначити хоч одну безпечну закриту клітинку. */
  hasLogicalMove: boolean;
}

/**
 * Простий розв'язувач сапера за видимими цифрами: «число = відомі міни → решта безпечні»,
 * «число − відомі = кількість невідомих → усі міни» та правило вкладених множин (1-2-1). Прапорці гравця
 * ігноруються (вони можуть бути хибні); підірвані клітинки (кратери) відомо безпечні. Істинних мін не підглядаємо.
 */
export function analyzeFrontier(b: Board): Frontier {
  const n = b.cols * b.rows;
  const state = new Int8Array(n); // 0 — невідомо, 1 — безпечна (виведено / кратер), 2 — міна (виведено)
  let exists = false;
  const numbered: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!b.opened[i] && b.exploded[i]) state[i] = 1;
  }
  for (let i = 0; i < n; i++) {
    if (!b.opened[i]) continue;
    let hasClosed = false;
    for (const j of neighbors(b, i)) if (!b.opened[j]) hasClosed = true;
    if (hasClosed) exists = true;
    if (hasClosed && b.level.numbers[i]! > 0) numbered.push(i);
  }
  // Кратер поруч із відкритою клітинкою вже сам по собі — безпечний хід.
  const craterMove = () => {
    for (let i = 0; i < n; i++) if (!b.opened[i] && b.exploded[i]) return true;
    return false;
  };

  const nb = new Map<number, number[]>();
  for (const i of numbered) nb.set(i, neighbors(b, i));

  for (let guard = 0; guard < 50; guard++) {
    let changed = false;
    const info = new Map<number, { unk: number[]; rem: number }>();
    for (const i of numbered) {
      let mines = 0;
      const unk: number[] = [];
      for (const j of nb.get(i)!) {
        if (b.opened[j]) continue;
        if (state[j] === 2) mines++;
        else if (state[j] === 0) unk.push(j);
      }
      const rem = b.level.numbers[i]! - mines;
      info.set(i, { unk, rem });
      if (unk.length === 0) continue;
      if (rem === 0) {
        for (const j of unk) state[j] = 1;
        changed = true;
      } else if (rem === unk.length) {
        for (const j of unk) state[j] = 2;
        changed = true;
      }
    }
    if (!changed) {
      // Правило вкладених множин для пар цифр поруч.
      for (const a of numbered) {
        const ia = info.get(a)!;
        if (ia.unk.length === 0) continue;
        const ax = a % b.cols;
        const ay = (a / b.cols) | 0;
        for (const c of numbered) {
          if (c === a) continue;
          if (Math.abs((c % b.cols) - ax) > 2 || Math.abs(((c / b.cols) | 0) - ay) > 2) continue;
          const ic = info.get(c)!;
          if (ic.unk.length <= ia.unk.length || !ia.unk.every((u) => ic.unk.includes(u))) continue;
          const diff = ic.unk.filter((u) => !ia.unk.includes(u));
          const remDiff = ic.rem - ia.rem;
          if (remDiff === 0) {
            for (const j of diff) if (state[j] === 0) state[j] = 1;
            changed = true;
          } else if (remDiff === diff.length) {
            for (const j of diff) if (state[j] === 0) state[j] = 2;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }

  let safe = craterMove();
  for (let i = 0; i < n && !safe; i++) if (!b.opened[i] && state[i] === 1) safe = true;
  return { exists: exists || safe, hasLogicalMove: safe };
}

/** Частка знайдених мін у режимі minesweeper: правильні червоні прапорці + підірвані, від усіх мін рівня. */
export function minesFound(b: Board): number {
  let exploded = 0;
  for (let i = 0; i < b.exploded.length; i++) exploded += b.exploded[i]!;
  const total = b.level.mineCount + exploded;
  if (total === 0) return 1;
  return (exploded + (total - exploded - b.minesLeftUnflagged())) / total;
}

/**
 * Настрій музики за станом гри:
 *  • піднесений — відкрилась дорога до хатинки («Додому») / знайдено ≥ 70% мін без хибних прапорців («Сапер») / перемога;
 *  • похмурий — складний вибір: жоден хід не виводиться логікою з цифр, а ні каменя, ні палки в запасі немає / поразка;
 *  • звичайний — решта.
 */
export function computeMood(b: Board): Mood {
  if (b.status === 'won') return 1;
  if (b.status === 'lost') return -1;
  if (b.mode === 'homerun' ? roadToHome(b) : minesFound(b) >= 0.7 && b.wrongFlags() === 0) return 1;
  if (b.inventory.stone > 0 || b.inventory.probe > 0) return 0; // є чим безпечно перевірити — вибір не тяжкий
  const f = analyzeFrontier(b);
  return f.exists && !f.hasLogicalMove ? -1 : 0;
}
