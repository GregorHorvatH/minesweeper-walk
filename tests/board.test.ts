import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { generateLevel } from '../src/core/generator';
import type { Dir, LevelData, Loot } from '../src/core/types';
import { loadRecords, modeRecords, submitResult } from '../src/core/records';

/** Рівень із заданих рядків: '#' — міна, '.' — вільно. Старт (0,0), хата в правому нижньому куті. */
function fromRows(rows: string[], chests: Record<string, Loot> = {}): LevelData {
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
  return {
    cols: w,
    rows: h,
    mines,
    numbers,
    path: [],
    start: { x: 0, y: 0 },
    home: { x: w - 1, y: h - 1 },
    mineCount: mines.reduce((a, b) => a + b, 0),
    // Ящики задаються як 'x,y' → вміст.
    chests: new Map(Object.entries(chests).map(([k, v]) => [Number(k.split(',')[1]) * w + Number(k.split(',')[0]), v])),
  };
}

/** Прокручує прапорець клітинки до «знято» (не більше 4 натискань: після перемоги цикл зупиняється). */
const clearFlag = (b: Board, x: number, y: number) => {
  for (let i = 0; i < 4 && b.flags[b.idx(x, y)] !== 0; i++) b.cycleFlag(x, y);
};

describe('Board', () => {
  it('каскад нулів відкриває сусідів і зупиняється на цифрах', () => {
    const b = new Board(fromRows(['......', '......', '.....#']), 3);
    const opened = b.begin();
    // Усе поле, крім міни, досяжне каскадом.
    expect(opened.length).toBe(17);
    expect(b.opened[b.idx(5, 2)]).toBe(0);
    expect(b.opened[b.idx(4, 1)]).toBe(1);
  });

  it('цифра біля міни не запускає каскад далі', () => {
    const b = new Board(fromRows(['.#...', '.....', '.....']), 3);
    b.begin();
    expect(b.numberAt(0, 0)).toBe(1);
    expect(b.opened[b.idx(0, 0)]).toBe(1);
    expect(b.opened[b.idx(1, 1)]).toBe(0);
  });

  it('хід по мінi забирає життя, гравець лишається на місці', () => {
    const b = new Board(fromRows(['.#.', '...', '...']), 2);
    b.begin();
    const r = b.move('right');
    expect(r).toMatchObject({ kind: 'mine', livesLeft: 1, lost: false });
    expect(b.player).toEqual({ x: 0, y: 0 });
    expect(b.lives).toBe(1);
  });

  it('після вибуху міни немає, цифри навколо перераховані, клітинка прохідна', () => {
    const b = new Board(fromRows(['.#.', '...', '...']), 3);
    b.begin();
    expect(b.numberAt(0, 0)).toBe(1);
    expect(b.level.mineCount).toBe(1);
    b.move('right');
    expect(b.isMine(1, 0)).toBe(false);
    expect(b.level.mineCount).toBe(0);
    for (const [x, y] of [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] as const) expect(b.numberAt(x, y)).toBe(0);
    expect(b.move('right')).toMatchObject({ kind: 'moved', to: { x: 1, y: 0 } });
    expect(b.lives).toBe(2); // життя забрав лише вибух, повторного вибуху на цій клітинці немає
  });

  it('цифри лише біля підірваної міни зменшуються на 1, решта не чіпається', () => {
    const b = new Board(fromRows(['.#.#.', '.....', '.....']), 3);
    b.begin();
    expect(b.numberAt(2, 0)).toBe(2);
    b.move('right');
    expect(b.numberAt(2, 0)).toBe(1);
    expect(b.numberAt(3, 1)).toBe(1);
    expect(b.numberAt(4, 1)).toBe(1);
  });

  it('відкрита клітинка, що стала нулем після вибуху, запускає каскад', () => {
    const b = new Board(fromRows(['.#...', '.....', '.....', '.....']), 3);
    b.begin();
    expect(b.opened[b.idx(0, 1)]).toBe(0);
    const r = b.move('right');
    expect(r.kind).toBe('mine');
    if (r.kind === 'mine') expect(r.opened.length).toBeGreaterThan(0);
    // Усе поле тепер без мін, тож каскад відкрив його повністю.
    expect(b.opened.every((v) => v === 1)).toBe(true);
  });

  it('прапорець можна поставити на кратер, а відкрита клітинка прапорець не приймає', () => {
    const b = new Board(fromRows(['.#.', '#..', '...']), 3);
    b.begin();
    b.move('right');
    expect(b.cycleFlag(1, 0)).toBe(1);
    expect(b.move('right')).toEqual({ kind: 'blocked', reason: 'flag' });
  });

  it('остання життя → поразка, далі ходи ігноруються', () => {
    const b = new Board(fromRows(['.#.', '...', '...']), 1);
    b.begin();
    expect(b.move('right')).toMatchObject({ kind: 'mine', lost: true });
    expect(b.status).toBe('lost');
    expect(b.move('down')).toEqual({ kind: 'ignored' });
  });

  it('прапорець блокує вхід; зняття дозволяє; на відкритій клітинці прапорець неможливий', () => {
    const b = new Board(fromRows(['.#.', '...', '...']), 3);
    b.begin();
    expect(b.cycleFlag(0, 0)).toBeNull();
    expect(b.cycleFlag(0, 1)).toBe(1);
    expect(b.move('down')).toEqual({ kind: 'blocked', reason: 'flag' });
    clearFlag(b, 0, 1);
    expect(b.flags[b.idx(0, 1)]).toBe(0);
    expect(b.move('down')).toMatchObject({ kind: 'moved' });
  });

  it('вихід за межі поля заблокований', () => {
    const b = new Board(fromRows(['.#.', '.#.', '.#.']), 3);
    b.begin();
    expect(b.move('up')).toEqual({ kind: 'blocked', reason: 'edge' });
    expect(b.move('left')).toEqual({ kind: 'blocked', reason: 'edge' });
  });

  it('прохід по безпечному шляху до хатинки дає перемогу', () => {
    const level = generateLevel({ cols: 15, rows: 10, density: 0.3, seed: 77 });
    const b = new Board(level, 1);
    b.begin();
    let last = b.move('up');
    for (let i = 1; i < level.path.length; i++) {
      const p = level.path[i - 1]!;
      const q = level.path[i]!;
      const dir: Dir = q.x > p.x ? 'right' : q.x < p.x ? 'left' : q.y > p.y ? 'down' : 'up';
      last = b.move(dir);
      if (last.kind === 'won') break;
    }
    expect(last.kind).toBe('won');
    expect(b.status).toBe('won');
    expect(b.steps).toBeLessThanOrEqual(level.path.length - 1);
  });

  it('walkPath веде лише по відкритих клітинках', () => {
    const b = new Board(fromRows(['.....', '.....', '..#..']), 3);
    b.begin();
    const dirs = b.walkPath(4, 1);
    expect(dirs.length).toBe(5);
    expect(b.walkPath(2, 2)).toEqual([]); // міна
  });

  it('walkPath порожній, якщо цілі немає серед відкритих', () => {
    const b = new Board(fromRows(['.#...', '#....', '.....']), 3);
    b.begin();
    expect(b.walkPath(4, 2)).toEqual([]);
  });
});

