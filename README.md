# Murdoku — Manhunt meets Sudoku

> *There was a murder last night. A handful of suspects, one victim, a floor plan full of clues — and only one arrangement that truly adds up. Grab your magnifying glass.*

**Murdoku** is a logic mystery for the web: the rigor of Sudoku married to the suspense of a whodunit. Every suspect leaves a clue ("…was sitting on a chair", "…was in the same room as Bryson", "…was **not** beside a wall"). You combine, cross out and place — until every person stands on exactly one tile. Whoever ends up **alone with the victim** in a room is the murderer.

<p align="center">
  <img src="screenshots/murdoku_menu.jpg" width="32%" alt="Start screen: blood-lettered Murdoku title with Open Case, Tutorial, Editor and Generate" />
  <img src="screenshots/murdoku_levelchooser.jpg" width="32%" alt="The Files — case selection with polaroid preview cards, filtered by difficulty and size" />
  <img src="screenshots/murdoku_ingame.jpg" width="32%" alt="A case in progress: suspects, written clues, furniture and crossed-out rows and columns" />
</p>
<p align="center">
  <img src="screenshots/murdoku_generator.jpg" width="40%" alt="The level generator, laid out as a confidential case file with size, difficulty and theme" />
  <img src="screenshots/murdoku_editor.jpg" width="40%" alt="The level editor: paint rooms and objects, define suspects and build their clues" />
</p>

<p align="center"><sub>Main menu · "The Files" (case selection) · An investigation in full swing · The case generator · The editor</sub></p>

---

## Highlights

- **A guided, interactive tutorial** that teaches the rules by solving a real mini-case with you, step by step.
- **An automatic case generator** that rolls *endless*, guaranteed-unique mysteries from 10+ themed settings in three difficulties — running in a Web Worker so the interface never stutters.
- **A full level editor** — paint the floor plan, define suspects, build their clues, verify uniqueness, then play or save your own cases.
- **48 hand-built bundled cases** spanning a gentle tutorial up through *hard*, on boards from 4×4 to 10×10 — and the generator adds as many more as you like.
- **A settings desk** behind the gear: language, three assistance levels, a case stopwatch and gender-tinted suspect files.
- **A noir "case file" look** — dark ink, brass and crimson, a typewriter testimony font, ink stamps, polaroid evidence cards and a faint film-grain over everything.
- **Fully bilingual** (English & German), switchable at any time, with every clue written out as a natural sentence.
- **Plays great on desktop and mobile**, with your progress saved locally.

---

## Hats off to the inventor

The brilliant core idea — fusing Sudoku logic with a murder case — comes from **Manuel Garand**. This project is a loving, freely-interpreted homage to his concept and is not affiliated with him.

> **If you enjoy the principle, please buy Manuel Garand's book and support the inventor!** Without his idea, this crime scene wouldn't exist.

---

## How the investigation works

1. **Pick a suspect** from the file on the left. Their clue reveals where they could have been — the possible tiles light up.
2. **Place them** with a long press on a tile. A short tap leaves a pencil note instead.
3. As in Sudoku: **one person per row and per column.** When you place someone, Murdoku crosses out their whole row and column automatically — no tile can be used twice.
4. **Cross out** anything you can rule out yourself (even across furniture), until only one solution remains.
5. **Submit.** If everyone stands correctly, the mystery unravels: who was alone with the victim?

Stuck? The **hint giver** explains the next logical step in words — it never hands you the answer, just a nudge in the right direction.

---

## What's in the file

- **A whole clue vocabulary** — on/beside an object, beside a window, in a corner, against a wall, in a row/column, alone in the room, "the only person on a chair", "in the same room as X", compass directions, room traits ("nobody with a beard") … all combinable with **AND / OR** and individually negatable with **NOT** — and rendered as clean, grammatical sentences.
- **Suspects with character** — hand-drawn avatars with gender, beard, glasses, baldness and hair colors. These traits aren't decoration; they're part of the logic.
- **A lovingly drawn crime scene** — armchairs, bookshelves, beds, cars and tables that **merge seamlessly into large pieces** (rows, L-shapes, 2×2 …), just like the carpets. Windows, walls and pastel rooms included.
- **Endless new cases** — the built-in **generator** rolls uniquely-solvable levels from 10+ themes (apartment, mansion, hotel, hospital, museum, auto shop …) in three difficulties. It runs in a **Web Worker** so the interface stays smooth.
- **Build your own cases** — a full **level editor** (see below).
- **Guided tutorial** — walks you through a real mini-case step by step.
- **Bilingual** — English & German, switchable anytime.
- **Desktop & mobile** — responsive layout, touch controls, and your progress is saved locally.

