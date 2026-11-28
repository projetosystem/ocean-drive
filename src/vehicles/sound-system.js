// Car sound system: speaker boxes (sub, trio, paredão, horn) attached to the car being driven
// (every car: its own layout is kept per model; the convertible keeps its old one), editable in game (position, rotation, W/H/D), saved in localStorage, and tied to the
// radio: the bigger the boxes, the more bass (audio.radio.setBass).
//
//   B             open / close the editor (while in any car)
//   Tab           next box          Enter  add a box (cycles the type)     Delete  remove it
//   T             change the type of the selected box
//   Arrows        move x / z        PageUp / PageDown  move up / down
//   U / O         width - / +       I / K  height + / -      J / L  depth - / +
//   , / .         turn (yaw)        [ / ]  tilt (pitch)
//   Shift         fine steps        C  camera (chase view shows the boot)
//
// Boxes are procedural (cabinet, carpet-black, cones with rubber surrounds). If a model exists in
// models/sound/<type>.glb (e.g. converted from the MTA pack) it replaces the procedural body and
// is stretched to the box's W x H x D; nothing in the repo depends on those files.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const STORE = 'od.sound.';   // + profile: 'hero', or '<body>:<model>' for the other cars
const TYPES = {
  sub:     { label: 'Subwoofer', size: [0.55, 0.5, 0.45], cols: 1, rows: 1, glb: null },
  trio:    { label: 'Trio',      size: [0.77, 0.38, 0.33], cols: 3, rows: 1, glb: 'models/sound/trio.glb' },
  paredao: { label: 'Paredão',   size: [1.11, 1.8, 0.55],  cols: 2, rows: 4, glb: 'models/sound/paredao.glb' },
  corneta: { label: 'Corneta',   size: [0.35, 0.35, 0.5],  cols: 1, rows: 1, glb: 'models/sound/corneta.glb', horn: true },
};
const ORDER = Object.keys(TYPES);
const LIM = { w: [0.15, 2.2], h: [0.15, 2.4], d: [0.15, 1.2] };
// trunk of the convertible, body space (+z nose, +x left, y up from the ground)
const BOOT = { x: 0, y: 0.62, z: -1.75 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mat = {
  cab: new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.95 }),
  face: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.8 }),
  cone: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.55, metalness: 0.2, side: THREE.DoubleSide }),
  rim: new THREE.MeshStandardMaterial({ color: 0x2a2a2d, roughness: 0.5, metalness: 0.6 }),
  cap: new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 0.35, metalness: 0.8 }),
  horn: new THREE.MeshStandardMaterial({ color: 0xd9d9dc, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }),
};
const gcache = {};
const geo = (k, f) => (gcache[k] ??= f());

// the procedural box: origin at the bottom centre, front toward +z. Returns { group, cones }
function buildBox(type, w, h, d) {
  const T = TYPES[type];
  const g = new THREE.Group();
  const cones = [];
  const cab = new THREE.Mesh(geo('box', () => new THREE.BoxGeometry(1, 1, 1)), mat.cab);
  cab.scale.set(w, h, d);
  cab.position.y = h / 2;
  g.add(cab);
  const front = new THREE.Mesh(geo('box', () => new THREE.BoxGeometry(1, 1, 1)), mat.face);
  front.scale.set(w * 0.96, h * 0.96, 0.01);
  front.position.set(0, h / 2, d / 2 + 0.004);
  g.add(front);
  const cw = w / T.cols, ch = h / T.rows;
  const r = Math.min(cw, ch) * 0.42;
  for (let i = 0; i < T.cols; i++) {
    for (let j = 0; j < T.rows; j++) {
      const c = new THREE.Group();
      c.position.set(-w / 2 + cw * (i + 0.5), ch * (j + 0.5), d / 2 + 0.01);
      const ring = new THREE.Mesh(geo('ring', () => new THREE.TorusGeometry(1, 0.08, 8, 28)), mat.rim);
      ring.scale.setScalar(r);
      const cone = new THREE.Mesh(geo('cone', () => new THREE.CylinderGeometry(0.34, 1, 1, 24, 1, true).rotateX(Math.PI / 2)), T.horn ? mat.horn : mat.cone);
      cone.scale.set(r * 0.95, r * 0.95, r * (T.horn ? 1.6 : 0.4));
      cone.position.z = T.horn ? r * 0.8 : -r * 0.15;
      const cap = new THREE.Mesh(geo('cap', () => new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2)), mat.cap);
      cap.scale.setScalar(r * 0.3);
      cap.position.z = -r * 0.1;
      c.add(ring, cone, cap);
      g.add(c);
      cones.push({ node: c, z0: c.position.z, r });
    }
  }
  return { group: g, cones };
}