describe('records', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it('фіксує перший результат і покращення окремо за кроками та часом', () => {
    const st = mem();
    const data = loadRecords(st);
    const first = submitResult(data, 'homerun', 1, { steps: 80, timeMs: 60000 }, st);
    expect(first).toMatchObject({ newSteps: true, newTime: true });
    const second = submitResult(loadRecords(st), 'homerun', 1, { steps: 70, timeMs: 90000 }, st);
    expect(second).toMatchObject({ newSteps: true, newTime: false });
    expect(second.best).toEqual({ steps: 70, timeMs: 60000 });
    expect(modeRecords(loadRecords(st), 'homerun').bestLevel).toBe(2);
  });

  it('прогрес у різних режимах незалежний', () => {
    const st = mem();
    submitResult(loadRecords(st), 'minesweeper', 3, { steps: 50, timeMs: 30000 }, st);
    const data = loadRecords(st);
    expect(modeRecords(data, 'minesweeper').bestLevel).toBe(4);
    expect(modeRecords(data, 'homerun').bestLevel).toBe(1);
    expect(modeRecords(data, 'homerun').levels).toEqual({});
  });

  it('старий формат рекордів (до режимів) читається як «Додому»', () => {
    const st = { getItem: () => JSON.stringify({ bestLevel: 5, levels: { '4': { steps: 10, timeMs: 1000 } } }) };
    const data = loadRecords(st);
    expect(modeRecords(data, 'homerun').bestLevel).toBe(5);
    expect(modeRecords(data, 'minesweeper').bestLevel).toBe(1);
  });

  it('псевдо-сховище з сміттям не ламає гру', () => {
    expect(modeRecords(loadRecords({ getItem: () => '{oops' }), 'homerun').bestLevel).toBe(1);
  });
});

