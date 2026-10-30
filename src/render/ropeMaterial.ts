import * as THREE from "three";

const SIZE = 256;

/**
 * Fibre detail for one strand, drawn procedurally so there are no image assets to manage.
 * The strands themselves are geometry (see RopeMesh); this only adds the fine twisted yarns.
 */
export function createRopeMaterial(
  color: THREE.ColorRepresentation,
  anisotropy: number,
): THREE.MeshPhysicalMaterial {
  const height = new Float32Array(SIZE * SIZE);
  let seed = 7;
  const noise = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE; // along the rope, one lay length per tile
      const v = y / SIZE; // around the strand
      // Yarns twist against the strand: soft ridges running diagonally.
      const yarn = 0.5 + 0.5 * Math.cos(2 * Math.PI * (4 * u - 6 * v));
      height[y * SIZE + x] = 0.75 * yarn + 0.25 * (0.5 + noise());
    }

  const colorData = new Uint8Array(SIZE * SIZE * 4);
  const normalData = new Uint8Array(SIZE * SIZE * 4);
  const at = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const g = 255 * (0.82 + 0.18 * height[i]);
      colorData.set([g, g, g, 255], i * 4);
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const len = Math.hypot(dx, dy, 1);
      normalData.set(
        [
          (0.5 - (0.5 * dx) / len) * 255,
          (0.5 - (0.5 * dy) / len) * 255,
          (0.5 + 0.5 / len) * 255,
          255,
        ],
        i * 4,
      );
    }

  const texture = (data: Uint8Array, srgb: boolean) => {
    const tex = new THREE.DataTexture(data, SIZE, SIZE);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = anisotropy;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const base = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: base,
    vertexColors: true, // strand-groove occlusion baked per vertex by RopeMesh
    map: texture(colorData, true),
    normalMap: texture(normalData, false),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.82,
    sheen: 0.7,
    sheenRoughness: 0.55,
    sheenColor: base.clone().lerp(new THREE.Color("#fff1e2"), 0.55),
  });
}
