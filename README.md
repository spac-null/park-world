# Park World

Multiplayer 3D browser game. You fly a bird around a caldera with other people.

**Live**: https://spac-null.github.io/park-world/
**Server**: wss://park.jaschablume.nl
**Stack**: Babylon.js + TypeScript + Vite → GitHub Pages

---

## What it is

No score. No timer. No win condition. You fly, you leave messages, you find things.

The feel reference is N64 Banjo-Kazooie — not the visuals, but the weight of movement: the lazy camera, the momentum when you bank into a turn, the satisfaction of a clean landing. Most players will be deaf so sound is low priority.

---

## What's built

### Flight
Full force-model physics in `FlightPhysics.ts`. Gravity, lift (quadratic falloff below stall speed), drag (gliding vs powered), horizontal carving. Direct bird-frame input — A/D bank, W/S pitch, Space flap. Tumble on hard crash. Coyote time on takeoff.

**Body inertia roll**: underdamped spring on visual roll — when you bank right the body briefly tilts left first (Newton resistance), then swings into the turn and settles. `ROLL_SPRING=18`, `ROLL_DAMPING=5` (underdamped → overshoot).

The camera (`SpringCamera.ts`) has its own yaw that lazily follows the bird — this gap is where the Banjo feel lives. Right-click orbit, R to snap.

### World
Caldera terrain with vertex colors, bowl walls, central Spire (7-sided cylinder + torus rings). Mountain with cave and waterfall NE. Zone landmarks: Hollows (stone arches N), Canopy (tall pillars E), ScrapYard (debris W). Sky dome, shadow map, bloom + FXAA + color grade post-processing.

**Kenney nature kit** (CC0, `public/assets/kenney/`): 80 trees (tree_blocks + tree_fat heavy — most N64), 60 rocks (5 variants), 80 extras (mushrooms, stumps, logs, flowers, grass tufts). Load async after scene starts — world is flyable immediately, assets pop in. Path uses `import.meta.env.BASE_URL` so it works both locally and on GitHub Pages.

### NPC flock
8 bird NPCs (`NpcFlock.ts`) with three behaviors: sideline, scout (backward-facing), orbit. Purely client-side, not networked. No chat behavior.

### Multiplayer
WebSocket relay server (`park-server.py` on trident). Players see each other as birds with floating name labels. Positions interpolated smoothly. Auto-reconnect on drop.

### Chat traces
Press **T**, type, Enter. Bird glides naturally while typing (vel.y counter-gravity prevents nosedive). Drops a graffiti tag billboard at world position — rounded rect with player-colored stripe, name, white message, random ±8° tilt. Floats up 1.8 units, fades after 90s. Synced to all players. New joiners only see traces < 90s old (TTL on server).

**Texture pipeline**: real HTML canvas → `DynamicTexture(name, canvas, scene)` → `emissiveTexture + opacityTexture` — full brightness, transparent corners. Babylon proxy canvas can't clearRect alpha reliably so the HTML canvas is used directly.

Day/night cycle is coded (`DayNightCycle.ts`) but not yet wired into the game loop.

---

## Controls

| Key | Action |
|-----|--------|
| W / up | pitch nose up |
| S / down | pitch nose down |
| A / left | bank left |
| D / right | bank right |
| Space | flap |
| R | snap camera behind bird |
| T | open chat (Enter to drop trace) |
| Right-click drag | orbit camera |

Mobile: nipplejs joystick for movement. `isMobile` requires both touch support AND `window.innerWidth < 1024` — prevents MacBooks (which report `maxTouchPoints > 0`) from triggering mobile mode.

---

## Code layout

```
src/
  config.ts             all tuning constants
  types.ts              FlightState, InputState, PlayerState interfaces
  main.ts               game loop, wiring, animation
  engine/
    InputManager.ts     keyboard + joystick → unified InputState
  physics/
    FlightPhysics.ts    force model
  camera/
    SpringCamera.ts     lazy-yaw spring camera
  world/
    WorldBuilder.ts     terrain, zones, structure (sync)
    BirdMesh.ts         N64-style chunky bird mesh
    DayNightCycle.ts    4-keyframe day/night (NOT WIRED)
    NpcFlock.ts         8 NPC birds, 3 behaviors
    TraceManager.ts     graffiti trace billboards
    AssetLoader.ts      async Kenney GLB loader + placer
  network/
    WebSocketClient.ts  WS connect/reconnect/send
    RemotePlayers.ts    remote bird spawn/lerp/despawn
  ui/
    ChatInput.ts        T to open, Enter to submit

public/assets/kenney/   20 GLB files (trees, rocks, mushrooms, flowers, extras)

scripts/ops/
  park-server.py        WebSocket relay (on trident)
  park-server.service   systemd unit
```

---

## Deploy

```bash
# build + push → GitHub Actions deploys to Pages automatically
git add -A && git commit -m "..." && git push

# server changes (from ~/code/trident/)
make deploy-scripts
sudo systemctl restart park-server   # on trident
```

---

## Asset sources (free, CC0)

All load client-side — server never sees them, multiplayer unaffected.

| What | Source | Format |
|------|--------|--------|
| PBR textures (grass, rock, dirt, bark) | polyhaven.com / ambientcg.com | JPG → `PBRMaterial` |
| Low-poly trees, rocks, nature | kenney.nl ✓ done | GLB → `AssetLoader` |
| Searchable low-poly models | poly.pizza | GLB |
| HDRI sky | polyhaven.com | HDR → `CubeTexture` |

---

## Direction — what's next

World needs to feel complete before weapons/interactions.

**1. Wire day/night** — 5-minute job, already coded. World feels alive on its own.

**2. Identity** — name input on load (localStorage), maybe color picker. Everyone is "player" right now — traces are meaningless until this is done.

**3. Things to find** — gems in hard spots (top of Spire, inside cave, behind waterfall). No score, just the pop of finding one. Something on each Canopy pillar. A reason to explore the whole caldera.

**4. Interaction** — egg bombs (arc, knockback, funny). NPC birds scatter when you fly through them.

After those: mobile button wiring, rockets, assess based on how people play.

---

## Key decisions

- No competitive mechanics ever — no score, no timer, no lives
- Horizontal-only carving — vel.y owned by gravity/lift only
- Camera-relative input removed — direct bird-frame + lazy camera creates the feel
- Glide while typing — physics keep running, only steering input is blocked
- HTML canvas for trace textures — Babylon proxy can't clearRect alpha
- Sound low priority — deaf player base
- `v0.1-foundation` tag = last commit before Kenney assets

---

## Known gotchas

- `isMobile` must check `window.innerWidth < 1024` — MacBooks have `maxTouchPoints > 0`
- Asset paths must use `import.meta.env.BASE_URL` — Vite base is `/park-world/` on Pages
- Babylon `DynamicTexture` proxy: `clearRect` doesn't preserve alpha — use real HTML canvas + `drawImage` or `drawText` with `'transparent'` bg
- `opacityTexture` reads alpha channel (not luminance) by default
- `emissiveTexture` for unlit billboards — `diffuseTexture` goes dark in shadowed areas
