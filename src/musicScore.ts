/**
 * Партитура фонової музики «Мінне поле»: повільна, трохи тривожна музика, що еволюціонує.
 * Це чиста функція від номера восьмої ноти — без Web Audio, тож її легко тестувати.
 *
 * Структура: 8 розділів по 16 тактів (кожен — 8-тактова послідовність акордів, зіграна двічі з різною фактурою).
 * Усього 128 тактів ≈ 6,7 хвилини до повтору. Розділи різняться тональністю, послідовністю акордів,
 * малюнком арпеджіо, щільністю, розкладкою пада та «енергією», а мелодія не повторює сама себе.
 */
export const BPM = 76;
/** Тривалість однієї восьмої, с. */
export const STEP_SEC = 60 / BPM / 2;
export const STEPS_PER_BAR = 8;
export const BAR_SEC = STEPS_PER_BAR * STEP_SEC;
export const SECTIONS = 8;
export const BARS_PER_PROGRESSION = 8;
export const BARS_PER_SECTION = BARS_PER_PROGRESSION * 2;
export const BARS = SECTIONS * BARS_PER_SECTION;
export const LOOP_STEPS = STEPS_PER_BAR * BARS;
/** Скільки секунд триває цикл до повтору. */
export const LOOP_SECONDS = LOOP_STEPS * STEP_SEC;

type Quality = 'm' | 'M' | 'dim' | 'sus';
interface Chord {
  /** Висота кореня (0 = до … 11 = сі) і тип. */
  pc: number;
  q: Quality;
}

const C = 0, D = 2, E = 4, F = 5, G = 7, A = 9, Bb = 10, B = 11;
const m = (pc: number): Chord => ({ pc, q: 'm' });
const M = (pc: number): Chord => ({ pc, q: 'M' });

/** Вісім 8-тактових послідовностей акордів — по одній на розділ. */
const PROGRESSIONS: readonly (readonly Chord[])[] = [
  [m(A), M(F), M(C), M(G), m(A), M(F), m(D), M(E)], // 1: ля мінор — головна тема
  [m(A), m(D), m(A), M(E), M(F), M(C), m(D), M(E)], // 2: темніша
  [m(D), M(Bb), M(F), M(C), m(D), M(Bb), m(G), M(A)], // 3: ре мінор — світліша
  [m(E), M(C), M(G), M(D), m(E), M(C), m(A), M(B)], // 4: мі мінор
  [m(A), M(G), M(F), M(E), m(A), M(G), M(F), M(E)], // 5: андалузька каденція
  [m(A), M(F), m(A), M(F), m(D), m(E), m(D), M(E)], // 6: розріджена, майже без руху
  [M(C), m(A), M(F), M(G), M(C), m(A), m(D), M(G)], // 7: до мажор — просвіт
  [m(A), M(C), m(D), m(A), M(F), M(G), m(A), M(E)], // 8: повернення до ля мінору
];

const REST = -1;
const P_UP = [0, 1, 2, 1, 2, 0, 1, 2];
const P_DOWN = [2, 1, 0, 1, 0, 2, 1, 0];
const P_WAVE = [0, 2, 1, 2, 0, 2, 1, 2];
const P_SPARSE = [0, REST, 2, REST, 1, REST, 2, REST];
const P_SLOW = [0, REST, REST, 1, REST, REST, 2, REST];
const P_BROKEN = [0, 1, REST, 2, 1, REST, 2, 0];

interface Texture {
  /** Малюнок арпеджіо (індекс звуку акорду або REST). */
  arp: readonly number[];
  /** Ймовірність, що нота арпеджіо прозвучить (решта — «повітря»). */
  arpProb: number;
  /** На скільки півтонів підняти арпеджіо відносно пада. */
  arpLift: 12 | 24;
  /** Позиції (восьмі в такті), де звучить бас. */
  bass: readonly number[];
  /** Ймовірність довгої мелодичної ноти на початку такту. */
  melodyProb: number;
  /** Друга, коротша мелодична нота посеред такту — ймовірність. */
  echoProb: number;
  /** Широка розкладка пада (кореневий звук октавою нижче). */
  openPad: boolean;
  /** Загальна гучність арпеджіо/мелодії (розділи мають різний «настрій»). */
  energy: number;
}

