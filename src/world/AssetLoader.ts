import { Scene, SceneLoader, AssetContainer } from '@babylonjs/core'
import '@babylonjs/loaders/glTF'

const BASE = `${import.meta.env.BASE_URL}assets/kenney/`
const load = (scene: Scene, name: string) =>
  SceneLoader.LoadAssetContainerAsync(BASE, name, scene)

export interface NatureAssets {
  trees:     AssetContainer[]   // [blocks, fat, simple, pineA, pineB]
  rocks:     AssetContainer[]   // [largeA, largeB, largeC, tallA, tallB]
  extras:    AssetContainer[]   // [mushroomRed, mushroomGroup, mushroomTall, stump, flowerRed, flowerPurple, grassLarge, log]
  statues:   AssetContainer[]   // [column, obelisk, head, ring]
  deco:      AssetContainer[]   // [campfire, bushSmall, bushLarge, hangingMoss, tent, logStack, logStackLarge]
  waterfall: AssetContainer[]   // [waterfallRock, waterfallTopRock]
  path:      AssetContainer[]   // [pathStone, pathStoneCircle, canoe]
}

export async function loadNatureAssets(scene: Scene): Promise<NatureAssets> {
  const [
    treeBlocks, treeFat, treeSimple, treePineA, treePineB,
    rockLargeA, rockLargeB, rockLargeC, rockTallA, rockTallB,
    mushroomRed, mushroomGroup, mushroomTall, stump, flowerRed, flowerPurple, grassLarge, log,
    statueColumn, statueObelisk, statueHead, statueRing,
    campfire, bushSmall, bushLarge, hangingMoss, tent, logStack, logStackLarge,
    waterfallRock, waterfallTopRock,
    pathStone, pathStoneCircle, canoe,
  ] = await Promise.all([
    load(scene, 'tree_blocks.glb'),
    load(scene, 'tree_fat.glb'),
    load(scene, 'tree_simple.glb'),
    load(scene, 'tree_pineRoundA.glb'),
    load(scene, 'tree_pineRoundB.glb'),
    load(scene, 'rock_largeA.glb'),
    load(scene, 'rock_largeB.glb'),
    load(scene, 'rock_largeC.glb'),
    load(scene, 'rock_tallA.glb'),
    load(scene, 'rock_tallB.glb'),
    load(scene, 'mushroom_red.glb'),
    load(scene, 'mushroom_redGroup.glb'),
    load(scene, 'mushroom_redTall.glb'),
    load(scene, 'stump_round.glb'),
    load(scene, 'flower_redA.glb'),
    load(scene, 'flower_purpleA.glb'),
    load(scene, 'grass_large.glb'),
    load(scene, 'log.glb'),
    load(scene, 'statue_column.glb'),
    load(scene, 'statue_obelisk.glb'),
    load(scene, 'statue_head.glb'),
    load(scene, 'statue_ring.glb'),
    load(scene, 'campfire_stones.glb'),
    load(scene, 'plant_bush.glb'),
    load(scene, 'plant_bushLarge.glb'),
    load(scene, 'hanging_moss.glb'),
    load(scene, 'tent_detailedOpen.glb'),
    load(scene, 'log_stack.glb'),
    load(scene, 'log_stackLarge.glb'),
    load(scene, 'cliff_waterfall_rock.glb'),
    load(scene, 'cliff_waterfallTop_rock.glb'),
    load(scene, 'path_stone.glb'),
    load(scene, 'path_stoneCircle.glb'),
    load(scene, 'canoe.glb'),
  ])

  return {
    trees:     [treeBlocks, treeFat, treeSimple, treePineA, treePineB],
    rocks:     [rockLargeA, rockLargeB, rockLargeC, rockTallA, rockTallB],
    extras:    [mushroomRed, mushroomGroup, mushroomTall, stump, flowerRed, flowerPurple, grassLarge, log],
    statues:   [statueColumn, statueObelisk, statueHead, statueRing],
    deco:      [campfire, bushSmall, bushLarge, hangingMoss, tent, logStack, logStackLarge],
    waterfall: [waterfallRock, waterfallTopRock],
    path:      [pathStone, pathStoneCircle, canoe],
  }
}

// Instantiate a container at a given position + scale + yaw
export function place(
  container: AssetContainer,
  x: number, y: number, z: number,
  scale: number, rotY = 0,
): void {
  const result = container.instantiateModelsToScene(undefined, false, { doNotInstantiate: false })
  const root   = result.rootNodes[0] as any
  if (!root) return
  root.position.set(x, y, z)
  root.scaling.setAll(scale)
  root.rotation.y = rotY
}
