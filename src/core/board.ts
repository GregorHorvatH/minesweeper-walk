import {
  DIR_DELTA,
  FLAG_DANGER,
  FLAG_NONE,
  FLAG_SUSPECT,
  type Dir,
  type FlagColor,
  type GameMode,
  type ItemKind,
  type LevelData,
  type Loot,
  type Pos,
} from './types';

export type Status = 'playing' | 'won' | 'lost';

/** Результат вибухової хвилі: куди відкинуло гравця і що сталося при приземленні. */
export interface Knockback {
  to: Pos;
  /** Клітинки, відкриті приземленням (каскад). */
  opened: Pos[];
  /** Клітинки, чиї цифри змінились (якщо приземлились на міну й вона вибухнула). */
  changed: Pos[];
  /** Приземлились на міну (можливо лише коли `blastOnlyOpened` вимкнено): вона вибухнула, життя −1. */
  mineLanded: boolean;
  /** Через приземлення гра програна (закінчились життя). */
  lost: boolean;
  /** Через приземлення гра виграна (хатинка або остання міна). */
  won: boolean;
}

export type MoveResult =
  | { kind: 'ignored' }
  | { kind: 'blocked'; reason: 'edge' | 'flag' }
  | { kind: 'moved'; from: Pos; to: Pos; opened: Pos[] }
  | { kind: 'won'; from: Pos; to: Pos; opened: Pos[] }
  /** Міна підірвана й прибрана: `changed` — клітинки, чия цифра змінилась, `opened` — відкриті внаслідок каскаду. */
  | { kind: 'mine'; at: Pos; livesLeft: number; lost: boolean; won: boolean; changed: Pos[]; opened: Pos[]; knockback: Knockback | null };

export type ItemResult =
  /** Предмет не застосовано і не витрачено. */
  | { kind: 'invalid'; reason: 'ignored' | 'none' | 'edge' | 'opened' | 'blocked' }
  /** Камінь: міна вибухнула без шкоди для життів (`hit: 'mine'`) або клітинка відкрилась (`hit: 'safe'`). */
  | { kind: 'stone'; at: Pos; hit: 'mine' | 'safe'; changed: Pos[]; opened: Pos[]; won: boolean; knockback: Knockback | null }
  /** Палка: безпечна клітинка відкрилась, палка ціла; на міні міна вибухає (без шкоди для життів), а палка ламається. */
  | {
      kind: 'probe';
      at: Pos;
      hit: 'mine' | 'safe';
      broke: boolean;
      changed: Pos[];
      opened: Pos[];
      won: boolean;
      knockback: Knockback | null;
    }
  /** Кірка: тунель під сусідньою клітинкою (`mid`) і вихід на наступній — звичайний хід (`move`). */
  | { kind: 'pickaxe'; mid: Pos; move: MoveResult };

/** Стан партії поверх незмінних даних рівня. Нічого не знає про Phaser. */
export class Board {
  readonly cols: number;
  readonly rows: number;
  readonly opened: Uint8Array;
  /** Колір прапорця клітинки: FLAG_NONE / FLAG_DANGER / FLAG_SUSPECT / FLAG_SAFE. */
  readonly flags: Uint8Array;
  readonly visited: Uint8Array;
  /** Клітинки, де підірвалась міна. Міни там уже немає — це лише слід (кратер), клітинка прохідна. */
  readonly exploded: Uint8Array;
  /** Ящики, що ще не відкриті (копія з даних рівня). */
  readonly chests: Map<number, Loot>;
  /** Знайдені предмети (на кожному рівні починаємо з порожнього інвентаря). */
  readonly inventory: Record<ItemKind, number> = { stone: 0, probe: 0, pickaxe: 0 };
  player: Pos;
  lives: number;
  steps = 0;
  status: Status = 'playing';

  constructor(
    readonly level: LevelData,
    lives: number,
    readonly mode: GameMode = 'homerun',
    /** true — вибухова хвиля кидає гравця лише на відкриті клітинки; false — і на закриті, навіть на міни. */
    public blastOnlyOpened = true,
    /** Предмети, з якими починаємо рівень (інвентар, перенесений з попереднього). */
    initialInventory: Partial<Record<ItemKind, number>> = {},
  ) {
    this.cols = level.cols;
    this.rows = level.rows;
    const n = this.cols * this.rows;
    this.opened = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.visited = new Uint8Array(n);
    this.exploded = new Uint8Array(n);
    this.chests = new Map(level.chests);
    for (const kind of Object.keys(initialInventory) as ItemKind[]) this.inventory[kind] = initialInventory[kind] ?? 0;
    this.player = { ...level.start };
    this.lives = lives;
  }

