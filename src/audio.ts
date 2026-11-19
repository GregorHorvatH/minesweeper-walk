/** Звук на WebAudio — ефекти й фонова музика синтезуються кодом, без жодних аудіофайлів. */
import { LOOP_STEPS, MOOD_TEMPO, STEPS_PER_BAR, STEP_SEC, midiToHz, scoreStep, type MusicMood } from './musicScore';
import { saveSettings, settings } from './settings';

type Sound = 'step' | 'open' | 'flag' | 'unflag' | 'bump' | 'boom' | 'win' | 'lose';

const MUSIC_VOLUME = 0.35;
/** Яскравість звучання (зріз фільтра, Гц) і довжина «луни» залежно від настрою: похмурий — глухіше й гулкіше. */
const MOOD_FILTER: Record<MusicMood, number> = { [-1]: 1100, 0: 2400, 1: 3800 };
const MOOD_FEEDBACK: Record<MusicMood, number> = { [-1]: 0.5, 0: 0.38, 1: 0.3 };

class Sfx {
  private ctx: AudioContext | null = null;
  private readonly music = new Music();

  /** true — вимкнено все (і музика, і ефекти). */
  get allMuted(): boolean {
    return !settings.sfx && !settings.music;
  }

  /** Браузер дозволяє звук лише після жесту користувача. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (!this.listening) {
      this.listening = true;
      this.ctx.addEventListener('statechange', () => this.syncMusic());
      // Фонова вкладка: ставимо звук на паузу, щоб музика не грала «в нікуди».
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else if (settings.music || settings.sfx) void this.ctx.resume();
      });
    }
    this.syncMusic();
  }

  private listening = false;

  /** Вмикає/вимикає фонову музику відповідно до налаштування (і чи дозволив браузер звук). */
  syncMusic(): void {
    if (!this.ctx) return;
    this.music.setEnabled(this.ctx, settings.music && this.ctx.state === 'running');
  }

  /** Настрій музики за станом гри (див. computeMood): −1 похмурий, 0 звичайний, +1 піднесений. */
  setMood(mood: MusicMood): void {
    this.music.setMood(mood);
  }

  /** Швидкий перемикач (кнопка 🔊 / клавіша S): якщо щось грає — вимикає все, інакше вмикає все. */
  toggleAll(): boolean {
    const mute = !this.allMuted;
    settings.music = !mute;
    settings.sfx = !mute;
    saveSettings();
    this.unlock();
    this.syncMusic();
    return mute;
  }

  play(name: Sound): void {
    const ctx = this.ctx;
    if (!ctx || !settings.sfx || ctx.state !== 'running') return;
    switch (name) {
      case 'step':
        this.tone(ctx, 180, 0.05, 'triangle', 0.12, 120);
        break;
      case 'open':
        this.tone(ctx, 520, 0.07, 'sine', 0.08);
        break;
      case 'flag':
        this.tone(ctx, 660, 0.06, 'square', 0.06);
        this.tone(ctx, 880, 0.08, 'square', 0.06, undefined, 0.05);
        break;
      case 'unflag':
        this.tone(ctx, 440, 0.08, 'square', 0.05);
        break;
      case 'bump':
        this.tone(ctx, 110, 0.08, 'sawtooth', 0.08, 80);
        break;
      case 'boom':
        this.noise(ctx, 0.5, 0.35);
        this.tone(ctx, 90, 0.4, 'sine', 0.3, 30);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, f, 0.2, 'triangle', 0.14, undefined, i * 0.11));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone(ctx, f, 0.25, 'sawtooth', 0.09, undefined, i * 0.16));
        break;
    }
  }

  private tone(
    ctx: AudioContext,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    endFreq?: number,
    delay = 0,
  ): void {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(ctx: AudioContext, dur: number, vol: number): void {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }
}

/**
 * Фонова музика: планувальник з випередженням грає партитуру з musicScore.ts —
 * пад (повільні акорди), бас, розріджене арпеджіо та рідкісні довгі ноти, усе через фільтр і м'яку луну.
 */
class Music {
  private timer: number | null = null;
  private stopTimer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bus: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private feedback: GainNode | null = null;
  /** Бажаний настрій (від гри) та той, що зараз звучить; змінюється лише на межі такту й лише якщо бажання трималось. */
  private targetMood: MusicMood = 0;
  private lastSeenTarget: MusicMood = 0;
  private mood: MusicMood = 0;

  setMood(mood: MusicMood): void {
    this.targetMood = mood;
  }

  setEnabled(ctx: AudioContext, on: boolean): void {
    if (on) this.start(ctx);
    else this.stop(ctx);
  }

