import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { glCamera } from "../../kit/gl.mjs";
import { tubePieces, tubeSvg } from "../../kit/tube.mjs";
import { kitScript, glScript } from "../../scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--dark") ? "dark" : "light";

// World units: 6 per metre. The bore's axis runs along x at y = 0, z = ZC.
const U = 7.5;
const W = 760;
const H = 430;
const AZIMUTH = 60;
const ELEVATION = 34;

const RI = (M.TUNNEL.inner / 2) * U; // 35.5
const RO = (M.TUNNEL.bore / 2) * U; // 39.6
const ZC = RO + 1.4 * U;
const YC = 2.9 * U; // near cut: everything with y > YC is cut away
const ZT = 4.2 * U; // top cut, above the axis
const LOW = [-2.4 * U, -1.9 * U]; // lower deck slab, below and top, relative to the axis
const UPP = [0.65 * U, 1.15 * U];
const CLEAR = 2.55 * U;
const X0 = -132; // the motorway section, cut open
const X1 = 132;
const XL = -198; // left closed bore starts at the intake chamber
const XR = 188; // right closed bore ends in the outlet structure
const YU = -0.5 * U; // stepped cut: the upper deck is cut back further to show the lower one
const BULK = 0.8 * U;
const HINGE = -3.65 * U;
const LEAF = 2 * 3.65 * U;
const LEAF_T = 0.4 * U;
const RING = 1.7 * U; // lining ring width
const wAt = (zr, r = RI) => Math.sqrt(Math.max(0, r * r - zr * zr));
const ZB = -Math.sqrt(RI * RI - YC * YC); // bottom of the cut opening, relative
const ZBO = -Math.sqrt(RO * RO - YC * YC);
const WT = wAt(ZT);
const WTO = wAt(ZT, RO);

