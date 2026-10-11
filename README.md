# Shatter

A browser space shooter built around a gravity well. Fight armored rocks through
three sizes, curve shots around the star, and save your guided Warhead torpedo for
a rock that needs to break now. Clear the field to face faster, denser waves while
an enemy saucer hunts you.

## Run

Requires Node.js compatible with Vite 8.

```sh
npm ci
npm run dev
```

Open the development server URL printed in the terminal.

```sh
npm run build
npm run preview
```

The production site is entirely contained in `dist/`. Serve that directory from
any static server, including at a nested base path. There are no external assets,
network services, or credentials.

## Controls

| Key | Action |
| --- | --- |
| Up / W | Thrust |
| Left / A, Right / D | Turn |
| Space | Fire; confirm menus |
| F | Launch guided torpedo; ten-second recharge |
| Enter | Confirm menus |
| Up / Down, W / S | Select menu entry |
| P / Escape | Pause or resume |
| Escape | Return from instructions or game over |
| M | Toggle sound |
| Backtick | Toggle diagnostics |

Menus also accept mouse and touch. The engine supplies touch flight controls.
The ship has momentum: turn and thrust against your motion to slow down. The star
pulls rocks and bullets, but leaves powered craft alone. Its core absorbs shots,
recycles rocks, and lets the ship slide along its surface.

## Development

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The render-free simulation runs at 120 Hz. `src/game.ts` exports its readonly
state types and the engine game. `src/simulation.ts` implements transitions,
`src/debug.ts` supplies the complete pose/read surface and diagnostics, and
`src/render.ts` draws the field and menus. Tests stand up the actual engine over
an in-process canvas and a controlled clock.

The debug surface is available only through an engine handle: apply a pose with
`engine.apply(s => engine.debug.setShipPosition(s, 640, 560))` and inspect it with
`engine.debug.snapshot(engine.state)`. Nothing is installed on the browser window.

The player-facing description and captured gameplay carousel live in `showcase/`.