/** По два варіанти на розділ: перше та друге проходження послідовності звучать по-різному. */
const TEXTURES: readonly (readonly [Texture, Texture])[] = [
  [
    { arp: P_UP, arpProb: 0.68, arpLift: 12, bass: [0, 5], melodyProb: 0.45, echoProb: 0.0, openPad: false, energy: 0.9 },
    { arp: P_WAVE, arpProb: 0.72, arpLift: 12, bass: [0, 3, 5], melodyProb: 0.6, echoProb: 0.25, openPad: false, energy: 1.0 },
  ],
  [
    { arp: P_SPARSE, arpProb: 0.85, arpLift: 12, bass: [0, 4], melodyProb: 0.5, echoProb: 0.0, openPad: false, energy: 0.85 },
    { arp: P_BROKEN, arpProb: 0.7, arpLift: 24, bass: [0, 5], melodyProb: 0.5, echoProb: 0.3, openPad: true, energy: 0.95 },
  ],
  [
    { arp: P_UP, arpProb: 0.75, arpLift: 12, bass: [0, 3, 5], melodyProb: 0.55, echoProb: 0.2, openPad: false, energy: 1.0 },
    { arp: P_DOWN, arpProb: 0.7, arpLift: 24, bass: [0, 5], melodyProb: 0.65, echoProb: 0.35, openPad: true, energy: 1.05 },
  ],
  [
    { arp: P_WAVE, arpProb: 0.6, arpLift: 12, bass: [0, 5], melodyProb: 0.5, echoProb: 0.0, openPad: false, energy: 0.9 },
    { arp: P_BROKEN, arpProb: 0.65, arpLift: 12, bass: [0, 4, 6], melodyProb: 0.55, echoProb: 0.25, openPad: true, energy: 0.95 },
  ],
  [
    { arp: P_SLOW, arpProb: 0.9, arpLift: 12, bass: [0, 5], melodyProb: 0.4, echoProb: 0.0, openPad: false, energy: 0.8 },
    { arp: P_UP, arpProb: 0.6, arpLift: 24, bass: [0, 3, 5], melodyProb: 0.5, echoProb: 0.3, openPad: true, energy: 0.9 },
  ],
  [
    { arp: P_SLOW, arpProb: 1.0, arpLift: 12, bass: [0], melodyProb: 0.35, echoProb: 0.0, openPad: true, energy: 0.7 },
    { arp: P_SPARSE, arpProb: 0.9, arpLift: 24, bass: [0, 4], melodyProb: 0.45, echoProb: 0.2, openPad: true, energy: 0.75 },
  ],
  [
    { arp: P_UP, arpProb: 0.8, arpLift: 12, bass: [0, 3, 5], melodyProb: 0.6, echoProb: 0.3, openPad: false, energy: 1.05 },
    { arp: P_WAVE, arpProb: 0.75, arpLift: 24, bass: [0, 5], melodyProb: 0.7, echoProb: 0.4, openPad: false, energy: 1.1 },
  ],
  [
    { arp: P_DOWN, arpProb: 0.7, arpLift: 12, bass: [0, 5], melodyProb: 0.5, echoProb: 0.2, openPad: false, energy: 0.95 },
    { arp: P_BROKEN, arpProb: 0.6, arpLift: 12, bass: [0, 4], melodyProb: 0.55, echoProb: 0.25, openPad: true, energy: 0.85 },
  ],
];

/** Настрій: −1 — похмурий, 0 — звичайний, +1 — піднесений. Мінявся лише на межі тактів, тож гармонія не ламається. */
export type MusicMood = -1 | 0 | 1;

/** Множник тривалості кроку: піднесена музика трохи жвавіша, похмура — повільніша. */
export const MOOD_TEMPO: Record<MusicMood, number> = { [-1]: 1.12, 0: 1, 1: 0.94 };

export interface ScoreStep {
  /** Тривалий пад — на початку такту; `steps` — скільки восьмих тримати. */
  pad?: { notes: number[]; steps: number };
  /** Низька нота. */
  bass?: number;
  /** Короткий щипок арпеджіо. */
  arp?: number;
  /** Довга мелодична нота. */
  melody?: { note: number; steps: number };
  /** Довга низька нота-«педаль» під усім тактом (лише в похмурому настрої). */
  drone?: number;
  /** Множник гучності арпеджіо та мелодії для поточного розділу. */
  energy: number;
}