export function createSoundSystem({ root, audio, vehicles, shot = false }) {
  if (!vehicles) return null;
  const heroBody = root ? (root.children[0]?.children[0] ?? root) : null;
  // one profile (holder + boxes) per car model; the one in use is items / holder / store
  const profiles = new Map();
  let holder = new THREE.Group(), items = [], store = STORE + 'hero', boot = BOOT, curKey = null, attachedTo = null;
  let sel = 0, editing = false;
  const glbs = {};           // type -> Promise<gltf|null>

  function loadGlb(type) {
    const url = TYPES[type].glb;
    if (!url || shot) return Promise.resolve(null);
    return (glbs[type] ??= new GLTFLoader().loadAsync(url).catch(() => null));
  }

  function rebuild(it) {
    if (it.node) holder.remove(it.node);
    const { group, cones } = buildBox(it.type, it.w, it.h, it.d);
    it.node = new THREE.Group();
    it.node.add(group);
    it.cones = cones;
    it.proc = group;
    // selection outline
    const ed = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(it.w, it.h, it.d)),
      new THREE.LineBasicMaterial({ color: 0xf6d69a, depthTest: false, transparent: true }));
    ed.position.y = it.h / 2;
    ed.renderOrder = 10;
    ed.visible = false;
    it.edge = ed;
    it.node.add(ed);
    holder.add(it.node);
    place(it);
    loadGlb(it.type).then((gltf) => {
      if (!gltf || !it.node || it.proc !== group) return;
      const m = gltf.scene.clone(true);
      const b = new THREE.Box3().setFromObject(m);
      const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const wrap = new THREE.Group();
      m.position.set(-c.x, -b.min.y, -c.z);
      wrap.add(m);
      wrap.scale.set(it.w / (s.x || 1), it.h / (s.y || 1), it.d / (s.z || 1));
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.visible = false;
      it.cones = [];
      it.node.add(wrap);
    });
    refreshEdges();
  }
  function place(it) {
    it.node.position.set(it.x, it.y, it.z);
    it.node.rotation.set(it.rx, it.ry, 0, 'YXZ');
  }
  function refreshEdges() { items.forEach((it, i) => { if (it.edge) it.edge.visible = editing && i === sel; }); }

  function make(type, o = {}) {
    const T = TYPES[type];
    const it = { type, x: boot.x, y: boot.y, z: boot.z, w: T.size[0], h: T.size[1], d: T.size[2], ry: Math.PI, rx: 0, ...o };
    rebuild(it);
    return it;
  }

  // bass 0..1 from the total cabinet volume (m3): 0.15 -> ~0.17, 1 -> 0.7, 2 -> 0.92
  function applyBass() {
    const vol = items.reduce((s, it) => s + it.w * it.h * it.d, 0);
    audio.radio.setBass(1 - Math.exp(-vol / 0.8));
  }
  function save() {
    try {
      localStorage.setItem(store, JSON.stringify(items.map(({ type, x, y, z, w, h, d, ry, rx }) => ({ type, x, y, z, w, h, d, ry, rx }))));
    } catch { /* storage blocked */ }
    applyBass();
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(store) || '[]');
      if (Array.isArray(raw)) for (const o of raw) if (TYPES[o?.type]) items.push(make(o.type, o));
    } catch { /* ignore */ }
    applyBass();
  }

  // ---- panel ----
  let panel = null;
  function ui() {
    if (panel || shot || typeof document === 'undefined') return;
    const st = document.createElement('style');
    st.textContent = `
#snd { position: fixed; left: 18px; bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); z-index: 5; display: none; width: 268px;
  padding: 14px 16px 12px; color: #fff4e6; pointer-events: none; font: 12px/1.45 'Helvetica Neue', 'Segoe UI', system-ui, sans-serif;
  background: rgba(24, 16, 12, 0.72); border-top: 1px solid rgba(246,214,154,.9); border-bottom: 1px solid rgba(246,214,154,.9);
  --gold: rgba(246,214,154,.95); }
#snd.on { display: block; }
#snd h4 { margin: 0 0 6px; font: 500 9px/1 inherit; letter-spacing: .5em; text-transform: uppercase; color: var(--gold); }
#snd .nm { font: italic 400 22px/1.1 Didot, 'Bodoni 72', 'Playfair Display', Georgia, serif; margin-bottom: 6px; }
#snd table { width: 100%; border-collapse: collapse; } #snd td { padding: 1px 0; } #snd td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
#snd .k { margin-top: 8px; color: rgba(255,244,230,.65); font-size: 10.5px; }
#snd .k b { color: var(--gold); font-weight: 600; }
#snd .bar { height: 3px; margin-top: 8px; background: rgba(246,214,154,.2); } #snd .bar i { display: block; height: 100%; background: var(--gold); }`;
    document.head.appendChild(st);
    panel = document.createElement('div');
    panel.id = 'snd';
    document.body.appendChild(panel);
  }
  function render() {
    if (!panel) return;
    panel.classList.toggle('on', editing);
    if (!editing) return;
    const it = items[sel];
    const cm = (v) => (v * 100).toFixed(0) + ' cm';
    const deg = (v) => ((((v * 180) / Math.PI) % 360 + 360) % 360).toFixed(0) + '°';
    panel.innerHTML = `<h4>Sound system</h4>` + (it
      ? `<div class="nm">${TYPES[it.type].label} <small style="font:11px sans-serif;opacity:.6">${sel + 1}/${items.length}</small></div>
<table><tr><td>Width · Height · Depth</td><td>${cm(it.w)} · ${cm(it.h)} · ${cm(it.d)}</td></tr>
<tr><td>Position x · y · z</td><td>${it.x.toFixed(2)} · ${it.y.toFixed(2)} · ${it.z.toFixed(2)}</td></tr>
<tr><td>Turn · tilt</td><td>${deg(it.ry)} · ${deg(it.rx)}</td></tr></table>`
      : '<div class="nm">No boxes</div>')
      + `<div class="bar"><i style="width:${(audio.radio.bass ?? 0) * 100}%"></i></div>
<div class="k"><b>Enter</b> add · <b>Tab</b> next · <b>T</b> type · <b>Del</b> remove<br><b>←↑↓→</b> move · <b>PgUp/Dn</b> height<br><b>U/O</b> W · <b>I/K</b> H · <b>J/L</b> D · <b>, .</b> turn · <b>[ ]</b> tilt<br><b>Shift</b> fine · <b>C</b> camera · <b>B</b> done</div>`;
  }

  const inHero = () => !!vehicles.currentEntry;   // (any vehicle: cars, the bike, the quad)
  // the car being driven: its profile's boxes are shown on it
  function useEntry(e) {
    const car = e ?? null;
    const key = !car ? null : car.origin === 'hero' ? 'hero' : car.kind !== 'car' ? car.kind : `${car.body}:${car.drive?.model ?? ''}`;
    if (key === curKey) return;
    if (editing) { editing = false; refreshEdges(); render(); }
    // (the boxes of another car are taken off; the convertible's stay on)
    if (curKey && curKey !== 'hero') holder.removeFromParent();
    curKey = key;
    attachedTo = null;
    if (!key) return;
    let pr = profiles.get(key);
    if (!pr) {
      const h = new THREE.Group();
      h.name = 'sound-system';
      pr = { holder: h, items: [], store: STORE + key, boot: key === 'hero' ? BOOT : car.kind === 'bike' ? { x: 0, y: 0.5, z: -0.55 } : car.kind === 'atv' ? { x: 0, y: 0.62, z: -0.75 } : { x: 0, y: 0.62, z: -((car.v?.spec?.length ?? 4.6) / 2) + 0.3 } };
      // (the bike's and the quad's frames have the nose at -z: the boxes are turned half a lap)
      if (car.kind !== 'car') h.rotation.y = Math.PI;
      profiles.set(key, pr);
      holder = h; items = pr.items; store = pr.store; boot = pr.boot;
      load();
    }
    holder = pr.holder; items = pr.items; store = pr.store; boot = pr.boot;
    sel = 0;
    const r = car.kind === 'car' ? car.drive?.root : (car.m?.tilt ?? car.m?.root);
    const body = key === 'hero' ? heroBody : r ?? null;
    if (body && holder.parent !== body) body.add(holder);
    attachedTo = body;
    applyBass();
  }
  function setEditing(on) {
    useEntry(vehicles.currentEntry);
    if (on && !inHero()) return;
    editing = on;
    if (on && !items.length) { items.push(make(vehicles.currentEntry?.kind === 'car' ? 'trio' : 'corneta')); sel = 0; save(); }
    refreshEdges();
    render();
  }

  const MOVES = {
    ArrowLeft: ['x', 1], ArrowRight: ['x', -1], ArrowUp: ['z', 1], ArrowDown: ['z', -1],   // as seen from behind
    PageUp: ['y', 1], PageDown: ['y', -1],
    KeyU: ['w', -1], KeyO: ['w', 1], KeyI: ['h', 1], KeyK: ['h', -1], KeyJ: ['d', -1], KeyL: ['d', 1],
    Comma: ['ry', -1], Period: ['ry', 1], BracketLeft: ['rx', -1], BracketRight: ['rx', 1],
  };
  function onKey(ev) {
    if (shot) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName ?? '') || ev.target?.isContentEditable;
    if (typing || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    if (ev.code === 'KeyB') { if (!ev.repeat) setEditing(!editing && inHero()); ev.stopImmediatePropagation(); return; }
    if (!editing) return;
    if (!inHero()) { setEditing(false); return; }
    const it = items[sel];
    let used = true;
    if (ev.code === 'Tab') { if (items.length) { sel = (sel + (ev.shiftKey ? items.length - 1 : 1)) % items.length; } }
    else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
      if (ev.repeat) return;
      const type = ORDER[(ORDER.indexOf(it?.type ?? 'corneta') + 1) % ORDER.length];
      items.push(make(type, it ? { x: it.x + 0.1, y: it.y, z: it.z, ry: it.ry } : {}));
      sel = items.length - 1;
      save();
    } else if (ev.code === 'Delete') {
      if (it && !ev.repeat) { holder.remove(it.node); items.splice(sel, 1); sel = Math.max(0, sel - 1); save(); }
    } else if (ev.code === 'KeyT') {
      if (it && !ev.repeat) {
        const type = ORDER[(ORDER.indexOf(it.type) + 1) % ORDER.length];
        const T = TYPES[type];
        Object.assign(it, { type, w: T.size[0], h: T.size[1], d: T.size[2] });
        rebuild(it); save();
      }
    } else if (MOVES[ev.code] && it) {
      const [k, s] = MOVES[ev.code];
      const f = ev.shiftKey ? 0.2 : 1;
      if (k === 'ry' || k === 'rx') it[k] += s * 0.05 * f * (ev.repeat ? 1.5 : 1);
      else if (k === 'w' || k === 'h' || k === 'd') {
        it[k] = clamp(it[k] + s * 0.02 * f, LIM[k][0], LIM[k][1]);
        rebuild(it);
      } else it[k] += s * 0.02 * f;
      place(it);
      save();
    } else used = false;
    if (used) { ev.preventDefault(); ev.stopImmediatePropagation(); refreshEdges(); render(); }
  }
  if (!shot && typeof window !== 'undefined') {
    window.addEventListener('keydown', onKey, true);   // capture: the editor's keys never reach the car
    ui();
  }
  // the convertible's own boxes, as before (on its body whether or not it is driven)
  if (heroBody) {
    const h = new THREE.Group();
    h.name = 'sound-system';
    heroBody.add(h);
    holder = h; items = []; store = STORE + 'hero'; boot = BOOT;
    profiles.set('hero', { holder, items, store, boot });
    load();
  }

  let t = 0;
  return {
    get editing() { return editing; },
    get items() { return items; },
    setEditing,
    // called once a frame: the cones pump with the bass while the radio plays
    update(dt) {
      useEntry(vehicles.currentEntry);
      if (!items.length) return;
      if (editing && !inHero()) setEditing(false);
      t += dt;
      const on = audio.radio.station >= 0 && (audio.radio.bass ?? 0) > 0.05;
      const beat = on ? Math.max(0, Math.sin(t * Math.PI * 4.2)) ** 3 : 0;
      for (const it of items) for (const c of it.cones) c.node.position.z = c.z0 - beat * c.r * 0.12;
      if (editing && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) render();   // the bass bar
    },
    dispose() { window.removeEventListener('keydown', onKey, true); for (const p of profiles.values()) p.holder.removeFromParent(); panel?.remove(); },
  };
}
