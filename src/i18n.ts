import { saveSettings, settings, type Lang } from './settings';

type Dict = Record<string, string>;

const uk: Dict = {
  level: 'Рівень {n}',
  best: 'Рекорд:',
  bestShort: 'Рек.',
  steps: 'Кроки {n}',
  stepsUnit: 'кр',
  zoom: 'Масштаб {n}%',

  'mode.homerun': 'Додому',
  'mode.minesweeper': 'Сапер',
  'mode.desc.homerun': 'Дійдіть до хатинки, не підірвавшись',
  'mode.desc.minesweeper': 'Позначте червоними прапорцями всі міни — зайвих червоних бути не повинно',
  'menu.mode': 'Режим: {v}',
  'end.mode': 'Режим: {v}',
  'end.wonMs': '🚩 Усі міни знайдено!',
  'end.won': '🏠 Ви вдома!',
  'end.lost': 'Життя скінчились',
  'end.steps': 'Кроки: {n}',
  'end.time': 'Час: {t}',
  'end.record': '★ новий рекорд!',
  'end.lives': 'Життя: {a} з {b}',
  'end.best': 'Найкраще: {s} кр · {t}',
  'end.lostSteps': 'Пройдено кроків: {n}',
  'end.furthest': 'Найдалі діставались до рівня {n}',
  'end.hintWon': 'Пробіл / тап — наступний рівень',
  'end.hintLost': 'Пробіл / тап — спробувати ще раз',

  'help.look': 'ОГЛЯД: Shift + стрілки — рух курсора · F — прапорець у клітинці\nПерсонаж стоїть на місці · відпустіть Shift — вийти з огляду',
  'help.touch': 'Тап по клітинці — крок або йти туди · свайп — крок\nДовгий тап — прапорець · слот → клітинка — предмет\nДва пальці — прокрутка й масштаб · 🎯 — камера назад',
  'help.desktop': 'Стрілки — крок (1 натискання = 1 клітинка) · F / права кнопка — прапорці (🔴 небезпека · 🟡 підозра · 🟢 безпечно · далі зняти) · S — звук\nКлік по відкритій — іти туди · Shift + стрілки — огляд · −/+ — масштаб · L — рівні · M / Esc — меню · R — заново\nO — відкрити ящик · 1 камінь · 2 палка з чобітком · 3 кірка, далі стрілка — напрямок',

  'toast.noChest': 'Тут немає ящика',
  'toast.noItem': 'Такого предмета ще немає — шукайте в ящиках',
  'toast.none': 'Такого предмета немає',
  'toast.opened': 'Тут уже все відкрито',
  'toast.edge': 'Там кінець поля',
  'toast.blocked': 'Туди не вийти — стоїть прапорець',
  'toast.probeBroke': 'Чобіток підірвав міну — палка зламалась',
  'toast.found.stone': 'Знайдено: камінці ×{n}',
  'toast.found.probe': 'Знайдено: палка з чобітком',
  'toast.found.pickaxe': 'Знайдено: кірка',
  'chest.open': 'Відкрити',
  'help.aim.stone': 'КАМІНЬ: стрілка / тап по сусідній клітинці — кинути (міна вибухне без шкоди, безпечна клітинка відкриється)\n1 — скасувати',
  'help.aim.probe': 'ПАЛКА З ЧОБІТКОМ: стрілка / тап по сусідній клітинці — перевірити (на міні міна вибухне, а палка зламається)\n2 — скасувати',
  'help.aim.pickaxe': 'КІРКА: стрілка / тап по клітинці через одну — пробити тунель під сусідньою й вийти за нею (кірка одноразова)\n3 — скасувати',
  'picker.title': 'Оберіть рівень',
  'picker.hint': 'Доступно рівнів: {n} · стрілки / клік — вибір · Enter — почати · Esc — закрити',
  'picker.scroll': ' · коліщатко / перетягування — прокрутка',

  'menu.play': 'Грати',
  'menu.continue': 'Продовжити (рівень {n})',
  'menu.resume': 'Повернутися до гри',
  'menu.newGame': 'Нова гра',
  'menu.levels': 'Обрати рівень',
  'menu.settings': 'Налаштування',
  'menu.back': 'Назад',
  'menu.hint': 'стрілки / клік — вибір · Enter — підтвердити',
  'menu.hintTouch': 'торкніться пункту',
  'menu.hintPause': ' · Esc / M — повернутися',
  'menu.help': 'Довідка',
  'help.title': 'Довідка',
  'help.tab': '◀ {name} ({i}/{n}) ▶',
  'help.name.rules': 'Правила',
  'help.name.modes': 'Режими',
  'help.name.flags': 'Прапорці',
  'help.name.items': 'Інвентар',
  'help.name.controls': 'Керування',
  'help.sec.rules': 'Ви йдете полем з верхнього лівого кута. Відкрита клітинка під ногами показує цифру: скільки мін серед 8 сусідніх клітинок.\n\n• Одне натискання стрілки — один крок на сусідню клітинку.\n• Відкриті клітинки лишаються на полі: прокладайте безпечний шлях за цифрами.\n• Клітинка з нулем сама відкриває сусідів (каскад).\n• Крок на міну — вибух і мінус одне життя. На місці міни лишається кратер, по ньому можна ходити, а цифри навколо перераховуються. Вибухова хвиля відкидає вас на клітинку назад.\n• Життя скінчились — рівень програно. Після перемоги — наступний рівень: поле більше, мін більше.\n• Далекі клітинки сховані туманом.\n• Рекорди (кроки й час) зберігаються окремо для кожного рівня й режиму.',
  'help.sec.modes': 'Режим обирається в головному меню (пункт «Режим»). Прогрес і рекорди в кожного режиму свої.\n\n🏠 Додому\n• Мета — дійти до хатинки в правому нижньому куті.\n• Безпечний шлях до неї гарантовано є, але він звивистий: шукайте його за цифрами.\n\n🚩 Сапер\n• Хатинки немає. Потрібно позначити червоними прапорцями всі міни.\n• Перемога, лише коли червоні прапорці стоять рівно на мінах і немає жодного зайвого. Жовті й зелені не рахуються.\n• Міна, яку ви підірвали, вважається знайденою, але коштує життя.\n• Лічильник 🚩 показує, скільки червоних прапорців поставлено; кількість мін на полі вказано вгорі.',
  'help.sec.flags': 'F (права кнопка миші, довгий тап) на клітинці змінює прапорець по колу:\n\n🔴 червоний — небезпека, тут міна. Ступити на клітинку не можна.\n🟡 жовтий — підозра. Теж не пускає на клітинку.\n🟢 зелений — безпечно. Клітинку можна проходити.\n— далі прапорець знімається.\n\nF ставить прапорець на клітинці перед персонажем. Щоб поставити його будь-де, затисніть Shift: стрілки рухають жовтий курсор, F змінює прапорець, а коли відпустите Shift, огляд закінчиться.\n\nУ режимі «Сапер» для перемоги рахуються лише червоні прапорці.',
  'help.sec.items': 'Ящики 📦 лежать лише на клітинках без мін, і їх видно тільки на відкритих клітинках. Станьте на ящик і натисніть O (або кнопку «Відкрити»): вміст потрапить в інвентар внизу екрана.\n\nЩоб узяти предмет «в руку», натисніть 1 / 2 / 3 або торкніться слота. Далі стрілка чи тап по сусідній клітинці задає напрямок. Повторне натискання скасовує вибір.\n\n🪨 Камінці (1) — кинути на сусідню клітинку. Міна вибухне без втрати життя й зникне, безпечна клітинка відкриється. Один камінь — одна клітинка.\n🥾 Палка з чобітком (2) — перевірити сусідню клітинку. Безпечна відкриється, і палку можна використати знову. На міні вона вибухне (без втрати життя), а палка зламається. Прапорець на перевіреній клітинці знімається.\n⛏ Кірка (3) — пробити тунель під сусідньою клітинкою (навіть із міною) й вийти через одну від себе. Одноразова. Вийшли на міну — вибух.\n\nЯкщо предмет застосувати до вже відкритої клітинки, він не витрачається. Галочка в налаштуваннях переносить інвентар на наступний рівень.',
  'help.sec.controls': 'Стрілки — крок (1 натискання = 1 клітинка)\nКлік по відкритій клітинці — іти туди (тап на екрані)\nF / права кнопка / довгий тап — прапорець\nShift + стрілки — огляд\nПеретягування мишею чи колесо — прокрутка карти, Ctrl + колесо — масштаб\nНа телефоні: два пальці — прокрутка й масштаб щипком; 🎯 чи тап по персонажу повертає камеру\nO — відкрити ящик · 1 / 2 / 3 — предмет в руку\n−/+ — масштаб · L — вибір рівня · R — рівень заново\nS — вимкнути/увімкнути звук · M / Esc — меню\n\nПідказка з клавішами завжди видна внизу екрана.',
  'settings.title': 'Налаштування',
  'settings.language': 'Мова: {v}',
  'settings.music': '{v} Фонова музика',
  'settings.sfx': '{v} Звукові ефекти',
  'settings.lives': 'Життя: {v}',
  'settings.blast': '{v} Хвиля відкидає лише на відкриту клітинку',
  'settings.carry': '{v} Переносити інвентар на наступний рівень',
  'settings.livesNote': 'Кількість життів діє з наступної гри. ← → — змінити значення',
  'settings.livesNoteTouch': 'Кількість життів діє з наступної гри. Торкніться, щоб змінити',
};

