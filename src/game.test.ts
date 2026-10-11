import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import { debug } from "./debug";
import { initialState, distance, swept } from "./simulation";
import * as C from "./constants";
const engines: ReturnType<
  typeof createEngine<import("./game").ShatterState, typeof debug>
>[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
});
async function harness(ms = 1000 / C.TICK_HZ) {
  const target = new EventTarget();
  const canvas = createCanvas(C.FIELD_W, C.FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    game,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
  engines.push(engine);
  const key = (code: string, down = true) => {
    const e = new Event(down ? "keydown" : "keyup");
    Object.assign(e, { code, repeat: false });
    target.dispatchEvent(e);
  };
  const play = () =>
    engine.apply((s) => ({
      ...s,
      screen: "playing",
      waveSpawning: false,
      saucerSpawning: false,
    }));
  return { engine, key, play, target };
}
describe("engine integration", () => {
  it("initializes complete state, diagnostics and detached snapshot", async () => {
    const { engine } = await harness();
    expect(engine.debug.version).toBe(C.SHATTER_DEBUG_VERSION);
    expect(engine.state).toEqual(initialState());
    const snap = debug.snapshot(engine.state);
    expect(snap.ship.speed).toBe(0);
    expect(snap.torpedoReady).toBe(true);
    expect(engine.diagnostics().every((r) => !r.error)).toBe(true);
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(16);
  });
  it("starts from confirm, waits for banner and places a legal wave", async () => {
    const { engine, key } = await harness();
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.screen).toBe("playing");
    expect(engine.state.rocks).toHaveLength(0);
    await engine.advance(180);
    expect(engine.state.rocks).toHaveLength(C.WAVE_BASE_ROCKS + 1);
    for (const r of engine.state.rocks) {
      expect(distance(r, engine.state.ship)).toBeGreaterThan(295);
      expect(r.health).toBe(C.ROCK_HEALTH.large);
    }
  });
  it("turns, thrusts, applies drag and ignores gravity on the ship", async () => {
    const { engine, key, play } = await harness();
    play();
    key("ArrowRight");
    key("ArrowUp");
    await engine.advance(120);
    expect(engine.state.ship.angle).toBeCloseTo(C.FACE_UP + C.SHIP_TURN);
    expect(
      Math.hypot(engine.state.ship.vx, engine.state.ship.vy),
    ).toBeGreaterThan(50);
    key("ArrowRight", false);
    key("ArrowUp", false);
    engine.apply((s) =>
      debug.setShipPosition(debug.setShipVelocity(s, 100, 0), 100, 100),
    );
    await engine.advance(360);
    expect(engine.state.ship.vx).toBeCloseTo(50, 5);
    expect(engine.state.ship.vy).toBe(0);
  });
  it("fires on press and hold with the exact tick gate and cap", async () => {
    const { engine, key, play } = await harness();
    play();
    engine.apply((s) =>
      debug.setShipAngle(debug.setShipPosition(s, 100, 100), 0),
    );
    key("Space");
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(1);
    await engine.advance(21);
    expect(engine.state.bullets).toHaveLength(1);
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(2);
    await engine.advance(60);
    expect(engine.state.bullets).toHaveLength(C.MAX_BULLETS);
  });
  it("pauses and resumes once per Escape edge", async () => {
    const { engine, key, play } = await harness();
    play();
    engine.apply((s) => debug.addRock(s, "small", 100, 100));
    key("Escape");
    await engine.advance(1);
    const frozen = engine.state;
    await engine.advance(30);
    expect(engine.state.rocks).toEqual(frozen.rocks);
    expect(engine.state.ship).toEqual(frozen.ship);
    expect(engine.state.simTime).toBeGreaterThan(frozen.simTime);
    key("Escape", false);
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("playing");
  });
  it("chips armor without score, then splits with weapon-perpendicular kicks", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) => debug.addRock(s, "large", 200, 100));
    for (let i = 0; i < 3; i++) {
      engine.apply((s) =>
        debug.addBullet(s, s.rocks[0].x, s.rocks[0].y, 520, 0),
      );
      await engine.advance(1);
      if (i < 2) {
        expect(engine.state.score).toBe(0);
        expect(engine.state.rocks[0].health).toBe(2 - i);
        expect(engine.state.rocks[0].flash).toBe(C.HIT_FLASH_TIME);
      }
    }
    expect(engine.state.score).toBe(C.SCORE_LARGE);
    expect(engine.state.rocks.map((r) => r.size)).toEqual(["medium", "medium"]);
    expect(
      Math.abs(engine.state.rocks[0].vy - engine.state.rocks[1].vy),
    ).toBeCloseTo(C.SPLIT_KICK * 2, 2);
  });
  it("torpedo destroys armor outright, scatters axially and recharges", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) =>
      debug.addTorpedo(debug.addRock(s, "large", 200, 100), 200, 100, 0),
    );
    await engine.advance(1);
    expect(engine.state.torpedoes).toHaveLength(0);
    expect(engine.state.score).toBe(C.SCORE_LARGE);
    expect(
      Math.abs(engine.state.rocks[0].vx - engine.state.rocks[1].vx),
    ).toBeCloseTo(C.TORPEDO_SCATTER * 2, 3);
    engine.apply((s) => debug.setTorpedoCharge(debug.clearRocks(s), 0));
    await engine.advance(600);
    expect(engine.state.torpedoCharge).toBeCloseTo(0.5, 8);
    await engine.advance(600);
    expect(engine.state.torpedoCharge).toBe(1);
  });
  it("launches torpedo without ship drift and only on presses", async () => {
    const { engine, key, play } = await harness();
    play();
    engine.apply((s) =>
      debug.setShipAngle(
        debug.setShipVelocity(debug.setShipPosition(s, 100, 100), 200, 0),
        0,
      ),
    );
    key("KeyF");
    await engine.advance(1);
    expect(engine.state.torpedoes[0].vx).toBe(C.TORPEDO_SPEED);
    expect(engine.state.torpedoCharge).toBe(0);
    engine.apply((s) => debug.setTorpedoCharge(debug.clearTorpedoes(s), 1));
    await engine.advance(1);
    expect(engine.state.torpedoes).toHaveLength(0);
  });
  it("guides within forward cone but ignores bodies behind", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) =>
      debug.addTorpedo(debug.addRock(s, "small", 300, 115), 100, 100, 0),
    );
    await engine.advance(1);
    expect(engine.state.torpedoes[0].heading).toBeGreaterThan(0);
    expect(engine.state.torpedoes[0].heading).toBeLessThanOrEqual(
      C.TORPEDO_TURN * C.TICK_DT,
    );
    engine.apply((s) => debug.clearTorpedoes(debug.clearRocks(s)));
    engine.apply((s) =>
      debug.addTorpedo(debug.addRock(s, "small", 50, 100), 100, 100, 0),
    );
    await engine.advance(1);
    expect(engine.state.torpedoes[0].heading).toBe(0);
  });
  it("recycles the same damaged rock with posed edge and speed", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) => debug.addRock(s, "large", C.STAR_X, C.STAR_Y));
    engine.apply((s) =>
      debug.setNextRockSpeed(
        debug.setNextRecycleEdge(
          debug.setRockHealth(s, s.rocks[0].id, 1),
          "top",
        ),
        123,
      ),
    );
    const id = engine.state.rocks[0].id;
    await engine.advance(1);
    expect(engine.state.rocks[0].id).toBe(id);
    expect(engine.state.rocks[0].health).toBe(1);
    expect(engine.state.rocks[0].y).toBe(0);
    expect(
      Math.hypot(engine.state.rocks[0].vx, engine.state.rocks[0].vy),
    ).toBeCloseTo(123);
    expect(engine.state.nextRecycleEdge).toBeNull();
    expect(engine.state.score).toBe(0);
  });
  it("absorbs shots and slides ship without losing lives", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) =>
      debug.addBullet(
        debug.addTorpedo(
          debug.setShipPosition(s, C.STAR_X, C.STAR_Y + 35),
          C.STAR_X,
          C.STAR_Y,
          0,
        ),
        C.STAR_X,
        C.STAR_Y,
        0,
        0,
      ),
    );
    await engine.advance(1);
    expect(engine.state.bullets).toHaveLength(0);
    expect(engine.state.torpedoes).toHaveLength(0);
    expect(
      distance(engine.state.ship, { x: C.STAR_X, y: C.STAR_Y }),
    ).toBeCloseTo(C.CORE_R + C.SHIP_R);
    expect(engine.state.lives).toBe(C.START_LIVES);
  });
  it("loses lives, respawns with grace and ends on last loss", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) => debug.addRock(s, "small", C.SAFE_X, C.SAFE_Y));
    await engine.advance(1);
    expect(engine.state.lives).toBe(2);
    expect(engine.state.ship.invuln).toBe(C.INVULN_TIME);
    await engine.advance(1);
    expect(engine.state.lives).toBe(2);
    engine.apply((s) => debug.setLives(debug.setShipInvuln(s, 0), 1));
    await engine.advance(1);
    expect(engine.state.screen).toBe("gameover");
    expect(engine.state.lives).toBe(0);
  });
  it("does not advance wave on an empty field; advances after destruction", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) => debug.setWaveSpawning(s, true));
    await engine.advance(2);
    expect(engine.state.wave).toBe(0);
    engine.apply((s) =>
      debug.addBullet(debug.addRock(s, "small", 100, 100), 100, 100, 0, 0),
    );
    await engine.advance(1);
    expect(engine.state.wave).toBe(1);
    expect(engine.state.waveBanner).toBe(C.WAVE_BANNER_TIME);
  });
  it("grants an extra life only through scoring", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) => debug.setScore(s, C.EXTRA_LIFE_STEP - 50));
    expect(engine.state.lives).toBe(3);
    engine.apply((s) =>
      debug.addBullet(debug.addRock(s, "small", 100, 100), 100, 100, 0, 0),
    );
    await engine.advance(1);
    expect(engine.state.lives).toBe(4);
    expect(engine.state.extraLifeBanner).toBeGreaterThan(0.5);
  });
  it("saucer consumes posed arrival and shot draws; faculties are independent", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) =>
      debug.setNextSaucerRow(
        debug.setNextSaucerEdge(
          debug.setSaucerDue(debug.setSaucerSpawning(s, true), 0),
          "right",
        ),
        120,
      ),
    );
    await engine.advance(1);
    expect(engine.state.saucer?.vx).toBe(-C.SAUCER_SPEED);
    expect(engine.state.nextSaucerRow).toBeNull();
    engine.apply((s) =>
      debug.setSaucerTravel(
        debug.setSaucerMind(debug.setNextSaucerAim(s, 0), false),
        false,
      ),
    );
    const pos = engine.state.saucer!.x;
    await engine.advance(192);
    expect(engine.state.saucer!.x).toBe(pos);
    expect(engine.state.enemyBullets.length).toBeGreaterThan(0);
    expect(engine.state.nextSaucerAim).toBeNull();
    engine.apply((s) => debug.setSaucerGun(s, false));
    await engine.advance(1500);
    expect(engine.state.saucer).toBeNull();
    expect(engine.state.saucerDue).toBeGreaterThanOrEqual(C.SAUCER_GAP_MIN);
  });
  it("reads menus, howto, mute and restarts", async () => {
    const { engine, key } = await harness();
    key("ArrowUp");
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(1);
    key("Enter");
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    expect(debug.menuItemRect(engine.state, 0)).toBeNull();
    key("Enter", false);
    key("Escape");
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    engine.apply((s) => debug.reset(s));
    expect(engine.state.muted).toBe(true);
  });
  it("has frame-rate independent ticks and immutable input states", async () => {
    const a = await harness(1000 / 60),
      b = await harness(1000 / 60);
    a.play();
    b.play();
    a.engine.apply((s) => debug.addRock(s, "small", 100, 100));
    b.engine.apply((s) => debug.addRock(s, "small", 100, 100));
    const before = JSON.stringify(a.engine.state);
    const held = a.engine.state;
    b.engine.setClock(new SequenceClock([5, 15, 30]));
    await a.engine.advance(30);
    await b.engine.advance(30);
    expect(a.engine.state.rocks[0]).toEqual(b.engine.state.rocks[0]);
    expect(JSON.stringify(held)).toBe(before);
  });
  it("rejects invalid debug arguments and missing ids; reconcile is pure", async () => {
    const { engine } = await harness();
    expect(() => debug.setScore(engine.state, NaN)).toThrow();
    expect(() => debug.removeRock(engine.state, 99)).toThrow();
    expect(() => debug.setScreen(engine.state, "invalid" as never)).toThrow();
    expect(() => debug.setSaucerGun(engine.state, true)).toThrow();
    expect(debug.reconcile(engine.state)).toEqual(engine.state);
  });
  it("poses and reads every entity without mutating the original", async () => {
    const { engine } = await harness();
    const original = engine.state;
    engine.apply((s) =>
      debug.setWaveBanner(
        debug.setWave(debug.setScore(debug.setMenuIndex(s, 1), 75), 6),
        0.9,
      ),
    );
    engine.apply((s) =>
      debug.setNextSaucerAim(
        debug.setNextSaucerRow(debug.setNextSaucerEdge(s, "left"), 50),
        0.1,
      ),
    );
    engine.apply((s) =>
      debug.setShipCollision(
        debug.setFireCooldown(
          debug.setShipInvuln(
            debug.setShipAngle(
              debug.setShipVelocity(debug.setShipPosition(s, 12, 34), 56, 78),
              1.2,
            ),
            1,
          ),
          5,
        ),
        false,
      ),
    );
    expect(debug.snapshot(engine.state).ship.speed).toBeCloseTo(
      Math.hypot(56, 78),
    );
    engine.apply((s) =>
      debug.addBullet(
        debug.addEnemyBullet(
          debug.addRock(s, "medium", 20, 30),
          40,
          50,
          60,
          70,
        ),
        80,
        90,
        100,
        110,
      ),
    );
    engine.apply((s) => debug.setRockVelocity(s, s.rocks[0].id, 120, 130));
    engine.apply((s) =>
      debug.removeBullet(
        debug.removeEnemyBullet(s, s.enemyBullets[0].id),
        s.bullets[0].id,
      ),
    );
    engine.apply((s) => debug.removeRock(s, s.rocks[0].id));
    engine.apply((s) => debug.clearEnemyBullets(debug.clearBullets(s)));
    engine.apply((s) => debug.addSaucer(s, 80, 100));
    engine.apply((s) =>
      debug.setSaucerWeave(debug.setSaucerVelocity(s, 20, 30), -1),
    );
    expect(engine.state.saucer?.weave).toBe(-1);
    engine.apply((s) => debug.removeSaucer(s));
    engine.apply((s) => debug.removeSaucer(s));
    engine.apply((s) => debug.addTorpedo(s, 150, 160, 0));
    engine.apply((s) =>
      debug.setTorpedoHoming(
        debug.setTorpedoHeading(s, s.torpedoes[0].id, 1),
        s.torpedoes[0].id,
        false,
      ),
    );
    expect(engine.state.torpedoes[0].homing).toBe(false);
    expect(engine.state.torpedoes[0].vx).toBeCloseTo(
      Math.cos(1) * C.TORPEDO_SPEED,
    );
    engine.apply((s) => debug.removeTorpedo(s, s.torpedoes[0].id));
    expect(original).toEqual(initialState());
    expect(() => debug.setRockHealth(engine.state, 99, 1)).toThrow();
    expect(() =>
      debug.setNextRecycleEdge(engine.state, "bogus" as never),
    ).toThrow();
  });
  it("confirms pointer clicks only when both edges occupy one menu item", async () => {
    const { engine, target, key } = await harness();
    const pointer = (type: string, x: number, y: number) => {
      const e = new Event(type);
      Object.assign(e, {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
      target.dispatchEvent(e);
    };
    pointer("pointerdown", 150, 400);
    pointer("pointerup", 150, 470);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    key("ArrowUp");
    pointer("pointermove", 150, 470);
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(1);
    pointer("pointerdown", 150, 470);
    await engine.advance(1);
    pointer("pointerup", 150, 470);
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
  });
  it("keeps a brief fire press until a whole tick is available", async () => {
    const { engine, key, play } = await harness(1);
    play();
    engine.apply((s) => debug.setShipPosition(s, 100, 100));
    key("Space");
    await engine.advance(1);
    key("Space", false);
    await engine.advance(8);
    expect(engine.state.bullets).toHaveLength(1);
  });
  it("absorbs enemy bullets, awards saucer kills and renders all screens", async () => {
    const { engine, play } = await harness();
    play();
    engine.apply((s) => debug.addEnemyBullet(s, C.STAR_X, C.STAR_Y, 0, 0));
    await engine.advance(1);
    expect(engine.state.enemyBullets).toHaveLength(0);
    engine.apply((s) =>
      debug.addBullet(
        debug.setSaucerTravel(
          debug.setSaucerMind(
            debug.setSaucerGun(debug.addSaucer(s, 100, 100), false),
            false,
          ),
          false,
        ),
        100,
        100,
        0,
        0,
      ),
    );
    await engine.advance(1);
    expect(engine.state.score).toBe(C.SCORE_SAUCER);
    expect(engine.state.saucer).toBeNull();
    for (const screen of ["paused", "howto", "gameover", "title"] as const) {
      engine.apply((s) => debug.setScreen(s, screen));
      await engine.advance(1);
    }
  });
  it("captures real renderer commands", async () => {
    const { engine } = await harness();
    engine.startRecording();
    await engine.advance(2);
    const rec = engine.stopRecording();
    expect(rec.frames).toHaveLength(2);
    expect(rec.frames[0].ops.length).toBeGreaterThan(100);
  });
});
describe("continuous wrapping geometry", () => {
  it("collides across seams and catches extreme velocity tunneling", () => {
    expect(distance({ x: 2, y: 2 }, { x: 1278, y: 718 })).toBeCloseTo(
      Math.sqrt(32),
    );
    expect(
      swept(
        { x: 100, y: 100, vx: 100000, vy: 0 },
        { x: 500, y: 100, vx: 0, vy: 0 },
        17,
      ),
    ).toBe(true);
    expect(
      swept(
        { x: 2, y: 100, vx: 0, vy: 0 },
        { x: 1278, y: 100, vx: 0, vy: 0 },
        10,
      ),
    ).toBe(true);
  });
});
