import type { DeepReadonly } from "ts-essentials";
import type { UpdateApi } from "@clockwyrks/simple-2d";
import type {
  ShatterState,
  ShipState,
  SaucerState,
  Point,
  RockState,
} from "./game";
import * as C from "./constants";
export type State = DeepReadonly<ShatterState>;
export const wrap = (v: number, n: number) => ((v % n) + n) % n;
export const delta = (a: Point, b: Point) => ({
  x: wrap(b.x - a.x + C.FIELD_W / 2, C.FIELD_W) - C.FIELD_W / 2,
  y: wrap(b.y - a.y + C.FIELD_H / 2, C.FIELD_H) - C.FIELD_H / 2,
});
export const distance = (a: Point, b: Point) => {
  const d = delta(a, b);
  return Math.hypot(d.x, d.y);
};
export const angleDelta = (a: number, b: number) =>
  wrap(b - a + Math.PI, Math.PI * 2) - Math.PI;
const down = (v: number) => (v - C.TICK_DT < 1e-9 ? 0 : v - C.TICK_DT);
export const safeShip = (): ShipState => ({
  x: C.SAFE_X,
  y: C.SAFE_Y,
  vx: 0,
  vy: 0,
  angle: C.FACE_UP,
  thrusting: false,
  invuln: 0,
  collision: true,
  fireCooldown: 0,
});
export function initialState(muted = false): ShatterState {
  return {
    screen: "title",
    menuIndex: 0,
    score: 0,
    lives: C.START_LIVES,
    wave: 0,
    waveBanner: 0,
    ship: safeShip(),
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    waveSpawning: true,
    saucerSpawning: true,
    saucerClock: 0,
    saucerDue: C.SAUCER_FIRST_DELAY,
    nextSaucerEdge: null,
    nextSaucerRow: null,
    nextSaucerAim: null,
    nextRockSpeed: null,
    nextRecycleEdge: null,
    tickClock: 0,
    nextId: 1,
    simTime: 0,
    muted,
    trails: {},
    effects: [],
    extraLifeBanner: 0,
    pointerStarts: {},
    pendingFire: false,
    pendingTorpedo: false,
  };
}
export function makeSaucer(id: number, x: number, y: number): SaucerState {
  return {
    id,
    x,
    y,
    vx: C.SAUCER_SPEED,
    vy: 0,
    mind: true,
    gun: true,
    travel: true,
    weave: 1,
    fireClock: C.SAUCER_FIRE_INTERVAL,
    weaveClock: C.SAUCER_WEAVE_INTERVAL,
    age: 0,
  };
}
export function newRun(s: State): ShatterState {
  return {
    ...initialState(s.muted),
    screen: "playing",
    wave: 1,
    waveBanner: C.WAVE_BANNER_TIME,
    simTime: s.simTime,
  };
}
export const items = (s: State): readonly string[] =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
export function menuRect(s: State, i: number) {
  return i >= 0 && i < items(s).length
    ? { x: 110, y: 385 + i * 62, w: 340, h: 50 }
    : null;
}
function confirm(s: State): ShatterState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? newRun(s) : { ...s, screen: "howto" };
  if (s.screen === "paused")
    return s.menuIndex === 0
      ? { ...s, screen: "playing", menuIndex: 0 }
      : s.menuIndex === 1
        ? newRun(s)
        : { ...s, screen: "title", menuIndex: 0 };
  return s.menuIndex === 0
    ? newRun(s)
    : { ...s, screen: "title", menuIndex: 0 };
}
interface Body extends Point {
  readonly vx: number;
  readonly vy: number;
}
function move<T extends Body>(b: T, pull: boolean, travel = true): T {
  let { vx, vy } = b;
  if (pull) {
    const x = C.STAR_X - b.x,
      y = C.STAR_Y - b.y,
      d = Math.hypot(x, y);
    if (d) {
      const a = ((C.MU / Math.max(d, C.SOFTEN) ** 2) * C.TICK_DT) / d;
      vx += x * a;
      vy += y * a;
    }
  }
  return {
    ...b,
    vx,
    vy,
    x: wrap(b.x + (travel ? vx * C.TICK_DT : 0), C.FIELD_W),
    y: wrap(b.y + (travel ? vy * C.TICK_DT : 0), C.FIELD_H),
  };
}
/** Relative swept circles, including every seam image crossed during the tick. */
export function swept(
  a: Body,
  b: Body,
  r: number,
  travelA = true,
  travelB = true,
): boolean {
  const d = delta(a, b),
    vx = ((travelB ? b.vx : 0) - (travelA ? a.vx : 0)) * C.TICK_DT,
    vy = ((travelB ? b.vy : 0) - (travelA ? a.vy : 0)) * C.TICK_DT;
  const nx = Math.ceil(Math.abs(vx) / C.FIELD_W) + 1,
    ny = Math.ceil(Math.abs(vy) / C.FIELD_H) + 1;
  for (let ix = -nx; ix <= nx; ix++)
    for (let iy = -ny; iy <= ny; iy++) {
      const x = d.x + ix * C.FIELD_W,
        y = d.y + iy * C.FIELD_H,
        t = Math.max(
          0,
          Math.min(1, -(x * vx + y * vy) / (vx * vx + vy * vy || 1)),
        );
      if (Math.hypot(x + vx * t, y + vy * t) <= r) return true;
    }
  return false;
}
const core = { x: C.STAR_X, y: C.STAR_Y, vx: 0, vy: 0 };
const random = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
function wave(s: ShatterState): ShatterState {
  let id = s.nextId;
  const rocks: RockState[] = [];
  for (let i = 0; i < C.WAVE_BASE_ROCKS + s.wave; i++) {
    let p: Point;
    do {
      p = { x: random(0, C.FIELD_W), y: random(0, C.FIELD_H) };
    } while (
      distance(p, s.ship) < C.WAVE_MIN_SHIP_DIST ||
      distance(p, core) < C.WAVE_MIN_STAR_DIST
    );
    const a = random(0, Math.PI * 2),
      speed =
        (s.nextRockSpeed ??
          random(C.ROCK_SPEED_MIN.large, C.ROCK_SPEED_MAX.large)) *
        (1 + Math.min(C.WAVE_SPEED_CAP, C.WAVE_SPEED_STEP * (s.wave - 1)));
    rocks.push({
      ...p,
      id: id++,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      size: "large",
      spin: a,
      health: C.ROCK_HEALTH.large,
      flash: 0,
    });
  }
  return { ...s, rocks, nextId: id, nextRockSpeed: null };
}
interface Controls {
  turn: number;
  thrust: boolean;
  fire: boolean;
  torpedo: boolean;
}
export function tick(
  previous: State,
  controls: Controls,
  api: UpdateApi,
): ShatterState {
  let s: ShatterState = { ...previous, simTime: previous.simTime + C.TICK_DT };
  if (s.screen !== "playing") return s;
  const cues = new Set<string>();
  const oldScore = s.score;
  let destroyed = false;
  let ship = {
    ...s.ship,
    angle: s.ship.angle + controls.turn * C.SHIP_TURN * C.TICK_DT,
    thrusting: controls.thrust,
    invuln: down(s.ship.invuln),
    fireCooldown: Math.max(0, s.ship.fireCooldown - 1),
  };
  if (controls.thrust) {
    ship.vx += Math.cos(ship.angle) * C.SHIP_THRUST * C.TICK_DT;
    ship.vy += Math.sin(ship.angle) * C.SHIP_THRUST * C.TICK_DT;
  }
  const drag = 0.5 ** (C.TICK_DT / C.SHIP_DRAG_HALFLIFE);
  ship.vx *= drag;
  ship.vy *= drag;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > C.SHIP_MAX) {
    ship.vx *= C.SHIP_MAX / speed;
    ship.vy *= C.SHIP_MAX / speed;
  }
  s = {
    ...s,
    ship,
    torpedoCharge:
      s.torpedoCharge + C.TICK_DT / C.TORPEDO_RECHARGE > 1 - 1e-9
        ? 1
        : s.torpedoCharge + C.TICK_DT / C.TORPEDO_RECHARGE,
    effects: s.effects
      .map((e) => ({ ...e, life: down(e.life) }))
      .filter((e) => e.life > 0),
    extraLifeBanner: down(s.extraLifeBanner),
  };
  if (
    controls.fire &&
    ship.fireCooldown === 0 &&
    s.bullets.length < C.MAX_BULLETS
  ) {
    s = {
      ...s,
      bullets: [
        ...s.bullets,
        {
          id: s.nextId,
          x: ship.x + Math.cos(ship.angle) * C.SHIP_R,
          y: ship.y + Math.sin(ship.angle) * C.SHIP_R,
          vx: ship.vx + Math.cos(ship.angle) * C.MUZZLE_SPEED,
          vy: ship.vy + Math.sin(ship.angle) * C.MUZZLE_SPEED,
          life: C.BULLET_LIFE,
        },
      ],
      nextId: s.nextId + 1,
    };
    ship = { ...ship, fireCooldown: C.FIRE_INTERVAL_TICKS };
    cues.add(C.CUES.fire);
  }
  if (controls.torpedo && s.torpedoCharge === 1 && s.torpedoes.length === 0)
    s = {
      ...s,
      torpedoes: [
        {
          id: s.nextId,
          x: ship.x + Math.cos(ship.angle) * C.SHIP_R,
          y: ship.y + Math.sin(ship.angle) * C.SHIP_R,
          vx: Math.cos(ship.angle) * C.TORPEDO_SPEED,
          vy: Math.sin(ship.angle) * C.TORPEDO_SPEED,
          heading: ship.angle,
          life: C.TORPEDO_LIFE,
          homing: true,
        },
      ],
      nextId: s.nextId + 1,
      torpedoCharge: 0,
    };
  if (!s.saucer) {
    s = { ...s, saucerClock: s.saucerClock + C.TICK_DT };
    if (s.saucerSpawning && s.saucerClock + 1e-9 >= s.saucerDue) {
      const edge = s.nextSaucerEdge ?? (Math.random() < 0.5 ? "left" : "right");
      s = {
        ...s,
        saucer: {
          ...makeSaucer(
            s.nextId,
            edge === "left" ? 0 : C.FIELD_W - 0.001,
            s.nextSaucerRow ?? random(C.SAUCER_R, C.FIELD_H - C.SAUCER_R),
          ),
          vx: edge === "left" ? C.SAUCER_SPEED : -C.SAUCER_SPEED,
          weave: Math.random() < 0.5 ? 1 : -1,
        },
        nextId: s.nextId + 1,
        nextSaucerEdge: null,
        nextSaucerRow: null,
      };
      cues.add(C.CUES.saucer);
    }
  }
  let saucer = s.saucer;
  if (saucer) {
    saucer = {
      ...saucer,
      age: saucer.age + C.TICK_DT,
      fireClock: down(saucer.fireClock),
      weaveClock: down(saucer.weaveClock),
    };
    if (saucer.weaveClock < 1e-9) {
      saucer = {
        ...saucer,
        weaveClock: C.SAUCER_WEAVE_INTERVAL,
        vy: saucer.mind
          ? (saucer.vy === 0 ? saucer.weave : -Math.sign(saucer.vy)) *
            C.SAUCER_WEAVE_SPEED
          : saucer.vy,
      };
    }
    if (
      saucer.mind &&
      Math.abs(saucer.x - C.STAR_X) < 110 &&
      Math.abs(saucer.y - C.STAR_Y) < 90
    )
      saucer = {
        ...saucer,
        vy: (saucer.y < C.STAR_Y ? -1 : 1) * C.SAUCER_WEAVE_SPEED,
      };
    if (saucer.fireClock < 1e-9) {
      if (saucer.gun) {
        const d = delta(saucer, ship),
          a =
            Math.atan2(d.y, d.x) +
            (s.nextSaucerAim ??
              random(-C.SAUCER_AIM_ERROR, C.SAUCER_AIM_ERROR));
        s = {
          ...s,
          enemyBullets: [
            ...s.enemyBullets,
            {
              id: s.nextId,
              x: saucer.x,
              y: saucer.y,
              vx: saucer.vx + Math.cos(a) * C.SAUCER_BULLET_SPEED,
              vy: saucer.vy + Math.sin(a) * C.SAUCER_BULLET_SPEED,
              life: C.SAUCER_BULLET_LIFE,
            },
          ],
          nextId: s.nextId + 1,
          nextSaucerAim: null,
        };
      }
      saucer = { ...saucer, fireClock: C.SAUCER_FIRE_INTERVAL };
    }
  }
  const startShip = ship;
  ship = move(ship, false);
  if (swept(startShip, core, C.CORE_R + C.SHIP_R)) {
    let dx = ship.x - C.STAR_X,
      dy = ship.y - C.STAR_Y;
    const d = Math.hypot(dx, dy);
    if (d < C.CORE_R + C.SHIP_R || swept(startShip, core, C.CORE_R)) {
      dx = startShip.x - C.STAR_X;
      dy = startShip.y - C.STAR_Y;
    }
    if (dx === 0 && dy === 0) dy = 1;
    const n = Math.hypot(dx, dy) || 1,
      ux = dx / n,
      uy = dy / n,
      inward = Math.min(0, ship.vx * ux + ship.vy * uy);
    ship = {
      ...ship,
      x: C.STAR_X + ux * (C.CORE_R + C.SHIP_R),
      y: C.STAR_Y + uy * (C.CORE_R + C.SHIP_R),
      vx: ship.vx - inward * ux,
      vy: ship.vy - inward * uy,
    };
  }
  const oldRocks = s.rocks;
  let rocks = s.rocks.map((r) =>
    move({ ...r, spin: r.spin + C.TICK_DT * 0.22, flash: down(r.flash) }, true),
  );
  const recycled = new Set<number>();
  rocks = rocks.map((r, i) => {
    const old = { ...oldRocks[i], vx: r.vx, vy: r.vy };
    if (!swept(old, core, C.ROCK_RADIUS[r.size] + C.CORE_R)) return r;
    recycled.add(r.id);
    const edge =
        s.nextRecycleEdge ??
        (["top", "bottom", "left", "right"] as const)[
          Math.floor(Math.random() * 4)
        ],
      speed =
        s.nextRockSpeed ??
        random(C.ROCK_SPEED_MIN[r.size], C.ROCK_SPEED_MAX[r.size]);
    s = { ...s, nextRockSpeed: null, nextRecycleEdge: null };
    const x =
        edge === "left"
          ? 0
          : edge === "right"
            ? C.FIELD_W - 0.001
            : random(0, C.FIELD_W),
      y =
        edge === "top"
          ? 0
          : edge === "bottom"
            ? C.FIELD_H - 0.001
            : random(0, C.FIELD_H),
      a = Math.atan2(C.STAR_Y - y, C.STAR_X - x);
    return { ...r, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
  });
  const oldSaucer = saucer;
  saucer = saucer ? move(saucer, false, saucer.travel) : null;
  if (saucer?.mind && distance(saucer, core) < C.CORE_R + C.SAUCER_R) {
    const d = delta(core, saucer),
      n = Math.hypot(d.x, d.y) || 1;
    saucer = {
      ...saucer,
      x: C.STAR_X + (d.x / n) * (C.CORE_R + C.SAUCER_R),
      y: C.STAR_Y + (d.y / n) * (C.CORE_R + C.SAUCER_R),
    };
  }
  const leave = () => {
    saucer = null;
    s = {
      ...s,
      saucerClock: 0,
      saucerDue: random(C.SAUCER_GAP_MIN, C.SAUCER_GAP_MAX),
    };
  };
  const explode = (p: Point, color: string) => {
    s = {
      ...s,
      effects: [...s.effects, { ...p, color, life: 0.65, seed: s.nextId }],
    };
  };
  const hurt = (r: RockState, weapon: Body, heavy: boolean) => {
    if (!heavy && r.health > 1) {
      rocks = rocks.map((x) =>
        x.id === r.id
          ? { ...x, health: x.health - 1, flash: C.HIT_FLASH_TIME }
          : x,
      );
      return;
    }
    destroyed = true;
    cues.add(C.CUES.shatter);
    explode(r, "#f9b574");
    s = {
      ...s,
      score:
        s.score +
        { large: C.SCORE_LARGE, medium: C.SCORE_MEDIUM, small: C.SCORE_SMALL }[
          r.size
        ],
    };
    rocks = rocks.filter((x) => x.id !== r.id);
    const child = C.ROCK_CHILD[r.size];
    if (child) {
      const n = Math.hypot(weapon.vx, weapon.vy) || 1,
        k = heavy ? C.TORPEDO_SCATTER : C.SPLIT_KICK,
        kx = ((heavy ? weapon.vx : -weapon.vy) / n) * k,
        ky = ((heavy ? weapon.vy : weapon.vx) / n) * k;
      for (const sign of [1, -1]) {
        rocks.push({
          ...r,
          id: s.nextId,
          size: child,
          health: C.ROCK_HEALTH[child],
          flash: 0,
          vx: r.vx + sign * kx,
          vy: r.vy + sign * ky,
        });
        s = { ...s, nextId: s.nextId + 1 };
      }
    }
  };
  const bulletStarts = s.bullets;
  let bullets = s.bullets.map((b) => move({ ...b, life: down(b.life) }, true));
  const torpedoStarts = s.torpedoes;
  let torpedoes = s.torpedoes.map((t) => {
    let heading = t.heading;
    if (t.homing) {
      const candidates = [...oldRocks, ...(oldSaucer ? [oldSaucer] : [])]
        .filter((r) => {
          const d = delta(t, r);
          return (
            Math.abs(angleDelta(heading, Math.atan2(d.y, d.x))) <=
            C.TORPEDO_CONE
          );
        })
        .sort((a, b) => distance(t, a) - distance(t, b));
      if (candidates[0]) {
        const d = delta(t, candidates[0]),
          diff = angleDelta(heading, Math.atan2(d.y, d.x));
        heading += Math.max(
          -C.TORPEDO_TURN * C.TICK_DT,
          Math.min(C.TORPEDO_TURN * C.TICK_DT, diff),
        );
      }
    }
    return move(
      {
        ...t,
        heading,
        vx: Math.cos(heading) * C.TORPEDO_SPEED,
        vy: Math.sin(heading) * C.TORPEDO_SPEED,
        life: down(t.life),
      },
      false,
    );
  });
  function impacts<T extends Body & { id: number; life: number }>(
    shots: T[],
    starts: readonly T[],
    heavy: boolean,
  ): T[] {
    return shots.filter((b, i) => {
      const start = { ...starts[i], vx: b.vx, vy: b.vy },
        radius = heavy ? C.TORPEDO_R : C.BULLET_R;
      if (swept(start, core, radius + C.CORE_R)) return false;
      const rock = rocks.find((r) => {
        const old = oldRocks.find((x) => x.id === r.id);
        return swept(
          start,
          old && !recycled.has(r.id) ? { ...old, vx: r.vx, vy: r.vy } : r,
          radius + C.ROCK_RADIUS[r.size],
        );
      });
      if (rock) {
        hurt(rock, b, heavy);
        return false;
      }
      if (
        saucer &&
        oldSaucer &&
        swept(start, oldSaucer, radius + C.SAUCER_R, true, oldSaucer.travel)
      ) {
        s = { ...s, score: s.score + C.SCORE_SAUCER };
        explode(saucer, "#ff698a");
        leave();
        return false;
      }
      return b.life > 0;
    });
  }
  bullets = impacts(bullets, bulletStarts, false);
  torpedoes = impacts(torpedoes, torpedoStarts, true);
  const enemyStarts = s.enemyBullets;
  let enemyBullets = s.enemyBullets
    .map((b) => move({ ...b, life: down(b.life) }, true))
    .filter(
      (b, i) =>
        b.life > 0 &&
        !swept(
          { ...enemyStarts[i], vx: b.vx, vy: b.vy },
          core,
          C.CORE_R + C.SAUCER_BULLET_R,
        ),
    );
  if (ship.collision && ship.invuln === 0) {
    const enemy = enemyBullets.find((b) =>
      swept(
        startShip,
        enemyStarts.find((x) => x.id === b.id) ?? b,
        C.SHIP_R + C.SAUCER_BULLET_R,
      ),
    );
    if (
      enemy ||
      rocks.some((r) =>
        swept(
          startShip,
          oldRocks.find((x) => x.id === r.id) && !recycled.has(r.id)
            ? { ...oldRocks.find((x) => x.id === r.id)!, vx: r.vx, vy: r.vy }
            : r,
          C.SHIP_R + C.ROCK_RADIUS[r.size],
        ),
      ) ||
      (saucer &&
        oldSaucer &&
        swept(
          startShip,
          oldSaucer,
          C.SHIP_R + C.SAUCER_R,
          true,
          oldSaucer.travel,
        ))
    ) {
      cues.add(C.CUES.death);
      explode(ship, "#8ffff0");
      if (enemy) enemyBullets = enemyBullets.filter((b) => b.id !== enemy.id);
      s = { ...s, lives: s.lives - 1, torpedoCharge: 1 };
      if (s.lives > 0) ship = { ...safeShip(), invuln: C.INVULN_TIME };
      else s = { ...s, screen: "gameover", menuIndex: 0 };
    }
  }
  if (saucer && saucer.age + 1e-9 >= C.SAUCER_LIFETIME) leave();
  const extra =
    Math.floor(s.score / C.EXTRA_LIFE_STEP) -
    Math.floor(oldScore / C.EXTRA_LIFE_STEP);
  if (extra) {
    s = { ...s, lives: s.lives + extra, extraLifeBanner: 1 };
    cues.add(C.CUES.extraLife);
  }
  let banner = down(s.waveBanner);
  if (s.waveBanner > 0 && banner < 1e-9) {
    banner = 0;
    if (s.waveSpawning) {
      s = wave({ ...s, ship, rocks });
      rocks = [...s.rocks];
    }
  } else if (destroyed && rocks.length === 0 && s.waveSpawning) {
    s = { ...s, wave: s.wave + 1 };
    banner = C.WAVE_BANNER_TIME;
  }
  const trails: Record<number, readonly Point[]> = {};
  for (const b of [...bullets, ...enemyBullets]) {
    const start = [...bulletStarts, ...enemyStarts].find((p) => p.id === b.id);
    trails[b.id] = [
      ...(s.trails[b.id] ?? (start ? [{ x: start.x, y: start.y }] : [])),
      { x: b.x, y: b.y },
    ].slice(-(C.TRAIL_TICKS + 1));
  }
  for (const cue of cues) api.audio.play(cue);
  if (ship.thrusting && s.screen === "playing") api.audio.loop(C.CUES.thrust);
  else api.audio.stop(C.CUES.thrust);
  return {
    ...s,
    ship,
    rocks,
    bullets,
    torpedoes,
    enemyBullets,
    saucer,
    waveBanner: banner,
    trails,
  };
}
export function update(state: State, api: UpdateApi, dt: number): ShatterState {
  const pressed = Object.fromEntries(
    C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
  ) as Record<C.ActionName, boolean>;
  if (pressed.mute) api.audio.setMuted(!api.audio.muted());
  let s: ShatterState = { ...state, muted: api.audio.muted() };
  const original = s.screen;
  if (original === "playing" && pressed.pause) {
    s = { ...s, screen: "paused", menuIndex: 0 };
    api.audio.stop(C.CUES.thrust);
  } else if (original === "paused" && (pressed.pause || pressed.back))
    s = { ...s, screen: "playing", menuIndex: 0 };
  else if (original === "howto") {
    if (pressed.back || pressed.confirm) s = { ...s, screen: "title" };
  } else if (items(s).length) {
    if (pressed.back && s.screen === "gameover")
      s = { ...s, screen: "title", menuIndex: 0 };
    else {
      const count = items(s).length;
      if (pressed.up) s = { ...s, menuIndex: wrap(s.menuIndex - 1, count) };
      if (pressed.down) s = { ...s, menuIndex: wrap(s.menuIndex + 1, count) };
      if (pressed.confirm) s = confirm(s);
      else {
        const starts = { ...s.pointerStarts };
        for (const p of api.input.pointerSamples()) {
          if (!p.primary && p.device !== "touch") continue;
          const index = items(s).findIndex((_, i) => {
            const r = menuRect(s, i)!;
            return (
              p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
            );
          });
          if (index >= 0) s = { ...s, menuIndex: index };
          if (p.type === "down") starts[p.id] = index;
          if (p.type === "up") {
            if (index >= 0 && starts[p.id] === index) s = confirm(s);
            delete starts[p.id];
          }
        }
        s = { ...s, pointerStarts: starts };
      }
    }
  }
  if (s.screen !== "playing") api.audio.stop(C.CUES.thrust);
  s = {
    ...s,
    pendingFire:
      s.screen === "playing" &&
      (s.pendingFire || (original === "playing" && pressed.a)),
    pendingTorpedo:
      s.screen === "playing" &&
      (s.pendingTorpedo || (original === "playing" && pressed.b)),
  };
  let clock = s.tickClock + dt,
    first = true;
  while (clock + 1e-12 >= C.TICK_DT) {
    s = tick(
      s,
      {
        turn: api.input.value("right") - api.input.value("left"),
        thrust: api.input.value("up") > 0,
        fire:
          original === "playing" &&
          (api.input.value("a") > 0 || (first && s.pendingFire)),
        torpedo: original === "playing" && first && s.pendingTorpedo,
      },
      api,
    );
    s = { ...s, pendingFire: false, pendingTorpedo: false };
    clock -= C.TICK_DT;
    first = false;
  }
  return { ...s, tickClock: Math.max(0, clock) };
}