const en: Dict = {
  level: 'Level {n}',
  best: 'Best:',
  bestShort: 'Best',
  steps: 'Steps {n}',
  stepsUnit: 'st',
  zoom: 'Zoom {n}%',

  'mode.homerun': 'Home run',
  'mode.minesweeper': 'Minesweeper',
  'mode.desc.homerun': 'Reach the hut without blowing up',
  'mode.desc.minesweeper': 'Flag every mine red — no extra red flags allowed',
  'menu.mode': 'Mode: {v}',
  'end.mode': 'Mode: {v}',
  'end.wonMs': '🚩 All mines found!',
  'end.won': '🏠 You made it home!',
  'end.lost': 'Out of lives',
  'end.steps': 'Steps: {n}',
  'end.time': 'Time: {t}',
  'end.record': '★ new record!',
  'end.lives': 'Lives: {a} of {b}',
  'end.best': 'Best: {s} st · {t}',
  'end.lostSteps': 'Steps taken: {n}',
  'end.furthest': 'Furthest level reached: {n}',
  'end.hintWon': 'Space / tap — next level',
  'end.hintLost': 'Space / tap — try again',

  'help.look': 'LOOK: Shift + arrows — move the cursor · F — flag the cell\nYour character stays put · release Shift — leave look mode',
  'help.touch': 'Tap a cell — step or walk there · swipe — step\nLong press — flag · slot, then cell — use item\nTwo fingers — scroll & zoom · 🎯 — camera back',
  'help.desktop': 'Arrows — step (1 press = 1 cell) · F / right click — flags (🔴 danger · 🟡 suspect · 🟢 safe · then clear) · S — sound\nClick an opened cell — walk there · Shift + arrows — look · −/+ — zoom · L — levels · M / Esc — menu · R — restart\nO — open chest · 1 stone · 2 boot on a stick · 3 pickaxe, then an arrow — direction',

  'toast.noChest': 'There is no chest here',
  'toast.noItem': 'You do not have that item yet — look in chests',
  'toast.none': 'No such item',
  'toast.opened': 'Everything is already revealed there',
  'toast.edge': 'That is the edge of the field',
  'toast.blocked': 'Cannot go there — a flag is in the way',
  'toast.probeBroke': 'The boot set off a mine — the stick broke',
  'toast.found.stone': 'Found: stones ×{n}',
  'toast.found.probe': 'Found: boot on a stick',
  'toast.found.pickaxe': 'Found: pickaxe',
  'chest.open': 'Open',
  'help.aim.stone': 'STONE: arrow / tap an adjacent cell — throw (a mine explodes harmlessly, a safe cell opens)\n1 — cancel',
  'help.aim.probe': 'BOOT ON A STICK: arrow / tap an adjacent cell — test it (on a mine the mine explodes and the stick breaks)\n2 — cancel',
  'help.aim.pickaxe': 'PICKAXE: arrow / tap the cell two away — dig under the neighbour and come up past it (single use)\n3 — cancel',
  'picker.title': 'Choose a level',
  'picker.hint': 'Levels available: {n} · arrows / click — select · Enter — start · Esc — close',
  'picker.scroll': ' · wheel / drag — scroll',

  'menu.play': 'Play',
  'menu.continue': 'Continue (level {n})',
  'menu.resume': 'Back to game',
  'menu.newGame': 'New game',
  'menu.levels': 'Choose level',
  'menu.settings': 'Settings',
  'menu.back': 'Back',
  'menu.hint': 'arrows / click — select · Enter — confirm',
  'menu.hintTouch': 'tap an item',
  'menu.hintPause': ' · Esc / M — back',
  'menu.help': 'Help',
  'help.title': 'Help',
  'help.tab': '◀ {name} ({i}/{n}) ▶',
  'help.name.rules': 'Rules',
  'help.name.modes': 'Modes',
  'help.name.flags': 'Flags',
  'help.name.items': 'Inventory',
  'help.name.controls': 'Controls',
  'help.sec.rules': 'You walk across the field from the top-left corner. The opened cell under your feet shows a number: how many mines are among the 8 neighbouring cells.\n\n• One arrow press is one step to a neighbouring cell.\n• Opened cells stay on the field: plan a safe path from the numbers.\n• A cell with zero opens its neighbours by itself (cascade).\n• Stepping on a mine blows it up and costs one life. A crater stays in its place and can be walked on, and the numbers around it are recounted. The blast throws you one cell back.\n• When your lives run out the level is lost. After a win you get the next level: a bigger field with more mines.\n• Distant cells are hidden by fog.\n• Records (steps and time) are kept separately for every level and mode.',
  'help.sec.modes': 'The mode is chosen in the main menu (the "Mode" item). Each mode has its own progress and records.\n\n🏠 Home run\n• Goal: reach the hut in the bottom-right corner.\n• A safe path to it is guaranteed, but it winds around: find it from the numbers.\n\n🚩 Minesweeper\n• There is no hut. You have to mark every mine with a red flag.\n• You win only when the red flags sit exactly on the mines and there is not a single extra one. Yellow and green flags do not count.\n• A mine you blew up counts as found, but it costs a life.\n• The 🚩 counter shows how many red flags are placed; the number of mines on the field is shown at the top.',
  'help.sec.flags': 'F (right mouse button, long tap) on a cell cycles its flag:\n\n🔴 red: danger, a mine is here. You cannot step onto the cell.\n🟡 yellow: suspicion. Also blocks the cell.\n🟢 green: safe. The cell can be walked on.\n— then the flag is removed.\n\nF flags the cell in front of the character. To flag anywhere, hold Shift: the arrows move the yellow cursor, F changes the flag, and releasing Shift ends look mode.\n\nIn Minesweeper mode only red flags count towards the win.',
  'help.sec.items': 'Chests 📦 lie only on cells without mines, and they are visible only on opened cells. Stand on a chest and press O (or the "Open" button): the contents go to the inventory at the bottom of the screen.\n\nTo take an item in hand press 1 / 2 / 3 or tap its slot. Then an arrow or a tap on a neighbouring cell sets the direction. Pressing again cancels.\n\n🪨 Stones (1): throw at a neighbouring cell. A mine explodes without costing a life and disappears; a safe cell opens. One stone, one cell.\n🥾 Boot on a stick (2): probe a neighbouring cell. A safe cell opens and the stick can be used again. On a mine it explodes (no life lost) and the stick breaks. A flag on the probed cell is removed.\n⛏ Pickaxe (3): dig a tunnel under the neighbouring cell (even one with a mine) and come out one cell further. Single use. If you come out on a mine, it explodes.\n\nUsing an item on an already opened cell does not spend it. A setting carries the inventory over to the next level.',
  'help.sec.controls': 'Arrows: step (1 press = 1 cell)\nClick an opened cell: walk there (tap on a touch screen)\nF / right click / long tap: flag\nShift + arrows: look\nDrag with the mouse or use the wheel: scroll the map; Ctrl + wheel: zoom\nOn a phone: two fingers scroll the map and pinch to zoom; 🎯 or a tap on the character brings the camera back\nO: open a chest · 1 / 2 / 3: item in hand\n−/+: zoom · L: choose level · R: restart level\nS: toggle sound · M / Esc: menu\n\nThe key hint is always visible at the bottom of the screen.',
  'settings.title': 'Settings',
  'settings.language': 'Language: {v}',
  'settings.music': '{v} Background music',
  'settings.sfx': '{v} Sound effects',
  'settings.lives': 'Lives: {v}',
  'settings.blast': '{v} Blast only throws onto an opened cell',
  'settings.carry': '{v} Carry the inventory over to the next level',
  'settings.livesNote': 'Lives apply from the next game. ← → — change value',
  'settings.livesNoteTouch': 'Lives apply from the next game. Tap to change',
};

const dicts: Record<Lang, Dict> = { uk, en };
const listeners = new Set<() => void>();

export const LANG_NAMES: Record<Lang, string> = { uk: 'Українська', en: 'English' };

export function t(key: string, params: Record<string, string | number> = {}): string {
  const raw = dicts[settings.lang][key] ?? dicts.uk[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function setLang(lang: Lang): void {
  if (settings.lang === lang) return;
  settings.lang = lang;
  saveSettings();
  document.documentElement.lang = lang;
  listeners.forEach((cb) => cb());
}

export function onLangChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

if (typeof document !== 'undefined') document.documentElement.lang = settings.lang;
