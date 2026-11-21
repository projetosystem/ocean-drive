// The MTA maps (public/models/mta-maps/<id>/*.glb, index.json lists them), each a separate
// place away from Ocean Drive. P opens the list (arrows + Enter, or click), a map loads the
// first time it is chosen, the world of Miami Beach is hidden and the walker walks on the
// map's own ground; P again goes back (the first line of the list is the way home).
//
// The walker's ground is a height grid rasterised from the map's upward-facing triangles
// (the highest surface in a cell), so any map can be walked without a collision file.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = 'models/mta-maps/';
const OFFSET = new THREE.Vector3(6000, 0, 30000);   // far from the district: its LOD'd objects stay off
const CELL_MAX = 1600;                              // grid cells along the longest side

function heightGrid(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const cell = Math.max(0.75, Math.max(size.x, size.z) / CELL_MAX);
  const nx = Math.ceil(size.x / cell) + 1, nz = Math.ceil(size.z / cell) + 1;
  const H = new Float32Array(nx * nz).fill(-Infinity);
  const R = new Uint8Array(nx * nz);   // 1: the top surface of the cell is a road
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || o.userData.noGround) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const count = idx ? idx.count : pos.count;
    const m = o.matrixWorld;
    const road = /road|asphalt|aspha|street|track|pist|tarmac|highway|drift/i.test(o.material?.name || '');
    const get = (i, out) => out.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
    for (let t = 0; t < count; t += 3) {
      get(t, a); get(t + 1, b); get(t + 2, c);
      e1.subVectors(b, a); e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      const len = n.length();
      if (len < 1e-9 || n.y / len < 0.25) continue;            // walls and undersides carry no ground
      const minx = Math.min(a.x, b.x, c.x), maxx = Math.max(a.x, b.x, c.x), minz = Math.min(a.z, b.z, c.z), maxz = Math.max(a.z, b.z, c.z);
      const i0 = Math.max(0, Math.floor((minx - box.min.x) / cell)), i1 = Math.min(nx - 1, Math.ceil((maxx - box.min.x) / cell));
      const j0 = Math.max(0, Math.floor((minz - box.min.z) / cell)), j1 = Math.min(nz - 1, Math.ceil((maxz - box.min.z) / cell));
      // barycentric on x, z
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(d) < 1e-12) continue;
      for (let j = j0; j <= j1; j++) {
        const pz = box.min.z + j * cell;
        for (let i = i0; i <= i1; i++) {
          const px = box.min.x + i * cell;
          const l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / d;
          const l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / d;
          const l3 = 1 - l1 - l2;
          const k = 0.02;   // (a little slack: cells on a triangle's edge)
          if (l1 < -k || l2 < -k || l3 < -k) continue;
          const y = l1 * a.y + l2 * b.y + l3 * c.y;
          const q = j * nx + i;
          if (y > H[q]) { H[q] = y; R[q] = road ? 1 : 0; }
        }
      }
    }
  });
  const at = (x, z) => {
    const i = Math.round((x - box.min.x) / cell), j = Math.round((z - box.min.z) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -Infinity : H[j * nx + i];
  };
  // a cell with data within one cell counts as ground (the rasteriser leaves hairline gaps)
  const valid = (x, z) => at(x, z) > -Infinity || at(x + cell, z) > -Infinity || at(x - cell, z) > -Infinity || at(x, z + cell) > -Infinity || at(x, z - cell) > -Infinity;
  const near = (x, z, cur) => {
    let best = at(x, z);
    if (best > -Infinity) return best;
    for (const [dx, dz] of [[cell, 0], [-cell, 0], [0, cell], [0, -cell]]) { const h = at(x + dx, z + dz); if (h > best) best = h; }
    return best > -Infinity ? best : cur;
  };
  // the ground cell nearest the middle of the map
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  // the road cell nearest the middle (any ground when the map names no road)
  const atRoad = (x, z) => {
    const i = Math.round((x - box.min.x) / cell), j = Math.round((z - box.min.z) / cell);
    return i >= 0 && j >= 0 && i < nx && j < nz && R[j * nx + i] === 1;
  };
  let spawn = null;
  for (const need of [true, false]) {
    for (let r = 0; r < Math.max(nx, nz) * cell && !spawn; r += cell * 2) {
      for (let k = 0; k < 32 && !spawn; k++) {
        const ang = (k / 32) * Math.PI * 2, x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
        if (at(x, z) > -Infinity && (!need || atRoad(x, z))) spawn = { x, z, y: at(x, z) };
      }
    }
  }
  // face along the road: the direction with the most road cells 4 to 40 m ahead
  let heading = 0;
  if (spawn) {
    let bestN = -1;
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
      let n = 0;
      for (let d = 4; d <= 40; d += cell) if (atRoad(spawn.x + dx * d, spawn.z + dz * d)) n++;
      if (n > bestN) { bestN = n; heading = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360; }
    }
  }
  return { box, cell, heightAt: (x, z, cur) => near(x, z, cur ?? 0), valid, spawn: { ...(spawn ?? { x: cx, z: cz, y: box.max.y }), heading } };
}