describe('Board: режим minesweeper', () => {
  const rows = ['.#.#.', '.....', '#...#', '.....'];
  const mk = (lives = 3) => new Board(fromRows(rows), lives, 'minesweeper');
  const flagMines = (b: Board) => {
    for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) if (b.isMine(x, y)) b.cycleFlag(x, y);
  };

  it('хатинка не потрібна: прихід у правий нижній кут нічого не виграє', () => {
    const b = new Board(fromRows(['.....', '.....', '.....']), 3, 'minesweeper');
    b.begin();
    let last = b.move('right');
    for (const d of ['right', 'right', 'right', 'down', 'down'] as const) last = b.move(d);
    expect(b.player).toEqual({ x: 4, y: 2 });
    expect(last.kind).toBe('moved');
    expect(b.status).toBe('playing');
  });

  it('перемога, коли прапорці стоять рівно на всіх мінах', () => {
    const b = mk();
    b.begin();
    flagMines(b);
    expect(b.status).toBe('won');
  });

  it('зайвий прапорець перемогу скасовує, а зняття зайвого — повертає', () => {
    const b = mk();
    b.begin();
    b.cycleFlag(2, 3); // зайвий
    flagMines(b);
    expect(b.status).toBe('playing');
    expect(b.wrongFlags()).toBe(1);
    expect(b.minesLeftUnflagged()).toBe(0);
    clearFlag(b, 2, 3);
    expect(b.status).toBe('won');
  });

  it('не всі міни позначені — гра триває', () => {
    const b = mk();
    b.begin();
    b.cycleFlag(1, 0);
    expect(b.status).toBe('playing');
    expect(b.minesLeftUnflagged()).toBe(3);
  });

  it('підірвана міна теж вважається відкритою: остання позначена міна + вибух = перемога', () => {
    const b = new Board(fromRows(['.#.', '...', '#..']), 3, 'minesweeper');
    b.begin();
    b.cycleFlag(0, 2); // позначили одну
    const r = b.move('right'); // підірвали другу
    expect(r).toMatchObject({ kind: 'mine', won: true, lost: false });
    expect(b.status).toBe('won');
  });

  it('вибух на останньому житті — поразка, навіть якщо прапорці вже стоять правильно', () => {
    const b = new Board(fromRows(['.#.', '...', '#..']), 1, 'minesweeper');
    b.begin();
    b.cycleFlag(0, 2);
    const r = b.move('right');
    expect(r).toMatchObject({ kind: 'mine', lost: true, won: false });
    expect(b.status).toBe('lost');
  });

  it('прапорець на кратері — зайвий', () => {
    const b = new Board(fromRows(['.#.', '#..', '...']), 3, 'minesweeper');
    b.begin();
    b.move('right'); // вибух (1,0), міна зникла; лишилась (0,1)
    b.cycleFlag(1, 0); // кратер — не міна
    b.cycleFlag(0, 1);
    expect(b.status).toBe('playing');
    clearFlag(b, 1, 0);
    expect(b.status).toBe('won');
  });

  it('у режимі «Додому» прапорці на мінах перемоги не дають', () => {
    const b = new Board(fromRows(rows), 3, 'homerun');
    b.begin();
    flagMines(b);
    expect(b.status).toBe('playing');
  });
});

