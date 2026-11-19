# Інструкція для Suno: семпл фонової музики «Minesweeper Walk»

Основа — наша вбудована музика (`src/musicScore.ts`): **ля мінор, 76 BPM, 4/4**, цикл акордів
**Am · F · C · G · Am · F · Dm · E**; шари: м'який пад, сабасовий бас (на 1-ю і 6-ту восьму такту),
розріджене арпеджіо щипками з «пунктирною» луною (3/8), довгі ніжні ноти-мелодія (хоровий унісон),
теплий низькочастотний фільтр. Настрій — повільна, трохи тривожна, але спокійна «мінна прогулянка».

Промпти англійською: Suno їх розуміє краще. Усе вставляйте в режим **Custom** → **Instrumental**.

---

## 1. Основний семпл (звичайний настрій)

**Title:** `Minefield Walk (main theme)`

**Style of Music** (коротка версія, ≤ 200 символів — для v3.5):

```
instrumental ambient minimal, A minor, 76 BPM, soft synth pads, sub bass, sparse plucked arpeggios with dotted delay, gentle sine lead, tense but calm, warm lowpass, no drums, loopable
```

**Style of Music** (розширена версія, для v4+ / v5):

```
Instrumental ambient game-soundtrack loop, A minor, 76 BPM, 4/4. Slow chord cycle Am - F - C - G - Am - F - Dm - E. Soft warm synth pad swells holding each bar, deep round sine sub-bass hitting beat 1 and the "and" of beat 3, sparse plucked arpeggio in eighth notes with a dotted-eighth ping-pong delay and a lot of air between the notes, rare long gentle lead notes (sine, slightly detuned chorus) playing chord tones. Warm low-pass filtered sound, soft reverb, slightly uneasy yet calm and thoughtful mood of walking carefully across a minefield. Minimal, hypnotic, repetitive but evolving. No drums, no percussion, no vocals. Seamless loop: the ending resolves back to the first Am chord.
```

**Exclude Styles / Negative prompt:**

```
vocals, singing, drums, percussion, beat, EDM drop, distorted guitar, orchestral hits, brass, choir, sudden loud sections, bright pop, trap hi-hats
```

**Lyrics** (поле для структури — тексту немає, лише теги):

```
[Instrumental]

[Intro - 4 bars: Am, only soft pad swell and deep sub bass, very sparse]

[Section A - 8 bars: Am, F, C, G, Am, F, Dm, E. Sparse plucked arpeggio enters on bar 2, one long gentle lead note at the start of bar 1 and bar 5]

[Section B - 8 bars: same chords, arpeggio pattern changes (descending), a few more lead notes with a short echo mid-bar, pad opens up wider]

[Outro - 4 bars: fade the arpeggio first, pad and bass hold Am, then fade so the piece loops seamlessly into the intro]

[End]
```

> Бажана тривалість: **1:30–2:30**. Для гри достатньо 1–2 хвилин, що ідеально зациклюються
> (повний вбудований цикл триває ≈ 6 хв 45 с — Suno його «один в один» не відтворить, це нормально).

---

## 2. Піднесений настрій (дорога до хатинки відкрита)

Змінюємо тільки стиль — структуру з розділу 1 можна лишити.

```
Instrumental ambient game-soundtrack loop, uplifting and hopeful, A major lift (minor chords turn major: A - F - C - G - A - F - D - E), 81 BPM, 4/4. Warm wide pads, bright airy plucked arpeggio an octave higher, denser and sparkling with dotted-eighth delay, more frequent soaring gentle lead notes with short echoes, light round sub-bass, soft shimmer reverb, open and optimistic feeling of the safe road home being found. No drums, no vocals, seamless loop.
```

Exclude: `vocals, drums, percussion, EDM drop, distorted guitar, dark drone, horror, sudden loud sections`

---

## 3. Похмурий настрій (складний вибір, ризик)

```
Instrumental dark ambient game-soundtrack loop, A minor with diminished chords (Am - F - Am - F - Dm - E, a diminished chord every fourth bar), 68 BPM slower, 4/4. Deep sub-bass drone holding the whole bar underneath, muffled low-pass pads, very sparse low plucked arpeggio notes with long dark echo, almost no melody, only an occasional low lead note. Tense, brooding, claustrophobic mood of a risky decision on a minefield. No drums, no vocals, seamless loop.
```

Exclude: `vocals, drums, percussion, EDM drop, bright pop, major key, cheerful, sudden loud hits, screams`

---

## 4. Як працювати з результатом

1. Згенеруйте по 3–4 варіанти кожного настрою (кнопка Create повторно), оберіть найтихіші й найрівніші:
   у грі музика грає «фоном» під ефекти, різкі стрибки гучності й соло не годяться.
2. Якщо трек вийшов задовгим чи без чіткого повернення до Am — натисніть **Extend/Crop** і залиште ~1–2 хв,
   потім обріжте так, щоб кінець плавно переходив у початок (кросфейд 1–2 с).
3. Додавайте в промпт те, що хочете підсилити (наприклад `more bass`, `less melody`, `slower`), і прибирайте зайве
   через Exclude Styles.
4. Збережіть як `.mp3` (бажано 128–192 kbps) чи `.ogg`; три файли — `main`, `bright`, `dark`.

> Поки в грі грає синтезована музика (без файлів). Коли будуть готові семпли, можна додати режим
> «програвати mp3» з тими самими трьома настроями й плавним перемиканням між ними.
