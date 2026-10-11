import type { RenderApi } from "@clockwyrks/simple-2d";
import type { State } from "./simulation";
import { delta, items, menuRect } from "./simulation";
import * as C from "./constants";
const ink = "#e0f6ef",
  mint = "#8bf3d4",
  muted = "#738c94",
  gold = "#ffbd72";
function text(
  ctx: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  size = 14,
  color = ink,
  font = "monospace",
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  ctx.fillText(t, x, y);
}
function line(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string | CanvasGradient,
  fill = false,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}
function ship(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a: number,
  scale = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-15, 13);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-15, -13);
  ctx.closePath();
  ctx.fillStyle = "#102e32";
  ctx.fill();
  ctx.strokeStyle = mint;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  line(ctx, 5, 0, -6, 0, ink);
  ctx.restore();
}
function rock(
  ctx: CanvasRenderingContext2D,
  id: number,
  x: number,
  y: number,
  r: number,
  spin: number,
  hp: number,
  max: number,
  flash = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2,
      rr = r * (0.8 + 0.19 * (0.5 + Math.sin(id * 17 + i * 13) * 0.5));
    const xx = Math.cos(a) * rr,
      yy = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.closePath();
  ctx.fillStyle = flash > 0 ? "#e2c0a0" : "#262a2c";
  ctx.fill();
  ctx.strokeStyle = flash > 0 ? ink : "#bb977d";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = "#4a4540";
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.45);
  ctx.lineTo(r * 0.08, -r * 0.2);
  ctx.lineTo(r * 0.45, -r * 0.5);
  ctx.moveTo(r * 0.08, -r * 0.2);
  ctx.lineTo(r * 0.2, r * 0.45);
  ctx.stroke();
  if (hp < max) {
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < max - hp; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, i * r * 0.25);
      ctx.lineTo(-r * 0.12, -r * 0.2 + i * r * 0.2);
      ctx.lineTo(r * 0.1, r * 0.15);
      ctx.lineTo(r * 0.6, r * 0.4 + i * r * 0.15);
      ctx.stroke();
    }
  }
  ctx.restore();
}
function seam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  draw: () => void,
) {
  for (const dx of [
    0,
    ...(x < r ? [C.FIELD_W] : []),
    ...(x > C.FIELD_W - r ? [-C.FIELD_W] : []),
  ])
    for (const dy of [
      0,
      ...(y < r ? [C.FIELD_H] : []),
      ...(y > C.FIELD_H - r ? [-C.FIELD_H] : []),
    ]) {
      ctx.save();
      ctx.translate(dx, dy);
      draw();
      ctx.restore();
    }
}
function star(ctx: CanvasRenderingContext2D) {
  const halo = ctx.createRadialGradient(
    C.STAR_X,
    C.STAR_Y,
    C.CORE_R * 0.7,
    C.STAR_X,
    C.STAR_Y,
    C.HALO_R * 1.5,
  );
  halo.addColorStop(0, "#ffda9c");
  halo.addColorStop(0.2, "#ffb56066");
  halo.addColorStop(0.5, "#d8943020");
  halo.addColorStop(1, "#ad793000");
  circle(ctx, C.STAR_X, C.STAR_Y, C.HALO_R * 1.5, halo, true);
  circle(ctx, C.STAR_X, C.STAR_Y, C.CORE_R, "#ffe5b4", true);
  circle(ctx, C.STAR_X, C.STAR_Y, C.CORE_R + 6, "#e6b46a44");
  ctx.setLineDash([2, 10]);
  circle(ctx, C.STAR_X, C.STAR_Y, C.HALO_R, "#be914322");
  ctx.setLineDash([]);
}
export function render(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 0; i < 190; i++) {
    const x = (i * 719.3 + 31) % C.FIELD_W,
      y = (i * i * 17.7 + 37) % C.FIELD_H;
    ctx.globalAlpha = 0.15 + (i % 5) * 0.1;
    ctx.fillStyle = i % 3 === 0 ? "#a2c4c7" : "#708a9b";
    ctx.fillRect(x, y, i % 13 === 0 ? 2 : 1, i % 13 === 0 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
  line(ctx, 32, 24, 1248, 24, "#283944");
  line(ctx, 32, 696, 1248, 696, "#283944");
  star(ctx);
  const menu = s.screen === "title" || s.screen === "howto";
  if (menu) {
    ctx.save();
    ctx.globalAlpha = 0.65;
    for (const [i, x, y, r] of [
      [1, 1020, 150, 63],
      [2, 900, 550, 44],
      [3, 1170, 410, 28],
      [4, 740, 90, 18],
    ])
      rock(ctx, i, x, y, r, i + s.simTime * 0.025, 3, 3);
    ctx.restore();
  } else {
    for (const r of s.rocks)
      seam(ctx, r.x, r.y, C.ROCK_RADIUS[r.size], () =>
        rock(
          ctx,
          r.id,
          r.x,
          r.y,
          C.ROCK_RADIUS[r.size],
          r.spin,
          r.health,
          C.ROCK_HEALTH[r.size],
          r.flash,
        ),
      );
    for (const b of [...s.bullets, ...s.enemyBullets]) {
      const color = s.enemyBullets.some((e) => e.id === b.id)
        ? "#ff7892"
        : mint;
      seam(
        ctx,
        b.x,
        b.y,
        Math.hypot(b.vx, b.vy) * C.TRAIL_TICKS * C.TICK_DT,
        () => {
          const trail = s.trails[b.id] ?? [];
          let x = b.x,
            y = b.y;
          for (let i = trail.length - 1; i > 0; i--) {
            const d = delta(trail[i], trail[i - 1]);
            ctx.globalAlpha = (i / trail.length) ** 2 * 0.65;
            ctx.lineWidth = 0.5 + (2 * i) / trail.length;
            line(ctx, x, y, x + d.x, y + d.y, color);
            x += d.x;
            y += d.y;
          }
          ctx.globalAlpha = 1;
          circle(ctx, b.x, b.y, C.BULLET_R, color, true);
        },
      );
    }
    for (const t of s.torpedoes)
      seam(ctx, t.x, t.y, 25, () => {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.heading);
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-7, 5);
        ctx.lineTo(-5, -5);
        ctx.closePath();
        ctx.fill();
        line(ctx, -8, 0, -28, 0, "#ffbe7299");
        ctx.restore();
      });
    if (s.saucer) {
      const u = s.saucer;
      seam(ctx, u.x, u.y, 25, () => {
        ctx.strokeStyle = "#ff819e";
        ctx.fillStyle = "#3f2336";
        ctx.beginPath();
        ctx.ellipse(u.x, u.y, 25, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(u.x, u.y - 5, 11, 9, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        for (let i = -1; i <= 1; i++)
          circle(ctx, u.x + i * 13, u.y, 2, "#ffadb9", true);
      });
    }
    if (s.lives > 0) {
      ctx.globalAlpha =
        s.ship.invuln > 0 ? 0.35 + 0.65 * (Math.floor(s.simTime * 10) % 2) : 1;
      seam(ctx, s.ship.x, s.ship.y, 40, () => {
        ship(ctx, s.ship.x, s.ship.y, s.ship.angle);
        if (s.ship.thrusting) {
          ctx.save();
          ctx.translate(s.ship.x, s.ship.y);
          ctx.rotate(s.ship.angle);
          ctx.fillStyle = gold;
          ctx.beginPath();
          ctx.moveTo(-13, -6);
          ctx.lineTo(-33 - 7 * Math.sin(s.simTime * 70), 0);
          ctx.lineTo(-13, 6);
          ctx.fill();
          ctx.restore();
        }
        if (s.ship.invuln > 0) circle(ctx, s.ship.x, s.ship.y, 24, "#8bf3d455");
      });
      ctx.globalAlpha = 1;
    }
    for (const e of s.effects) {
      ctx.globalAlpha = e.life / 0.65;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + e.seed,
          dist = (0.65 - e.life) * (45 + i * 9);
        line(
          ctx,
          e.x + Math.cos(a) * dist,
          e.y + Math.sin(a) * dist,
          e.x + Math.cos(a) * (dist + 6),
          e.y + Math.sin(a) * (dist + 6),
          e.color,
        );
      }
      ctx.globalAlpha = 1;
    }
    text(ctx, "SCORE", 42, 56, 11, muted);
    text(ctx, s.score.toString().padStart(6, "0"), 40, 94, 36);
    for (let i = 0; i < s.lives - 1; i++)
      ship(ctx, 50 + i * 24, 120, C.FACE_UP, 0.48);
    ctx.fillStyle = s.torpedoCharge === 1 ? gold : muted;
    ctx.beginPath();
    ctx.moveTo(49, 139);
    ctx.lineTo(55, 153);
    ctx.lineTo(43, 153);
    ctx.closePath();
    ctx.fill();
    text(ctx, "F / WARHEAD", 65, 155, 10, s.torpedoCharge === 1 ? gold : muted);
    ctx.fillStyle = "#25333a";
    ctx.fillRect(42, 164, 104, 3);
    ctx.fillStyle = gold;
    ctx.fillRect(42, 164, 104 * s.torpedoCharge, 3);
    text(
      ctx,
      `SECTOR ${s.wave.toString().padStart(2, "0")}`,
      1100,
      56,
      14,
      muted,
    );
    text(ctx, `${s.rocks.length} CONTACTS`, 1100, 79, 11, muted);
    text(ctx, "P  PAUSE", 1100, 103, 10, muted);
    if (s.waveBanner > 0) {
      ctx.textAlign = "center";
      text(ctx, `WAVE ${s.wave}`, C.STAR_X, 255, 32);
      ctx.textAlign = "left";
    }
    if (s.extraLifeBanner > 0) {
      ctx.textAlign = "center";
      text(ctx, "EXTRA SHIP", C.STAR_X, 190, 20, mint);
      ctx.textAlign = "left";
    }
  }
  if (s.screen !== "playing") {
    if (!menu) {
      ctx.fillStyle = "#080f18d9";
      ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
    }
    text(ctx, "S H / 01", 110, 103, 12, mint);
    text(
      ctx,
      s.screen === "title"
        ? C.TITLE_TEXT
        : s.screen === "howto"
          ? "FLIGHT MANUAL"
          : s.screen === "paused"
            ? "PAUSED"
            : "SIGNAL LOST",
      106,
      230,
      s.screen === "howto" ? 50 : 84,
      ink,
      "Arial, sans-serif",
    );
    if (s.screen === "title") {
      text(ctx, C.TAGLINE_TEXT, 110, 268, 16, gold);
      text(
        ctx,
        "A field of fragments. A star that bends the fight.",
        110,
        325,
        13,
        muted,
      );
      text(ctx, "WARHEAD EDITION", 1030, 662, 11, gold);
    }
    if (s.screen === "paused")
      text(ctx, "Take a breath. The field can wait.", 110, 290, 15, muted);
    if (s.screen === "gameover") {
      text(
        ctx,
        `FINAL SCORE  ${s.score}   /   WAVE ${s.wave}`,
        110,
        295,
        17,
        gold,
      );
    }
    if (s.screen === "howto") {
      ctx.fillStyle = "#080f18e8";
      ctx.fillRect(95, 275, 1090, 335);
      const rows = [
        [
          "01 / SHATTER THE FIELD",
          "Break every rock, then its fragments, to clear a wave. Armor takes several hits.",
        ],
        [
          "02 / USE THE WELL",
          "The star bends shots and rocks, never your ship. Swallowed rocks return at an edge.",
        ],
        [
          "03 / MAKE IT COUNT",
          "F launches one torpedo. It homes on the nearest target in a narrow forward cone.",
        ],
        [
          "04 / KEEP MOVING",
          "A saucer hunts you. Shoot it down. Momentum carries you; turn and thrust to change course.",
        ],
      ];
      rows.forEach(([a, b], i) => {
        text(ctx, a, 110, 303 + i * 62, 12, mint);
        text(ctx, b, 110, 327 + i * 62, 14, ink);
      });
      text(
        ctx,
        "It flies true through the well, destroys any rock outright, and recharges in ten seconds.",
        110,
        469,
        14,
        ink,
      );
      text(
        ctx,
        "ARROWS / WASD  TURN + THRUST     SPACE  FIRE     F  TORPEDO",
        110,
        576,
        13,
        gold,
      );
      text(
        ctx,
        "ENTER  CONFIRM     ESC / P  PAUSE     M  SOUND",
        110,
        602,
        13,
        gold,
      );
      text(ctx, "ENTER / ESC  RETURN TO MENU", 110, 660, 12, muted);
    } else {
      items(s).forEach((label, i) => {
        const r = menuRect(s, i)!;
        if (s.menuIndex === i) {
          ctx.fillStyle = "#14312f";
          ctx.fillRect(r.x, r.y, r.w, r.h);
          ctx.fillStyle = mint;
          ctx.fillRect(r.x, r.y, 3, r.h);
        }
        text(
          ctx,
          label,
          r.x + 24,
          r.y + 32,
          17,
          s.menuIndex === i ? mint : muted,
        );
        if (s.menuIndex === i)
          text(ctx, "→", r.x + r.w - 35, r.y + 32, 20, mint);
      });
      text(ctx, "↑ ↓  SELECT    ENTER  CONFIRM", 110, 630, 11, muted);
    }
  }
  text(ctx, s.muted ? "M / SOUND OFF" : "M / SOUND ON", 42, 680, 10, muted);
  text(ctx, "SHATTER   /   GRAVITY IS YOUR AMMUNITION", 830, 680, 10, muted);
  ctx.restore();
}
