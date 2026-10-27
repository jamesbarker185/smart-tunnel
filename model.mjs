// SMART Tunnel, Kuala Lumpur (2007). Pure numbers and the operating modes.
// Sources: SMART project page (construction.smarttunnel.com.my), Bernama / The Star reports
// of mode activations (Mode 2 at 70 m³/s, Mode 3 at 150 m³/s at the Klang–Ampang confluence).
// [Bracketed] values are placeholders set by judgement, not published figures.

export const TUNNEL = {
  bore: 13.2, // m, TBM cut diameter
  inner: 11.83, // m, finished inside diameter
  length: 9.7, // km, stormwater tunnel
  motorway: 3, // km, double-deck section inside it
  decks: 2,
  lanes: 2, // per deck, one way, light vehicles only
  limit: 60, // km/h
};

export const STORE = {
  berembang: 600000, // m³, upstream holding pond at Kampung Berembang
  tunnel: 1000000, // m³, the bore itself
  tamanDesa: 1400000, // m³, downstream ex-mining pond at Taman Desa
};
export const CAPACITY = STORE.berembang + STORE.tunnel + STORE.tamanDesa; // 3 million m³
export const PONDS = STORE.berembang + STORE.tamanDesa;

export const MODE2 = 70; // m³/s at the confluence: divert into the lower channel
export const MODE3 = 150; // m³/s: close the motorway
export const REOPEN_AFTER_FLOOD = 48; // h, typical reopening after Mode 4
export const REOPEN_AFTER_CLOSE = [1]; // h, [inspection after a Mode 3 closure that stayed dry]
export const RELEASE = [30]; // m³/s, [controlled release from Taman Desa to the Kerayong]
export const DRAIN = [55]; // m³/s, [release while the bore empties after Mode 4]

// Rainfall stops: none, moderate, major, prolonged. Flow at the confluence each one settles to.
export const RAIN = [
  { name: "no storm", flow: 28 },
  { name: "moderate storm", flow: 112 },
  { name: "major storm", flow: 192 },
  { name: "prolonged storm", flow: 265 },
];

// Figure time: hours of storm per second of animation (cars always run at true speed).
export const HOURS_PER_S = { storm: 0.55, drain: 1.1, clean: 5 };
export const FLOW_TAU = 2.2; // s of figure time for the river to answer the rain

export const PHASES = {
  open: { mode: 1, deck: "open" },
  channel: { mode: 2, deck: "open" },
  closing: { mode: 3, deck: "closing" },
  closed: { mode: 3, deck: "closed" },
  flooding: { mode: 4, deck: "flooding" },
  flooded: { mode: 4, deck: "flooded" },
  draining: { mode: 4, deck: "draining" },
  cleaning: { mode: 1, deck: "cleaning" },
};

export function initial() {
  return { flow: RAIN[0].flow, stored: 0, phase: "open", reopen: 0, gate: 0, fill: 0, silt: 0, clock: 0 };
}

// Advance the operating state by dt seconds of figure time.
// rain: stop 0..3; cars: vehicles still on the decks (from the live layer).
export function step(s, rain, cars, dt) {
  const n = { ...s };
  const hourRate = s.phase === "cleaning" ? HOURS_PER_S.clean : s.phase === "draining" ? HOURS_PER_S.drain : HOURS_PER_S.storm;
  const dh = dt * hourRate;
  n.clock = s.clock + dh;
  n.flow = s.flow + (RAIN[rain].flow - s.flow) * (1 - Math.exp(-dt / FLOW_TAU));

  const inflow = n.flow > MODE2 ? n.flow - MODE2 : 0;
  const out = s.phase === "draining" ? DRAIN[0] : s.stored > 0 ? RELEASE[0] : 0;
  // The bore takes water only once its gates swing open, and holds it until it has drained.
  const room = s.phase === "flooding" ? PONDS + STORE.tunnel * s.gate : s.phase === "flooded" || s.phase === "draining" ? CAPACITY : PONDS;
  n.stored = Math.min(room, Math.max(0, s.stored + (inflow - out) * 3600 * dh));
  // The ponds take the water first; only an open bore (Mode 4) holds the last million.
  n.fill = Math.max(0, Math.min(1, (n.stored - PONDS) / STORE.tunnel));

  const next = () => (n.flow > MODE3 ? "closed" : n.flow > MODE2 ? "channel" : "open");
  switch (s.phase) {
    case "open":
      if (n.flow > MODE3) n.phase = "closing";
      else if (n.flow > MODE2) n.phase = "channel";
      break;
    case "channel":
      if (n.flow > MODE3) n.phase = "closing";
      else if (n.flow < MODE2) n.phase = "open";
      break;
    case "closing":
      if (cars === 0) n.phase = "closed";
      break;
    case "closed":
      if (n.flow > MODE3) {
        n.reopen = 0;
        if (n.stored >= PONDS * 0.985) n.phase = "flooding";
      } else {
        n.reopen = s.reopen > 0 ? s.reopen - dh : REOPEN_AFTER_CLOSE[0];
        if (n.reopen <= 0) {
          n.reopen = 0;
          n.phase = next();
        }
      }
      break;
    case "flooding":
      n.gate = Math.min(1, s.gate + dt / 3.2);
      if (n.fill >= 0.999) n.phase = "flooded";
      else if (n.flow < MODE3 && n.gate >= 1) n.phase = "draining";
      break;
    case "flooded":
      if (n.flow < MODE3) n.phase = "draining";
      break;
    case "draining":
      // Gates stay open until the bore has emptied back into the ponds and the river.
      n.reopen = Math.max(0, s.reopen - dh);
      n.silt = Math.min(1, s.silt + dt / 2);
      if (n.fill <= 0) {
        n.gate = Math.max(0, s.gate - dt / 3.2);
        if (n.gate <= 0) n.phase = "cleaning";
      }
      break;
    case "cleaning":
      n.reopen = Math.max(0, s.reopen - dh);
      n.silt = Math.min(1, n.reopen / (REOPEN_AFTER_FLOOD * 0.8));
      if (n.reopen <= 0) n.phase = next();
      break;
  }
  if (s.phase !== "draining" && n.phase === "draining") n.reopen = REOPEN_AFTER_FLOOD;
  if (n.phase === "open" || n.phase === "channel") n.silt = 0;
  return n;
}

// Water depth in the lower channel (m above invert) for a diverted flow, and whether traffic may enter.
export const CHANNEL_DEPTH = 3.4; // m from invert to the lower deck soffit
export function channelDepth(flow, phase) {
  if (phase === "flooding" || phase === "flooded") return CHANNEL_DEPTH;
  const diverted = Math.max(0, flow - MODE2);
  return CHANNEL_DEPTH * 0.92 * Math.min(1, Math.pow(diverted / 150, 0.6));
}
export const trafficOpen = (phase) => phase === "open" || phase === "channel";

const million = (v) => (v / 1e6).toFixed(2);
export function readoutOf(s) {
  const p = PHASES[s.phase];
  const parts = [`Mode ${p.mode}`, `${Math.round(s.flow)} m³/s`, `${million(s.stored)} M m³`, p.deck];
  if (s.reopen > 0) parts.push(`reopens in ${Math.ceil(s.reopen)} h`);
  return parts.join(" · ");
}