describe('Board: кольори прапорців', () => {
  const mk = () => {
    const b = new Board(fromRows(['.#.', '...', '#..']), 3);
    b.begin();
    return b;
  };

  it('F по колу: червоний → жовтий → зелений → знято', () => {
    const b = mk();
    expect([1, 2, 3, 0, 1].map(() => b.cycleFlag(0, 1))).toEqual([1, 2, 3, 0, 1]);
  });

  it('червоний і жовтий не пускають на клітинку, зелений пускає', () => {
    const b = mk();
    b.cycleFlag(0, 1); // червоний
    expect(b.move('down')).toEqual({ kind: 'blocked', reason: 'flag' });
    b.cycleFlag(0, 1); // жовтий
    expect(b.move('down')).toEqual({ kind: 'blocked', reason: 'flag' });
    b.cycleFlag(0, 1); // зелений
    expect(b.move('down')).toMatchObject({ kind: 'moved', to: { x: 0, y: 1 } });
  });

  it('прапорець зникає, коли клітинка відкрита (зелений — після входу)', () => {
    const b = mk();
    b.cycleFlag(0, 1);
    b.cycleFlag(0, 1);
    b.cycleFlag(0, 1);
    b.move('down');
    expect(b.flags[b.idx(0, 1)]).toBe(0);
  });

  it('зелений прапорець не рятує від міни: на неї можна ступити і підірватись', () => {
    const b = new Board(fromRows(['.#.', '...', '...']), 3);
    b.begin();
    b.cycleFlag(1, 0);
    b.cycleFlag(1, 0);
    b.cycleFlag(1, 0); // зелений на міні
    expect(b.move('right')).toMatchObject({ kind: 'mine', livesLeft: 2 });
  });

  it('flagCount рахує лише червоні прапорці', () => {
    const b = mk();
    b.cycleFlag(0, 1); // червоний
    b.cycleFlag(1, 0);
    b.cycleFlag(1, 0); // жовтий
    expect(b.flagCount).toBe(1);
  });

  it('walkPath обходить червоні та жовті прапорці', () => {
    const b = new Board(fromRows(['.....', '.....', '.....']), 3);
    b.begin();
    b.flags[b.idx(1, 0)] = 2; // жовтий на відкритій клітинці (напр., лишився з каскаду) — не пускає
    const p = b.walkPath(2, 0);
    expect(p[0]).not.toBe('right');
  });

  it('minesweeper: перемога лише за червоними; жовті й зелені на безпечних клітинках не заважають', () => {
    const b = new Board(fromRows(['.#.#.', '.....', '#...#', '.....']), 3, 'minesweeper');
    b.begin();
    b.cycleFlag(2, 3);
    b.cycleFlag(2, 3); // жовтий на безпечній
    b.cycleFlag(3, 3);
    b.cycleFlag(3, 3);
    b.cycleFlag(3, 3); // зелений на безпечній
    for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) if (b.isMine(x, y)) b.cycleFlag(x, y);
    expect(b.status).toBe('won');
  });

  it('minesweeper: жовтий чи зелений прапорець на міні — це ще не «позначена» міна', () => {
    const b = new Board(fromRows(['.#.', '...', '#..']), 3, 'minesweeper');
    b.begin();
    b.cycleFlag(1, 0);
    b.cycleFlag(1, 0); // жовтий на першій міні (проходить через червоний, але друга міна ще вільна)
    b.cycleFlag(0, 2); // друга міна позначена червоним
    expect(b.status).toBe('playing');
    b.cycleFlag(1, 0); // зелений
    expect(b.status).toBe('playing');
    b.cycleFlag(1, 0); // знято
    expect(b.status).toBe('playing');
    b.cycleFlag(1, 0); // червоний
    expect(b.status).toBe('won');
  });

  it('minesweeper: зайвий червоний на безпечній клітинці блокує перемогу', () => {
    const b = new Board(fromRows(['.#.', '...', '...']), 3, 'minesweeper');
    b.begin();
    b.cycleFlag(2, 2); // зайвий червоний
    b.cycleFlag(1, 0);
    expect(b.status).toBe('playing');
    b.cycleFlag(2, 2);
    b.cycleFlag(2, 2);
    b.cycleFlag(2, 2); // знято
    expect(b.status).toBe('won');
  });
});