  idx(x: number, y: number): number {
    return y * this.cols + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  isMine(x: number, y: number): boolean {
    return this.level.mines[this.idx(x, y)] === 1;
  }

  numberAt(x: number, y: number): number {
    return this.level.numbers[this.idx(x, y)]!;
  }

  isHome(x: number, y: number): boolean {
    return x === this.level.home.x && y === this.level.home.y;
  }

  /** Відкриває стартову клітинку (разом з каскадом нулів). */
  begin(): Pos[] {
    const { x, y } = this.player;
    this.visited[this.idx(x, y)] = 1;
    return this.open(x, y);
  }

  /**
   * Відкриває клітинку; якщо там 0 — каскадом відкриває всіх сусідів (вони безпечні),
   * як у класичному сапері. Повертає лише щойно відкриті клітинки.
   */
  private open(x: number, y: number): Pos[] {
    const newly: Pos[] = [];
    const stack: Pos[] = [{ x, y }];
    while (stack.length > 0) {
      const p = stack.pop()!;
      const i = this.idx(p.x, p.y);
      if (this.opened[i] || this.level.mines[i]) continue;
      this.opened[i] = 1;
      this.flags[i] = 0;
      newly.push(p);
      if (this.level.numbers[i] !== 0) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && this.inBounds(p.x + dx, p.y + dy)) stack.push({ x: p.x + dx, y: p.y + dy });
        }
      }
    }
    return newly;
  }

  /**
   * Прибирає міну й зменшує цифри 8 сусідів. Відкрита клітинка, що стала нулем, запускає каскад,
   * щоб лишалась інваріантність «відкритий нуль має відкритих сусідів».
   */
  private defuse(at: Pos): { changed: Pos[]; opened: Pos[] } {
    this.level.mines[this.idx(at.x, at.y)] = 0;
    this.level.mineCount--;
    const changed: Pos[] = [at];
    const neighbors: Pos[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = at.x + dx;
        const ny = at.y + dy;
        if ((dx || dy) && this.inBounds(nx, ny)) {
          this.level.numbers[this.idx(nx, ny)]!--;
          neighbors.push({ x: nx, y: ny });
        }
      }
    }
    changed.push(...neighbors);

    const opened: Pos[] = [];
    for (const n of neighbors) {
      const i = this.idx(n.x, n.y);
      if (!this.opened[i] || this.level.numbers[i] !== 0) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && this.inBounds(n.x + dx, n.y + dy)) opened.push(...this.open(n.x + dx, n.y + dy));
        }
      }
    }
    return { changed, opened };
  }

  canEnter(x: number, y: number): boolean {
    return this.inBounds(x, y) && !this.blocksMove(this.idx(x, y));
  }

  move(dir: Dir): MoveResult {
    if (this.status !== 'playing') return { kind: 'ignored' };
    const d = DIR_DELTA[dir];
    const to = { x: this.player.x + d.x, y: this.player.y + d.y };
    if (!this.inBounds(to.x, to.y)) return { kind: 'blocked', reason: 'edge' };
    if (this.blocksMove(this.idx(to.x, to.y))) return { kind: 'blocked', reason: 'flag' };
    return this.enter(to);
  }

  /** Вхід гравця в клітинку (кроком чи після тунелю): міна вибухає, інакше — перехід і відкриття. */
  private enter(to: Pos): MoveResult {
    const from = this.player;
    const i = this.idx(to.x, to.y);

    if (this.level.mines[i]) {
      // Міна: гравець лишається на місці, міна вибухає і зникає, цифри навколо перераховуються.
      this.exploded[i] = 1;
      this.lives--;
      const lost = this.lives <= 0;
      if (lost) this.status = 'lost';
      const { changed, opened } = this.defuse(to);
      // У режимі minesweeper підірвана міна теж «відкрита»: могла лишитись остання непозначена.
      const won = !lost && this.checkMinesweeperWin();
      const knockback = this.status === 'playing' ? this.blast(to) : null;
      return { kind: 'mine', at: to, livesLeft: this.lives, lost, won, changed, opened, knockback };
    }

    this.player = to;
    this.steps++;
    this.visited[i] = 1;
    const opened = this.open(to.x, to.y);
    if (this.mode === 'homerun' && this.isHome(to.x, to.y)) {
      this.status = 'won';
      return { kind: 'won', from, to, opened };
    }
    return { kind: 'moved', from, to, opened };
  }

  /**
   * Вибухова хвиля: відкидає гравця на 1 клітинку від міни, що вибухнула (по прямій від міни до гравця).
   * `blastOnlyOpened` (за замовчуванням): кидає лише на вже ВІДКРИТУ клітинку — вона безпечна, і по тому, чи був
   * відкид, не вгадати, що позаду на закритих. Якщо вимкнено — гравець може опинитись на закритій клітинці
   * (вона відкривається) або навіть на міні (та вибухає: життя −1, без нової хвилі).
   * Край поля хвилю гасить. Повертає опис відкиду або null, якщо гравець не зрушив.
   */
  private blast(mine: Pos): Knockback | null {
    const dx = Math.sign(this.player.x - mine.x);
    const dy = Math.sign(this.player.y - mine.y);
    if ((dx === 0) === (dy === 0)) return null; // не на одній лінії з мiною (або на самій міні)
    const to = { x: this.player.x + dx, y: this.player.y + dy };
    if (!this.inBounds(to.x, to.y)) return null;
    const i = this.idx(to.x, to.y);
    if (this.blastOnlyOpened && !this.opened[i]) return null;

    this.player = to;
    this.flags[i] = FLAG_NONE;

    if (this.level.mines[i]) {
      // Приземлились на міну: вона вибухає (без нового відкиду — гравець лишається на цій клітинці).
      this.exploded[i] = 1;
      this.lives--;
      const lost = this.lives <= 0;
      if (lost) this.status = 'lost';
      const { changed, opened } = this.defuse(to);
      const won = !lost && this.checkMinesweeperWin();
      return { to, opened, changed, mineLanded: true, lost, won };
    }

    this.visited[i] = 1;
    const opened = this.open(to.x, to.y);
    let won = false;
    if (this.mode === 'homerun' && this.isHome(to.x, to.y)) {
      this.status = 'won';
      won = true;
    }
    return { to, opened, changed: [], mineLanded: false, lost: false, won };
  }

  // ───────────────────────── ящики та предмети ─────────────────────────

  /** Ящик у клітинці гравця (бачимо лише ті, що на відкритих клітинках, тож це не витік інформації про міни). */
  chestHere(): Loot | undefined {
    return this.chests.get(this.idx(this.player.x, this.player.y));
  }

  /** O: відкриває ящик під гравцем, вміст іде в інвентар. null — тут немає ящика. */
  openChest(): Loot | null {
    if (this.status !== 'playing') return null;
    const i = this.idx(this.player.x, this.player.y);
    const loot = this.chests.get(i);
    if (!loot) return null;
    this.chests.delete(i);
    this.inventory[loot.kind] += loot.amount;
    return loot;
  }

  /** Застосовує предмет до сусіднього поля у напрямку `dir` (кірка — до поля через одне). */
  useItem(kind: ItemKind, dir: Dir): ItemResult {
    if (this.status !== 'playing') return { kind: 'invalid', reason: 'ignored' };
    if (this.inventory[kind] <= 0) return { kind: 'invalid', reason: 'none' };
    const d = DIR_DELTA[dir];
    const near = { x: this.player.x + d.x, y: this.player.y + d.y };
    if (!this.inBounds(near.x, near.y)) return { kind: 'invalid', reason: 'edge' };

    if (kind === 'pickaxe') {
      const far = { x: near.x + d.x, y: near.y + d.y };
      if (!this.inBounds(far.x, far.y)) return { kind: 'invalid', reason: 'edge' };
      if (this.blocksMove(this.idx(far.x, far.y))) return { kind: 'invalid', reason: 'blocked' };
      this.inventory.pickaxe--; // одноразова
      return { kind: 'pickaxe', mid: near, move: this.enter(far) };
    }

    const i = this.idx(near.x, near.y);
    if (this.opened[i]) return { kind: 'invalid', reason: 'opened' }; // там і так усе відомо — предмет не витрачаємо
    const isMine = this.level.mines[i] === 1;

    if (kind === 'stone') {
      this.inventory.stone--;
      if (isMine) {
        // Камінь підриває міну: вона зникає без втрати життя, цифри навколо перераховуються, прапорець знімається.
        this.exploded[i] = 1;
        this.flags[i] = FLAG_NONE;
        const { changed, opened } = this.defuse(near);
        const won = this.checkMinesweeperWin();
        const knockback = this.status === 'playing' ? this.blast(near) : null;
        return { kind: 'stone', at: near, hit: 'mine', changed, opened, won, knockback };
      }
      const opened = this.open(near.x, near.y);
      return { kind: 'stone', at: near, hit: 'safe', changed: [], opened, won: false, knockback: null };
    }

    // Палка з чобітком.
    if (isMine) {
      // Чобіток спрацьовує на міні: міна вибухає (життя не страждають), палка псується, прапорець знімається.
      this.inventory.probe--;
      this.exploded[i] = 1;
      this.flags[i] = FLAG_NONE;
      const { changed, opened } = this.defuse(near);
      const won = this.checkMinesweeperWin();
      const knockback = this.status === 'playing' ? this.blast(near) : null;
      return { kind: 'probe', at: near, hit: 'mine', broke: true, changed, opened, won, knockback };
    }
    const opened = this.open(near.x, near.y); // відкриття знімає прапорець, якщо він був
    return { kind: 'probe', at: near, hit: 'safe', broke: false, changed: [], opened, won: false, knockback: null };
  }

  /** Червоний і жовтий прапорці не пускають на клітинку; зелений («безпечно») — пускає. */
  private blocksMove(i: number): boolean {
    return this.flags[i] === FLAG_DANGER || this.flags[i] === FLAG_SUSPECT;
  }

  /**
   * Наступний колір прапорця клітинки по колу: немає → червоний → жовтий → зелений → немає.
   * Повертає новий колір або null, якщо прапорець тут неможливий (відкрита клітинка, кінець гри).
   */
  cycleFlag(x: number, y: number): FlagColor | null {
    if (this.status !== 'playing' || !this.inBounds(x, y)) return null;
    const i = this.idx(x, y);
    if (this.opened[i]) return null;
    const next = ((this.flags[i]! + 1) % 4) as FlagColor;
    this.flags[i] = next;
    this.checkMinesweeperWin();
    return next;
  }

  /**
   * Режим minesweeper: перемога, коли ЧЕРВОНІ прапорці стоять рівно на всіх мінах, що лишились (підірвані вже
   * прибрані), і ніде більше — зайвий червоний прапорець перемогу скасовує. Жовті («підозра») та зелені («безпека»)
   * мінами не вважаються і на перемогу не впливають. Виставляє status і повертає, чи виграно.
   */
  private checkMinesweeperWin(): boolean {
    if (this.mode !== 'minesweeper' || this.status !== 'playing') return false;
    if (this.wrongFlags() > 0 || this.minesLeftUnflagged() > 0) return false;
    this.status = 'won';
    return true;
  }

  /** Червоні прапорці на клітинках без мін. */
  wrongFlags(): number {
    let n = 0;
    for (let i = 0; i < this.flags.length; i++) if (this.flags[i] === FLAG_DANGER && !this.level.mines[i]) n++;
    return n;
  }

  /** Міни без червоного прапорця. */
  minesLeftUnflagged(): number {
    let n = 0;
    for (let i = 0; i < this.flags.length; i++) if (this.level.mines[i] && this.flags[i] !== FLAG_DANGER) n++;
    return n;
  }

  /** Кількість червоних прапорців («небезпека») — саме вони рахуються як позначені міни. */
  get flagCount(): number {
    let n = 0;
    for (let i = 0; i < this.flags.length; i++) if (this.flags[i] === FLAG_DANGER) n++;
    return n;
  }

  /**
   * Найкоротший шлях по вже відкритих клітинках (4 напрямки) від гравця до (tx, ty).
   * Порожній масив — шляху немає або ціль збігається з гравцем.
   */
  walkPath(tx: number, ty: number): Dir[] {
    if (!this.inBounds(tx, ty)) return [];
    const ti = this.idx(tx, ty);
    if (!this.opened[ti] || this.level.mines[ti]) return [];
    const startI = this.idx(this.player.x, this.player.y);
    if (startI === ti) return [];

    const prev = new Int32Array(this.cols * this.rows).fill(-1);
    const prevDir: Dir[] = new Array(prev.length);
    prev[startI] = startI;
    const queue = [startI];
    const dirs: Dir[] = ['up', 'down', 'left', 'right'];
    for (let h = 0; h < queue.length; h++) {
      const cur = queue[h]!;
      if (cur === ti) break;
      const cx = cur % this.cols;
      const cy = (cur / this.cols) | 0;
      for (const dir of dirs) {
        const nx = cx + DIR_DELTA[dir].x;
        const ny = cy + DIR_DELTA[dir].y;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (prev[ni] !== -1 || !this.opened[ni] || this.level.mines[ni] || this.blocksMove(ni)) continue;
        prev[ni] = cur;
        prevDir[ni] = dir;
        queue.push(ni);
      }
    }
    if (prev[ti] === -1) return [];
    const out: Dir[] = [];
    for (let i = ti; i !== startI; i = prev[i]!) out.push(prevDir[i]!);
    return out.reverse();
  }
}
