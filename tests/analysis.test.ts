import { describe, expect, it } from 'vitest';
import { analyzeFrontier, computeMood, minesFound, roadToHome } from '../src/core/analysis';
import { Board } from '../src/core/board';
import type { LevelData } from '../src/core/types';

/** Рівень із рядків: '#' — міна. Цифри рахуються автоматично. Старт (0,0), хата в правому нижньому куті. */
function fromRows(rows: string[]): LevelData {
  const h = rows.length;
  const w = rows[0]!.length;
  const mines = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (mines[y * w + x] = c === '#' ? 1 : 0)));
  const numbers = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) numbers[y * w + x]! += mines[ny * w + nx]!;
        }
  return { cols: w, rows: h, mines, numbers, path: [], start: { x: 0, y: 0 }, home: { x: w - 1, y: h - 1 }, mineCount: mines.reduce((a, b) => a + b, 0), chests: new Map() };
}

/** Позначає клітинки відкритими вручну. */
function open(b: Board, cells: [number, number][]) {
  for (const [x, y] of cells) b.opened[b.idx(x, y)] = 1;
}

describe('roadToHome', () => {
  it('дороги немає, поки хатинка закрита', () => {
    const b = new Board(fromRows(['.....', '.....', '.....']), 3);
    b.begin();
    b.opened.fill(1);
    b.opened[b.idx(4, 2)] = 0;
    expect(roadToHome(b)).toBe(false);
  });

  it('є суцільна відкрита дорога до відкритої хатинки', () => {
    const b = new Board(fromRows(['.....', '.....', '.....']), 3);
    b.begin();
    b.opened.fill(1);
    expect(roadToHome(b)).toBe(true);
  });

  it('розрив на шляху (закрита клітинка) — дороги немає', () => {
    const b = new Board(fromRows(['...', '.#.', '...']), 3);
    b.begin();
    b.opened.fill(1);
    // стіна з закритих клітинок навколо центру не заважає, але відріжемо гравця від хати суцільною лінією
    for (let y = 0; y < 3; y++) b.opened[b.idx(1, y)] = 0;
    expect(roadToHome(b)).toBe(false);
  });
});

describe('analyzeFrontier (логіка за цифрами)', () => {
  it('одна закрита клітинка біля «1» — це виведена міна, але інші клітинки поруч безпечні → є логічний хід', () => {
    // 1 біля (1,0) міни: відкриті (0,0) і (0,1) та (1,1); міна (1,0) вираховується, (2,0)… не межує з відкритими
    const b = new Board(fromRows(['.#..', '....', '....']), 3);
    open(b, [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2]]);
    const f = analyzeFrontier(b);
    expect(f.exists).toBe(true);
    // (1,0) — міна за цифрою 1 у (0,0); цифри у (1,1) = 1 теж лише від (1,0) → решта сусідів (0,0)…(2,0)/(2,1)/(2,2) безпечні
    expect(f.hasLogicalMove).toBe(true);
  });

  it('класичні 50/50: два закриті сусіди «1» без іншої інформації — логічного ходу немає', () => {
    const level = fromRows(['#.', '..']);
    // Відкриваємо лише (1,1): число 1, закриті сусіди (0,0),(1,0),(0,1) — три невідомі, одна міна: вгадування
    const b = new Board(level, 3);
    open(b, [[1, 1]]);
    const f = analyzeFrontier(b);
    expect(f.exists).toBe(true);
    expect(f.hasLogicalMove).toBe(false);
  });

  it('правило 1-2-1 (вкладені множини) знаходить безпечну клітинку', () => {
    //  # . .      відкрито нижній ряд: 1 у (0,1), 1 у (1,1)
    //  . . .
    const b = new Board(fromRows(['#..', '...']), 3);
    open(b, [[0, 1], [1, 1], [2, 1]]);
    // (0,1)=1: невідомі (0,0),(1,0); (1,1)=1: невідомі (0,0),(1,0),(2,0); (2,1)=0 → (1,0),(2,0) безпечні одразу
    expect(analyzeFrontier(b).hasLogicalMove).toBe(true);
  });

  it('кратер (підірвана міна) — відомо безпечний хід', () => {
    const b = new Board(fromRows(['#..', '...']), 3);
    open(b, [[1, 1]]);
    expect(analyzeFrontier(b).hasLogicalMove).toBe(false);
    b.exploded[b.idx(0, 0)] = 1;
    b.level.mines[b.idx(0, 0)] = 0;
    expect(analyzeFrontier(b).hasLogicalMove).toBe(true);
  });

  it('повністю відкрите поле — немає куди ступати (frontier порожній)', () => {
    const b = new Board(fromRows(['...', '...']), 3);
    b.opened.fill(1);
    expect(analyzeFrontier(b)).toEqual({ exists: false, hasLogicalMove: false });
  });
});

describe('computeMood', () => {
  it('Додому: дорога відкрита → піднесений', () => {
    const b = new Board(fromRows(['...', '...']), 3);
    b.opened.fill(1);
    expect(computeMood(b)).toBe(1);
  });

  it('вгадування без запасів → похмурий; із каменем чи палкою — звичайний', () => {
    const b = new Board(fromRows(['#.', '..']), 3);
    open(b, [[1, 1]]);
    expect(computeMood(b)).toBe(-1);
    b.inventory.stone = 1;
    expect(computeMood(b)).toBe(0);
    b.inventory.stone = 0;
    b.inventory.probe = 1;
    expect(computeMood(b)).toBe(0);
  });

  it('перемога → піднесений, поразка → похмурий', () => {
    const b = new Board(fromRows(['...', '...']), 3);
    b.status = 'won';
    expect(computeMood(b)).toBe(1);
    b.status = 'lost';
    expect(computeMood(b)).toBe(-1);
  });

  it('звичайна ситуація з логічним ходом — нейтральний настрій', () => {
    const b = new Board(fromRows(['.#..', '....', '....']), 3);
    open(b, [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2]]); // з цифр виводиться безпечна клітинка
    expect(analyzeFrontier(b).hasLogicalMove).toBe(true);
    expect(computeMood(b)).toBe(0);
  });

  it('Сапер: піднесений, коли знайдено ≥ 70% мін без хибних прапорців', () => {
    const b = new Board(fromRows(['.#.#.', '.....', '#...#', '.....']), 3, 'minesweeper');
    b.begin();
    expect(minesFound(b)).toBe(0);
    b.cycleFlag(1, 0);
    b.cycleFlag(3, 0);
    b.cycleFlag(0, 2); // 3 з 4
    expect(minesFound(b)).toBeCloseTo(0.75);
    expect(computeMood(b)).toBe(1);
    b.cycleFlag(2, 3); // хибний червоний
    expect(computeMood(b)).not.toBe(1);
  });
});
