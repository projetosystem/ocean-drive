// Vehicles converted from the MTA pack (public/models/mta/*.glb, see CHANGELOG.md for the
// credit and licence note): textured cars, a motorbike and a quad bike with their wheels as
// separate nodes. tools: dff2glb (vehicle.py). The files are glTF in metres, nose at +z, the
// car's left at +x, the origin at the middle of the wheelbase with the tyres on y = 0, and
// carry `extras` on the root: length, wheelbase, track, wheelR, wheels (the wheel nodes).
// Materials: role `paint` (body colour, set per instance), `paint2` (dark trim), `glass`,
// `lamp`, and the textured rest.
//
// A car is built from a file into an instance (root, wheel nodes, the driver's anchor) and,
// for the player, wrapped in a view with the interface vehicles/index.js drives (the same as
// the hero's and the fleet cars'): apply(v), lod(dist), eye(out), eyeQuat(out), attachDriver.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LOD } from './lod.js';

const BASE = 'models/mta/';
const FLIP_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// which file a parked body kind / paint draws: the lighter models only (the whole pack is in
// public/models/mta; the heavy ones, i8 and saveiro-cross, are for close-ups)
export const FLEET_POOL = {
  hatch: ['carro-golf'],
  sedan: ['carro-lancer'],
  wagon: [],
  coupe: ['carro-silvia', 'carro-toyota-supra', 'carro-gtr', 'carro-shelby'],
  suv: ['carro-vapid', 'carro-suburban'],
  crossover: [],
  pickup: [],
};
export const MOTO_FILE = 'moto-kawasaki';
export const QUAD_FILE = 'quadriciclo';
export const modelFor = (kind, color = 0) => {
  const pool = FLEET_POOL[kind];
  if (!pool || !pool.length) return null;   // no MTA model for this kind: the generic body stays
  return pool[Math.abs(color | 0) % pool.length];
};

const cache = new Map();   // name -> Promise<gltf | null>
export const loaded = new Map();   // name -> gltf (once it is in)
export function loadMta(name) {
  if (new URLSearchParams(location.search).has('shot')) return Promise.resolve(null);
  if (!cache.has(name)) {
    cache.set(name, new GLTFLoader().loadAsync(`${BASE}${name}.glb`)
      .then((g) => { loaded.set(name, g); return g; })
      .catch((e) => { console.warn('mta: ' + name + ' failed', e); return null; }));
  }
  return cache.get(name);
}

// one instance: clones the file's scene (geometry and textures are shared), its own paint
export function instantiate(gltf, { color = 0xb9bcbf, length = null, env = null, shadows = true } = {}) {
  const src = gltf.scene.children[0] ?? gltf.scene;
  const info = src.userData ?? {};
  const model = src.clone(true);
  const s = length && info.length ? length / info.length : 1;
  model.scale.setScalar(s);
  const root = new THREE.Group();
  root.add(model);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env, envMapIntensity: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.55, metalness: 0.1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1319, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false, envMap: env, envMapIntensity: 1 });
  const swapped = new Map();
  model.traverse((o) => {
    if (!o.isMesh) return;
    let m = swapped.get(o.material);
    if (!m) {
      const role = o.material.userData?.role;
      if (role === 'paint') m = paint;
      else if (role === 'paint2' || role === 'paint3' || role === 'paint4') m = trim;
      else if (role === 'glass') m = glass;
      else {
        m = o.material;
        m.roughness = role === 'lamp' ? 0.25 : 0.62;
        m.metalness = 0.05;
        if (m.map) m.map.anisotropy = 4;
        if (env && !m.envMap) { m.envMap = env; m.envMapIntensity = 0.6; }
        m.side = THREE.FrontSide === m.side ? m.side : THREE.DoubleSide;
      }
      swapped.set(o.material, m);
    }
    o.material = m;
    o.castShadow = shadows && m !== glass;
    o.receiveShadow = false;   // (self-shadowing on these low-poly bodies drew stair-step acne across the paint)
    if (m === glass) o.renderOrder = 2;
  });
  const wheels = {};
  for (const tag of ['FL', 'FR', 'RL', 'RR', 'F', 'R']) {
    const w = model.getObjectByName('wheel_' + tag);
    if (w) wheels[tag] = w;
  }
  const driver = model.getObjectByName('driver');
  const box = new THREE.Box3().setFromObject(model);
  return { root, model, wheels, driver, paint, scale: s, info, len: (info.length ?? 4.5) * s, wheelR: (info.wheelR ?? 0.34) * s,
    zc: (box.max.z + box.min.z) / 2, top: box.max.y, width: (info.width ?? 1.9) * s };
}