describe('Board: ящики, інвентар і предмети', () => {
  const stones = (n: number): Loot => ({ kind: 'stone', amount: n });

  it('O відкриває ящик під гравцем: вміст іде в інвентар, ящик зникає', () => {
    const b = new Board(fromRows(['..#..', '.....', '.....'], { '1,0': stones(3), '0,0': { kind: 'probe', amount: 1 } }), 3);
    b.begin();
    expect(b.chestHere()).toEqual({ kind: 'probe', amount: 1 });
    expect(b.openChest()).toEqual({ kind: 'probe', amount: 1 });
    expect(b.inventory).toEqual({ stone: 0, probe: 1, pickaxe: 0 });
    expect(b.chestHere()).toBeUndefined();
    expect(b.openChest()).toBeNull();
    b.move('right');
    b.openChest();
    expect(b.inventory.stone).toBe(3);
  });

  it('без ящика O нічого не дає', () => {
    const b = new Board(fromRows(['...', '...']), 3);
    b.begin();
    expect(b.openChest()).toBeNull();
    expect(b.inventory).toEqual({ stone: 0, probe: 0, pickaxe: 0 });
  });

  it('предмет, якого немає, не застосовується', () => {
    const b = new Board(fromRows(['.#.', '...']), 3);
    b.begin();
    expect(b.useItem('stone', 'right')).toEqual({ kind: 'invalid', reason: 'none' });
  });

  it('камінь на міну: міна зникає без втрати життя, цифри перераховані, камінь витрачено', () => {
    const b = new Board(fromRows(['.#.', '#..', '...']), 3);
    b.begin();
    b.inventory.stone = 2;
    const r = b.useItem('stone', 'right');
    expect(r).toMatchObject({ kind: 'stone', hit: 'mine' });
    expect(b.isMine(1, 0)).toBe(false);
    expect(b.lives).toBe(3);
    expect(b.inventory.stone).toBe(1);
    expect(b.numberAt(0, 0)).toBe(1); // було 2
    expect(b.player).toEqual({ x: 0, y: 0 });
  });

  it('камінь на безпечну клітинку відкриває її, камінь витрачено', () => {
    const b = new Board(fromRows(['.#.....', '.......', '.......', '.......']), 3);
    b.begin();
    b.inventory.stone = 1;
    expect(b.opened[b.idx(0, 1)]).toBe(0);
    const r = b.useItem('stone', 'down');
    expect(r).toMatchObject({ kind: 'stone', hit: 'safe' });
    expect(b.opened[b.idx(0, 1)]).toBe(1);
    expect(b.inventory.stone).toBe(0);
  });

  it('предмет не витрачається на вже відкриту клітинку чи за межі поля', () => {
    const b = new Board(fromRows(['....', '....']), 3);
    b.begin(); // усе відкрито каскадом
    b.inventory.stone = 1;
    b.inventory.probe = 1;
    expect(b.useItem('stone', 'right')).toEqual({ kind: 'invalid', reason: 'opened' });
    expect(b.useItem('probe', 'down')).toEqual({ kind: 'invalid', reason: 'opened' });
    expect(b.useItem('stone', 'up')).toEqual({ kind: 'invalid', reason: 'edge' });
    expect(b.inventory).toEqual({ stone: 1, probe: 1, pickaxe: 0 });
  });

  it('палка на безпечній клітинці відкриває її і лишається цілою', () => {
    const b = new Board(fromRows(['.#...', '.....', '.....', '.....']), 3);
    b.begin();
    b.inventory.probe = 1;
    const r = b.useItem('probe', 'down');
    expect(r).toMatchObject({ kind: 'probe', hit: 'safe', broke: false });
    expect(b.opened[b.idx(0, 1)]).toBe(1);
    expect(b.inventory.probe).toBe(1);
  });

  it('палка на міні: міна вибухає (без втрати життя), цифри перераховані, палка ламається', () => {
    const b = new Board(fromRows(['.#.', '#..', '...']), 3);
    b.begin();
    b.inventory.probe = 2;
    const r = b.useItem('probe', 'right');
    expect(r).toMatchObject({ kind: 'probe', hit: 'mine', broke: true });
    expect(b.inventory.probe).toBe(1);
    expect(b.isMine(1, 0)).toBe(false);
    expect(b.level.mineCount).toBe(1);
    expect(b.numberAt(0, 0)).toBe(1); // було 2
    expect(b.lives).toBe(3);
    expect(b.player).toEqual({ x: 0, y: 0 });
    expect(b.move('right')).toMatchObject({ kind: 'moved', to: { x: 1, y: 0 } }); // кратер прохідний
  });

  it('палка знімає прапорець: і з міни, що вибухнула, і з безпечної клітинки', () => {
    const onMine = new Board(fromRows(['.#.', '...', '...']), 3);
    onMine.begin();
    onMine.inventory.probe = 1;
    onMine.cycleFlag(1, 0); // червоний на міні
    expect(onMine.useItem('probe', 'right')).toMatchObject({ hit: 'mine', broke: true });
    expect(onMine.flags[onMine.idx(1, 0)]).toBe(0);

    const onSafe = new Board(fromRows(['.#.', '...', '...', '...']), 3);
    onSafe.begin();
    onSafe.inventory.probe = 1;
    onSafe.cycleFlag(0, 1);
    onSafe.cycleFlag(0, 1); // жовтий на безпечній
    expect(onSafe.useItem('probe', 'down')).toMatchObject({ hit: 'safe', broke: false });
    expect(onSafe.flags[onSafe.idx(0, 1)]).toBe(0);
    expect(onSafe.opened[onSafe.idx(0, 1)]).toBe(1);
    expect(onSafe.inventory.probe).toBe(1);
  });

  it('камінь теж знімає прапорець із підірваної міни — інакше він псував би перемогу в minesweeper', () => {
    const b = new Board(fromRows(['.#.', '...', '#..']), 3, 'minesweeper');
    b.begin();
    b.cycleFlag(1, 0); // червоний на першій міні
    b.inventory.stone = 1;
    expect(b.useItem('stone', 'right')).toMatchObject({ hit: 'mine', won: false });
    expect(b.flags[b.idx(1, 0)]).toBe(0);
    expect(b.wrongFlags()).toBe(0);
    b.cycleFlag(0, 2); // друга міна
    expect(b.status).toBe('won');
  });

  it('кірка: тунель під сусідньою клітинкою (навіть із міною) і вихід на наступній; кірка одноразова', () => {
    const b = new Board(fromRows(['.#...', '#....', '.....']), 3);
    b.begin();
    b.inventory.pickaxe = 1;
    const r = b.useItem('pickaxe', 'right');
    expect(r).toMatchObject({ kind: 'pickaxe', mid: { x: 1, y: 0 }, move: { kind: 'moved', to: { x: 2, y: 0 } } });
    expect(b.player).toEqual({ x: 2, y: 0 });
    expect(b.isMine(1, 0)).toBe(true); // міна під тунелем нікуди не ділась
    expect(b.lives).toBe(3);
    expect(b.inventory.pickaxe).toBe(0);
    expect(b.useItem('pickaxe', 'right')).toEqual({ kind: 'invalid', reason: 'none' });
  });

  it('кірка виводить на міну — вибух як при кроці', () => {
    const b = new Board(fromRows(['..#..', '.....', '.....']), 3);
    b.begin();
    b.cycleFlag(1, 0);
    b.cycleFlag(1, 0);
    b.cycleFlag(1, 0); // зелений на сусідній безпечній — тунель під ним
    b.inventory.pickaxe = 1;
    const r = b.useItem('pickaxe', 'right');
    expect(r).toMatchObject({ kind: 'pickaxe', move: { kind: 'mine', livesLeft: 2 } });
    expect(b.player).toEqual({ x: 0, y: 0 });
    expect(b.inventory.pickaxe).toBe(0);
  });

  it('кірка не копає за межі поля і не виходить на червоний/жовтий прапорець (предмет не витрачається)', () => {
    const b = new Board(fromRows(['.#...', '.....', '.....']), 3);
    b.begin();
    b.inventory.pickaxe = 1;
    expect(b.useItem('pickaxe', 'left')).toEqual({ kind: 'invalid', reason: 'edge' });
    b.cycleFlag(2, 0); // червоний
    expect(b.useItem('pickaxe', 'right')).toEqual({ kind: 'invalid', reason: 'blocked' });
    expect(b.inventory.pickaxe).toBe(1);
  });

  it('кірка в хатинку виграє «Додому»', () => {
    const b = new Board(fromRows(['.#.', '.#.', '.#.']), 3);
    b.begin();
    b.inventory.pickaxe = 2;
    b.useItem('pickaxe', 'down'); // (0,2)
    expect(b.player).toEqual({ x: 0, y: 2 });
    const r = b.useItem('pickaxe', 'right'); // (2,2) = хатинка, під (1,2) міна
    expect(r).toMatchObject({ kind: 'pickaxe', move: { kind: 'won' } });
    expect(b.status).toBe('won');
  });

  it('minesweeper: камінь чи палка, що «знаходять» останню міну, дають перемогу', () => {
    const a = new Board(fromRows(['.#.', '...', '#..']), 3, 'minesweeper');
    a.begin();
    a.cycleFlag(0, 2); // друга міна — червоним
    a.inventory.stone = 1;
    expect(a.useItem('stone', 'right')).toMatchObject({ kind: 'stone', hit: 'mine', won: true });
    expect(a.status).toBe('won');

    const b = new Board(fromRows(['.#.', '...', '#..']), 3, 'minesweeper');
    b.begin();
    b.cycleFlag(0, 2);
    b.inventory.probe = 1;
    expect(b.useItem('probe', 'right')).toMatchObject({ kind: 'probe', hit: 'mine', won: true });
    expect(b.status).toBe('won');
  });
});

