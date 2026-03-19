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

The camera (`SpringCamera.ts`) has its own yaw that lazily follows the bird — this gap between bird direction and camera direction is where the Banjo feel lives. Right-click orbit, R to snap.

### World
Caldera terrain with vertex colors, bowl walls, central Spire (7-sided cylinder + torus rings). Mountain with cave and waterfall NE. Zone landmarks: Hollows (stone arches N), Canopy (tall pillars E), ScrapYard (debris W). 60 rocks + 45 trees via instancing. Sky dome, shadow map, bloom + FXAA + color grade post-processing.

### NPC flock
8 bird NPCs (`NpcFlock.ts`) with three behaviors: sideline (orbit player from a distance), scout (fly ahead and backward-face), orbit (circle overhead). Purely client-side, not networked.

### Multiplayer
WebSocket relay server (`park-server.py` on trident). Players see each other as birds with floating name labels. Positions interpolated smoothly. Auto-reconnect on drop.

### Chat traces
Press **T**, type, Enter. Drops a graffiti tag billboard at your world position — player-colored tag shape, your name, white message text, random tilt. Floats up 1.8 units, fades after 90 seconds. Synced to all players. New joiners see traces younger than 90s (TTL-filtered on server).

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

Mobile: nipplejs joystick for movement, flap/egg/rocket buttons present but not fully wired.

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
    WorldBuilder.ts     terrain, zones, vegetation
    BirdMesh.ts         N64-style chunky bird mesh
    DayNightCycle.ts    4-keyframe day/night (not wired)
    NpcFlock.ts         8 NPC birds, 3 behaviors
    TraceManager.ts     graffiti trace billboards
  network/
    WebSocketClient.ts  WS connect/reconnect/send
    RemotePlayers.ts    remote bird spawn/lerp/despawn
  ui/
    ChatInput.ts        T to open, Enter to submit

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

All load client-side — server never sees them, multiplayer unaffected. Slow connections see late pop-in but can still fly and connect fine.

| What | Source | Format |
|------|--------|--------|
| PBR textures (grass, rock, dirt, bark) | polyhaven.com / ambientcg.com | JPG → `PBRMaterial` |
| Low-poly trees, rocks, nature | kenney.nl / quaternius.com | GLB → `SceneLoader.ImportMesh` |
| Searchable low-poly models | poly.pizza | GLB |
| HDRI sky | polyhaven.com | HDR → `CubeTexture` |

```ts
// Texture from URL
mat.diffuseTexture = new Texture("https://...", scene)

// GLB model
SceneLoader.ImportMesh("", "https://...", "tree.glb", scene, (meshes) => {
  meshes[0].position.set(x, y, z)
})
```

Biggest visual jump for least work: terrain PBR textures first, then replace procedural trees/rocks with Kenney assets, then HDRI sky.

---

## Direction

The game needs three more layers to feel complete:

**1. Identity** — right now everyone is named "player" and the bird looks the same. Name input on load (stored in localStorage), maybe a color picker. This makes traces meaningful and multiplayer feel real.

**2. Things to find** — the world is beautiful but passive. Gems scattered in hard-to-reach spots (top of Spire, inside the cave, behind the waterfall). No score — just the pop of finding one. Something unusual on each Canopy pillar. A reason to explore the whole caldera.

**3. Interaction** — egg bombs: arc projectile, harmless knockback, funny not punishing. NPC birds scatter when you fly through them. The world reacts to you being in it.

**4. Wire day/night** — 5-minute job, already coded. Makes the world feel alive on its own.

After those four: mobile controls, rockets, and then assess what the game actually is based on how people play it.

---

## Key decisions

- No competitive mechanics ever — no score, no timer, no lives
- Horizontal-only carving — vel.y owned by gravity/lift, carving never touches it
- Camera-relative input removed — direct bird-frame + lazy camera creates the feel
- Sound low priority — deaf player base
- No reference to virtualPark.html — clean slate