const tmpA = new THREE.Vector3();
// the player's view of a car instance (the interface of cars-glb.js makeDrivable)
export function carView(scene, I, kind) {
  const eye = new THREE.Object3D();
  const pelvis = new THREE.Object3D();
  const d = I.driver ? I.driver.position : tmpA.set(0.4, 0.5, 0);
  // (the model's driver anchor is the hips; the eye 0.62 m above and a little back)
  pelvis.position.copy(d).multiplyScalar(I.scale);
  eye.position.set(pelvis.position.x, pelvis.position.y + 0.62, pelvis.position.z - 0.05);
  I.model.add(pelvis, eye);
  const rig = { pelvis, eye, gripL: null, gripR: null, wheel: null, wheelAngle: 0, t: 0, body: null, update: null, chase: false };
  const wheels = [I.wheels.FL, I.wheels.FR, I.wheels.RL, I.wheels.RR];
  scene.add(I.root);
  const view = {
    kind, mta: true, root: I.root, rig,
    apply(v) {
      const g = I.root;
      g.visible = true;
      g.position.set(v.x, v.bodyY, v.z);
      g.rotation.set(-v.pitch, v.yaw + Math.PI, -v.roll, 'YXZ');
      I.model.position.y = -(v.visSink ?? 0);
      const dd = v.steer, ad = Math.abs(dd), S = v.spec;
      let inner = dd, outer = dd;
      if (ad > 1e-4) {
        const R = S.wheelbase / Math.tan(ad);
        inner = Math.sign(dd) * Math.atan(S.wheelbase / Math.max(0.5, R - S.track / 2));
        outer = Math.sign(dd) * Math.atan(S.wheelbase / (R + S.track / 2));
      }
      const angFL = dd > 0 ? outer : inner, angFR = dd > 0 ? inner : outer;
      wheels[0]?.rotation.set(v.wheelRot, -angFL, 0, 'YXZ');
      wheels[1]?.rotation.set(v.wheelRot, -angFR, 0, 'YXZ');
      wheels[2]?.rotation.set(v.wheelRot, 0, 0);
      wheels[3]?.rotation.set(v.wheelRot, 0, 0);
      rig.wheelAngle = (v.steer / S.steerMax) * 0.75 * 2 * Math.PI;
      if (rig.body) {
        rig.body.visible = !!v.ridden && !rig.hidden;
        if (v.ridden && rig.update) { rig.t = v.t; g.updateMatrixWorld(true); rig.update(rig, v); }
      }
    },
    lod(dist) { I.root.visible = dist < LOD.cars; },
    eye: (out) => eye.getWorldPosition(out),
    eyeQuat: (out) => I.root.getWorldQuaternion(out).multiply(FLIP_Y),
    setView(mode) { rig.chase = mode === 'chase'; },
    attachDriver(body, { update = null } = {}) {
      pelvis.add(body);
      rig.body = body; rig.update = update;
      body.visible = false;
      return () => { pelvis.remove(body); rig.body = rig.update = null; };
    },
    dispose() { scene.remove(I.root); },
  };
  return view;
}

// ---------------------------------------------------------------------------
// the rideables that replace the procedural bike / ATV: the same fields vehicles/index.js
// poses (see pose3 there), built from the MTA motorbike and quad
let _blobTex = null;
function shadowBlob(w, l) {
  if (!_blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    _blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.renderOrder = 1; m.castShadow = false;
  return m;
}

// MTA models face +z; the rideables' sim faces -z, so the model turns half a lap in its group
export function buildMotoBike(gltf, env) {
  const I = instantiate(gltf, { color: 0x1e7a3c, length: 1.94, env });
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt);
  tilt.add(I.root);
  I.root.rotation.y = Math.PI;
  I.root.position.y = 0;
  const steer = new THREE.Object3D();
  tilt.add(steer);
  const shadow = shadowBlob(1.0, 2.6);
  return {
    root, tilt, steer, wheelF: I.wheels.F ?? new THREE.Object3D(), wheelR: I.wheels.R ?? new THREE.Object3D(),
    crank: new THREE.Object3D(), pedals: [], kick: new THREE.Object3D(), shadow, mat: { userData: { u: {} } }, R: I.wheelR,
    spin: -1,   // (the wheel nodes sit in a half-turned group)
    mta: true, inst: I,
  };
}

