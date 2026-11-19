import { describe, expect, it } from 'vitest';
import {
  BARS,
  BARS_PER_SECTION,
  LOOP_SECONDS,
  LOOP_STEPS,
  SECTIONS,
  STEPS_PER_BAR,
  STEP_SEC,
  midiToHz,
  noise,
  scoreStep,
} from '../src/musicScore';

describe('musicScore', () => {
  const all = Array.from({ length: LOOP_STEPS }, (_, i) => scoreStep(i));
  const sectionSteps = BARS_PER_SECTION * STEPS_PER_BAR;
  const section = (n: number) => all.slice(n * sectionSteps, (n + 1) * sectionSteps);

  it('цикл довгий: повтор починається не раніше ніж за 6 хвилин', () => {
    expect(LOOP_SECONDS).toBeGreaterThan(6 * 60);
    expect(BARS).toBe(SECTIONS * BARS_PER_SECTION);
  });

  it('цикл замикається: крок N і N + довжина циклу однакові', () => {
    for (let i = 0; i < LOOP_STEPS; i += 7) expect(scoreStep(i + LOOP_STEPS)).toEqual(scoreStep(i));
  });

  it('детермінована: двічі те саме', () => {
    expect(Array.from({ length: LOOP_STEPS }, (_, i) => scoreStep(i))).toEqual(all);
  });

  it('усі розділи звучать по-різному: жодні два не збігаються і жодні дві 8-тактові половини розділу теж', () => {
    const sig = (steps: unknown[]) => JSON.stringify(steps);
    const sections = Array.from({ length: SECTIONS }, (_, n) => sig(section(n)));
    expect(new Set(sections).size).toBe(SECTIONS);
    const halves = new Set<string>();
    for (let n = 0; n < SECTIONS; n++) {
      halves.add(sig(section(n).slice(0, sectionSteps / 2)));
      halves.add(sig(section(n).slice(sectionSteps / 2)));
    }
    expect(halves.size).toBe(SECTIONS * 2);
  });

  it('жодна 8-тактова фраза не повторюється в межах циклу', () => {
    const phrase = (i: number) => JSON.stringify(all.slice(i * 64, (i + 1) * 64));
    const phrases = Array.from({ length: BARS / 8 }, (_, i) => phrase(i));
    expect(new Set(phrases).size).toBe(phrases.length);
  });

  it('використовує багато різних акордів (пади): щонайменше 8 унікальних', () => {
    const chords = new Set(all.filter((s) => s.pad).map((s) => [...s.pad!.notes].sort((a, b) => a - b).join(',')));
    expect(chords.size).toBeGreaterThanOrEqual(8);
  });

  it('усі ноти в приємному діапазоні, пад — рівно на початку кожного такту', () => {
    for (const [i, st] of all.entries()) {
      if (st.bass !== undefined) {
        expect(st.bass).toBeGreaterThanOrEqual(40);
        expect(st.bass).toBeLessThanOrEqual(51);
      }
      for (const n of [st.arp, st.melody?.note].filter((n): n is number => n !== undefined)) {
        expect(n).toBeGreaterThanOrEqual(64);
        expect(n).toBeLessThanOrEqual(95);
      }
      for (const n of st.pad?.notes ?? []) {
        expect(n).toBeGreaterThanOrEqual(40);
        expect(n).toBeLessThanOrEqual(84);
      }
      if (i % STEPS_PER_BAR === 0) expect(st.pad).toBeDefined();
      else expect(st.pad).toBeUndefined();
    }
  });

  it('є і бас, і арпеджіо, і мелодія; арпеджіо в кожному розділі розріджене', () => {
    for (let n = 0; n < SECTIONS; n++) {
      const steps = section(n);
      expect(steps.some((s) => s.bass !== undefined)).toBe(true);
      expect(steps.filter((s) => s.melody !== undefined).length).toBeGreaterThan(BARS_PER_SECTION * 0.3);
      const arp = steps.filter((s) => s.arp !== undefined).length;
      expect(arp).toBeGreaterThan(steps.length * 0.12);
      expect(arp).toBeLessThan(steps.length * 0.9);
    }
  });

  it('«енергія» розділів різна — є і спокійні, і яскравіші місця', () => {
    const energies = new Set(all.map((s) => s.energy));
    expect(energies.size).toBeGreaterThanOrEqual(6);
    expect(Math.min(...energies)).toBeLessThan(0.8);
    expect(Math.max(...energies)).toBeGreaterThan(1.0);
  });

  it('перший і останній такти мають мелодичну ноту — цикл «закінчується» і починається виразно', () => {
    expect(all[0]!.melody).toBeDefined();
    expect(all[(BARS - 1) * STEPS_PER_BAR]!.melody).toBeDefined();
  });

  it('допоміжні функції: noise ∈ [0,1), la4 = 440 Гц, темп помірний', () => {
    for (let i = 0; i < 200; i++) {
      expect(noise(i)).toBeGreaterThanOrEqual(0);
      expect(noise(i)).toBeLessThan(1);
    }
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(STEP_SEC).toBeGreaterThan(0.3);
    expect(STEP_SEC).toBeLessThan(0.5);
  });

  describe('настрій', () => {
    const sample = (mood: -1 | 0 | 1) => Array.from({ length: LOOP_STEPS }, (_, i) => scoreStep(i, mood));

    it('нейтральний настрій збігається зі звичайним викликом', () => {
      expect(sample(0)).toEqual(all);
    });

    it('піднесена музика гучніша, густіша й має більше мелодії; похмура — тихіша, рідша й із «педаллю»', () => {
      const bright = sample(1);
      const neutral = sample(0);
      const dark = sample(-1);
      const arp = (xs: typeof bright) => xs.filter((s) => s.arp !== undefined).length;
      const mel = (xs: typeof bright) => xs.filter((s) => s.melody !== undefined).length;
      const energy = (xs: typeof bright) => xs.reduce((a, s) => a + s.energy, 0) / xs.length;
      expect(arp(bright)).toBeGreaterThan(arp(neutral));
      expect(arp(dark)).toBeLessThan(arp(neutral));
      expect(mel(bright)).toBeGreaterThan(mel(neutral));
      expect(mel(dark)).toBeLessThan(mel(neutral));
      expect(energy(bright)).toBeGreaterThan(energy(neutral));
      expect(energy(dark)).toBeLessThan(energy(neutral));
      expect(dark.some((s) => s.drone !== undefined)).toBe(true);
      expect(neutral.some((s) => s.drone !== undefined)).toBe(false);
      expect(bright.some((s) => s.drone !== undefined)).toBe(false);
    });

    it('настрої змінюють гармонію: піднесений — мажорніші акорди, похмурий — мінорніші/зменшені', () => {
      const padSet = (xs: ReturnType<typeof scoreStep>[]) => new Set(xs.filter((s) => s.pad).map((s) => s.pad!.notes.join(',')));
      expect(padSet(sample(1))).not.toEqual(padSet(all));
      expect(padSet(sample(-1))).not.toEqual(padSet(all));
    });

    it('в усіх настроях ноти лишаються в допустимих діапазонах', () => {
      for (const mood of [-1, 0, 1] as const) {
        for (const st of sample(mood)) {
          if (st.bass !== undefined) expect(st.bass).toBeGreaterThanOrEqual(40);
          if (st.drone !== undefined) {
            expect(st.drone).toBeGreaterThanOrEqual(28);
            expect(st.drone).toBeLessThanOrEqual(39);
          }
          for (const n of [st.arp, st.melody?.note].filter((n): n is number => n !== undefined)) {
            expect(n).toBeGreaterThanOrEqual(57);
            expect(n).toBeLessThanOrEqual(96);
          }
        }
      }
    });
  });
});