describe('Board: вибухова хвиля', () => {
  // Гравець у (1,0), міна справа в (2,0); зліва від гравця (0,0).
  const mk = (rows = ['....#', '.....', '.....']) => {
    const b = new Board(fromRows(rows), 3);
    b.begin();
    return b;
  };
  const stand = (b: Board, x: number, y: number) => {
    b.player = { x, y };
  };

  it('крок на міну: хвиля відкидає гравця на 1 клітинку від міни, якщо там відкрита клітинка', () => {
    const b = mk(['.....', '..#..', '.....']);
    b.begin();
    stand(b, 1, 1);
    const r = b.move('right');
    expect(r).toMatchObject({ kind: 'mine', livesLeft: 2, knockback: { to: { x: 0, y: 1 } } });
    expect(b.player).toEqual({ x: 0, y: 1 });
  });

  it('позаду край поля — хвиля гравця не зрушує', () => {
    const b = mk(['.#...', '.....', '.....']);
    const r = b.move('right'); // гравець у (0,0), позаду нічого
    expect(r).toMatchObject({ kind: 'mine', knockback: null });
    expect(b.player).toEqual({ x: 0, y: 0 });
  });

  it('позаду закрита клітинка: хвиля гравця не рухає', () => {
    const b = mk(['.....', '.....', '.....', '.....']);
    // робимо клітинку позаду (1,2) закритою, гравця ставимо в (2,2), міну — в (3,2)
    b.opened[b.idx(1, 2)] = 0;
    b.level.mines[b.idx(3, 2)] = 1;
    stand(b, 2, 2);
    const r = b.move('right');
    expect(r).toMatchObject({ kind: 'mine', knockback: null });
    expect(b.player).toEqual({ x: 2, y: 2 });
  });

  it('камінь, що підриває сусідню міну, теж відкидає гравця', () => {
    const b = mk(['.....', '..#..', '.....']);
    stand(b, 1, 1);
    b.inventory.stone = 1;
    const r = b.useItem('stone', 'right');
    expect(r).toMatchObject({ kind: 'stone', hit: 'mine', knockback: { to: { x: 0, y: 1 } } });
    expect(b.player).toEqual({ x: 0, y: 1 });
    expect(b.lives).toBe(3);
  });

  it('палка на міні відкидає гравця', () => {
    const b = mk(['.....', '..#..', '.....']);
    stand(b, 1, 1);
    b.inventory.probe = 1;
    expect(b.useItem('probe', 'right')).toMatchObject({ kind: 'probe', hit: 'mine', knockback: { to: { x: 0, y: 1 } } });
    expect(b.player).toEqual({ x: 0, y: 1 });
  });

  it('палка і камінь на безпечній закритій клітинці гравця не відкидають', () => {
    const b = mk(['.....', '.....', '.....']);
    b.opened[b.idx(2, 1)] = 0; // закрита безпечна клітинка
    stand(b, 1, 1);
    b.inventory.probe = 1;
    b.inventory.stone = 1;
    expect(b.useItem('probe', 'right')).toMatchObject({ hit: 'safe', knockback: null });
    b.opened[b.idx(2, 1)] = 0;
    expect(b.useItem('stone', 'right')).toMatchObject({ hit: 'safe', knockback: null });
    expect(b.player).toEqual({ x: 1, y: 1 });
  });

  it('кірка: вихід на міну через одну — хвиля відкидає від міни', () => {
    const b = mk(['.....', '...#.', '.....']);
    stand(b, 1, 1);
    b.inventory.pickaxe = 1;
    const r = b.useItem('pickaxe', 'right'); // тунель під (2,1), вихід у (3,1) — міна
    expect(r).toMatchObject({ kind: 'pickaxe', move: { kind: 'mine', knockback: { to: { x: 0, y: 1 } } } });
    expect(b.player).toEqual({ x: 0, y: 1 });
  });

  it('остання життя: гра закінчена, хвиля не діє', () => {
    const b = new Board(fromRows(['.....', '..#..', '.....']), 1);
    b.begin();
    stand(b, 1, 1);
    const r = b.move('right');
    expect(r).toMatchObject({ kind: 'mine', lost: true, knockback: null });
    expect(b.player).toEqual({ x: 1, y: 1 });
  });
});