---

## The settings desk

A gear in the corner of every screen opens the **settings case file**:

- **Language** — switch between English and German at any time.
- **Investigation aid** — pick your rank: **Assistant** highlights every tile the statements still allow, **Inspector** marks only the clues' references (the objects, rooms and traces named), **Master Detective** shows nothing at all — you combine entirely on your own.
- **Stopwatch** — show or hide the elapsed-time counter in the game header.
- **Files by gender** — tint the suspect cards (and the victim's name) softly in rose and blue, or turn it off.

Everything is stored locally and applies across the game, picker, generator and editor instantly.

---

## A crime scene with atmosphere

Murdoku is dressed as a **noir case file**. Warm near-black "interrogation room" ink, brass and crimson accents, and a faint **film-grain** over the whole app. The display face is **Fraunces**, headings and testimony are typed in **Special Elite**, the body is **Spline Sans**. Cases arrive as **polaroid evidence cards** (taped into place), solved files get a slanted crimson **SOLVED** stamp, the title bleeds its letters, and the generator is laid out as a stamped, **confidential** dossier. Form, not just function.

---

## Build your own crime scene (editor)

Got your own Murdoku puzzles on paper? Recreate them 1:1:

- Paint **rooms, floor, objects and windows** straight onto the board (4×4 up to 16×16).
- Create **suspects** (name, traits) and assemble their clues in the flat **clue builder**.
- **"Check"** tells you whether the case is solvable **and unique** — and who the murderer would be.
- **"Play"** tests it instantly, **"Save"** files it (with name & difficulty) into your case archive or exports it as JSON.

Room names follow the chosen theme — and can be swapped anytime.

---

## The detective's tools

Murdoku is built **engine-first**: the entire game logic is a pure, framework-free TypeScript engine (no React, no DOM) — testable, portable, and the single source of truth.

| Area        | Tech |
|-------------|------|
| **Engine**  | Pure TypeScript 6 (strict): model, composable `Clue` classes, a backtracking **solver** (uniqueness oracle + answer key) and a **DeductionEngine** for explainable hints |
| **Frontend**| React 19 + Vite 8, board rendered on **Canvas 2D** |
| **Generator** | Runs in a **Web Worker**, guarantees unique solutions |
| **i18n**    | i18next / react-i18next — all text from locale files |
| **Quality** | Vitest, ESLint 10, strict `tsc` throughout |

---

## Getting started at the scene

```bash
npm install      # gather your gear
npm run dev      # start the investigation (dev server)
npm run build    # secure the evidence (production build)
npm run preview  # view the build locally
```

Quality assurance:

```bash
npm test         # engine tests (Vitest)
npm run lint     # ESLint
npm run typecheck
```

And a few bloodhounds for the engine — small CLIs that solve, generate and analyze levels:

```bash
npm run solve      # solve a case
npm run generate   # roll new cases
npm run show       # print a level in the terminal
npm run check      # verify all levels are uniquely solvable
npm run hardest    # find the trickiest cases
```

---

## Case file structure

```
src/
  engine/        Pure-TS game logic: model · clues · solver · io · generator
  game/          Engine <-> UI bridge: board rendering, furniture art, sessions, settings, storage
  components/    React building blocks (board, file, toolbar, settings, editor …)
  screens/       Start · Case select · Game · Generator · Tutorial · Editor
  i18n/          English & German + the clue renderer
levels/          Bundled cases (JSON)
screenshots/     The images above
```

---

## The detective behind the desk

Built by **Dirk Aporius** ([@TheApo](https://github.com/TheApo)) — from the pure logic engine down to the last hand-drawn armchair.

Original concept: **Manuel Garand**. Enjoying Murdoku? Then **buy his book** — and happy sleuthing.