export function createMapPortal({ scene, camera, controls, vehicles, requestShadow = () => {}, onEnter = null, onExit = null, shot = false }) {
  if (shot) return null;
  let index = [], loaded = null, current = null, hidden = [], saved = null, menu = null, open = false, sel = 0, busy = '';
  const cache = new Map();
  fetch(BASE + 'index.json').then((r) => r.json()).then((j) => { index = j; render(); }).catch(() => {});

  async function load(entry) {
    if (cache.has(entry.id)) return cache.get(entry.id);
    const group = new THREE.Group();
    group.name = 'mta-map-' + entry.id;
    const loader = new GLTFLoader();
    const parts = await Promise.all(entry.files.map((f) => loader.loadAsync(`${BASE}${entry.id}/${f}`).catch((e) => { console.warn('map piece failed', f, e); return null; })));
    for (const g of parts) {
      if (!g) continue;
      g.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        const m = o.material;
        if (m.map) m.map.anisotropy = 4;
        m.roughness = 0.9; m.metalness = 0;
        m.side = THREE.DoubleSide;
        if (m.map) {
          m.color.setScalar(1);   // (the GTA material tints, 0.42-0.5 grey, halve the texture: slopes and trees came out black)
          // foliage / fences: cut-outs, not blended planes (blending sorted wrongly and left dark bars)
          if (m.transparent || m.alphaTest > 0) { m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true; }
          // a floor of light so slopes turned from the sun are not black
          m.emissive = new THREE.Color(0x5a5a5a); m.emissiveMap = m.map;
        }
        m.needsUpdate = true;
      });
      group.add(g.scene);
    }
    group.add(new THREE.AmbientLight(0xdfe6f5, 1.1));   // (the maps carry no light of their own: the sun alone leaves their shaded slopes black)
    group.position.copy(OFFSET);
    const grid = heightGrid(group);
    const rec = { entry, group, grid };
    cache.set(entry.id, rec);
    return rec;
  }

  const world = (grid) => ({
    heightAt: grid.heightAt,
    boxes: [], circles: [],
    bounds: { x0: grid.box.min.x, x1: grid.box.max.x, z0: grid.box.min.z, z1: grid.box.max.z },
    inside: (x, z) => grid.valid(x, z),
  });

  function hideMain(keep) {
    hidden = [];
    scene.children.forEach((o, i) => {
      if (o.isLight || o === keep || i === 0 || o.name === 'player-avatar' || o.name?.startsWith('mta-map-') || o.isObject3D && o.type === 'Object3D') return;
      if (o.visible) { hidden.push(o); o.visible = false; }
    });
  }
  function showMain() { for (const o of hidden) o.visible = true; hidden = []; }

  async function enter(entry) {
    if (busy) return;
    busy = 'Loading ' + entry.name + '…';
    render();
    try {
      const rec = await load(entry);
      if (vehicles.riding) vehicles.dismount();
      if (!current) saved = { x: controls.pos.x, z: controls.pos.y, heading: controls.heading, pitch: THREE.MathUtils.radToDeg(controls.pitch), world: controls.world, y: controls.feetY };
      else { scene.remove(current.group); }
      scene.add(rec.group);
      hideMain(rec.group);
      current = rec;
      controls.world = world(rec.grid);
      const s = rec.grid.spawn;
      controls.set(s.x, s.y + 1.7, s.z, s.heading, 0);
      controls.vel.set(0, 0);
      controls.teleport(s.x, s.z, s.heading, 0, s.y);
      requestShadow();
      onEnter?.(entry);
    } catch (e) {
      console.warn('map failed', e);
    }
    busy = '';
    open = false;
    render();
  }
  function exit() {
    if (!current) return;
    scene.remove(current.group);
    showMain();
    controls.world = saved.world;
    controls.set(saved.x, saved.y + 1.7, saved.z, saved.heading, saved.pitch);
    controls.vel.set(0, 0);
    current = null;
    requestShadow();
    onExit?.();
    open = false;
    render();
  }

  // ---- list ----
  function ui() {
    const st = document.createElement('style');
    st.textContent = `
#maps { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 6; display: none; width: min(360px, calc(100vw - 32px)); max-height: 80vh; overflow: auto;
  padding: 18px 20px 14px; color: #fff4e6; font: 13px/1.5 'Helvetica Neue', 'Segoe UI', system-ui, sans-serif;
  background: rgba(24, 16, 12, 0.86); border-top: 1px solid rgba(246,214,154,.9); border-bottom: 1px solid rgba(246,214,154,.9); --gold: rgba(246,214,154,.95); }
#maps.on { display: block; }
#maps h4 { margin: 0 0 8px; font: 500 9px/1 inherit; letter-spacing: .5em; text-transform: uppercase; color: var(--gold); text-align: center; }
#maps .it { padding: 5px 10px; cursor: pointer; display: flex; justify-content: space-between; gap: 12px; border-left: 2px solid transparent; }
#maps .it.sel { background: rgba(246,214,154,.14); border-left-color: var(--gold); }
#maps .it small { opacity: .55; font-variant-numeric: tabular-nums; }
#maps .k { margin-top: 8px; font-size: 10.5px; color: rgba(255,244,230,.6); text-align: center; }
#mapsbadge { position: fixed; left: 18px; top: calc(env(safe-area-inset-top, 0px) + 14px); z-index: 5; display: none; color: #fff4e6; padding: 6px 12px; font: 11px/1.3 system-ui, sans-serif; letter-spacing: .2em; text-transform: uppercase;
  background: rgba(24,16,12,.6); border-bottom: 1px solid rgba(246,214,154,.8); pointer-events: none; }`;
    document.head.appendChild(st);
    menu = document.createElement('div'); menu.id = 'maps'; document.body.appendChild(menu);
    menu.addEventListener('click', (ev) => { const it = ev.target.closest('.it'); if (it) go(+it.dataset.i); });
    badge = document.createElement('div'); badge.id = 'mapsbadge'; document.body.appendChild(badge);
  }
  let badge = null;
  function render() {
    if (!menu) return;
    menu.classList.toggle('on', open || !!busy);
    badge.style.display = current ? 'block' : 'none';
    if (current) badge.textContent = current.entry.name + ' · P menu';
    if (busy) { menu.innerHTML = `<h4>Maps</h4><div class="it">${busy}</div>`; return; }
    const rows = [{ name: current ? 'Back to Ocean Drive' : 'Ocean Drive', home: true }, ...index];
    menu.innerHTML = `<h4>Teleport · maps</h4>` + rows.map((r, i) => `<div class="it${i === sel ? ' sel' : ''}" data-i="${i}"><span>${r.name}</span><small>${r.home ? '' : r.mb + ' MB'}</small></div>`).join('')
      + '<div class="k">↑ ↓ Enter · click · P or Esc to close</div>';
  }
  function go(i) {
    const row = i === 0 ? null : index[i - 1];
    if (!row) { if (current) exit(); open = false; render(); return; }
    enter(row);
  }
  function onKey(ev) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName ?? '') || ev.target?.isContentEditable;
    if (typing || ev.ctrlKey || ev.altKey || ev.metaKey || busy) return;
    if (ev.code === 'KeyP') {
      if (!ev.repeat) { open = !open; sel = 0; render(); if (open) document.exitPointerLock?.(); }
      ev.stopImmediatePropagation(); ev.preventDefault();
      return;
    }
    if (current && /^Digit\d$/.test(ev.code)) { exit(); return; }   // fast travel goes home first
    if (!open) return;
    if (ev.code === 'ArrowDown' || ev.code === 'ArrowUp') { const n = index.length + 1; sel = (sel + (ev.code === 'ArrowDown' ? 1 : n - 1)) % n; render(); }
    else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') go(sel);
    else if (ev.code === 'Escape') { open = false; render(); return; }
    else return;
    ev.stopImmediatePropagation(); ev.preventDefault();
  }
  ui();
  window.addEventListener('keydown', onKey, true);
  return {
    get active() { return !!current; },
    get current() { return current?.entry ?? null; },
    get index() { return index; },
    enter: (id) => { const e = index.find((m) => m.id === id); return e ? enter(e) : Promise.resolve(); },
    exit, toggle() { open = !open; render(); },
    // the walker's ground at a map-space point (test hook)
    heightAt: (x, z) => current?.grid.heightAt(x, z, 0),
  };
}
