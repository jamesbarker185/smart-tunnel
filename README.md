# SMART Tunnel, Kuala Lumpur, 2007

An interactive isometric cutaway of Kuala Lumpur's SMART Tunnel (Stormwater Management And Road Tunnel), showing how it switches between a double-deck motorway and a flood channel through its four operating modes.

- `smart-tunnel.html`: the interactive figure (light theme). Self-contained; open it in any browser.
- `smart-tunnel-dark.html`: the same figure, dark theme.
- `smart-tunnel-preview.png`: a 1200×1200 preview image for LinkedIn.

Move the pointer across the figure (or press 1–4) to set the rainfall; with no input it tours from no storm to a prolonged storm and back.

Built with the [anatomy](https://github.com/jamesbarker185/anatomy) skill. The source (`build.mjs`, `model.mjs`, `live.js`, `smart.css`) expects to sit at `productions/smart-tunnel/` inside that repo; rebuild with `node build.mjs` (and `node build.mjs --dark`).

Credit: MMC-Gamuda with JPS and LLM.
