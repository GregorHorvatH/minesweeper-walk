import { describe, expect, it } from 'vitest';
import { chestCount, generateLevel, maxStartOpen } from '../src/core/generator';
import { Board } from '../src/core/board';
import { levelSeed } from '../src/core/rng';
import { levelParams } from '../src/config';

function reachable(level: ReturnType<typeof generateLevel>): boolean {
  const { cols, rows, mines } = level;
  const seen = new Uint8Array(cols * rows);
  const q = [0];
  seen[0] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h]!;
    const x = c % cols;
    const y = (c / cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (seen[ni] || mines[ni]) continue;
      seen[ni] = 1;
      q.push(ni);
    }
  }
  return seen[cols * rows - 1] === 1;
}

describe('generateLevel', () => {
  it('завжди дає безпечний прохід від старту до хатинки', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const level = generateLevel({ cols: 30, rows: 20, density: 0.3, seed });
      expect(level.mines[0]).toBe(0);
      expect(level.mines[level.cols * level.rows - 1]).toBe(0);
      expect(reachable(level)).toBe(true);
    }
  });

  it('шлях з’єднує кути сусідніми клітинками без мін', () => {
    const level = generateLevel({ cols: 40, rows: 25, density: 0.3, seed: 7 });
    expect(level.path[0]).toEqual(level.start);
    expect(level.path.at(-1)).toEqual(level.home);
    for (let i = 0; i < level.path.length; i++) {
      const p = level.path[i]!;
      expect(level.mines[p.y * level.cols + p.x]).toBe(0);
      if (i > 0) {
        const q = level.path[i - 1]!;
        expect(Math.abs(p.x - q.x) + Math.abs(p.y - q.y)).toBe(1);
      }
    }
  });

  it('шлях петляє: помітно довший за найкоротший', () => {
    let longer = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const level = generateLevel({ cols: 30, rows: 20, density: 0.2, seed });
      if (level.path.length > 30 + 20 - 1 + 20) longer++;
    }
    expect(longer).toBeGreaterThanOrEqual(15);
  });

  it('працює на мінімальному полі 2×2 і на найбільшому рівні', () => {
    expect(reachable(generateLevel({ cols: 2, rows: 2, density: 1, seed: 1 }))).toBe(true);
    const { cols, rows, density } = levelParams(99);
    expect(reachable(generateLevel({ cols, rows, density, seed: 5 }))).toBe(true);
  });

  it('цифри відповідають кількості мін серед 8 сусідів', () => {
    const level = generateLevel({ cols: 20, rows: 15, density: 0.25, seed: 42 });
    for (let y = 0; y < level.rows; y++) {
      for (let x = 0; x < level.cols; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < level.cols && ny < level.rows) n += level.mines[ny * level.cols + nx]!;
          }
        }
        expect(level.numbers[y * level.cols + x]).toBe(n);
      }
    }
  });

  it('детермінований за seed і різний для різних seed', () => {
    const a = generateLevel({ cols: 30, rows: 20, density: 0.2, seed: 123 });
    const b = generateLevel({ cols: 30, rows: 20, density: 0.2, seed: 123 });
    const c = generateLevel({ cols: 30, rows: 20, density: 0.2, seed: 124 });
    expect(Array.from(a.mines)).toEqual(Array.from(b.mines));
    expect(Array.from(a.mines)).not.toEqual(Array.from(c.mines));
  });

  it('щільність мін близька до заданої поза шляхом', () => {
    const level = generateLevel({ cols: 60, rows: 40, density: 0.2, seed: 9 });
    const safe = new Set(level.path.map((p) => p.y * level.cols + p.x));
    const free = level.cols * level.rows - safe.size;
    expect(level.mineCount / free).toBeGreaterThan(0.17);
    expect(level.mineCount / free).toBeLessThan(0.23);
  });

  it('levelSeed дає різні сіди для різних рівнів і спроб', () => {
    const s = new Set([levelSeed(1, 1), levelSeed(1, 2), levelSeed(1, 1, 1), levelSeed(2, 1)]);
    expect(s.size).toBe(4);
  });

  it('на старті цифра 0, тож перший крок завжди безпечний', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { cols, rows, density } = levelParams(1 + (seed % 15));
      const level = generateLevel({ cols, rows, density, seed });
      expect(level.numbers[0]).toBe(0);
      expect(level.mines[1]).toBe(0);
      expect(level.mines[cols]).toBe(0);
      expect(level.mines[cols + 1]).toBe(0);
    }
  });

  it('стартовий каскад ніколи не відкриває хатинку чи клітинку поруч із нею', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { cols, rows, density } = levelParams(1 + (seed % 15));
      const level = generateLevel({ cols, rows, density, seed });
      const b = new Board(level, 3);
      b.begin();
      const home = b.idx(level.home.x, level.home.y);
      expect(b.opened[home]).toBe(0);
      expect(b.opened[home - 1]).toBe(0);
      expect(b.opened[home - cols]).toBe(0);
    }
  });

  it('стартовий каскад обмежений — гравцеві лишається що відкривати', () => {
    const sizes: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const { cols, rows, density } = levelParams(1);
      const b = new Board(generateLevel({ cols, rows, density, seed }), 3);
      sizes.push(b.begin().length);
    }
    expect(Math.max(...sizes)).toBeLessThanOrEqual(maxStartOpen(30, 20));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(4); // старт + три сусіди
  });

  it('обмеження старту виконуються на всіх рівнях 1–40 (без запасного варіанту)', () => {
    for (let level = 1; level <= 40; level++) {
      for (let seed = 1; seed <= 10; seed++) {
        const { cols, rows, density } = levelParams(level);
        const b = new Board(generateLevel({ cols, rows, density, seed: seed * 7919 + level }), 3);
        expect(b.begin().length).toBeLessThanOrEqual(maxStartOpen(cols, rows));
        expect(b.opened[b.idx(cols - 1, rows - 1)]).toBe(0);
      }
    }
  });

  it('режим без хатинки (safePath: false): шляху немає, старт усе одно безпечний, цифра на старті 0', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { cols, rows, density } = levelParams(1 + (seed % 10));
      const level = generateLevel({ cols, rows, density, seed, safePath: false });
      expect(level.path).toEqual([{ x: 0, y: 0 }]);
      expect(level.numbers[0]).toBe(0);
      const b = new Board(level, 3, 'minesweeper');
      expect(b.begin().length).toBeLessThanOrEqual(maxStartOpen(cols, rows));
    }
  });

  it('без безпечного шляху мін більше, ніж із ним (при тій самій щільності)', () => {
    let withPath = 0;
    let without = 0;
    for (let seed = 1; seed <= 30; seed++) {
      withPath += generateLevel({ cols: 30, rows: 20, density: 0.15, seed }).mineCount;
      without += generateLevel({ cols: 30, rows: 20, density: 0.15, seed, safePath: false }).mineCount;
    }
    expect(without).toBeGreaterThan(withPath);
  });

  it('ящики лише на клітинках без мін, не на старті, потрібної кількості', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { cols, rows, density } = levelParams(1 + (seed % 20));
      for (const safePath of [true, false]) {
        const level = generateLevel({ cols, rows, density, seed, safePath });
        expect(level.chests.size).toBe(chestCount(cols, rows));
        for (const [i, loot] of level.chests) {
          expect(level.mines[i]).toBe(0);
          expect(i).not.toBe(0);
          expect(loot.amount).toBeGreaterThanOrEqual(1);
          if (loot.kind === 'stone') expect(loot.amount).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('ящики детерміновані за seed і дають усі три види предметів', () => {
    const a = generateLevel({ cols: 30, rows: 20, density: 0.12, seed: 5 });
    const b = generateLevel({ cols: 30, rows: 20, density: 0.12, seed: 5 });
    expect([...a.chests]).toEqual([...b.chests]);
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const loot of generateLevel({ cols: 30, rows: 20, density: 0.12, seed }).chests.values()) kinds.add(loot.kind);
    }
    expect(kinds).toEqual(new Set(['stone', 'probe', 'pickaxe']));
  });
});
