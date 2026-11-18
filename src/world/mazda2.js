// The 2015 Mazda2 hatchback (public/models/mazda2.glb, a Sketchfab model: see CHANGELOG.md for
// the credit), parked at a free bay of the west curb.
//
// The file is a plain glTF export in metres, nose toward -z, with no material factors (glTF's
// defaults would make every part a rough metal), so this module fits it to the scene:
//   - scale: fitted to the real car's length (4.06 m), so it stands to the fleet's hatchbacks
//   - position: the origin is the middle of the wheelbase on the ground, tyres touching y = 0
//   - heading: the scene's parked cars have their nose at +z (south, with the west lane), so
//     the model turns half a lap inside its own pivot
//   - materials: rebuilt per part (lacquer, chrome, rubber, glass) on the same reflection
//     chunks as the rest of the fleet; the file's transmission glass is replaced by plain
//     alpha glass, because transmission costs a second render of the whole scene
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAR, CROSSWALK_Z } from './layout.js';
import { seat, groundReflect, clampRadiance, CAR_MAX_RADIANCE, blockedBay, shared } from './car.js';

const MODEL_URL = 'models/mazda2.glb';
const TARGET_LENGTH = 4.06;   // Mazda2 (DJ): 4 060 mm
const BAY_HALF = 2.1;         // half the bay it needs along the curb (the body, with a margin)
const BODY_PAINT = null;      // null: the paint the model ships with

// start the download early (cars-glb.js preloadCars); null if it fails or in ?shot frames
export function loadMazda2() {
  if (new URLSearchParams(location.search).has('shot')) return Promise.resolve(null);
  return new GLTFLoader().loadAsync(MODEL_URL).catch((e) => { console.warn('cars: mazda2.glb failed', e); return null; });
}

// one scene-ready material per part of the file, matched by the part's name
function convertMaterial(src, env, sky) {
  const name = src.name || '';
  const map = src.map ?? null;
  if (map) map.anisotropy = 8;
  const key = 'mazda-' + name;
  let m;
  if (/glass/i.test(name)) {
    m = new THREE.MeshStandardMaterial({
      color: 0x0d1319, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.42,
      envMap: env, envMapIntensity: 1, depthWrite: false,
    });
    clampRadiance(m, key);
    m.userData.glass = true;
  } else if (/body/i.test(name)) {
    m = new THREE.MeshPhysicalMaterial({
      map, roughness: 0.45, metalness: 0, specularIntensity: 0.18, clearcoat: 1, clearcoatRoughness: 0.05,
      envMap: env, envMapIntensity: 1,
    });
    groundReflect(m, key, CAR_MAX_RADIANCE, 1.4, 2.6);
  } else if (/chrom/i.test(name)) {
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.12, metalness: 1, envMap: env, envMapIntensity: 1 });
    groundReflect(m, key, CAR_MAX_RADIANCE, 2.1);
  } else if (/wheel/i.test(name)) {
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.3, metalness: 0.85, envMap: env, envMapIntensity: 1 });
    groundReflect(m, key, CAR_MAX_RADIANCE, 1.6);
  } else if (/rotor/i.test(name)) {
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0.7, envMap: sky, envMapIntensity: 1 });
    clampRadiance(m, key);
  } else if (/light/i.test(name)) {
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.18, metalness: 0, envMap: env, envMapIntensity: 1 });
    clampRadiance(m, key);
  } else if (/tire/i.test(name)) {
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, envMap: sky, envMapIntensity: 1 });
    clampRadiance(m, key);
  } else {   // black plastic trim, the interior
    m = new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0, envMap: sky, envMapIntensity: 1 });
    clampRadiance(m, key);
  }
  m.name = name;
  return m;
}

// the nearest free bay on the west curb to the hero car: clear of every collider, the cross
// street mouths and the mid-block crosswalk. Returns the bay's z, or null
function findBay(colliders) {
  const x = CAR.x + 0.05;
  const hit = (z) => colliders.some((c) => c.min && c.max
    && x + 1.05 > c.min.x && x - 1.05 < c.max.x
    && z + BAY_HALF + 0.6 > c.min.z && z - BAY_HALF - 0.6 < c.max.z);
  for (let d = 5; d < 80; d += 0.5) {
    for (const s of [1, -1]) {
      const z = CAR.z + s * d;
      if (blockedBay(z, BAY_HALF) || Math.abs(z - CROSSWALK_Z) < BAY_HALF + 3 || hit(z)) continue;
      return z;
    }
  }
  return null;
}

// Fit the loaded model into the scene and park it. `colliders` is the cars' collider list
// (the new car's box is added to it). Returns { car, update(camera) } or null
export function buildMazda2(scene, gltf, { env, colliders, lodDistance }) {
  if (!gltf) return null;
  const z = findBay(colliders);
  if (z == null) { console.warn('cars: no free bay for the Mazda2'); return null; }
  const sky = scene.environment;
  const model = gltf.scene;

  // measure the file as authored: its length, and the wheels (the node origins are the
  // wheel centres, and the tyres' lowest point is the ground)
  model.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const tyres = [];
  model.traverse((o) => { if (/^tire/i.test(o.name)) tyres.push(o); });
  const ground = new THREE.Box3(), wheelMid = new THREE.Vector3(), p = new THREE.Vector3();
  for (const t of tyres) { ground.union(new THREE.Box3().setFromObject(t)); wheelMid.add(t.getWorldPosition(p)); }
  const box = new THREE.Box3().setFromObject(model);
  const bottom = tyres.length ? ground.min.y : box.min.y;
  if (tyres.length) wheelMid.divideScalar(tyres.length); else box.getCenter(wheelMid);

  // scale to the real length; origin at the middle of the wheelbase, tyres on y = 0
  const k = TARGET_LENGTH / size.z;
  model.scale.setScalar(k);
  model.position.set(-wheelMid.x * k, -bottom * k, -wheelMid.z * k);
  // the model's nose is -z; the scene's parked cars face +z
  const pivot = new THREE.Group();
  pivot.rotation.y = Math.PI;
  pivot.add(model);
  const car = new THREE.Group();
  car.name = 'mazda2';
  car.add(pivot);

  const converted = new Map();
  model.traverse((o) => {
    if (!o.isMesh) return;
    let m = converted.get(o.material);
    if (!m) { m = convertMaterial(o.material, env, sky); converted.set(o.material, m); }
    o.material = m;
    o.castShadow = !m.userData.glass;
    o.receiveShadow = true;
    if (m.userData.glass) o.renderOrder = 1;
  });
  if (BODY_PAINT != null) for (const m of converted.values()) if (/body/i.test(m.name)) m.color.setHex(BODY_PAINT);
  for (const old of converted.keys()) old.dispose();

  // soft contact shadow under it, like the rest of the fleet
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.7).rotateX(-Math.PI / 2), shared().blob);
  blob.position.y = 0.012;
  blob.renderOrder = 1;
  blob.castShadow = false;
  car.add(blob);

  const x = CAR.x + 0.05;
  seat(car, x, z, 0);
  scene.add(car);
  console.info(`cars: Mazda2 parked at x ${x.toFixed(1)}, z ${z.toFixed(1)}`);
  const collider = { min: { x: x - 1.0, y: 0, z: z - 2.12 }, max: { x: x + 1.0, y: 1.5, z: z + 2.12 } };
  colliders.push(collider);
  const here = new THREE.Vector3();
  return {
    car, z, collider,
    // hidden beyond the cars' draw distance
    update(camera) { car.visible = car.getWorldPosition(here).distanceTo(camera.position) < lodDistance; },
  };
}