const BASE = { x: -322, y: -196, w: 644, d: 276, r: 12 };
const BASE_H = 14;
const FOOT_H = 6;
const RIVER = { x0: -312, x1: -150, y0: -184, y1: -82, bed: 3, wall: 30 };
const CHAMBER = { x: -240, y: -77, w: XL + 2 + 240, d: 136, r: 2 };
const CHAMBER_TOP = ZC + RO + 7;
const OUTLET = { x: XR - 2, y: -77, w: 34, d: 136, r: 2 };
const OUTLET_TOP = ZC + RO + 7;
const POND = { x: 132, y: -188, w: 180, d: 106, r: 4 };
const POND_FLOOR = 3;
const POND_WALL = 34;
const POND_T = 5;

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), [-300, -46, CHAMBER_TOP + 20], [XR + 30, 40, OUTLET_TOP], [-150, 0, ZC + RO]],
  W,
  H,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0.5) => k.slabOf(plan, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const along = (x) => G.frameOf([x, 0, ZC], [1, 0, 0], [0, 1, 0], [0, 0, 1]); // u = y, v = z (relative)
const pathOf3 = (points, closed = true) => k.pathOf(points.map(at), closed);
const shadeOf = (normal) => Math.min(3, G.toneOf(normal, P));

// A flat face of any polygon, shaded by its normal like the kit's sides.
function faceSvg(points, normal, { tone = "mid", inner = "", top = false, className } = {}) {
  const d = pathOf3(points);
  const fill = top ? `<path class="iso-top" d="${d}"/>` : `<path class="iso-shade" data-shade="${shadeOf(normal)}" d="${d}"/>`;
  return `<g class="iso-solid${className ? ` ${className}` : ""}"><path class="iso-fill" d="${d}"/>${fill}${inner}<path class="iso-line iso-edge" data-tone="${tone}" d="${d}"/></g>`;
}

// Closed outlines on vertical faces: doors, vent slots, hatches. A face at y = const facing +y, or x = const facing +x.
const onFaceY = (y, pts) => pathOf3(pts.map(([x, z]) => [x, y + 0.05, z]));
const onFaceX = (x, pts) => pathOf3(pts.map(([y, z]) => [x + 0.05, y, z]));
const rect = (a0, a1, z0, z1) => [[a0, z0], [a1, z0], [a1, z1], [a0, z1]];
function furnish(box, top) {
  // A door with a kick plate on the +y face, vent slots high on it, and a ladder up the +x face.
  const yF = box.y + box.d;
  const xF = box.x + box.w;
  const out = [];
  const dx = box.x + 7;
  out.push(Ln(onFaceY(yF, rect(dx, dx + 9, 0.2, 16)) + onFaceY(yF, rect(dx + 1, dx + 8, 1.2, 3.4)), { tone: "lo" }));
  out.push(Dots([at([dx + 7.6, yF + 0.05, 8.5])], { size: 0.5 }));
  const slots = [];
  for (let i = 0; i < 5; i++) slots.push(onFaceY(yF, rect(box.x + 24 + i * 4, box.x + 25.6 + i * 4, top - 16, top - 7)));
  out.push(Ln(slots.join(""), { tone: "lo" }));
  const ly = box.y + box.d - 22;
  const rungs = [];
  for (let z = 4; z < top - 1; z += 4) rungs.push(k.segment([xF + 0.05, ly - 3, z], [xF + 0.05, ly + 3, z], P));
  out.push(Ln(k.segment([xF + 0.05, ly - 3, 0], [xF + 0.05, ly - 3, top], P) + k.segment([xF + 0.05, ly + 3, 0], [xF + 0.05, ly + 3, top], P), { tone: "mid" }));
  out.push(Ln(rungs.join(""), { tone: "lo" }));
  return out.join("");
}

const back = [];
const mid = [];
const front = [];

// ---------------------------------------------------------------- base plate
back.push(`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`);
for (const [x, y] of byDepth([...k.corners(BASE, 26), [BASE.x + BASE.w / 2, BASE.y + 26], [BASE.x + BASE.w / 2, BASE.y + BASE.d - 26]])) {
  back.push(S(k.cylinder(x, y, 10, -BASE_H - FOOT_H, 2, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 8, -BASE_H - FOOT_H + 2, FOOT_H - 2, P, 28), { tone: "mid" }));
}
back.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.6), { tone: "mid" }));
back.push(Ln(k.planOutline(k.insetPlan(BASE, 6), 0, P), { tone: "lo" }));
const BASE_SCREWS = k.corners(BASE, 14);
back.push(Ln(BASE_SCREWS.map(([x, y]) => k.ring(x, y, 2.8, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(BASE_SCREWS.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
const SIDE = k.sideTicks(BASE.x + 30, BASE.x + BASE.w - 30, 6, 5, BASE.y + BASE.d, 0, [2.4, 4.6], P, "x");
back.push(Ln(SIDE.minor, { tone: "lo" }), Ln(SIDE.major, { tone: "mid" }));
// Ruler strip along the near edge: one tick a metre, a long one every 5 m, true to the cross-section scale.
const STRIP = { x: -150, y: BASE.y + BASE.d - 17, w: 300, d: 8, r: 1 };
back.push(S(k.slabOf(STRIP, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
const TICKS = k.topTicks(STRIP.x + 4.5, STRIP.x + STRIP.w - 4.5, U, 5, STRIP.y + 0.9, 0.8, [2.2, 4.4], P);
back.push(Ln(TICKS.minor, { tone: "lo" }), Ln(TICKS.major, { tone: "mid" }));
back.push(Dots([at([STRIP.x + 2.2, STRIP.y + 4, 0.8]), at([STRIP.x + STRIP.w - 2.2, STRIP.y + 4, 0.8])], { size: 0.45 }));
// Label plate with an engraved name and three rule lines.
const LABEL = { x: 232, y: BASE.y + BASE.d - 40, w: 76, d: 24, r: 1.5 };
back.push(S(k.slabOf(LABEL, 0, 1, P, 3), { tone: "mid" }));
back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.8), 1, P), { tone: "faint" }));
back.push(k.faceTextSvg(k.topMatrix([LABEL.x + 6, LABEL.y + 9.5], 1, P, "x"), "SMART · KL 2007", { size: 4.4, tone: "lo" }));
back.push(Ln([0, 1, 2].map((row) => k.onTop([[LABEL.x + 6, LABEL.y + 13.5 + row * 2.6], [LABEL.x + [62, 48, 34][row], LABEL.y + 13.5 + row * 2.6]], 1, P)).join(""), { tone: "lo", free: true }));
back.push(Dots([at([LABEL.x + 2.8, LABEL.y + LABEL.d / 2, 1]), at([LABEL.x + LABEL.w - 2.8, LABEL.y + LABEL.d / 2, 1])], { size: 0.45 }));

// ---------------------------------------------------------------- river (behind the intake), flowing +x
// A concrete channel: bed, far wall with a staff gauge on its inner face; the near wall is drawn over the water.
const R = RIVER;
back.push(S(slab({ x: R.x0, y: R.y0 - 6, w: R.x1 - R.x0, d: R.y1 - R.y0 + 12, r: 1 }, 0, R.bed, 2, 0.4), { tone: "lo" }));
back.push(S(slab({ x: R.x0, y: R.y0 - 6, w: R.x1 - R.x0, d: 6, r: 1 }, R.bed, R.wall, 2, 0.6), { tone: "mid", inner: Ln(k.sideSeam({ x: R.x0, y: R.y0 - 6, w: R.x1 - R.x0, d: 6, r: 1 }, R.bed + 15, P, 2), { tone: "faint" }) }));
function staff(x, y, z0, z1) {
  // A staff gauge board on a wall face that faces +y: a tick every 2 units, long ticks every 10.
  const out = [faceSvg([[x - 3, y, z0], [x + 3, y, z0], [x + 3, y, z1], [x - 3, y, z1]], [0, 1, 0], { tone: "lo" })];
  const ticks = [];
  for (let z = z1 - 2, i = 0; z > z0 + 1; z -= 2, i++) ticks.push(k.segment([x - 3, y + 0.1, z], [x + (i % 5 === 0 ? 2.4 : -0.6), y + 0.1, z], P));
  out.push(Ln(ticks.join(""), { tone: "mid" }));
  return out.join("");
}
back.push(staff(R.x0 + 40, R.y0 + 0.2, R.bed, R.bed + R.wall - 2));

// ---------------------------------------------------------------- pond (Taman Desa), behind the outlet
const PO = POND;
back.push(S(slab(PO, 0, POND_FLOOR, 3, 0.5), { tone: "lo" }));
back.push(S(slab({ x: PO.x, y: PO.y, w: PO.w, d: POND_T, r: 1 }, POND_FLOOR, POND_WALL, 2, 0.6), { tone: "mid" }));
back.push(S(slab({ x: PO.x, y: PO.y, w: POND_T, d: PO.d, r: 1 }, POND_FLOOR, POND_WALL, 2, 0.6), { tone: "mid" }));
back.push(staff(PO.x + 70, PO.y + POND_T + 0.2, POND_FLOOR, POND_FLOOR + POND_WALL - 3));
// Outfall culvert to the Kerayong river in the far wall, and the inlet culvert from the outlet structure.
const culvert = (x, y, w, h) => faceSvg([[x - w / 2, y, POND_FLOOR], [x + w / 2, y, POND_FLOOR], [x + w / 2, y, POND_FLOOR + h], [x - w / 2, y, POND_FLOOR + h]], [0, 1, 0], { tone: "lo", className: "st-void" });
back.push(culvert(PO.x + PO.w - 34, PO.y + POND_T + 0.1, 18, 12));

// ---------------------------------------------------------------- cradles
const CRADLES = [-170, -112, -44, 24, 92, 160];
const cradle = (x) => {
  const plan = { x: x - 6, y: -RO * 0.42, w: 12, d: RO * 0.84, r: 1 };
  const top = ZC - RO;
  return (
    S(slab({ x: x - 9, y: -RO * 0.42 - 5, w: 18, d: RO * 0.84 + 10, r: 1.2 }, 0, 2.4, 2, 0.5), { tone: "lo" }) +
    S(slab(plan, 2.4, top - 2.4, 2, 0.5), { tone: "mid" }) +
    Dots([-1, 1].flatMap((sx) => [-1, 1].map((sy) => at([x + sx * 6.6, sy * (RO * 0.42 + 2.5), 2.4]))), { size: 0.45 })
  );
};
for (const x of CRADLES.filter((x) => x < X1)) mid.push(cradle(x));

// ---------------------------------------------------------------- intake chamber and its diversion gate
// River near wall first, then the chamber; its lift gate stands in the river-side wall and rises to divert.
mid.push(S(slab({ x: R.x0, y: R.y1, w: R.x1 - R.x0, d: 5, r: 1 }, R.bed, R.wall, 2, 0.5), { tone: "mid", inner: Ln(k.sideSeam({ x: R.x0, y: R.y1, w: R.x1 - R.x0, d: 5, r: 1 }, R.bed + 15, P, 2), { tone: "faint" }) }));
mid.push(`<path class="iso-halo" d="${k.haloOf(CHAMBER, 0, 4, P)}" style="opacity:.5"/>`);
mid.push(S(slab(CHAMBER, 0, CHAMBER_TOP, 3, 0.8), { tone: "mid", inner: Ln(k.sideSeam(CHAMBER, 32, P, 3) + k.sideSeam(CHAMBER, 64, P, 3), { tone: "faint" }) }));
mid.push(Ln(k.planOutline(k.insetPlan(CHAMBER, 3), CHAMBER_TOP, P, 3), { tone: "faint" }));
mid.push(furnish(CHAMBER, CHAMBER_TOP));
mid.push(Ln(k.planOutline({ x: CHAMBER.x + 10, y: CHAMBER.y + CHAMBER.d - 26, w: 14, d: 14, r: 0.6 }, CHAMBER_TOP, P, 2) + k.planOutline({ x: CHAMBER.x + 11.5, y: CHAMBER.y + CHAMBER.d - 24.5, w: 11, d: 11, r: 0.4 }, CHAMBER_TOP, P, 2), { tone: "lo" }));
const GATE_Y = CHAMBER.y + 7;
const GATE_X = [CHAMBER.x + 12, CHAMBER.x + CHAMBER.w - 12];
const GATE_H = 30;
const GATE_PLAN = { x: GATE_X[0], y: GATE_Y - 1.4, w: GATE_X[1] - GATE_X[0], d: 2.8, r: 0.3 };
mid.push(`<path class="st-void" d="${k.planOutline({ x: GATE_X[0] - 1, y: GATE_Y - 2.6, w: GATE_X[1] - GATE_X[0] + 2, d: 5.2, r: 0.4 }, CHAMBER_TOP, P, 2)}"/>`);
mid.push(S(slab({ x: GATE_X[0] - 5, y: GATE_Y - 3, w: 4, d: 6, r: 0.6 }, CHAMBER_TOP, 36, 2, 0.4), { tone: "mid" }));
mid.push(`<g data-part="liftgate"></g>`);
mid.push(S(slab({ x: GATE_X[1] + 1, y: GATE_Y - 3, w: 4, d: 6, r: 0.6 }, CHAMBER_TOP, 36, 2, 0.4), { tone: "mid" }));
const HOIST = { x: GATE_X[0] - 7, y: GATE_Y - 6, w: GATE_X[1] - GATE_X[0] + 14, d: 12, r: 1 };
mid.push(S(slab(HOIST, CHAMBER_TOP + 36, 4, 2, 0.5), { tone: "mid" }));
mid.push(S(slab({ x: (GATE_X[0] + GATE_X[1]) / 2 - 7, y: GATE_Y - 4, w: 14, d: 8, r: 1 }, CHAMBER_TOP + 40, 7, 2, 0.5), { tone: "mid" }));
mid.push(Dots([[HOIST.x + 3, HOIST.y + 3], [HOIST.x + HOIST.w - 3, HOIST.y + 3], [HOIST.x + 3, HOIST.y + HOIST.d - 3], [HOIST.x + HOIST.w - 3, HOIST.y + HOIST.d - 3]].map(([x, y]) => at([x, y, CHAMBER_TOP + 40])), { size: 0.45 }));
// Handrail along the chamber roof's near edge.
{
  const y = CHAMBER.y + CHAMBER.d - 3;
  const xs = [];
  for (let x = CHAMBER.x + 5; x <= CHAMBER.x + CHAMBER.w - 5; x += 11) xs.push(x);
  mid.push(Ln(xs.map((x) => k.rise([x, y], CHAMBER_TOP, CHAMBER_TOP + 7, P)).join("") + k.segment([xs[0], y, CHAMBER_TOP + 7], [xs[xs.length - 1], y, CHAMBER_TOP + 7], P), { tone: "mid" }));
}

// ---------------------------------------------------------------- the left closed bore
function closedBore(x0, x1, endCap) {
  const F = G.frameOf([x0, 0, ZC], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const L = x1 - x0;
  const out = [S(G.solidOf([[0, RO], [L, RO]], F, P), { tone: "mid", inner: Ln(Array.from({ length: Math.floor(L / RING) }, (_, i) => G.arcOf(F, (i + 1) * RING, RO, P)).join(""), { tone: "faint" }) })];
  out.push(Dots(Array.from({ length: Math.floor(L / RING) }, (_, i) => G.dotsOf(F, (i + 0.5) * RING, RO, 6, P, { phase: (i % 2) * 0.5, fade: [0.04, 0.42] })).flat(), { size: 0.5, tone: "lo" }));
  if (endCap) out.push(`<path class="st-void" d="${G.circleOf(F, L, RI, P, 96)}"/>`, Ln(G.circleOf(F, L, RI, P, 96), { tone: "lo" }));
  return out.join("");
}
mid.push(closedBore(XL, X0, true));

// ---------------------------------------------------------------- inside the cut section: the lining
const PHI_A = Math.atan2(ZT, -WT);
const PHI_B = 2 * Math.PI + Math.atan2(ZB, YC);
const onBore = (x, phi, r = RI) => [x, r * Math.cos(phi), ZC + r * Math.sin(phi)];
{
  const N = 64;
  const strips = [];
  for (let i = 0; i < N; i++) {
    const a = PHI_A + ((PHI_B - PHI_A) * i) / N;
    const b = PHI_A + ((PHI_B - PHI_A) * (i + 1)) / N;
    const m = (a + b) / 2;
    const normal = [0, -Math.cos(m), -Math.sin(m)];
    strips.push({ d: pathOf3([onBore(X0, a), onBore(X1, a), onBore(X1, b), onBore(X0, b)]), shade: shadeOf(normal) });
  }
  const all = pathOf3([...Array.from({ length: N + 1 }, (_, i) => onBore(X0, PHI_A + ((PHI_B - PHI_A) * i) / N)), ...Array.from({ length: N + 1 }, (_, i) => onBore(X1, PHI_B - ((PHI_B - PHI_A) * i) / N))]);
  const byShade = [0, 1, 2, 3].map((s) => strips.filter((t) => t.shade === s).map((t) => t.d).join(""));
  const joints = [];
  for (let x = X0 + RING; x < X1; x += RING) joints.push(k.pathOf(Array.from({ length: 49 }, (_, i) => at(onBore(x, PHI_A + ((PHI_B - PHI_A) * i) / 48))), false));
  // Longitudinal joints between the segments of each ring.
  const seams = [3, 7].map((j) => k.pathOf([at(onBore(X0, PHI_A + ((PHI_B - PHI_A) * j) / 10)), at(onBore(X1, PHI_A + ((PHI_B - PHI_A) * j) / 10))]));
  mid.push(`<g class="iso-solid st-bore"><path class="iso-fill" d="${all}"/>${byShade.map((d, s) => (d ? `<path class="iso-shade" data-shade="${s}" d="${d}"/>` : "")).join("")}${Ln(joints.join("") + seams.join(""), { tone: "faint" })}</g>`);
}

// Wall fittings: cable trays and lamps along the far wall over each deck, and corbels under the decks.
const wallAt = (zr) => -wAt(zr);
function tray(zr, x0 = X0 + BULK, x1 = X1) {
  const y = wallAt(zr) + 2.2;
  const route = [[x0, y, ZC + zr], [x1, y, ZC + zr]];
  return tubePieces(route, 1.1, P, { maxLength: 400, caps: [false, false] }).map((piece) => tubeSvg(piece, { tone: "lo" })).join("");
}
function lamps(zr) {
  const out = [];
  const y = wallAt(zr);
  for (let x = X0 + 22; x < X1 - 8; x += 24) {
    out.push(S(slab({ x: x - 4, y, w: 8, d: 1.6, r: 0.4 }, ZC + zr - 1.2, 2.4, 2), { tone: "mid", crease: "none" }));
  }
  return out.join("");
}
function corbels(zr) {
  const out = [];
  for (let x = X0 + 14; x < X1; x += 30) {
    const y = wallAt(zr - 4);
    out.push(S(slab({ x: x - 3, y: y - 1, w: 6, d: 5, r: 0.5 }, ZC + zr - 5, 5, 2), { tone: "mid", crease: "none" }));
  }
  return out.join("");
}
mid.push(corbels(LOW[0]));
mid.push(tray(LOW[0] - 6));

// Ramp portals in the far wall: where each deck's traffic leaves the bore for the surface.
const PORTAL_UP = [
  [X0 + 26, X0 + 74],
  [X1 - 74, X1 - 26],
];
function portal([xa, xb], zr0, zr1) {
  const n = 12;
  const left = Array.from({ length: n + 1 }, (_, i) => {
    const zr = zr0 + ((zr1 - zr0) * i) / n;
    return [xa, wallAt(zr), ZC + zr];
  });
  const right = left.map(([, y, z]) => [xb, y, z]).reverse();
  const d = pathOf3([...left, ...right]);
  return `<path class="st-void" d="${d}"/>` + Ln(d, { tone: "lo" });
}

// ---------------------------------------------------------------- decks
const deckPlan = (zr, yEnd) => ({ x: X0 + BULK, y: -wAt(zr), w: X1 - X0 - BULK, d: wAt(zr) + yEnd, r: 0 });
function deck(slabZ, yEnd) {
  const plan = deckPlan(slabZ[1], yEnd);
  const top = ZC + slabZ[1];
  const out = [S(slab(plan, ZC + slabZ[0], slabZ[1] - slabZ[0], 1, 0.4), { tone: "mid", crease: "lo" })];
  // Emergency walkway along the far wall, kerb, and the lane line.
  const walk = { x: plan.x, y: plan.y, w: plan.w, d: 1.1 * U, r: 0 };
  out.push(S(slab(walk, top, 0.25 * U, 1, 0.3), { tone: "mid", crease: "none" }));
  if (yEnd > 0) {
    out.push(Ln(k.lineOnTop([plan.x, 0], [X1, 0], top, P), { tone: "lo", dashed: true }));
    out.push(Dots(Array.from({ length: Math.floor((X1 - plan.x) / 18) }, (_, i) => at([plan.x + 9 + i * 18, YC - 0.6 * U, top])), { size: 0.45, tone: "mid" }));
    out.push(Ln(k.lineOnTop([plan.x, YC - 0.6 * U], [X1, YC - 0.6 * U], top, P), { tone: "faint" }));
  }
  // Expansion joints across the carriageway, wall to cut edge.
  const joints = [];
  for (let x = plan.x + 40; x < X1 - 10; x += 52) joints.push(k.lineOnTop([x, plan.y + 1.1 * U], [x, yEnd], top, P));
  out.push(Ln(joints.join(""), { tone: "faint" }));
  // Handrail on the walkway's edge: posts from the walkway up to a rail.
  const ry = plan.y + 1.1 * U - 0.6;
  const wz = top + 0.25 * U;
  const posts = [];
  for (let x = plan.x + 6; x < X1; x += 12) posts.push(k.rise([x, ry], wz, wz + 0.9 * U, P));
  out.push(Ln(posts.join("") + k.segment([plan.x, ry, wz + 0.9 * U], [X1, ry, wz + 0.9 * U], P), { tone: "lo" }));
  out.push(Ln(k.lineOnTop([plan.x, -3.5 * U], [X1, -3.5 * U], top, P), { tone: "faint" }));
  return out.join("");
}
mid.push(deck(LOW, YC));

// Bulkhead at the upstream end of the decks, cut like everything else. The lower gate leaf fills the opening between the decks.
const bulkFrame = G.frameOf([X0, 0, ZC], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const arcPoly = (zr0, zr1, yHigh, steps = 10) => {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const zr = zr0 + ((zr1 - zr0) * i) / steps;
    pts.push([-wAt(zr), zr]);
  }
  return [...pts.reverse(), [yHigh, zr0], [yHigh, zr1]].reverse();
};
const bulkhead = (zr0, zr1, yHigh) => S(G.prismOf(bulkFrame, arcPoly(zr0, zr1, yHigh), 0, BULK, P), { tone: "mid" });
mid.push(bulkhead(LOW[1], UPP[0], HINGE));
mid.push(`<g data-part="gate-low"></g>`);
mid.push(S(G.disc(LOW[1] + ZC - ZC, LOW[1] + CLEAR, 1.2, G.frameOf([X0 + BULK, HINGE + 0.6, ZC], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P), { tone: "mid" }));
mid.push(`<g data-part="cars-low"></g>`);
mid.push(`<g data-part="silt-low" class="st-silt" style="opacity:0"><path d="${pathOf3([[X0 + BULK, -wAt(LOW[1]) + 1.1 * U, ZC + LOW[1] + 0.05], [X1, -wAt(LOW[1]) + 1.1 * U, ZC + LOW[1] + 0.05], [X1, YC, ZC + LOW[1] + 0.05], [X0 + BULK, YC, ZC + LOW[1] + 0.05]])}"/></g>`);

// Upper deck: wall gear above it is drawn first, then the slab, its bulkhead, gate, barrier and traffic.
mid.push(corbels(UPP[0]));
mid.push(portal(PORTAL_UP[0], UPP[1], UPP[1] + CLEAR - 3));
mid.push(portal(PORTAL_UP[1], UPP[1], UPP[1] + CLEAR - 3));
mid.push(tray(ZT - 4));
mid.push(lamps(UPP[1] + CLEAR + 1.5));
// Cross-passage doors to the escape route and hose cabinets, on the far wall over the walkway.
{
  const z0 = UPP[1] + 0.25 * U;
  const doorAt = (x0, x1, zr0, zr1) => {
    const n = 8;
    const side = (x, a, b) => Array.from({ length: n + 1 }, (_, i) => {
      const zr = a + ((b - a) * i) / n;
      return [x, wallAt(zr) + 0.05, ZC + zr];
    });
    return pathOf3([...side(x0, zr0, zr1), ...side(x1, zr1, zr0)]);
  };
  for (const x of [-18, 30]) mid.push(Ln(doorAt(x, x + 9, z0, z0 + 2.1 * U) + doorAt(x + 1, x + 8, z0 + 1.2 * U, z0 + 1.9 * U), { tone: "lo" }));
  for (const x of [-48, 8, 56]) {
    const zr = z0 + 1.0 * U;
    mid.push(S(slab({ x: x - 3, y: wallAt(zr) - 0.5, w: 6, d: 2.4, r: 0.4 }, ZC + zr, 7, 2, 0.3), { tone: "mid", crease: "none" }));
  }
}
mid.push(deck(UPP, YU));
mid.push(bulkhead(UPP[1], ZT, HINGE));
mid.push(S(G.prismOf(bulkFrame, [[HINGE, UPP[1] + CLEAR], [YU, UPP[1] + CLEAR], [YU, ZT], [HINGE, ZT]], 0, BULK, P), { tone: "mid" }));
mid.push(`<g data-part="gate-up"></g>`);
mid.push(S(G.disc(UPP[1], UPP[1] + CLEAR, 1.2, G.frameOf([X0 + BULK, HINGE + 0.6, ZC], [0, 0, 1], [1, 0, 0], [0, 1, 0]), P), { tone: "mid" }));
mid.push(`<g data-part="cars-up"></g>`);
mid.push(`<g data-part="silt-up" class="st-silt" style="opacity:0"><path d="${pathOf3([[X0 + BULK, -wAt(UPP[1]) + 1.1 * U, ZC + UPP[1] + 0.05], [X1, -wAt(UPP[1]) + 1.1 * U, ZC + UPP[1] + 0.05], [X1, YU, ZC + UPP[1] + 0.05], [X0 + BULK, YU, ZC + UPP[1] + 0.05]])}"/></g>`);
mid.push(`<g data-part="barriers"></g>`);

// ---------------------------------------------------------------- pond near walls
mid.push(S(slab({ x: PO.x + PO.w - POND_T, y: PO.y, w: POND_T, d: PO.d, r: 1 }, POND_FLOOR, POND_WALL, 2, 0.6), { tone: "mid" }));
mid.push(S(slab({ x: PO.x, y: PO.y + PO.d - POND_T, w: PO.w, d: POND_T, r: 1 }, POND_FLOOR, POND_WALL, 2, 0.6), { tone: "mid", inner: Ln(k.sideSeam({ x: PO.x, y: PO.y + PO.d - POND_T, w: PO.w, d: POND_T, r: 1 }, POND_FLOOR + 17, P, 2), { tone: "faint" }) }));

// ---------------------------------------------------------------- front: cut faces, right bore, outlet
// Lining cut faces: the bottom strip in the plane y = YC and the top strip in the plane z = ZT.
{
  const joints = [];
  for (let x = X0 + RING; x < X1; x += RING) joints.push(k.segment([x, YC, ZC + ZB], [x, YC, ZC + ZBO], P));
  front.push(faceSvg([[X0, YC, ZC + ZB], [X1, YC, ZC + ZB], [X1, YC, ZC + ZBO], [X0, YC, ZC + ZBO]], [0, 1, 0], { tone: "mid", inner: Ln(joints.join(""), { tone: "lo" }), className: "st-cut" }));
  const tops = [];
  for (let x = X0 + RING; x < X1; x += RING) tops.push(k.segment([x, -WT, ZC + ZT], [x, -WTO, ZC + ZT], P));
  front.push(faceSvg([[X0, -WTO, ZC + ZT], [X1, -WTO, ZC + ZT], [X1, -WT, ZC + ZT], [X0, -WT, ZC + ZT]], [0, 0, 1], { tone: "mid", top: true, inner: Ln(tops.join(""), { tone: "lo" }), className: "st-cut" }));
}
for (const x of CRADLES.filter((x) => x > X1)) front.push(cradle(x));
front.push(closedBore(X1, XR, false));
front.push(`<path class="iso-halo" d="${k.haloOf(OUTLET, 0, 4, P)}" style="opacity:.5"/>`);
front.push(S(slab(OUTLET, 0, OUTLET_TOP, 3, 0.8), { tone: "mid", inner: Ln(k.sideSeam(OUTLET, 30, P, 3) + k.sideSeam(OUTLET, 60, P, 3), { tone: "faint" }) }));
front.push(Ln(k.planOutline(k.insetPlan(OUTLET, 3), OUTLET_TOP, P, 3), { tone: "faint" }));
front.push(furnish(OUTLET, OUTLET_TOP));
front.push(S(slab({ x: OUTLET.x + 10, y: -14, w: 18, d: 28, r: 1 }, OUTLET_TOP, 10, 2, 0.5), { tone: "mid" }));
front.push(Ln(k.planOutline({ x: OUTLET.x + 12.5, y: -11.5, w: 13, d: 23, r: 0.6 }, OUTLET_TOP + 10, P, 2), { tone: "faint" }));

// ---------------------------------------------------------------- the control console (mode selector) on the base
const DESK = { x: -290, y: 10, w: 46, d: 30, r: 2 };
front.push(`<path class="iso-halo" d="${k.haloOf(DESK, 0, 4, P)}" style="opacity:.45"/>`);
front.push(S(slab(DESK, 0, 14, 3, 0.6), { tone: "mid" }));
const KNOB = [DESK.x + 16, DESK.y + 15];
front.push(S(k.cylinder(KNOB[0], KNOB[1], 8, 14, 1, P, 40), { tone: "mid" }));
const MODE_ANGLES = [-0.9, -0.3, 0.3, 0.9];
front.push(Ln(MODE_ANGLES.map((a) => k.lineOnTop([KNOB[0] + Math.sin(a) * 8.4, KNOB[1] - Math.cos(a) * 8.4], [KNOB[0] + Math.sin(a) * 11, KNOB[1] - Math.cos(a) * 11], 14, P)).join(""), { tone: "mid" }));
front.push(S(k.cylinder(KNOB[0], KNOB[1], 5, 15, 3.5, P, 32), { tone: "mid" }));
front.push(Ln(k.knurl(KNOB[0], KNOB[1], 5, 15, 18.5, 30, P), { tone: "lo" }));
const pointerAt = (mode) => {
  const a = MODE_ANGLES[mode - 1];
  return k.lineOnTop([KNOB[0], KNOB[1]], [KNOB[0] + Math.sin(a) * 4.4, KNOB[1] - Math.cos(a) * 4.4], 18.5, P);
};
front.push(`<path data-part="pointer" class="iso-line" data-tone="lit" data-free="end" style="stroke-width:1.1" d="${pointerAt(1)}"/>`);
const LAMPS = MODE_ANGLES.map((_, i) => [DESK.x + 34, DESK.y + 6 + i * 6]);
front.push(Ln(LAMPS.map(([x, y]) => k.ring(x, y, 1.8, 14, P, 16)).join(""), { tone: "lo" }));
front.push(LAMPS.map(([x, y], i) => `<circle data-lamp="${i + 1}" class="st-lamp" cx="${at([x, y, 14])[0].toFixed(1)}" cy="${at([x, y, 14])[1].toFixed(1)}" r="1.3"/>`).join(""));
// A tipping-bucket rain gauge beside it.
const RG = [DESK.x - 16, DESK.y + 16];
front.push(S(k.cylinder(RG[0], RG[1], 6, 0, 2, P, 32), { tone: "lo" }));
front.push(S(k.cylinder(RG[0], RG[1], 4.6, 2, 22, P, 32), { tone: "mid", inner: Ln(k.sideArc(RG[0], RG[1], 4.6, 10, P, 24), { tone: "faint" }) }));
front.push(S(k.cylinder(RG[0], RG[1], 5.2, 24, 2, P, 32), { tone: "mid" }));
front.push(`<path class="st-void" d="${k.ring(RG[0], RG[1], 4.2, 26, P, 32)}"/>`, Ln(k.ring(RG[0], RG[1], 4.2, 26, P, 32), { tone: "lo" }));

// ---------------------------------------------------------------- fallback water (no WebGL)
const fallback = `<g class="st-fallback"><path data-part="fb-river" class="st-water"/><path data-part="fb-pond" class="st-water"/></g>`;
const fallbackBore = `<g class="st-fallback"><path data-part="fb-bore" class="st-water"/></g>`;

// ---------------------------------------------------------------- traffic paths
// Upper deck runs downstream (+x) between ramp portals in the far wall; the lower deck runs back (-x),
// joining and leaving its near lane from the far side, out of sight under the upper deck.
const flat2 = (points) => G.resample(G.fillet(points.map(([x, y]) => [x, y, 0]), 22, 10), 1.5).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
const WALL_UP = wallAt(UPP[1] + 4);
const LANES = [-1.83 * U, 1.83 * U];
const PATHS = [
  { deck: "up", z: ZC + UPP[1], wall: WALL_UP, points: flat2([[X0 + 40, WALL_UP - 16], [X0 + 40, LANES[0]], [X1 - 40, LANES[0]], [X1 - 40, WALL_UP - 16]]) },
  { deck: "low", z: ZC + LOW[1], wall: null, points: flat2([[X1 + 30, LANES[1]], [X0 + 70, LANES[1]], [X0 + 34, -32], [X0 + 14, -32]]) },
];

// ---------------------------------------------------------------- data for the page
const DATA = {
  W,
  H,
  P,
  camera: glCamera(P),
  U,
  RI,
  RO,
  ZC,
  YC,
  ZT,
  ZB,
  LOW,
  UPP,
  CLEAR,
  X0,
  X1,
  BULK,
  HINGE,
  YU,
  LEAF,
  LEAF_T,
  RIVER,
  POND: { ...POND, floor: POND_FLOOR, wall: POND_WALL, t: POND_T },
  CHAMBER,
  CHAMBER_TOP,
  GATE_H,
  GATE_PLAN,
  PORTAL_UP,
  KNOB,
  MODE_ANGLES,
  XL,
  XR,
  PATHS,
};

const LABEL_TEXT =
  "A cutaway model of Kuala Lumpur's SMART Tunnel on a base plate. A round bored tunnel lies on concrete cradles. At the left, a river channel and an intake chamber with a lift gate divert floodwater into it; at the right it empties into a holding pond. The middle section is cut open to show two motorway decks with small cars, above a stormwater channel at the bottom, and a watertight gate on each deck at the upstream end. As the rain control steps from no storm to a prolonged storm, water runs first in the bottom channel only, then the decks are cleared and closed, and finally the gates swing open and water fills the whole bore; then it drains, crews clean, and the cars return.";

const backSvg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: back, className: "st-back" });
const layerSvg = (name, body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg st-layer ${name}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body.join("")}</svg>`;
const stage = `<div class="st-stage" tabindex="0" role="slider" aria-roledescription="rainfall control" aria-valuemin="1" aria-valuemax="4" aria-valuenow="1" aria-valuetext="No storm" aria-label="SMART Tunnel. Move the pointer across the figure, or press 1 to 4 or the arrow keys, to set the rainfall from no storm to a prolonged storm."><span class="st-said" aria-live="polite"></span>${backSvg}<canvas class="st-layer st-gl st-gl-open" aria-hidden="true"></canvas>${layerSvg("st-fb", [fallback])}${layerSvg("st-mid", mid)}<canvas class="st-layer st-gl st-gl-bore" aria-hidden="true"></canvas>${layerSvg("st-fb2", [fallbackBore])}${layerSvg("st-front", front)}</div>`;

const caption = `The SMART Tunnel is a ${M.TUNNEL.length} km stormwater bypass, bored ${M.TUNNEL.bore} m wide (${M.TUNNEL.inner} m inside), that carries floodwater from the Klang river at Kampung Berembang round the city centre to the Taman Desa pond. Inside its middle ${M.TUNNEL.motorway} km run two motorway decks, ${M.TUNNEL.lanes} lanes each, light vehicles only. Mode 1: no storm, no diversion. Mode 2: when the flow where the Klang meets the Ampang passes ${M.MODE2} m³/s, water is diverted into the channel under the decks and traffic keeps running. Mode 3: above ${M.MODE3} m³/s the motorway is closed, its barriers come down and the last cars drive out. Mode 4: if the storm goes on and the ponds fill, the watertight gates at the ends of the motorway open and the whole bore runs full. The system stores up to ${(M.CAPACITY / 1e6).toFixed(0)} million m³: ${(M.STORE.berembang / 1e6).toFixed(1)} million in the Berembang pond, ${(M.STORE.tunnel / 1e6).toFixed(0)} million in the tunnel and ${(M.STORE.tamanDesa / 1e6).toFixed(1)} million at Taman Desa, which is the pond drawn here. After Mode 4 the bore drains, crews wash out the silt and the motorway typically reopens within ${M.REOPEN_AFTER_FLOOD} hours. The cross-section is to scale (one ruler tick a metre); the length is not, and storm hours run compressed while the cars move at true speed.`;

const body = `<div class="st">${k.plateHtml({
  fig: "Fig 1",
  title: "SMART Tunnel, Kuala Lumpur, 2007",
  hint: "Move across for rainfall · keys 1–4",
  readout: M.readoutOf(M.initial()),
  keys: [
    { mark: "lit", label: "Watertight gates and the mode selector" },
    { mark: "raised", label: "Bore lining, decks, intake and outlet" },
    { mark: "flat", label: "Floodwater: lower channel, then the whole bore" },
  ],
  caption,
  body: `<span class="st-credit">MMC-Gamuda with JPS and LLM</span>${stage}`,
})}</div>`;

const MODEL = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const CSS = readFileSync(join(HERE, "smart.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const page = k.pageHtml({ title: "SMART Tunnel", theme, body: `<style>${CSS}</style>${body}`, script: kitScript() + glScript() + MODEL + LIVE, width: 800 });
const name = theme === "light" ? "smart-tunnel.html" : "smart-tunnel-dark.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${back.length + mid.length + front.length} layer items`, "scale", KS.toFixed(3));