describe('Board: хвиля без обмеження «лише на відкриту» (blastOnlyOpened = false)', () => {
  const mk = (rows: string[], lives = 3) => {
    const b = new Board(fromRows(rows), lives, 'homerun', false);
    b.begin();
    return b;
  };

  it('кидає на закриту безпечну клітинку — вона відкривається', () => {
    const b = mk(['.....', '..#..', '.....', '.....']);
    b.player = { x: 1, y: 1 };
    b.opened[b.idx(0, 1)] = 0;
    const r = b.move('right');
    expect(r).toMatchObject({ kind: 'mine', knockback: { to: { x: 0, y: 1 }, mineLanded: false, lost: false } });
    expect(b.player).toEqual({ x: 0, y: 1 });
    expect(b.opened[b.idx(0, 1)]).toBe(1);
    expect(b.lives).toBe(2);
  });

  it('кидає на міну — вона вибухає, ще −1 життя, гравець лишається на цій клітинці', () => {
    const b = mk(['.....', '#.#..', '.....', '.....']);
    b.player = { x: 1, y: 1 };
    const r = b.move('right'); // вибух (2,1); позаду (0,1) — міна
    expect(r).toMatchObject({ kind: 'mine', knockback: { to: { x: 0, y: 1 }, mineLanded: true, lost: false } });
    expect(b.player).toEqual({ x: 0, y: 1 });
    expect(b.lives).toBe(1);
    expect(b.isMine(0, 1)).toBe(false);
    expect(b.level.mineCount).toBe(0);
  });

  it('приземлення на міну на останньому житті — поразка', () => {
    const b = mk(['.....', '#.#..', '.....', '.....'], 2);
    b.player = { x: 1, y: 1 };
    const r = b.move('right');
    expect(r).toMatchObject({ kind: 'mine', lost: false, knockback: { mineLanded: true, lost: true } });
    expect(b.status).toBe('lost');
    expect(b.lives).toBe(0);
  });

  it('відкид у хатинку виграє «Додому»', () => {
    const b = mk(['.....', '.....', '...#.']);
    b.player = { x: 3, y: 2 };
    // міна в (3,2)?? — ставимо гравця так, щоб міна була ліворуч, а хатинка (4,2) позаду
    b.level.mines[b.idx(3, 2)] = 0;
    b.level.mines[b.idx(2, 2)] = 1;
    const r = b.move('left');
    expect(r).toMatchObject({ kind: 'mine', knockback: { to: { x: 4, y: 2 }, won: true } });
    expect(b.status).toBe('won');
  });

  it('край поля хвилю гасить і в цьому режимі', () => {
    const b = mk(['.#...', '.....', '.....']);
    const r = b.move('right');
    expect(r).toMatchObject({ kind: 'mine', knockback: null });
  });

  it('прапорець на клітинці приземлення знімається', () => {
    const b = mk(['.....', '..#..', '.....', '.....']);
    b.player = { x: 1, y: 1 };
    b.opened[b.idx(0, 1)] = 0;
    b.cycleFlag(0, 1); // червоний
    b.move('right');
    expect(b.flags[b.idx(0, 1)]).toBe(0);
  });

  it('за замовчуванням (true) закриту клітинку позаду хвиля не чіпає', () => {
    const b = new Board(fromRows(['.....', '.....', '.....', '.....']), 3);
    b.begin();
    b.level.mines[b.idx(3, 2)] = 1; // міна справа від гравця, позаду (1,2) закрита
    b.opened[b.idx(1, 2)] = 0;
    b.player = { x: 2, y: 2 };
    expect(b.move('right')).toMatchObject({ kind: 'mine', knockback: null });
    expect(b.player).toEqual({ x: 2, y: 2 });
  });
});

describe('Board: початковий інвентар (перенесення між рівнями)', () => {
  it('рівень може стартувати з уже наявними предметами; решта — нулі', () => {
    const b = new Board(fromRows(['...', '...']), 3, 'homerun', true, { stone: 2, pickaxe: 1 });
    expect(b.inventory).toEqual({ stone: 2, probe: 0, pickaxe: 1 });
  });

  it('інвентар за замовчуванням порожній і не ділиться між дошками', () => {
    const a = new Board(fromRows(['...', '...']), 3);
    const b = new Board(fromRows(['...', '...']), 3);
    a.inventory.stone = 5;
    expect(b.inventory.stone).toBe(0);
  });
});
