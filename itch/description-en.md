**Minesweeper, but you are the one walking the field.**

Carry a torch through a dark minefield, one careful step at a time. The number under your feet tells you how many mines hide in the 8 cells around you. Read the numbers, plan your route, and find the safe road home.

## How it plays

- **One key press, one step.** No accidental dashes into the unknown.
- **Numbers appear where you stand.** Opened cells stay on the map, so every step builds your picture of the field.
- **Zero cells cascade** and open their neighbours, giving you a place to start thinking.
- **Step on a mine and it blows up.** You lose a life, the mine is gone, and a crater you can walk over remains. The blast wave throws you one cell back.
- **Run out of lives and you leave a little grave with a candle** on the spot where the mine was.

## Two modes

**Home run.** Reach the hut in the bottom-right corner. A safe path is guaranteed, but it winds all over the field, so you still have to find it.

**Minesweeper.** No hut. Mark every mine with a red flag, with no extra red flags anywhere. A mine you blow up counts as found, but it costs a life.

Each mode keeps its own progress and records.

## Flags

Press F on a cell to cycle the flag colour:

- Red: danger, a mine is here. You cannot step on it.
- Yellow: suspicion. Also blocks the cell.
- Green: safe. You can walk through.
- Press once more to remove it.

Hold Shift to look around: the arrows move a cursor and F flags any cell without moving your character.

## Chests and items

Chests hide on mine-free cells and show up only on opened ones. Open one and you find:

- **Stones:** throw at a neighbouring cell. A mine explodes without hurting you, and a safe cell opens.
- **Boot on a stick:** probe a neighbouring cell. On a mine it explodes (no life lost) and the stick breaks.
- **Pickaxe:** dig under the next cell, even one with a mine, and come out one cell further. Single use.

An option lets you carry your inventory over to the next level.

## And also

- Endless levels. The field grows and the mines get denser as you progress.
- Records for fewest steps and best time on every level, per mode.
- A fog of darkness that lifts around your torch.
- Procedural ambient music, about 6 minutes 45 seconds before it repeats. It brightens when the road home opens and turns dark when you are forced to guess.
- Choose your lives (1, 3 or 5), and tune the blast wave and other options in Settings.
- Built-in Help screen with rules, modes, flags and items.
- English and Ukrainian.
- Plays on desktop and touch screens, with pinch to zoom and two-finger scrolling. Everything is drawn in code and the sounds are synthesised, so there are no downloads beyond the page itself.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Step | Arrow keys, click a neighbouring cell | Tap a neighbouring cell, swipe |
| Walk to an opened cell | Click it | Tap it |
| Flag | F, right click | Long tap |
| Look around | Shift + arrows | Long tap any cell |
| Open chest | O | Open button |
| Use item | 1 stone, 2 boot, 3 pickaxe, then an arrow | Tap the slot, then a cell |
| Zoom | - / + , Ctrl + wheel | Pinch with two fingers |
| Scroll the map | Drag with the mouse, mouse wheel | Drag with two fingers |
| Levels / restart | L / R | Level menu at the top |
| Sound / menu | S / M or Esc | Buttons at the top |

Tip: sound starts after your first click or key press, as browsers require.

Made with TypeScript and Phaser 4.
