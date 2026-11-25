// F1 panel: the frame-rate readout and the MTA skins (world/mta-skins.js) for the player and
// for everyone else. The choice is kept in localStorage.
//   Player: the original body or one skin (on foot, in the car, in third person).
//   NPCs:   the originals, one skin for everyone, or a mix of all skins.
import { skinList, applySkin } from '../world/mta-skins.js';
import { FLEET_POOL, SPAWN_EXTRA, loadMta } from '../world/mta-vehicles.js';

const KEY = 'od.f1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ } };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

export function createF1Panel({ hud, bodies, hooks = {}, shot = false }) {
  if (shot) return null;
  const st = { fps: false, player: '', npc: '', noCars: false, noNpcs: false, low: false, ...load() };
  let skins = [];
  const css = document.createElement('style');
  css.textContent = `
    #f1 { position: fixed; top: 14px; right: 14px; width: 270px; z-index: 40; padding: 14px 16px 12px; border-radius: 10px;
      background: rgba(18, 14, 12, 0.82); border: 1px solid rgba(255, 236, 205, 0.22); backdrop-filter: blur(8px);
      color: #fff4e6; font: 12px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
    #f1.hidden { display: none; }
    #f1 h3 { margin: 0 0 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255, 236, 205, 0.75); }
    #f1 label { display: block; margin: 9px 0 3px; font-size: 11px; color: rgba(255, 244, 230, 0.7); }
    #f1 select { width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255, 236, 205, 0.25); background: #241c18; color: #fff4e6; font: inherit; }
    #f1 button { padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255, 236, 205, 0.35); background: #3a2a20; color: #fff4e6; font: inherit; cursor: pointer; white-space: nowrap; }
    #f1 button:hover { background: #4d3828; }
    #f1 .row select { flex: 1; min-width: 0; }
    #f1 .row { display: flex; align-items: center; gap: 8px; margin: 2px 0 6px; }
    #f1 .hint { margin-top: 10px; font-size: 10.5px; color: rgba(255, 244, 230, 0.5); }`;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'f1';
  el.className = 'hidden';
  el.innerHTML = `<h3>F1 · Painel</h3>
    <div class="row"><input type="checkbox" id="f1fps"><label for="f1fps" style="margin:0">Mostrar FPS</label></div>
    <label for="f1player">Skin do jogador</label><select id="f1player"></select>
    <label for="f1npc">Skin dos NPCs</label><select id="f1npc"></select>
    <label for="f1car">Spawnar veículo</label>
    <div class="row"><select id="f1car"></select><button id="f1spawn" type="button">Spawnar</button></div>
    <div class="row"><button id="f1despawn" type="button" style="flex:1">Despawnar o carro spawnado (mais perto)</button></div>
    <div class="row"><input type="checkbox" id="f1nocars"><label for="f1nocars" style="margin:0">Tirar os carros do mapa</label></div>
    <div class="row"><input type="checkbox" id="f1nonpc"><label for="f1nonpc" style="margin:0">Tirar os NPCs do mapa</label></div>
    <div class="row"><input type="checkbox" id="f1low"><label for="f1low" style="margin:0">Gráficos baixos (PC fraco)</label></div>
    <div class="hint">F1 abre / fecha · skins do MTA</div>`;
  document.body.appendChild(el);
  // (keys typed in the panel are not the game's)
  for (const t of ['keydown', 'keyup']) el.addEventListener(t, (e) => { if (e.key !== 'F1') e.stopPropagation(); });
  const $ = (id) => el.querySelector('#' + id);

  const fillSelects = () => {
    const opt = (v, t) => `<option value="${v}">${t}</option>`;
    const list = skins.map((s) => opt(s.id, s.label)).join('');
    $('f1player').innerHTML = opt('', 'Original') + list;
    $('f1npc').innerHTML = opt('', 'Originais') + opt('*', 'Mistura (todas as skins)') + list;
    $('f1player').value = st.player;
    $('f1npc').value = st.npc;
    $('f1fps').checked = st.fps;
    $('f1nocars').checked = st.noCars; $('f1nonpc').checked = st.noNpcs; $('f1low').checked = st.low;
  };
  // the cars that can be spawned: every MTA body of the fleet pool, with its body kind
  const spawnable = [];
  for (const [kind, names] of Object.entries(FLEET_POOL)) for (const n of names) if (!spawnable.some((q) => q.mta === n)) spawnable.push({ kind, mta: n, label: n.replace(/^carro-/, '').replace(/-/g, ' ') });
  for (const q of SPAWN_EXTRA) spawnable.push({ ...q, label: q.mta.replace(/^carro-/, '').replace(/-/g, ' ') });
  $('f1car').innerHTML = spawnable.map((q, i) => `<option value="${i}">${q.label.replace(/^./, (c) => c.toUpperCase())}</option>`).join('');
  $('f1spawn').addEventListener('click', async () => { const q = spawnable[+$('f1car').value]; if (!q) return; await loadMta(q.mta); hooks.spawn?.(q.kind, q.mta); });
  $('f1despawn').addEventListener('click', () => hooks.despawn?.());
  const applyToggles = () => { hooks.cars?.(st.noCars); hooks.npcs?.(st.noNpcs); hooks.low?.(st.low); };
  $('f1nocars').addEventListener('change', () => { st.noCars = $('f1nocars').checked; save(st); hooks.cars?.(st.noCars); });
  $('f1nonpc').addEventListener('change', () => { st.noNpcs = $('f1nonpc').checked; save(st); hooks.npcs?.(st.noNpcs); });
  $('f1low').addEventListener('change', () => { st.low = $('f1low').checked; save(st); hooks.low?.(st.low); });
  // the frame-rate readout: its own counter (frames over the last half second)
  const fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'position:fixed;top:12px;left:12px;z-index:39;padding:4px 9px;border-radius:6px;background:rgba(18,14,12,.72);color:#9dff8a;font:600 13px/1.3 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;display:none';
  document.body.appendChild(fpsEl);
  let frames = 0, t0 = performance.now();
  const tick = (now) => {
    frames++;
    if (now - t0 >= 500) {
      const f = (frames * 1000) / (now - t0);
      if (st.fps) { fpsEl.textContent = f.toFixed(0) + ' FPS · ' + (1000 / f).toFixed(1) + ' ms'; fpsEl.style.color = f >= 50 ? '#9dff8a' : f >= 30 ? '#ffd86b' : '#ff7a6b'; }
      frames = 0; t0 = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const showFps = () => { fpsEl.style.display = st.fps ? 'block' : 'none'; };

  // skins are applied once per body; new bodies (the traffic's drivers are made as cars come
  // into view) are picked up on the timer
  const wanted = (P, role) => {
    if (role === 'player') return st.player;
    if (st.npc === '*') return skins.length ? skins[hash(P.root.uuid) % skins.length].id : '';
    return st.npc;
  };
  let busy = false;
  async function sweep() {
    if (busy || !skins.length) return;
    busy = true;
    try {
      const b = bodies();
      for (const role of ['player', 'npc']) {
        for (const P of b[role]) {
          const w = wanted(P, role);
          if ((P.skin ?? '') !== w) await applySkin(P, w || null);
        }
      }
    } catch (e) { console.warn('f1: skins', e); }
    busy = false;
  }
  $('f1fps').addEventListener('change', () => { st.fps = $('f1fps').checked; save(st); showFps(); });
  $('f1player').addEventListener('change', () => { st.player = $('f1player').value; save(st); sweep(); });
  $('f1npc').addEventListener('change', () => { st.npc = $('f1npc').value; save(st); sweep(); });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'F1') return;
    e.preventDefault();
    if (e.repeat) return;
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) document.exitPointerLock?.();
  });
  skinList().then((l) => { skins = l; fillSelects(); showFps(); sweep(); });
  // (the saved choices, once the world is up)
  setTimeout(() => { if (st.noCars || st.noNpcs || st.low) applyToggles(); }, 2500);
  setInterval(sweep, 1500);
  return { el, state: st, sweep, apply: applySkin, applyToggles };
}
