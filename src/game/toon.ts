import * as THREE from 'three';

/** Layer used for inverted-hull outlines, so the edge pass's normal render skips them. */
export const OUTLINE_LAYER = 1;

let gradient: THREE.DataTexture | null = null;
/** 3-step toon ramp. */
export function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([105, 185, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();
export function toon(color: number, map?: THREE.Texture): THREE.MeshToonMaterial {
  const key = `${color}:${map?.uuid ?? ''}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), map: map ?? null });
    cache.set(key, m);
  }
  return m;
}

/** Unlit, HDR-bright material: these are the only things that bloom. */
export function glow(color: number, intensity = 3): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
}

const hullMat = new THREE.MeshBasicMaterial({ color: 0x15161c, side: THREE.BackSide });
const box = new THREE.Box3();
const size = new THREE.Vector3();
const center = new THREE.Vector3();

/** Inverted-hull outline: a slightly larger black back-face copy, scaled about the geometry centre. */
export function outline(target: THREE.Object3D, thickness = 0.012): void {
  const meshes: THREE.Mesh[] = [];
  target.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.isHull && !m.userData.noOutline) meshes.push(m);
  });
  for (const m of meshes) {
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    box.copy(g.boundingBox!);
    box.getSize(size);
    box.getCenter(center);
    const s = (v: number) => 1 + (2 * thickness) / Math.max(v, 0.02);
    const hull = new THREE.Mesh(g, hullMat);
    hull.userData.isHull = true;
    hull.scale.set(s(size.x), s(size.y), s(size.z));
    hull.position.set(center.x * (1 - hull.scale.x), center.y * (1 - hull.scale.y), center.z * (1 - hull.scale.z));
    hull.layers.set(OUTLINE_LAYER);
    hull.raycast = () => {};
    m.add(hull);
  }
}
