
const D = __DATA__;
const root = document.querySelector(".st");
const stage = root.querySelector(".st-stage");
const readout = root.querySelector("[data-readout]");
const said = stage.querySelector(".st-said");
const part = (name) => stage.querySelector(`[data-part="${name}"]`);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const P = D.P;
const at = (p) => iso(p, P);
const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (a, b, x) => {
  const t = clampTo((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const RAIN_WORDS = RAIN.map((r) => r.name[0].toUpperCase() + r.name.slice(1));

// ------------------------------------------------------------ state
let sim = initial();
let rain = 0;
let flood = 0; // eased bore level above the channel, 0..1
let lift = 0; // intake lift gate, 0 shut .. 1 raised
let leaf = 0; // watertight gates, 0 shut .. 1 open
let arm = 1; // barrier arms, 1 up (open) .. 0 down
let crew = 0;
let clock = 0;

// ------------------------------------------------------------ traffic
const SPEED = (TUNNEL.limit / 3.6) * D.U; // true speed, 60 km/h in world units a second
const STEP = 1.5;
const paths = D.PATHS.map((p) => ({ ...p, length: (p.points.length - 1) * STEP, wait: Math.random() * 1.2 }));
let cars = [];
function pointOn(path, s) {
  const f = clampTo(s / STEP, 0, path.points.length - 1.001);
  const i = Math.floor(f);
  const a = path.points[i];
  const b = path.points[i + 1];
  const t = f - i;
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, h: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
function alphaOf(path, s, y) {
  if (path.wall !== null) return ease(path.wall - 6, path.wall + 8, y);
  return ease(0, 10, s) * ease(0, 10, path.length - s);
}
function boxAt(x, y, h, l, w, dx = 0) {
  const c = Math.cos(h);
  const n = Math.sin(h);
  return [
    [-l / 2 + dx, -w / 2],
    [l / 2 + dx, -w / 2],
    [l / 2 + dx, w / 2],
    [-l / 2 + dx, w / 2],
  ].map(([u, v]) => [x + u * c - v * n, y + u * n + v * c]);
}
const U = D.U;
function carSvg(x, y, h, z, alpha, van) {
  const L = (van ? 5.2 : 4.4) * U;
  const Wd = (van ? 2.0 : 1.8) * U;
  let out;
  if (van) {
    // Crew van: a tall box body behind a lower cab.
    out = solidSvg(extrude(boxAt(x, y, h, 3.5 * U, Wd, -0.85 * U), z + 0.9, 13, P, { convex: true, bevel: 0.4 }), { tone: "mid", crease: "lo" });
    out += solidSvg(extrude(boxAt(x, y, h, 1.7 * U, Wd, 1.75 * U), z + 0.9, 9.5, P, { convex: true, bevel: 0.4 }), { tone: "mid", crease: "lo" });
  } else {
    out = solidSvg(extrude(boxAt(x, y, h, L, Wd), z + 0.9, 4.4, P, { convex: true, bevel: 0.4 }), { tone: "hi", crease: "lo" });
    out += solidSvg(extrude(boxAt(x, y, h, 2.4 * U, 1.56 * U, -0.25 * U), z + 5.3, 3.4, P, { convex: true, bevel: 0.3 }), { tone: "mid", crease: "lo" });
  }
  const wheels = boxAt(x, y, h, L * 0.62, Wd + 0.2).map(([wx, wy]) => at([wx, wy, z + 1]));
  out += dotsSvg(wheels, { size: 1.1, tone: "hi" });
  if (van) {
    const [bx, by] = at([x - 0.4 * U * Math.cos(h), y - 0.4 * U * Math.sin(h), z + 0.9 + 13]);
    out += `<circle class="st-beacon" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="1.5" data-beacon=""/>`;
  }
  return alpha >= 0.995 ? out : `<g opacity="${alpha.toFixed(3)}">${out}</g>`;
}
function stepTraffic(dt, open) {
  for (const car of cars) car.s += SPEED * dt;
  cars = cars.filter((car) => car.s < car.path.length);
  for (const path of paths) {
    path.wait -= dt;
    if (!open || path.wait > 0) continue;
    const last = cars.filter((c) => c.path === path).reduce((m, c) => Math.min(m, c.s), Infinity);
    if (last < 44) continue;
    cars.push({ path, s: 0 });
    path.wait = 0.55 + Math.random() * 1.1;
  }
}
// A still picture of traffic for reduced motion: evenly spaced cars on every path.
function parkTraffic(open) {
  cars = [];
  if (!open) return;
  for (const path of paths) for (let s = path.length * 0.2; s < path.length * 0.85; s += 90) cars.push({ path, s });
}
const CREW = [
  { deck: "up", z: D.ZC + D.UPP[1], x: 30, y: -1.83 * D.U },
  { deck: "low", z: D.ZC + D.LOW[1], x: 10, y: 1.83 * D.U },
  { deck: "low", z: D.ZC + D.LOW[1], x: -70, y: -1.83 * D.U },
];
function drawTraffic() {
  for (const deck of ["up", "low"]) {
    const items = cars
      .filter((c) => c.path.deck === deck)
      .map((c) => {
        const p = pointOn(c.path, c.s);
        return { ...p, z: c.path.z, a: alphaOf(c.path, c.s, p.y), depth: depthOf([p.x, p.y, 0], P) };
      });
    if (crew > 0.01) for (const v of CREW.filter((v) => v.deck === deck)) items.push({ x: v.x + Math.sin(clock * 0.25 + v.x) * 14, y: v.y, h: 0, z: v.z, a: crew, van: true, depth: depthOf([v.x, v.y, 0], P) });
    items.sort((a, b) => a.depth - b.depth);
    part(`cars-${deck}`).innerHTML = items.map((c) => carSvg(c.x, c.y, c.h, c.z, c.a, c.van)).join("");
  }
}

// ------------------------------------------------------------ gates, barriers, selector
let gateKey = "";
function leafSvg(zBase, yEnd) {
  const t = leaf * (88 * Math.PI) / 180;
  const d = [Math.sin(t), Math.cos(t)];
  const n = [Math.cos(t), -Math.sin(t)];
  const p = [D.X0 + D.BULK, D.HINGE];
  const s = Math.min(D.LEAF, (yEnd - D.HINGE) / Math.max(Math.cos(t), 1e-3));
  const ring = [p, [p[0] + d[0] * s, p[1] + d[1] * s], [p[0] + d[0] * s + n[0] * D.LEAF_T, p[1] + d[1] * s + n[1] * D.LEAF_T], [p[0] + n[0] * D.LEAF_T, p[1] + n[1] * D.LEAF_T]];
  const paths = extrude(ring, zBase, D.CLEAR, P, { convex: true, bevel: 0.4 });
  const seams = [0.33, 0.66].map((f) => ringSeam(ring, zBase + D.CLEAR * f, P)).join("");
  return solidSvg(paths, { tone: "hi", lit: true, crease: "lo", inner: lineSvg(seams, { tone: "lo" }) });
}
function drawGates() {
  const key = leaf.toFixed(4);
  if (key === gateKey) return;
  gateKey = key;
  part("gate-low").innerHTML = leafSvg(D.ZC + D.LOW[1], D.YC);
  part("gate-up").innerHTML = leafSvg(D.ZC + D.UPP[1], D.YU);
}
let barrierKey = "";
function drawBarriers(go) {
  const key = arm.toFixed(3) + go;
  if (key === barrierKey) return;
  barrierKey = key;
  const out = [];
  const y = paths[0].wall + 3;
  const z = D.ZC + D.UPP[1];
  const [xa, xb] = D.PORTAL_UP[0];
  const pivot = [xa - 2, y, z + 6];
  out.push(solidSvg(cylinder(pivot[0], y, 1.6, z, 7.5, P, 16), { tone: "mid" }));
  const t = arm * (82 * Math.PI) / 180;
  const dir = [Math.cos(t), 0, Math.sin(t)];
  const up = [-Math.sin(t), 0, Math.cos(t)];
  const len = xb - xa + 2;
  const q = (s, o) => [pivot[0] + dir[0] * s + up[0] * o, y, pivot[2] + dir[2] * s + up[2] * o];
  const plate = [q(0, -0.8), q(len, -0.8), q(len, 0.8), q(0, 0.8)];
  const d = pathOf(plate.map(at), true);
  const stripes = [0.2, 0.45, 0.7].map((f) => pathOf([q(len * f, -0.8), q(len * (f + 0.12), -0.8), q(len * (f + 0.12), 0.8), q(len * f, 0.8)].map(at), true)).join("");
  out.push(`<g class="iso-solid"><path class="iso-fill" d="${d}"/><path class="iso-top" d="${d}"/><path class="st-stripe" d="${stripes}"/><path class="iso-line iso-edge" data-tone="mid" d="${d}"/></g>`);
  // Lane signals on the bulkhead lintel above the upper deck: green arrow open, red cross closed.
  for (const ly of [-1.83 * U]) {
    const c = at([D.X0 + D.BULK + 0.1, ly, D.ZC + D.UPP[1] + D.CLEAR + 1.6]);
    out.push(`<circle class="st-signal" data-state="${go ? "go" : "stop"}" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="1.4"/>`);
  }
  part("barriers").innerHTML = out.join("");
}
// The intake's lift gate: only the part above the chamber roof shows; it rises out of its slot to divert.
let liftKey = "";
function drawLift() {
  const key = lift.toFixed(3);
  if (key === liftKey) return;
  liftKey = key;
  const g = D.GATE_PLAN;
  const top = D.CHAMBER_TOP + 3 + lift * (D.GATE_H - 6);
  const h = top - D.CHAMBER_TOP;
  const seams = [8, 16, 24].filter((z) => top - z > D.CHAMBER_TOP + 0.5).map((z) => sideSeam(g, top - z, P, 2)).join("");
  part("liftgate").innerHTML = solidSvg(slabOf(g, D.CHAMBER_TOP, h, P, 2), { tone: "hi", inner: lineSvg(seams, { tone: "lo" }) });
}
const pointer = part("pointer");
const lamps = [...stage.querySelectorAll("[data-lamp]")];
let modeShown = 0;
function drawSelector(mode) {
  if (mode === modeShown) return;
  modeShown = mode;
  const a = D.MODE_ANGLES[mode - 1];
  pointer.setAttribute("d", lineOnTop([D.KNOB[0], D.KNOB[1]], [D.KNOB[0] + Math.sin(a) * 4.4, D.KNOB[1] - Math.cos(a) * 4.4], 18.5, P));
  lamps.forEach((lamp, i) => lamp.toggleAttribute("data-on", i + 1 === mode));
}

// ------------------------------------------------------------ water levels (world z)
const riverZ = () => D.RIVER.bed + 3 + 17 * Math.pow(clampTo(sim.flow / 265, 0, 1), 0.7);
const pondZ = () => D.POND.floor + 2 + (D.POND.wall - 7) * clampTo(sim.stored / PONDS, 0, 1);
const channelZ = () => D.ZC - D.RI + channelDepth(sim.flow, sim.phase) * U;
const boreZ = () => Math.max(channelZ(), D.ZC + D.LOW[0] + flood * (D.RI + 2 - D.LOW[0]));
function quad(a, b, c, d) {
  return pathOf([a, b, c, d].map(at), true);
}
function drawFallback() {
  const R = D.RIVER;
  const rz = riverZ();
  part("fb-river").setAttribute("d", quad([R.x0, R.y0, rz], [R.x1, R.y0, rz], [R.x1, R.y1, rz], [R.x0, R.y1, rz]) + quad([R.x0, R.y1, R.bed], [R.x1, R.y1, R.bed], [R.x1, R.y1, rz], [R.x0, R.y1, rz]));
  const O = D.POND;
  const pz = pondZ();
  part("fb-pond").setAttribute("d", quad([O.x + O.t, O.y + O.t, pz], [O.x + O.w - O.t, O.y + O.t, pz], [O.x + O.w - O.t, O.y + O.d - O.t, pz], [O.x + O.t, O.y + O.d - O.t, pz]));
  const bz = Math.min(boreZ(), D.ZC + D.ZT);
  const bottom = D.ZC + D.ZB;
  let d = bz > bottom ? quad([D.X0 + D.BULK, D.YC, bottom], [D.X1, D.YC, bottom], [D.X1, D.YC, bz], [D.X0 + D.BULK, D.YC, bz]) : "";
  if (boreZ() >= D.ZC + D.ZT) {
    const w = Math.sqrt(D.RI * D.RI - D.ZT * D.ZT);
    d += quad([D.X0 + D.BULK, -w, bz], [D.X1, -w, bz], [D.X1, D.YC, bz], [D.X0 + D.BULK, D.YC, bz]);
  }
  part("fb-bore").setAttribute("d", d);
}

// ------------------------------------------------------------ water shader
// Two canvases share one fragment: the river and pond under the drawing (uWhich 0), and the bore
// water between the decks and the lining's cut faces (uWhich 1). Every face is a world plane,
// so it registers with the SVG; colour comes from the optical path through turbid water.
const pale = !!stage.closest('[data-theme="light"]');
const f1 = (v) => v.toFixed(2);
const WATER_GLSL = `
uniform float uWhich;uniform float uLight;
uniform float uBore;uniform float uChan;uniform float uRiver;uniform float uPond;uniform float uFlow;uniform float uBoreFlow;uniform float uFirst;
const float X0=${f1(D.X0 + D.BULK)};const float X1=${f1(D.X1)};const float YC=${f1(D.YC)};const float YU=${f1(D.YU)};
const float ZC=${f1(D.ZC)};const float RI=${f1(D.RI)};const float ZB=${f1(D.ZC + D.ZB)};const float ZT=${f1(D.ZC + D.ZT)};
const vec2 LOWZ=vec2(${f1(D.ZC + D.LOW[0])},${f1(D.ZC + D.LOW[1])});const vec2 UPZ=vec2(${f1(D.ZC + D.UPP[0])},${f1(D.ZC + D.UPP[1])});
const vec4 RIV=vec4(${f1(D.RIVER.x0)},${f1(D.RIVER.y0)},${f1(D.RIVER.x1)},${f1(D.RIVER.y1)});const float RBED=${f1(D.RIVER.bed)};
const vec4 PON=vec4(${f1(D.POND.x + D.POND.t)},${f1(D.POND.y + D.POND.t)},${f1(D.POND.x + D.POND.w - D.POND.t)},${f1(D.POND.y + D.POND.d - D.POND.t)});const float PBED=${f1(D.POND.floor)};
const vec3 DEEP=vec3(.25,.42,.52);const vec3 SILT=vec3(.50,.47,.38);const vec3 DARKW=vec3(.16,.32,.40);
vec4 inkFor(vec3 seen,float cover){vec3 absorbed=1.-seen;float a=max(max(absorbed.r,max(absorbed.g,absorbed.b)),cover);return vec4(vec3(a)-absorbed,a);}
vec4 over(vec4 top,vec4 under){return top+under*(1.-top.a);}
float wOf(float z){float r=z-ZC;return sqrt(max(RI*RI-r*r,0.));}
// Path length from p, away from the viewer, until the ray meets something solid inside the bore.
float boreDepth(vec3 p){
  vec3 v=towardViewer();
  float t=1e4;
  if(p.z>LOWZ.y+.01)t=min(t,(p.z-LOWZ.y)/v.z);
  if(p.z>UPZ.y+.01){float s=(p.z-UPZ.y)/v.z;if(p.y-s*v.y<YU)t=min(t,s);}
  if(p.y>YU+.01&&p.z>UPZ.x&&p.z<UPZ.y+30.){float s=(p.y-YU)/v.y;float z=p.z-s*v.z;if(z>UPZ.x&&z<UPZ.y)t=min(t,s);}
  float b=p.y*v.y+(p.z-ZC)*v.z;float c=p.y*p.y+(p.z-ZC)*(p.z-ZC)-RI*RI;float a=v.y*v.y+v.z*v.z;
  float disc=b*b-a*c;if(disc>0.)t=min(t,(b+sqrt(disc))/a);
  t=min(t,max(p.x-X0,0.)/v.x);
  return max(t,0.);
}
float streak(vec2 q,float speed,float scale){
  float n=fbm2(vec2((q.x-uTime*speed)*.045*scale,q.y*.32*scale));
  float m=fbm2(vec2((q.x-uTime*speed*1.35)*.11*scale+7.,q.y*.9*scale));
  return smoothstep(.55,.8,n)*.7+smoothstep(.62,.85,m)*.4;
}
vec3 waterSeen(float d,float foam,float face){
  float e=1.-exp(-d/22.);
  vec3 seen=mix(vec3(.93,.96,.97),mix(DEEP,SILT,.28),e*.95);
  seen=mix(seen,seen*.9,face);
  return mix(seen,vec3(.97,.98,.98),foam*.45*(.4+.6*e));
}
vec4 shade(float d,float foam,float face,float cover){
  vec3 seen=waterSeen(d,foam,face);
  vec4 ink=inkFor(seen,cover);
  vec4 dark=vec4(DARKW*(.5+.5*(1.-exp(-d/34.)))+foam*.18,1.)*(.35+.55*(1.-exp(-d/30.)));
  return mix(dark,ink,uLight);
}
vec4 bore(vec2 vb,float px){
  vec4 col=vec4(0.);
  float level=max(uBore,uChan);
  if(level<ZB+.05)return col;
  float top=min(level,ZT);
  // Front face in the cut plane y = YC.
  vec3 q=onWallY(vb,YC);
  float inFace=window(q.x,X0,X1,.7*px)*window(q.z,ZB,top,.7*px/uCam.w);
  if(inFace>.001){
    float d=boreDepth(q);
    float foam=streak(vec2(q.x,q.z),uBoreFlow,1.);
    col=shade(d,foam*.8,1.,.32)*inFace;
  }
  // Free surface (or the top cut when full), unless a deck above hides it.
  vec3 p=onFloor(vb,top);
  float inTop=window(p.x,X0,X1,.7*px)*window(p.y,-wOf(top),YC,.7*px/uCam.z);
  vec3 v=towardViewer();
  if(top<LOWZ.x){float s=(LOWZ.x-top)/v.z;inTop*=smoothstep(YC-.6*px,YC+.6*px,p.y+s*v.y);}
  if(top<UPZ.x){float s=(UPZ.x-top)/v.z;inTop*=smoothstep(YU-.6*px,YU+.6*px,p.y+s*v.y);}
  if(inTop>.001){
    float d=boreDepth(p-vec3(0.,0.,.05));
    float foam=streak(vec2(p.x,p.y),uBoreFlow,1.);
    col=over(col,shade(d,foam,0.,.26)*inTop);
  }
  return col;
}
vec4 open(vec2 vb,float px){
  vec4 col=vec4(0.);
  // River: surface and its cut face at the downstream end of the channel segment.
  vec3 p=onFloor(vb,uRiver);
  float inR=window(p.x,RIV.x,RIV.z,.7*px)*window(p.y,RIV.y,RIV.w,.7*px/uCam.z);
  if(inR>.001){
    float d=min((uRiver-RBED)/uCam.z,(p.y-RIV.y)/(uCam.y*uCam.w)+(uRiver-RBED));
    col=shade(d+4.,streak(vec2(p.x,p.y),uFlow,1.3),0.,.12)*inR;
  }
  vec3 q=onWallX(vb,RIV.z);
  float inF=window(q.y,RIV.y,RIV.w,.7*px)*window(q.z,RBED,uRiver,.7*px/uCam.w);
  if(inF>.001)col=over(col,shade(12.+(q.y-RIV.y)*.3,streak(vec2(q.y*.4,q.z),0.,1.)*.3,1.,.16)*inF);
  // Pond: still water, a slow drift away from the inlet.
  vec3 o=onFloor(vb,uPond);
  float inP=window(o.x,PON.x,PON.z,.7*px)*window(o.y,PON.y,PON.w,.7*px/uCam.z);
  if(inP>.001){
    float d=(uPond-PBED)/uCam.z;
    float ripple=smoothstep(.6,.85,fbm2(vec2(o.x*.05+uTime*.05,o.y*.12)))*.5;
    col=over(col,shade(d+6.,ripple,0.,.12)*inP);
  }
  return col;
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf();
  vec4 col=uWhich<.5?open(vb,px):bore(vb,px);
  col.rgb=min(col.rgb,vec3(col.a));
  float n=(hash12(gl_FragCoord.xy+fract(uTime*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uTime*.37)*57.)-1.)/255.;
  col=max(col+n*smoothstep(0.,1.5/255.,col.a),0.);
  gl_FragColor=col*uFirst;
}`;
const UNIFORMS = ["uBore", "uChan", "uRiver", "uPond", "uFlow", "uBoreFlow", "uFirst"];
const layers = ["st-gl-open", "st-gl-bore"].map((name, i) =>
  glLayer({ canvas: stage.querySelector(`.${name}`), fragment: WATER_GLSL, view: [D.W, D.H], camera: D.camera, uniforms: UNIFORMS, fixed: { uWhich: i, uLight: pale ? 1 : 0 } }),
);
let first = 0;
const water = layers.every(Boolean)
  ? {
      draw(time, dt) {
        first = still.matches ? 1 : Math.min(1, first + dt / 0.9);
        const values = {
          uBore: flood > 0.001 ? D.ZC + D.LOW[0] + flood * (D.RI + 2 - D.LOW[0]) : 0,
          uChan: channelZ(),
          uRiver: riverZ(),
          uPond: pondZ(),
          uFlow: 6 + 30 * clampTo(sim.flow / 265, 0, 1),
          uBoreFlow: 10 + 50 * clampTo((sim.flow - MODE2) / 190, 0, 1),
          uFirst: first,
        };
        layers.forEach((layer) => layer.draw(values, time));
      },
    }
  : null;
if (water) stage.setAttribute("data-gl", "");

// ------------------------------------------------------------ readout and words
let lastText = "";
let lastPhase = sim.phase;
function say() {
  const text = readoutOf(sim);
  if (text !== lastText) {
    readout.textContent = text;
    lastText = text;
  }
  if (sim.phase !== lastPhase) {
    lastPhase = sim.phase;
    said.textContent = `Mode ${PHASES[sim.phase].mode}: motorway ${PHASES[sim.phase].deck}.`;
  }
}
function setRain(next) {
  next = clampTo(next, 0, 3);
  if (next === rain) return;
  rain = next;
  stage.setAttribute("aria-valuenow", String(rain + 1));
  stage.setAttribute("aria-valuetext", RAIN_WORDS[rain]);
  if (still.matches) settleNow();
  kick();
}
// Reduced motion: run the model to where this rainfall leads and show that still.
function settleNow() {
  for (let i = 0; i < 30 * 160; i++) {
    sim = step(sim, rain, 0, 1 / 30);
  }
  flood = sim.fill;
  lift = sim.flow > MODE2 ? 1 : 0;
  leaf = sim.gate;
  arm = trafficOpen(sim.phase) ? 1 : 0;
  crew = sim.phase === "cleaning" ? 1 : 0;
  parkTraffic(trafficOpen(sim.phase));
}

// ------------------------------------------------------------ tour
const TOUR = [
  { rain: 0, hold: 4 },
  { rain: 1, hold: 9 },
  { rain: 2, until: () => sim.phase === "closed", hold: 4 },
  { rain: 3, until: () => sim.phase === "flooded", hold: 5 },
  { rain: 0, until: () => sim.phase === "open" && cars.length > 3, hold: 5 },
];
let touring = !still.matches;
let tourAt = 0;
let tourHold = 0;
let quiet = 0;
function tour(dt) {
  const stop = TOUR[tourAt];
  setRain(stop.rain);
  if (stop.until && !stop.until()) return;
  tourHold += dt;
  if (tourHold < stop.hold) return;
  tourHold = 0;
  tourAt = (tourAt + 1) % TOUR.length;
}
function interact() {
  touring = false;
  clearTimeout(quiet);
  if (!still.matches)
    quiet = setTimeout(() => {
      touring = true;
      tourAt = 0;
      tourHold = 0;
    }, 9000);
}
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const box = stage.getBoundingClientRect();
  interact();
  setRain(Math.floor(clampTo((event.clientX - box.left) / box.width, 0, 0.999) * 4));
});
stage.addEventListener("pointerdown", (event) => {
  const box = stage.getBoundingClientRect();
  interact();
  setRain(Math.floor(clampTo((event.clientX - box.left) / box.width, 0, 0.999) * 4));
});
stage.addEventListener("keydown", (event) => {
  const keys = { ArrowRight: rain + 1, ArrowUp: rain + 1, ArrowLeft: rain - 1, ArrowDown: rain - 1, Home: 0, End: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
  if (!(event.key in keys)) return;
  event.preventDefault();
  interact();
  setRain(keys[event.key]);
});

// ------------------------------------------------------------ loop
let frame = 0;
let last = 0;
let visible = false;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring && !calm) tour(dt);
  if (!calm) {
    clock += dt;
    sim = step(sim, rain, cars.length, dt);
    const open = trafficOpen(sim.phase);
    stepTraffic(dt, open);
    const follow = (x, target, tau) => x + (target - x) * (1 - Math.exp(-dt / tau));
    flood = follow(flood, sim.fill, 0.5);
    lift = follow(lift, sim.flow > MODE2 || sim.phase === "flooding" || sim.phase === "flooded" ? 1 : 0, 0.8);
    leaf = follow(leaf, sim.gate, 0.25);
    arm = follow(arm, open ? 1 : 0, 0.35);
    crew = follow(crew, sim.phase === "cleaning" ? 1 : 0, 0.6);
  }
  drawLift();
  drawTraffic();
  drawGates();
  drawBarriers(trafficOpen(sim.phase));
  drawSelector(PHASES[sim.phase].mode);
  for (const deck of ["low", "up"]) {
    const top = D.ZC + (deck === "low" ? D.LOW[1] : D.UPP[1]);
    part(`silt-${deck}`).style.opacity = (0.55 * sim.silt * (boreZ() < top ? 1 : 0)).toFixed(3);
  }
  stage.querySelectorAll("[data-beacon]").forEach((b) => (b.style.opacity = calm ? "1" : (0.35 + 0.65 * (Math.sin(clock * 9) > 0 ? 1 : 0.2)).toFixed(2)));
  drawFallback();
  if (water) water.draw(calm ? 0.8 : clock, dt);
  say();
  frame = visible && !calm ? requestAnimationFrame(tick) : 0;
}
function kick() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}
new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) kick();
  },
  { rootMargin: "120px 0px" },
).observe(stage);
if (still.matches) settleNow();
window.__st = { get sim() { return sim; }, get cars() { return cars.length; }, setRain, set touring(v) { touring = v; } };