export function buildMotoQuad(gltf, env) {
  const I = instantiate(gltf, { color: 0xc92b22, length: 2.18, env });
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt);
  tilt.add(I.root);
  I.root.rotation.y = Math.PI;
  const steer = new THREE.Object3D();
  tilt.add(steer);
  // the sim's wheel list: FL FR RL RR with x, z in the sim frame (the nose at -z), a `hold`
  // that carries the wheel's height / steering and the `mesh` that spins
  const wheels = ['FL', 'FR', 'RL', 'RR'].map((tag) => {
    const node = I.wheels[tag];
    const k = I.scale;
    const hold = new THREE.Group();
    hold.position.copy(node.position).multiplyScalar(k);   // (in the unscaled, half-turned root)
    const x = -node.position.x * k, z = -node.position.z * k;
    node.position.set(0, 0, 0);
    node.scale.multiplyScalar(k);
    hold.add(node);
    I.root.add(hold);
    return { hold, mesh: node, x, z };
  });
  const shadow = shadowBlob(1.6, 2.8);
  const u = { uLights: { value: 0 }, uBeaconA: { value: 0 }, uBeaconB: { value: 0 } };
  return { root, tilt, steer, wheels, shadow, mat: { userData: { u } }, R: I.wheelR, spin: -1, mta: true, inst: I };
}

// ---------------------------------------------------------------------------
// the parked fleet (world/cars-glb.js buildFleet): near the viewer each parked car is drawn
// from its MTA model instead of the batched generic body; far away the batch stays. A car
// driven off (fleet.take) loses its instance, and the view the player drives is made from
// the same file (makeView).
export function createMtaFleet(scene, fleet, { env, seat, near = 62 }) {
  const NEAR2 = near * near, active = new Map();   // car -> instance
  const free = [];                                 // pool per model name
  const take = (c) => {
    const name = modelFor(c.kind, c.color);
    const gltf = name && loaded.get(name);
    if (!gltf) { if (name) loadMta(name); return null; }
    const pool = free.filter((f) => f.name === name);
    let I = pool[0];
    if (I) free.splice(free.indexOf(I), 1);
    else {
      I = instantiate(gltf, { color: c.color, length: c.L, env });
      I.name = name;
    }
    I.paint.color.setHex(c.color);
    return I;
  };
  const hideBatch = (c, hide) => {
    if (hide) { c.override = true; for (const pt of c.parts) pt.bm.setVisibleAt(pt.id, false); }
    else { c.override = false; c.vis = false; c.lod = -1; }   // (the fleet's own update shows it again)
  };
  function drop(c) {
    const I = active.get(c);
    if (!I) return;
    scene.remove(I.root);
    free.push(I);
    active.delete(c);
    hideBatch(c, false);
  }
  const take0 = fleet.take, release0 = fleet.release;
  fleet.take = (c) => { drop(c); take0(c); };
  fleet.release = (c) => release0(c);
  const sin = Math.sin, cos = Math.cos;
  return {
    update(p) {
      for (const c of fleet.cars) {
        const d2 = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
        if (c.taken || d2 > NEAR2 * 1.2) { if (active.has(c)) drop(c); continue; }
        if (active.has(c) || d2 > NEAR2) continue;
        const I = take(c);
        if (!I) continue;
        const R = c.pose.yaw + Math.PI;
        // (the model's centre where the generic body's centre was)
        seat(I.root, c.x - I.zc * sin(R), c.z - I.zc * cos(R), R);
        I.root.visible = true;
        scene.add(I.root);
        active.set(c, I);
        hideBatch(c, true);
      }
    },
    makeView(kind, color) {
      const name = modelFor(kind, color);
      const gltf = name && loaded.get(name);
      if (!gltf) { if (name) loadMta(name); return null; }
      const I = instantiate(gltf, { color: color ?? 0xb9bcbf, length: lengthOf(kind), env });
      return carView(scene, I, kind);
    },
    preload(kinds = Object.keys(FLEET_POOL)) { for (const k of kinds) for (const n of FLEET_POOL[k]) loadMta(n); },
  };
}
const LENGTH = { hatch: 4.2, sedan: 4.8, wagon: 4.86, coupe: 5.05, crossover: 4.45, suv: 4.72, pickup: 5.36 };
const lengthOf = (kind) => LENGTH[kind] ?? 4.8;
