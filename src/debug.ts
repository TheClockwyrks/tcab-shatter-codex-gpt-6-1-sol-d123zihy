import type { DeepReadonly } from "ts-essentials";
import type { InitApi } from "@clockwyrks/simple-2d";
import type { ShatterState, Screen, SaucerEdge, FieldEdge } from "./game";
import * as C from "./constants";
import type { RockSize } from "./constants";
import { initialState, makeSaucer, menuRect } from "./simulation";
type State = DeepReadonly<ShatterState>;
const valid = (...values: number[]) => {
  if (values.some((v) => !Number.isFinite(v)))
    throw new Error("Expected finite number");
};
const named = <T extends string>(value: T, choices: readonly string[]) => {
  if (!choices.includes(value)) throw new Error("Unknown name: " + value);
};
const copy = (s: State): ShatterState => ({ ...s });
function snapshot(s: State) {
  const {
    tickClock: _tick,
    nextId: _id,
    trails: _trails,
    effects: _effects,
    extraLifeBanner: _extra,
    pointerStarts: _pointer,
    pendingFire: _fire,
    pendingTorpedo: _torpedo,
    ...base
  } = s;
  return {
    ...base,
    version: C.SHATTER_DEBUG_VERSION,
    ship: { ...s.ship, speed: Math.hypot(s.ship.vx, s.ship.vy) },
    rocks: s.rocks.map(({ spin: _spin, flash: _flash, ...r }) => ({
      ...r,
      radius: C.ROCK_RADIUS[r.size],
    })),
    bullets: s.bullets.map((b) => ({ ...b })),
    enemyBullets: s.enemyBullets.map((b) => ({ ...b })),
    saucer: s.saucer ? { ...s.saucer } : null,
    torpedoes: s.torpedoes.map((t) => ({ ...t })),
    torpedoReady: s.torpedoCharge === 1,
  };
}
export const debug = {
  version: C.SHATTER_DEBUG_VERSION,
  reset: (s: State): ShatterState => initialState(s.muted),
  snapshot,
  reconcile: copy,
  menuItemRect: menuRect,
  setScreen: (s: State, v: Screen): ShatterState => {
    named(v, ["title", "howto", "playing", "paused", "gameover"]);
    return { ...s, screen: v };
  },
  setMenuIndex: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, menuIndex: v };
  },
  setScore: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, score: v };
  },
  setLives: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, lives: v };
  },
  setWave: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, wave: v };
  },
  setWaveBanner: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, waveBanner: v };
  },
  setWaveSpawning: (s: State, v: boolean): ShatterState => {
    return { ...s, waveSpawning: v };
  },
  setSaucerSpawning: (s: State, v: boolean): ShatterState => {
    return { ...s, saucerSpawning: v };
  },
  setSaucerDue: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, saucerDue: v };
  },
  setNextSaucerEdge: (s: State, v: SaucerEdge): ShatterState => {
    named(v, ["left", "right"]);
    return { ...s, nextSaucerEdge: v };
  },
  setNextSaucerRow: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, nextSaucerRow: v };
  },
  setNextSaucerAim: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, nextSaucerAim: v };
  },
  setNextRockSpeed: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, nextRockSpeed: v };
  },
  setNextRecycleEdge: (s: State, v: FieldEdge): ShatterState => {
    named(v, ["top", "bottom", "left", "right"]);
    return { ...s, nextRecycleEdge: v };
  },
  setTorpedoCharge: (s: State, v: number): ShatterState => {
    valid(v);
    return { ...s, torpedoCharge: v };
  },
  setShipPosition: (s: State, x: number, y: number): ShatterState => {
    valid(x, y);
    return { ...s, ship: { ...s.ship, x, y } };
  },
  setShipVelocity: (s: State, vx: number, vy: number): ShatterState => {
    valid(vx, vy);
    return { ...s, ship: { ...s.ship, vx, vy } };
  },
  setShipAngle: (s: State, angle: number): ShatterState => {
    valid(angle);
    return { ...s, ship: { ...s.ship, angle } };
  },
  setShipInvuln: (s: State, invuln: number): ShatterState => {
    valid(invuln);
    return { ...s, ship: { ...s.ship, invuln } };
  },
  setFireCooldown: (s: State, fireCooldown: number): ShatterState => {
    valid(fireCooldown);
    return { ...s, ship: { ...s.ship, fireCooldown } };
  },
  setShipCollision: (s: State, collision: boolean): ShatterState => {
    return { ...s, ship: { ...s.ship, collision } };
  },
  addBullet: (
    s: State,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState => {
    valid(x, y, vx, vy);
    return {
      ...s,
      bullets: [
        ...s.bullets,
        { id: s.nextId, x, y, vx, vy, life: C.BULLET_LIFE },
      ],
      nextId: s.nextId + 1,
    };
  },
  addEnemyBullet: (
    s: State,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState => {
    valid(x, y, vx, vy);
    return {
      ...s,
      enemyBullets: [
        ...s.enemyBullets,
        { id: s.nextId, x, y, vx, vy, life: C.SAUCER_BULLET_LIFE },
      ],
      nextId: s.nextId + 1,
    };
  },
  removeBullet: (s: State, id: number): ShatterState => {
    valid(id);
    if (!s.bullets.some((e) => e.id === id)) throw new Error("Unknown id");
    return { ...s, bullets: s.bullets.filter((e) => e.id !== id) };
  },
  clearBullets: (s: State): ShatterState => ({ ...s, bullets: [] }),
  removeEnemyBullet: (s: State, id: number): ShatterState => {
    valid(id);
    if (!s.enemyBullets.some((e) => e.id === id)) throw new Error("Unknown id");
    return { ...s, enemyBullets: s.enemyBullets.filter((e) => e.id !== id) };
  },
  clearEnemyBullets: (s: State): ShatterState => ({ ...s, enemyBullets: [] }),
  removeRock: (s: State, id: number): ShatterState => {
    valid(id);
    if (!s.rocks.some((e) => e.id === id)) throw new Error("Unknown id");
    return { ...s, rocks: s.rocks.filter((e) => e.id !== id) };
  },
  clearRocks: (s: State): ShatterState => ({ ...s, rocks: [] }),
  removeTorpedo: (s: State, id: number): ShatterState => {
    valid(id);
    if (!s.torpedoes.some((e) => e.id === id)) throw new Error("Unknown id");
    return { ...s, torpedoes: s.torpedoes.filter((e) => e.id !== id) };
  },
  clearTorpedoes: (s: State): ShatterState => ({ ...s, torpedoes: [] }),
  addRock: (s: State, size: RockSize, x: number, y: number): ShatterState => {
    valid(x, y);
    named(size, ["large", "medium", "small"]);
    return {
      ...s,
      rocks: [
        ...s.rocks,
        {
          id: s.nextId,
          size,
          x,
          y,
          vx: 0,
          vy: 0,
          health: C.ROCK_HEALTH[size],
          spin: 0,
          flash: 0,
        },
      ],
      nextId: s.nextId + 1,
    };
  },
  setRockVelocity: (
    s: State,
    id: number,
    vx: number,
    vy: number,
  ): ShatterState => {
    valid(id, vx, vy);
    if (!s.rocks.some((r) => r.id === id)) throw new Error("Unknown id");
    return {
      ...s,
      rocks: s.rocks.map((r) => (r.id === id ? { ...r, vx, vy } : r)),
    };
  },
  setRockHealth: (s: State, id: number, health: number): ShatterState => {
    valid(id, health);
    const r = s.rocks.find((r) => r.id === id);
    if (
      !r ||
      !Number.isInteger(health) ||
      health < 1 ||
      health > C.ROCK_HEALTH[r.size]
    )
      throw new Error("Invalid health or id");
    return {
      ...s,
      rocks: s.rocks.map((r) => (r.id === id ? { ...r, health } : r)),
    };
  },
  addSaucer: (s: State, x: number, y: number): ShatterState => {
    valid(x, y);
    return { ...s, saucer: makeSaucer(s.nextId, x, y), nextId: s.nextId + 1 };
  },
  removeSaucer: (s: State): ShatterState => ({ ...s, saucer: null }),
  setSaucerVelocity: (s: State, vx: number, vy: number): ShatterState => {
    valid(vx, vy);
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, vx, vy } };
  },
  setSaucerWeave: (s: State, weave: 1 | -1): ShatterState => {
    if (weave !== 1 && weave !== -1) throw new Error("Invalid weave");
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, weave } };
  },
  setSaucerMind: (s: State, mind: boolean): ShatterState => {
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, mind } };
  },
  setSaucerGun: (s: State, gun: boolean): ShatterState => {
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, gun } };
  },
  setSaucerTravel: (s: State, travel: boolean): ShatterState => {
    if (!s.saucer) throw new Error("No saucer");
    return { ...s, saucer: { ...s.saucer, travel } };
  },
  addTorpedo: (
    s: State,
    x: number,
    y: number,
    heading: number,
  ): ShatterState => {
    valid(x, y, heading);
    return {
      ...s,
      torpedoes: [
        ...s.torpedoes,
        {
          id: s.nextId,
          x,
          y,
          heading,
          vx: Math.cos(heading) * C.TORPEDO_SPEED,
          vy: Math.sin(heading) * C.TORPEDO_SPEED,
          life: C.TORPEDO_LIFE,
          homing: true,
        },
      ],
      nextId: s.nextId + 1,
    };
  },
  setTorpedoHeading: (s: State, id: number, heading: number): ShatterState => {
    valid(id, heading);
    if (!s.torpedoes.some((t) => t.id === id)) throw new Error("Unknown id");
    return {
      ...s,
      torpedoes: s.torpedoes.map((t) =>
        t.id === id
          ? {
              ...t,
              heading,
              vx: Math.cos(heading) * C.TORPEDO_SPEED,
              vy: Math.sin(heading) * C.TORPEDO_SPEED,
            }
          : t,
      ),
    };
  },
  setTorpedoHoming: (s: State, id: number, homing: boolean): ShatterState => {
    valid(id);
    if (!s.torpedoes.some((t) => t.id === id)) throw new Error("Unknown id");
    return {
      ...s,
      torpedoes: s.torpedoes.map((t) => (t.id === id ? { ...t, homing } : t)),
    };
  },
};
export type ShatterDebugApi = typeof debug;
export function register(api: InitApi<ShatterState>) {
  for (const action of C.ACTIONS)
    api.input.register(action, C.BINDINGS[action]);
  const sounds = [
    { freq: 900, freqTo: 160, durationMs: 90, gain: 0.08 },
    { freq: 110, freqTo: 25, durationMs: 240, gain: 0.2 },
    { freq: 45, durationMs: 100, gain: 0.035 },
    { freq: 380, freqTo: 720, durationMs: 250, gain: 0.08 },
    { freq: 190, freqTo: 20, durationMs: 400, gain: 0.17 },
    { freq: 740, freqTo: 1200, durationMs: 350, gain: 0.12 },
  ];
  Object.values(C.CUES).forEach((cue, i) =>
    api.audio.define(cue, {
      ...sounds[i],
      wave: i === 1 || i === 2 ? "sawtooth" : "triangle",
    }),
  );
  for (const name of [
    "screen",
    "score",
    "lives",
    "wave",
    "simTime",
    "torpedoCharge",
  ] as const)
    api.diagnostics.register(name, (s) => s[name]);
  api.diagnostics.register(
    "ship.position",
    (s) => `${s.ship.x.toFixed(1)}, ${s.ship.y.toFixed(1)}`,
  );
  api.diagnostics.register(
    "ship.velocity",
    (s) => `${s.ship.vx.toFixed(1)}, ${s.ship.vy.toFixed(1)}`,
  );
  api.diagnostics.register("ship.speed", (s) =>
    Math.hypot(s.ship.vx, s.ship.vy),
  );
  api.diagnostics.register("ship.angle", (s) => s.ship.angle);
  api.diagnostics.register("ship.invuln", (s) => s.ship.invuln);
  for (const name of ["bullets", "rocks", "torpedoes"] as const)
    api.diagnostics.register(name, (s) => s[name].length);
  api.diagnostics.register("saucer", (s) => s.saucer !== null);
  api.diagnostics.register("saucer.position", (s) =>
    s.saucer ? `${s.saucer.x.toFixed(1)}, ${s.saucer.y.toFixed(1)}` : "none",
  );
}
