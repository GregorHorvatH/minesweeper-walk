import { createRng, type Rng } from './rng';
import type { ItemKind, LevelData, Loot, Pos } from './types';

export interface GenerateOptions {
  cols: number;
  rows: number;
  /** Частка мін серед клітинок поза безпечним шляхом (0..1). */
  density: number;
  seed: number;
  /**
   * true (за замовчуванням) — прокласти гарантований безпечний шлях до хатинки і стежити, щоб старт не відкривав її.
   * false (режим minesweeper) — хатинки немає, шляху немає, міни лише оминають старт.
   */
  safePath?: boolean;
}

const STEPS: readonly Pos[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Найдешевший шлях між двома клітинками по 4 напрямках (Дейкстра з бінарною купою). */
function cheapestPath(cols: number, rows: number, weights: Float32Array, from: number, target: number): number[] {
  const total = cols * rows;
  const dist = new Float32Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);
  const done = new Uint8Array(total);
  dist[from] = 0;

  const heap: number[] = [from];
  const less = (a: number, b: number) => dist[a]! < dist[b]!;
  const push = (v: number) => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i]!, heap[p]!)) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const cur = pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === target) break;
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    for (const s of STEPS) {
      const nx = cx + s.x;
      const ny = cy + s.y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      const nd = dist[cur]! + weights[ni]!;
      if (nd < dist[ni]!) {
        dist[ni] = nd;
        prev[ni] = cur;
        push(ni);
      }
    }
  }

  const out: number[] = [];
  for (let i = target; i !== -1; i = prev[i]!) out.push(i);
  return out.reverse();
}

/**
 * Безпечний шлях start → home по 4 напрямках. Прямий шлях був би нудним (завжди «сходинка»),
 * тому йдемо через кілька випадкових проміжних точок — шлях петляє по всьому полю.
 */
function carvePath(cols: number, rows: number, rng: Rng): Pos[] {
  const total = cols * rows;
  const weights = new Float32Array(total);
  for (let i = 0; i < total; i++) weights[i] = 1 + rng() * 3;

  const waypoints = [0];
  const extra = Math.round(total / 120);
  for (let k = 0; k < extra; k++) waypoints.push(Math.floor(rng() * (total - 1)));
  waypoints.push(total - 1);

  const cells: number[] = [0];
  for (let k = 1; k < waypoints.length; k++) {
    const seg = cheapestPath(cols, rows, weights, waypoints[k - 1]!, waypoints[k]!);
    for (let j = 1; j < seg.length; j++) cells.push(seg[j]!);
  }
  return cells.map((i) => ({ x: i % cols, y: (i / cols) | 0 }));
}

/** Скільки разів перекидаємо міни, якщо старт виявився надто «відкритим». */
const MAX_MINE_ATTEMPTS = 60;

function countNumbers(cols: number, rows: number, mines: Uint8Array): Uint8Array {
  const numbers = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) n += mines[ny * cols + nx]!;
        }
      }
      numbers[y * cols + x] = n;
    }
  }
  return numbers;
}

/** Скільки клітинок щонайбільше може відкрити стартовий каскад (≈6% поля, від 20 до 120). */
export function maxStartOpen(cols: number, rows: number): number {
  return Math.min(120, Math.max(20, Math.round(cols * rows * 0.06)));
}

/**
 * Чи надто «відкритий» старт: каскад нулів дістає до хатинки (чи клітинки поруч з нею) —
 * шлях видно з першого ходу, — або охоплює завелику частину поля, і гравцеві лишається мало роботи.
 */
function startTooOpen(cols: number, rows: number, numbers: Uint8Array, checkHome: boolean): boolean {
  const opened = new Uint8Array(cols * rows);
  let count = 0;
  const stack = [0];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (opened[i]) continue;
    opened[i] = 1;
    count++;
    if (numbers[i] !== 0) continue;
    const x = i % cols;
    const y = (i / cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < cols && ny < rows) stack.push(ny * cols + nx);
      }
    }
  }
  const home = cols * rows - 1;
  if (count > maxStartOpen(cols, rows)) return true;
  return checkHome && (opened[home] === 1 || opened[home - 1] === 1 || opened[home - cols] === 1);
}

/** Скільки ящиків на полі: ≈1 на 90 клітинок, щонайменше 3. */
export function chestCount(cols: number, rows: number): number {
  return Math.max(3, Math.round((cols * rows) / 90));
}

/**
 * Розкладає ящики лише по клітинках без мін (старт не рахуємо). Вміст: 50% каміння (2–4),
 * 30% палка з чобітком, 20% кірка. Викликається після розстановки мін — самі міни від ящиків не залежать.
 */
function placeChests(cols: number, rows: number, mines: Uint8Array, rng: Rng): Map<number, Loot> {
  const candidates: number[] = [];
  for (let i = 1; i < cols * rows; i++) if (!mines[i]) candidates.push(i);
  const chests = new Map<number, Loot>();
  const want = Math.min(chestCount(cols, rows), candidates.length);
  for (let k = 0; k < want; k++) {
    const pick = k + Math.floor(rng() * (candidates.length - k));
    [candidates[k], candidates[pick]] = [candidates[pick]!, candidates[k]!];
    const r = rng();
    const kind: ItemKind = r < 0.5 ? 'stone' : r < 0.8 ? 'probe' : 'pickaxe';
    chests.set(candidates[k]!, { kind, amount: kind === 'stone' ? 2 + Math.floor(rng() * 3) : 1 });
  }
  return chests;
}

export function generateLevel(opts: GenerateOptions): LevelData {
  const { cols, rows, density, seed } = opts;
  const safePath = opts.safePath ?? true;
  if (cols < 2 || rows < 2) throw new Error('Поле має бути щонайменше 2×2');
  const rng = createRng(seed);

  const path = safePath ? carvePath(cols, rows, rng) : [{ x: 0, y: 0 }];
  const safe = new Uint8Array(cols * rows);
  for (const p of path) safe[p.y * cols + p.x] = 1;
  // Сусіди старту завжди без мін: на старті цифра 0, перший крок безпечний, а каскад дає гравцю відправну точку.
  for (const [x, y] of [[1, 0], [0, 1], [1, 1]] as const) safe[y * cols + x] = 1;

  let mines: Uint8Array = new Uint8Array(cols * rows);
  let numbers: Uint8Array = new Uint8Array(cols * rows);
  let mineCount = 0;
  for (let attempt = 0; attempt < MAX_MINE_ATTEMPTS; attempt++) {
    mines = new Uint8Array(cols * rows);
    mineCount = 0;
    for (let i = 0; i < mines.length; i++) {
      if (!safe[i] && rng() < density) {
        mines[i] = 1;
        mineCount++;
      }
    }
    numbers = countNumbers(cols, rows, mines);
    // Старт надто відкритий — перекидаємо міни (на крихітних полях просто беремо останню розкладку).
    if (!startTooOpen(cols, rows, numbers, safePath)) break;
  }

  return {
    cols,
    rows,
    mines,
    numbers,
    path,
    start: { x: 0, y: 0 },
    home: { x: cols - 1, y: rows - 1 },
    mineCount,
    chests: placeChests(cols, rows, mines, rng),
  };
}
