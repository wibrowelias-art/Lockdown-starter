import * as THREE from 'three';
import type { PBRSet } from './materials';

// v3: everything is physically based. The cartoon look (toon ramp + ink outlines)
// lives on in the v2 commit; these helpers keep the old call sites working.

/** Layer kept for compatibility (v2 hulls). */
export const OUTLINE_LAYER = 1;

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** A plain PBR material (name kept from v2). */
export function toon(color: number, map?: THREE.Texture, rough = 0.72): THREE.MeshStandardMaterial {
  const key = `${color}:${map?.uuid ?? ''}:${rough}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, map: map ?? null, roughness: rough, metalness: 0 });
    cache.set(key, m);
  }
  return m;
}

export function std(color: number, rough = 0.72, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
}

/** Material from a procedural PBR set. */
export function pbr(set: PBRSet, extra: Partial<THREE.MeshStandardMaterialParameters> = {}, normalScale = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: 1,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    ...extra,
  });
}

/** Unlit, HDR-bright material: the only things that bloom (door window, strip, EXIT, sirens). */
export function glow(color: number, intensity = 3): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
}

/** v2 inverted-hull outlines are gone in v3 (no-op kept for call sites). */
export function outline(_target: THREE.Object3D, _thickness = 0.012): void {}

/** Mark every mesh under o as shadow caster/receiver. */
export function shadows(o: THREE.Object3D, cast = true, receive = true): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}