  private start(ctx: AudioContext): void {
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (!this.bus) this.bus = this.buildGraph(ctx);
    this.bus.gain.cancelScheduledValues(ctx.currentTime);
    this.bus.gain.setTargetAtTime(MUSIC_VOLUME, ctx.currentTime, 0.4); // плавне наростання
    if (this.timer !== null) return;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(ctx), 120);
    this.schedule(ctx);
  }

  private stop(ctx: AudioContext): void {
    if (this.timer === null) return;
    this.bus?.gain.cancelScheduledValues(ctx.currentTime);
    this.bus?.gain.setTargetAtTime(0, ctx.currentTime, 0.15); // плавне затихання
    window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Ланцюжок: шина → фільтр → вихід, плюс відгалуження в «луну» (затримка зі зворотним зв'язком). */
  private buildGraph(ctx: AudioContext): GainNode {
    const bus = ctx.createGain();
    bus.gain.value = 0;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = MOOD_FILTER[0];
    this.lowpass = lowpass;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP_SEC * 3; // три восьмих — «пунктирна» луна
    const feedback = ctx.createGain();
    feedback.gain.value = MOOD_FEEDBACK[0];
    this.feedback = feedback;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1500;
    bus.connect(lowpass).connect(ctx.destination);
    bus.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    damp.connect(wet).connect(ctx.destination);
    return bus;
  }

  private schedule(ctx: AudioContext): void {
    const bus = this.bus;
    if (!bus) return;
    // Випереджаємо на ~0.6 с: якщо вкладка була «заморожена», наздоганяти пропущене не треба.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.6) {
      if (this.step % STEPS_PER_BAR === 0) this.maybeChangeMood(this.nextTime);
      const stepDur = STEP_SEC * MOOD_TEMPO[this.mood];
      this.playStep(ctx, bus, this.step % LOOP_STEPS, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  /**
   * На початку такту: якщо бажаний настрій тримається вже другий такт поспіль — перемикаємось (так одноразові
   * стрибки стану не смикають музику). Заодно плавно міняємо фільтр і луну.
   */
  private maybeChangeMood(t: number): void {
    const target = this.targetMood;
    if (target === this.lastSeenTarget && target !== this.mood) {
      this.mood = target;
      this.lowpass?.frequency.setTargetAtTime(MOOD_FILTER[target], t, 0.8);
      this.feedback?.gain.setTargetAtTime(MOOD_FEEDBACK[target], t, 0.8);
    }
    this.lastSeenTarget = target;
  }

  private playStep(ctx: AudioContext, bus: GainNode, index: number, t: number, stepDur: number): void {
    const st = scoreStep(index, this.mood);
    const e = st.energy;
    if (st.pad) {
      // Широка розкладка має 4 звуки — трохи тихіше кожен, щоб загальна гучність пада не стрибала між розділами.
      const vol = (0.028 * 3) / st.pad.notes.length;
      for (const note of st.pad.notes) this.voice(ctx, bus, 'triangle', midiToHz(note), t, st.pad.steps * stepDur, vol, 1.2, 1.4);
    }
    if (st.bass !== undefined) this.voice(ctx, bus, 'sine', midiToHz(st.bass), t, stepDur * 3, 0.16, 0.03, 0.6);
    if (st.drone !== undefined) this.voice(ctx, bus, 'sine', midiToHz(st.drone), t, stepDur * 8, 0.12, 1.5, 1.6);
    if (st.arp !== undefined) this.voice(ctx, bus, 'triangle', midiToHz(st.arp), t, stepDur * 0.9, 0.05 * e, 0.01, 0.5);
    if (st.melody) {
      const hz = midiToHz(st.melody.note);
      const dur = st.melody.steps * stepDur;
      this.voice(ctx, bus, 'sine', hz, t, dur, 0.045 * e, 0.25, 1.1);
      this.voice(ctx, bus, 'sine', hz * 1.004, t, dur, 0.03 * e, 0.35, 1.1); // легка розстройка — «хор»
    }
  }

  /** Одна нота з огинаючою: швидка/повільна атака, тримання `hold` с, затихання `release` с. */
  private voice(
    ctx: AudioContext,
    bus: GainNode,
    type: OscillatorType,
    freq: number,
    t: number,
    hold: number,
    vol: number,
    attack: number,
    release: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const peak = t + Math.min(attack, hold);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, peak);
    gain.gain.setValueAtTime(vol, t + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + hold + release);
    osc.connect(gain).connect(bus);
    osc.start(t);
    osc.stop(t + hold + release + 0.05);
  }
}

export const sfx = new Sfx();
