import { Scene, SceneLoader, AssetContainer } from '@babylonjs/core'
import '@babylonjs/loaders/glTF'

const BASE = `${import.meta.env.BASE_URL}assets/kenney/`
const load = (scene: Scene, name: string) =>
  SceneLoader.LoadAssetContainerAsync(BASE, name, scene)

export interface NatureAssets {
  trees:  AssetContainer[]   // [blocks, fat, simple, pineA, pineB]
  rocks:  AssetContainer[]   // [largeA, largeB, largeC, tallA, tallB]
  extras: AssetContainer[]   // [mushroomRed, mushroomGroup, stump, flowerRed, flowerPurple, grassLarge, log]
}

export async function loadNatureAssets(scene: Scene): Promise<NatureAssets> {
  const [
    treeBlocks, treeFat, treeSimple, treePineA, treePineB,
    rockLargeA, rockLargeB, rockLargeC, rockTallA, rockTallB,
    mushroomRed, mushroomGroup, stump, flowerRed, flowerPurple, grassLarge, log,
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
    load(scene, 'stump_round.glb'),
    load(scene, 'flower_redA.glb'),
    load(scene, 'flower_purpleA.glb'),
    load(scene, 'grass_large.glb'),
    load(scene, 'log.glb'),
  ])

  return {
    trees:  [treeBlocks, treeFat, treeSimple, treePineA, treePineB],
    rocks:  [rockLargeA, rockLargeB, rockLargeC, rockTallA, rockTallB],
    extras: [mushroomRed, mushroomGroup, stump, flowerRed, flowerPurple, grassLarge, log],
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
