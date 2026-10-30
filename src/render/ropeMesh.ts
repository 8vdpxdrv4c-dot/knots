import * as THREE from "three";

const STRANDS = 3;
const RADIAL = 16; // vertices around each strand
const SUB = 3; // smooth samples per particle gap
const CAP = 4; // rings in each strand's rounded end
// Drawn slightly thinner than the collision radius so contacts never show as overlap.
const VISUAL_SCALE = 0.93;
const OFFSET = 0.53; // strand axis distance from the rope axis, in visual radii
const STRAND_R = 0.47; // strand radius in visual radii; neighbours just touch (√3 · 0.53 ≈ 2 · 0.47)
const LAY = 7; // rope length per full turn of the strands, in radii

/**
 * Three-strand laid rope built around the simulated centerline every frame.
 * The strands are real geometry, so the outline is bumpy and the grooves stay dark.
 */
export class RopeMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  private readonly n: number;
  private readonly m: number;
  private readonly rings: number;
  private readonly d: number;
  private readonly rs: number;
  private readonly pitch: number;
  private readonly centers: Float32Array;
  private readonly frames: Float32Array; // normal and binormal per sample
  private readonly tangents: Float32Array;
  private readonly lengths: Float32Array;
  private readonly axis: Float32Array; // one strand's axis per sample
  private readonly outward: Float32Array; // from the rope axis toward that strand

  constructor(n: number, rope: { length: number; radius: number }, material: THREE.Material) {
    const { radius } = rope;
    const m = (n - 1) * SUB + 1;
    const rings = m + 2 * CAP;
    const verts = STRANDS * rings * (RADIAL + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
    const index: number[] = [];
    for (let s = 0; s < STRANDS; s++)
      for (let r = 0; r < rings - 1; r++)
        for (let j = 0; j < RADIAL; j++) {
          const a = (s * rings + r) * (RADIAL + 1) + j;
          const b = a + RADIAL + 1;
          index.push(a, a + 1, b, b, a + 1, b + 1); // counter-clockwise seen from outside
        }
    geometry.setIndex(index);
    super(geometry, material);
    const visual = radius * VISUAL_SCALE;
    this.n = n;
    this.m = m;
    this.rings = rings;
    this.d = OFFSET * visual;
    this.rs = STRAND_R * visual;
    this.pitch = LAY * radius;
    this.centers = new Float32Array(m * 3);
    this.frames = new Float32Array(m * 6);
    this.tangents = new Float32Array(m * 3);
    // The lay is measured along the rope at rest, so stretching never slides the strands.
    this.lengths = Float32Array.from({ length: m }, (_, k) => (k / SUB) * (rope.length / (n - 1)));
    this.axis = new Float32Array(m * 3);
    this.outward = new Float32Array(m * 3);
    this.castShadow = true;
    this.receiveShadow = true;
    this.frustumCulled = false;
  }

  update(p: Float32Array, pn: Float32Array): void {
    const { n, m, centers, frames, tangents, lengths, axis, outward, d, rs, pitch } = this;
    // Catmull-Rom between particles for a smooth centerline.
    for (let i = 0; i < n - 1; i++)
      for (let s = 0; s < SUB; s++) {
        const u = s / SUB;
        const o = (i * SUB + s) * 3;
        for (let c = 0; c < 3; c++) {
          const p0 = p[Math.max(i - 1, 0) * 3 + c];
          const p1 = p[i * 3 + c];
          const p2 = p[(i + 1) * 3 + c];
          const p3 = p[Math.min(i + 2, n - 1) * 3 + c];
          centers[o + c] =
            0.5 *
            (2 * p1 +
              (p2 - p0) * u +
              (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
              (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
        }
      }
    centers.set(p.subarray((n - 1) * 3, n * 3), (m - 1) * 3);

    // Frames from the baked material normals, so the twist travels with the rope.
    const t = new THREE.Vector3();
    const nor = new THREE.Vector3();
    const bin = new THREE.Vector3();
    for (let k = 0; k < m; k++) {
      const a = Math.max(k - 1, 0) * 3;
      const b = Math.min(k + 1, m - 1) * 3;
      t.set(
        centers[b] - centers[a],
        centers[b + 1] - centers[a + 1],
        centers[b + 2] - centers[a + 2],
      ).normalize();
      const i = Math.min(Math.floor(k / SUB), n - 2);
      const u = k / SUB - i;
      nor.set(
        pn[i * 3] * (1 - u) + pn[i * 3 + 3] * u,
        pn[i * 3 + 1] * (1 - u) + pn[i * 3 + 4] * u,
        pn[i * 3 + 2] * (1 - u) + pn[i * 3 + 5] * u,
      );
      nor.addScaledVector(t, -nor.dot(t)).normalize();
      bin.crossVectors(t, nor);
      t.toArray(tangents, k * 3);
      nor.toArray(frames, k * 6);
      bin.toArray(frames, k * 6 + 3);
    }

    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const normals = this.geometry.attributes.normal as THREE.BufferAttribute;
    const colors = this.geometry.attributes.color as THREE.BufferAttribute;
    const uvs = this.geometry.attributes.uv as THREE.BufferAttribute;
    const center = new THREE.Vector3();
    const out = new THREE.Vector3();
    const st = new THREE.Vector3();
    const sn = new THREE.Vector3();
    const sb = new THREE.Vector3();
    const dir = new THREE.Vector3();

    for (let s = 0; s < STRANDS; s++) {
      const phase = (2 * Math.PI * s) / STRANDS;
      for (let k = 0; k < m; k++) {
        const angle = (2 * Math.PI * lengths[k]) / pitch + phase;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (let c = 0; c < 3; c++) {
          const o = cos * frames[k * 6 + c] + sin * frames[k * 6 + 3 + c];
          outward[k * 3 + c] = o;
          axis[k * 3 + c] = centers[k * 3 + c] + o * d;
        }
      }

      // Rings run: start cap (tip first), body, end cap.
      for (let r = 0; r < this.rings; r++) {
        const k = r - CAP;
        const kk = Math.min(Math.max(k, 0), m - 1);
        const a = Math.max(kk - 1, 0) * 3;
        const b = Math.min(kk + 1, m - 1) * 3;
        st.set(axis[b] - axis[a], axis[b + 1] - axis[a + 1], axis[b + 2] - axis[a + 2]).normalize();
        out.fromArray(outward, kk * 3);
        // The ring frame faces away from the rope axis, so the dark inner side stays inside.
        sn.copy(out).addScaledVector(st, -out.dot(st)).normalize();
        sb.crossVectors(st, sn);
        center.fromArray(axis, kk * 3);

        let ringR = rs;
        let tilt = 0;
        let along = lengths[kk];
        if (k < 0 || k >= m) {
          // Rounded strand ends.
          const sign = k < 0 ? -1 : 1;
          const phi = ((Math.PI / 2) * (k < 0 ? -k : k - m + 1)) / CAP;
          ringR = rs * Math.cos(phi);
          center.addScaledVector(t.fromArray(tangents, kk * 3), sign * rs * Math.sin(phi));
          tilt = sign * phi;
          along += sign * rs * phi;
        }

        for (let j = 0; j <= RADIAL; j++) {
          const ang = (j / RADIAL) * Math.PI * 2;
          dir.copy(sn).multiplyScalar(Math.cos(ang)).addScaledVector(sb, Math.sin(ang));
          const v = (s * this.rings + r) * (RADIAL + 1) + j;
          pos.setXYZ(
            v,
            center.x + dir.x * ringR,
            center.y + dir.y * ringR,
            center.z + dir.z * ringR,
          );
          // Ambient occlusion: the sides pressed against the other strands get little light.
          const shade = 0.35 + 0.65 * Math.min(1, Math.max(0, 0.45 + 0.75 * dir.dot(out)));
          colors.setXYZ(v, shade, shade, shade);
          if (tilt !== 0) dir.multiplyScalar(Math.cos(tilt)).addScaledVector(st, Math.sin(tilt));
          normals.setXYZ(v, dir.x, dir.y, dir.z);
          uvs.setXY(v, along / pitch, j / RADIAL);
        }
      }
    }
    pos.needsUpdate = true;
    normals.needsUpdate = true;
    colors.needsUpdate = true;
    uvs.needsUpdate = true;
  }
}