/** Детермінований «випадковий» шум 0..1 — щоб музика не була механічно однаковою, але завжди та сама. */
export function noise(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Бас: від мі другої октави до ре-дієз третьої — не гуде й не пищить. */
function bassNote(pc: number): number {
  return 40 + ((pc - 4 + 12) % 12);
}

/** Звуки акорду в середньому регістрі (≈ 52–71). */
function chordNotes(c: Chord): [number, number, number] {
  const root = 52 + ((c.pc - 52 + 120) % 12);
  const third = c.q === 'M' ? 4 : c.q === 'sus' ? 2 : 3;
  const fifth = c.q === 'dim' ? 6 : 7;
  return [root, root + third, root + fifth];
}

/** Переносить ноту в діапазон мелодії (69–84). */
function toMelodyRange(n: number, low = false): number {
  const lo = low ? 57 : 69;
  let x = n;
  while (x < lo) x += 12;
  while (x > lo + 15) x -= 12;
  return x;
}

/** Піднесений настрій: мінорні акорди світлішають до мажорних; похмурий: мажорні темніють, а кожен четвертий такт — зменшений. */
function applyMoodToChord(c: Chord, mood: MusicMood, bar: number): Chord {
  if (mood > 0 && c.q === 'm') return { pc: c.pc, q: 'M' };
  if (mood < 0) {
    if (c.q === 'M') return { pc: c.pc, q: 'm' };
    if (c.q === 'm' && bar % 4 === 3) return { pc: c.pc, q: 'dim' };
  }
  return c;
}

/** Фактура з урахуванням настрою. */
function applyMoodToTexture(t: Texture, mood: MusicMood): Texture {
  if (mood > 0) {
    return {
      ...t,
      arpProb: Math.min(1, t.arpProb + 0.15),
      arpLift: 24,
      bass: [0, 3, 5],
      melodyProb: Math.min(1, t.melodyProb + 0.25),
      echoProb: Math.max(0.3, t.echoProb),
      openPad: true,
      energy: t.energy + 0.15,
    };
  }
  if (mood < 0) {
    return {
      ...t,
      arpProb: Math.max(0.25, t.arpProb - 0.3),
      arpLift: 12,
      bass: [0],
      melodyProb: Math.max(0.15, t.melodyProb - 0.2),
      echoProb: 0,
      openPad: false,
      energy: Math.max(0.5, t.energy - 0.25),
    };
  }
  return t;
}

export function scoreStep(step: number, mood: MusicMood = 0): ScoreStep {
  const s = ((step % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  const globalBar = Math.floor(s / STEPS_PER_BAR);
  const pos = s % STEPS_PER_BAR;
  const section = Math.floor(globalBar / BARS_PER_SECTION);
  const inSection = globalBar % BARS_PER_SECTION;
  const repeat = inSection >= BARS_PER_PROGRESSION ? 1 : 0;
  const bar = inSection % BARS_PER_PROGRESSION;

  const chord = applyMoodToChord(PROGRESSIONS[section]![bar]!, mood, bar);
  const tex = applyMoodToTexture(TEXTURES[section]![repeat]!, mood);
  const notes = chordNotes(chord);
  const out: ScoreStep = { energy: tex.energy };

  if (pos === 0) {
    const pad = tex.openPad ? [notes[0] - 12, notes[1], notes[2], notes[0] + 12] : [...notes];
    out.pad = { notes: pad, steps: STEPS_PER_BAR };
  }
  if (tex.bass.includes(pos)) out.bass = bassNote(chord.pc);
  if (mood < 0 && pos === 0) out.drone = bassNote(chord.pc) - 12;

  // Арпеджіо розріджене: частина нот випадає, тож є «повітря».
  const idx = tex.arp[pos]!;
  if (idx !== REST && noise(globalBar * 8 + pos + 1) < tex.arpProb && !(pos === 0 && repeat === 0 && bar % 2 === 0)) {
    out.arp = notes[idx]! + tex.arpLift;
  }

  // Мелодія: довга нота з акорду на початку такту. Перший такт циклу та останній звучать завжди — цикл «рифмується».
  const first = globalBar === 0;
  const last = globalBar === BARS - 1;
  if (pos === 0 && (first || last || noise(globalBar * 7 + 2) < tex.melodyProb)) {
    let pick = Math.floor(noise(globalBar * 11 + 5) * 3);
    // Не повторюємо ту саму ступінь двічі поспіль (порівнюємо з попереднім тактом тієї ж логіки).
    const prevPick = Math.floor(noise((globalBar - 1) * 11 + 5) * 3);
    if (pick === prevPick) pick = (pick + 1) % 3;
    out.melody = { note: toMelodyRange(notes[pick]!, mood < 0), steps: last ? 8 : 6 };
  }
  // Коротка «луна» мелодії посеред такту — інша нота акорду.
  if (pos === 4 && noise(globalBar * 5 + 9) < tex.echoProb) {
    const pick = Math.floor(noise(globalBar * 13 + 3) * 3);
    out.melody = { note: toMelodyRange(notes[pick]!, mood < 0), steps: 3 };
  }
  return out;
}
