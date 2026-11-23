// MTA (GTA San Andreas) pedestrian skins on the game's Mixamo-rigged people.
//
// The converted skins (public/models/mta-skins/*.glb) are static meshes: no skeleton. They are
// fitted to a person's own skeleton at runtime ("auto-skinning by proximity"): the mesh is
// scaled to the body's height and set on its feet, and every vertex takes the nearest bone
// segments of the person's rest pose as its weights. All of the people's clips (walking, sitting,
// driving...) then move the skin, since it hangs from the same bones.
//
// applySkin(P, id) swaps the geometry / material of a person's skinned meshes in place (null puts
// the original body back); the geometry is built once per skin, skeleton and level and cached.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = 'models/mta-skins/';
// the bones a vertex can follow (Mixamo names, without the 'mixamorig' prefix); the fingers
// follow the hand, the toes the foot
const BODY = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

const CHAIN = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Shoulder: 'Arm', Arm: 'ForeArm', ForeArm: 'Hand', UpLeg: 'Leg', Leg: 'Foot', Foot: 'ToeBase' };

let index = null;
export async function skinList() {
  if (!index) index = fetch(BASE + 'index.json').then((r) => r.json()).catch(() => []);
  return index;
}

const sources = new Map();   // id -> Promise<{ geometry, map, alpha }>
function loadSource(id) {
  if (!sources.has(id)) {
    sources.set(id, new GLTFLoader().loadAsync(`${BASE}${id}.glb`).then((g) => {
      // the skin is several parts (face, shirt, trousers, shoes...: one material each): merged into
      // one geometry with a group per material
      g.scene.updateMatrixWorld(true);
      const parts = [];
      g.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
      const geoms = parts.map((o) => o.geometry.clone().applyMatrix4(o.matrixWorld));
      let n = 0, ni = 0;
      for (const q of geoms) { n += q.attributes.position.count; ni += q.index ? q.index.count : q.attributes.position.count; }
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), I = new Uint32Array(ni);
      const out = new THREE.BufferGeometry();
      let v0 = 0, i0 = 0;
      geoms.forEach((q, k) => {
        const c = q.attributes.position.count, nm = q.attributes.normal, uv = q.attributes.uv;
        for (let i = 0; i < c; i++) {
          P[(v0 + i) * 3] = q.attributes.position.getX(i); P[(v0 + i) * 3 + 1] = q.attributes.position.getY(i); P[(v0 + i) * 3 + 2] = q.attributes.position.getZ(i);
          if (nm) { N[(v0 + i) * 3] = nm.getX(i); N[(v0 + i) * 3 + 1] = nm.getY(i); N[(v0 + i) * 3 + 2] = nm.getZ(i); }
          if (uv) { U[(v0 + i) * 2] = uv.getX(i); U[(v0 + i) * 2 + 1] = uv.getY(i); }
        }
        const ic = q.index ? q.index.count : c;
        for (let i = 0; i < ic; i++) I[i0 + i] = v0 + (q.index ? q.index.getX(i) : i);
        out.addGroup(i0, ic, k);
        v0 += c; i0 += ic;
      });
      out.setAttribute('position', new THREE.BufferAttribute(P, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      out.setIndex(new THREE.BufferAttribute(I, 1));
      const mats = parts.map((o) => ({ map: o.material.map ?? null, alpha: o.material.alphaTest > 0 || o.material.transparent, color: o.material.color.getHex() }));
      return { geometry: out, mats };
    }).catch((e) => { console.warn('mta-skins: ' + id + ' failed', e); return null; }));
  }
  return sources.get(id);
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _m4 = new THREE.Matrix4();

// the bone segments of a skinned mesh's rest pose (bind space): [{ bone index, a, b }]
function segments(mesh, rinv) {
  const bones = mesh.skeleton.bones;
  const at = bones.map((b) => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(rinv));
  const short = (b) => b.name.replace('mixamorig', '');
  const idx = new Map(bones.map((b, i) => [short(b), i]));
  const out = [];
  for (const name of BODY) {
    const i = idx.get(name);
    if (i === undefined) continue;
    const next = idx.get(CHAIN[name.replace(/^(Left|Right)/, '')] ? (/^(Left|Right)/.exec(name)?.[0] ?? '') + CHAIN[name.replace(/^(Left|Right)/, '')] : CHAIN[name]);
    let end;
    if (next !== undefined) end = at[next].clone();
    else {
      // a tip: the bone's own length again beyond it (the head, the hands, the toes)
      const par = bones[i].parent ? bones.indexOf(bones[i].parent) : -1;
      const dir = par >= 0 ? at[i].clone().sub(at[par]) : new THREE.Vector3(0, 0.1, 0);
      const k = /Head/.test(name) ? 1.1 : /Hand/.test(name) ? 0.8 : /Toe/.test(name) ? 0.7 : 0.5;
      end = at[i].clone().addScaledVector(dir, k);
    }
    out.push({ i, a: at[i].clone(), b: end });
  }
  return out;
}

function segDist(p, s) {
  _a.copy(s.b).sub(s.a);
  const L = _a.lengthSq();
  const t = L > 1e-9 ? THREE.MathUtils.clamp(_b.copy(p).sub(s.a).dot(_a) / L, 0, 1) : 0;
  return _p.copy(s.a).addScaledVector(_a, t).distanceTo(p);
}

// the skin's geometry fitted to this skinned mesh's skeleton. Everything is worked out in the
// person's root space with the skeleton at rest; T maps the mesh's own vertex coordinates (the
// quantised, normalised ones of the donor body) to that space, and its inverse puts the skin's
// vertices back in the mesh's coordinates.
function fit(src, mesh, donor, root) {
  const g = src.geometry, pos = g.attributes.position;
  const rinv = root.matrixWorld.clone().invert();
  const bones = mesh.skeleton.bones, hip = Math.max(0, bones.findIndex((b) => /Hips$/.test(b.name)));
  const S = new THREE.Matrix4().copy(mesh.bindMatrixInverse).multiply(bones[hip].matrixWorld).multiply(mesh.skeleton.boneInverses[hip]).multiply(mesh.bindMatrix);
  const T = new THREE.Matrix4().copy(rinv).multiply(mesh.matrixWorld).multiply(S);
  const Ti = T.clone().invert();
  const dp = donor.attributes.position, tmp = new THREE.Vector3();
  const dmin = new THREE.Vector3(1e9, 1e9, 1e9), dmax = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (let i = 0; i < dp.count; i += 3) { tmp.fromBufferAttribute(dp, i).applyMatrix4(T); dmin.min(tmp); dmax.max(tmp); }
  // the skins stand with their arms angled down; the donor's skeleton is in a T-pose. The arms are
  // swung up to the horizontal about the shoulder (blended in over the shoulder, and tapering out
  // before the legs), so the arm vertices lie along the arm bones and take their weights
  const n0 = pos.count, nrm0 = g.attributes.normal;
  const SP = new Float32Array(n0 * 3), SN = new Float32Array(n0 * 3);
  {
    let ymin = 1e9, ymax = -1e9;
    for (let i = 0; i < n0; i++) { const y = pos.getY(i); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    const H = ymax - ymin, shY = ymin + 0.79 * H, shX = 0.11 * H;
    const tip = { 1: null, '-1': null };
    for (let i = 0; i < n0; i++) {
      const x = pos.getX(i), y = pos.getY(i), sg = x > 0 ? 1 : -1;
      if (y < ymin + 0.35 * H || y > ymin + 0.9 * H) continue;
      if (!tip[sg] || Math.abs(x) > Math.abs(tip[sg].x)) tip[sg] = { x, y };
    }
    const ang = {};
    for (const sg of [1, -1]) {
      const t = tip[sg];
      // (angle below the horizontal of the pivot -> tip line; a skin already in a T-pose: ~0)
      ang[sg] = t ? Math.max(0, Math.atan2(shY - t.y, Math.abs(t.x) - shX)) : 0;
      if (ang[sg] > 1.2) ang[sg] = 0;
    }
    const sstep = (a, b2, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b2 - a))); return u * u * (3 - 2 * u); };
    for (let i = 0; i < n0; i++) {
      let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let nx = nrm0 ? nrm0.getX(i) : 0, ny = nrm0 ? nrm0.getY(i) : 1;
      const sg = x > 0 ? 1 : -1;
      // armness: well outside the torso, above the thighs
      const w = sstep(shX * 0.9, shX * 2.2, Math.abs(x)) * sstep(ymin + 0.38 * H, ymin + 0.55 * H, y);
      if (w > 0 && ang[sg]) {
        const th = ang[sg] * w, c = Math.cos(th), sn = Math.sin(th);
        // rotate (|x|-shX, y-shY) up by th about the pivot
        const dx = Math.abs(x) - shX, dy = y - shY;
        x = sg * (shX + dx * c - dy * sn); y = shY + dx * sn + dy * c;
        const nax = sg * (nx * sg * c - ny * sn), nay = nx * sg * sn + ny * c;
        nx = nax; ny = nay;
      }
      SP[i * 3] = x; SP[i * 3 + 1] = y; SP[i * 3 + 2] = z;
      SN[i * 3] = nx; SN[i * 3 + 1] = ny; SN[i * 3 + 2] = nrm0 ? nrm0.getZ(i) : 0;
    }
  }
  const smin = new THREE.Vector3(1e9, 1e9, 1e9), smax = new THREE.Vector3(-1e9, -1e9, -1e9);
  for (let i = 0; i < n0; i++) { tmp.set(SP[i * 3], SP[i * 3 + 1], SP[i * 3 + 2]); smin.min(tmp); smax.max(tmp); }
  const k = (dmax.y - dmin.y) / Math.max(0.1, smax.y - smin.y);
  const cx = (smin.x + smax.x) / 2, cz = (smin.z + smax.z) / 2;
  const dcx = (dmin.x + dmax.x) / 2, dcz = (dmin.z + dmax.z) / 2;
  const segs = segments(mesh, rinv);
  const n = pos.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
  const nm = new THREE.Matrix3().getNormalMatrix(Ti);
  const v = new THREE.Vector3(), nv = new THREE.Vector3(), ds = new Float32Array(segs.length);
  const TAU = 0.045, nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    v.set((SP[i * 3] - cx) * k + dcx, (SP[i * 3 + 1] - smin.y) * k + dmin.y, (SP[i * 3 + 2] - cz) * k + dcz);
    let best = 1e9;
    for (let s = 0; s < segs.length; s++) { ds[s] = segDist(v, segs[s]); if (ds[s] < best) best = ds[s]; }
    // weights: the nearest segments, softly (within TAU of the nearest), the four strongest kept
    const w = [];
    for (let s = 0; s < segs.length; s++) { const e = Math.exp(-(ds[s] - best) / TAU); if (e > 0.02) w.push([segs[s].i, e]); }
    w.sort((x, y) => y[1] - x[1]);
    let sum = 0;
    for (let c = 0; c < 4; c++) sum += w[c]?.[1] ?? 0;
    for (let c = 0; c < 4; c++) { SI[i * 4 + c] = w[c]?.[0] ?? 0; SW[i * 4 + c] = (w[c]?.[1] ?? 0) / sum; }
    v.applyMatrix4(Ti);
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    if (nrm) {
      nv.set(SN[i * 3], SN[i * 3 + 1], SN[i * 3 + 2]).applyMatrix3(nm).normalize();
      N[i * 3] = nv.x; N[i * 3 + 1] = nv.y; N[i * 3 + 2] = nv.z;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (nrm) out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (g.attributes.uv) out.setAttribute('uv', g.attributes.uv.clone());
  out.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  out.setAttribute('zone', new THREE.BufferAttribute(new Float32Array(n * 4), 4));   // (the people's tint mask: none)
  if (g.index) out.setIndex(g.index.clone());
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  out.computeBoundingSphere();
  return out;
}

const cache = new Map();   // skin|asset|level|index -> geometry
function material(src) {
  return src.mats.map((q) => {
    const m = new THREE.MeshStandardMaterial({ map: q.map, color: q.map ? 0xffffff : q.color, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
    if (q.alpha) m.alphaTest = 0.45;
    // (the people's tint hook: nothing to tint)
    m.userData.tint = { uTint: { value: [0, 1, 2].map(() => new THREE.Vector4(1, 1, 1, 0)) } };
    return m;
  });
}

// put skin `id` (or, null, the original body) on person P; resolves true once applied
export async function applySkin(P, id) {
  const meshes = [];
  P.lod.forEach((l, lv) => l.forEach((m, i) => meshes.push([m, lv, i])));
  if (!id) {
    for (const [m] of meshes) {
      const o = m.userData.orig;
      if (!o) continue;
      m.geometry = o.geometry; m.material = o.material; m.userData.orig = null;
    }
    P.skin = null;
    return true;
  }
  const src = await loadSource(id);
  if (!src) return false;
  if (P.skin === id) return true;
  const mat = material(src);
  P.restPose();
  P.root.updateMatrixWorld(true);
  for (const [m, lv, i] of meshes) {
    const key = `${id}|${P.asset.name}|${lv}|${i}`;
    let geo = cache.get(key);
    if (!geo) {
      geo = fit(src, m, m.userData.orig?.geometry ?? m.geometry, P.root);   // (the original body sets the size)
      cache.set(key, geo);
    }
    if (!m.userData.orig) m.userData.orig = { geometry: m.geometry, material: m.material };
    m.geometry = geo;
    m.material = mat;
    // (hair cards of the original body gone: the skin is one opaque mesh)
  }
  P.skin = id;
  return true;
}
