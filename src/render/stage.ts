import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Prop } from "../knots/types";

const BACKGROUND = "#ece7de";

/** A fixed prop, drawn from the same axis and radius the simulation collides with. */
export function createPropMesh({ kind, a, b, radius }: Prop): THREE.Mesh {
  const axis = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const length = axis.length();
  const mesh = new THREE.Mesh(
    kind === "capsule"
      ? new THREE.CapsuleGeometry(radius, length, 8, 24)
      : new THREE.CylinderGeometry(radius, radius, length, 32),
    new THREE.MeshStandardMaterial({ color: "#8a7458", roughness: 0.7 }),
  );
  mesh.position.set(...a).addScaledVector(axis, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Renderer, camera and a softly lit table for the rope to lie on. */
export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.Fog(BACKGROUND, 2.2, 4.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;

  const key = new THREE.DirectionalLight("#fff4e8", 2.6);
  key.position.set(-0.6, 1.6, 0.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 5;
  key.shadow.intensity = 0.65; // the fill and room light reach into the shade; full-strength shadows read too heavy
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  Object.assign(key.shadow.camera, {
    left: -0.8,
    right: 0.8,
    top: 0.8,
    bottom: -0.8,
    near: 0.5,
    far: 3.5,
  });
  scene.add(key);
  // Weak warm fill from below and around, so shadows read soft brown, never black or grey.
  scene.add(new THREE.HemisphereLight("#fff4e6", "#a8875c", 0.35));

  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ color: "#e4ddd1", roughness: 0.95 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  camera.position.set(0.02, 0.72, 0.92);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.02, 0.02, 0.04);
  controls.enableDamping = true;
  controls.minDistance = 0.25;
  controls.maxDistance = 2.5;
  controls.maxPolarAngle = Math.PI * 0.47; // stay above the table
  controls.update();

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole rope in view on narrow screens.
    camera.fov = w / h < 1 ? 30 / Math.max(0.55, w / h) : 30;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  return {
    renderer,
    scene,
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
  };
}
