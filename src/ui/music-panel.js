// Music panel, [R]: the game's one place for music (it replaces the old car radio on Q).
// Now: music from a link (.mp3 or YouTube) or from a file on the device, played in 3D from the
// car's speakers, with one volume for inside the car (next to the speakers) and one for outside.
// More sources (playlists, stations, the bar's music) are meant to be added here as sections.
import { createLinkPlayer } from '../audio/link-player.js';

const KEY = 'od.music';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private window */ } };

export function createMusicPanel({ hooks = {}, shot = false }) {
  if (shot) return null;
  const st = { link: '', vIn: 0.8, vOut: 1.2, ...load() };
  const linker = createLinkPlayer(hooks);
  linker.setVolumes(st.vIn, st.vOut);
  const css = document.createElement('style');
  css.textContent = `
    #mus { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, calc(100vw - 32px)); z-index: 41; padding: 16px 18px 14px;
      border-radius: 10px; background: rgba(18, 14, 12, 0.88); border: 1px solid rgba(255, 236, 205, 0.25); backdrop-filter: blur(8px);
      color: #fff4e6; font: 12px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
    #mus.hidden { display: none; }
    #mus h3 { margin: 0 0 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255, 236, 205, 0.75); }
    #mus h4 { margin: 14px 0 4px; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(246, 214, 154, 0.9); }
    #mus .row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
    #mus input[type=text] { flex: 1; min-width: 0; padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255, 236, 205, 0.25); background: #241c18; color: #fff4e6; font: inherit; }
    #mus input[type=range] { flex: 1; accent-color: #f6d69a; }
    #mus .row span.v { width: 64px; color: rgba(255, 244, 230, 0.8); }
    #mus .row span.n { width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
    #mus button { padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255, 236, 205, 0.35); background: #3a2a20; color: #fff4e6; font: inherit; cursor: pointer; white-space: nowrap; }
    #mus button:hover { background: #4d3828; }
    #mus .now { margin: 6px 0 0; min-height: 16px; color: #f6d69a; }
    #mus .hint { margin-top: 10px; font-size: 10.5px; color: rgba(255, 244, 230, 0.5); }`;
  document.head.appendChild(css);
  const el = document.createElement('div');
  el.id = 'mus';
  el.className = 'hidden';
  el.innerHTML = `<h3>Música · R</h3>
    <div class="now" id="musnow">Nada tocando.</div>
    <h4>Tocar</h4>
    <div class="row"><input id="muslink" type="text" placeholder="Link .mp3 ou YouTube"><button id="musplay" type="button">Tocar</button><button id="musstop" type="button">■</button></div>
    <div class="row"><input id="musfile" type="file" accept="audio/*" style="max-width:100%"></div>
    <h4>Volume</h4>
    <div class="row"><span class="v">Dentro</span><input id="musin" type="range" min="0" max="200" step="1"><span class="n" id="musinn"></span></div>
    <div class="row"><span class="v">Fora</span><input id="musout" type="range" min="0" max="200" step="1"><span class="n" id="musoutn"></span></div>
    <div class="hint">Dentro = no carro / junto das caixas · Fora = andando longe dele (diminui com a distância).<br>A música sai das caixas [B] do carro em 3D. R fecha.</div>`;
  document.body.appendChild(el);
  for (const t of ['keydown', 'keyup']) el.addEventListener(t, (e) => { if (e.code !== 'KeyR' && e.key !== 'Escape') e.stopPropagation(); });
  const $ = (id) => el.querySelector('#' + id);
  const msg = (t) => { $('musnow').textContent = t; };
  const vols = () => {
    $('musin').value = Math.round(st.vIn * 100); $('musout').value = Math.round(st.vOut * 100);
    $('musinn').textContent = Math.round(st.vIn * 100) + '%'; $('musoutn').textContent = Math.round(st.vOut * 100) + '%';
    linker.setVolumes(st.vIn, st.vOut);
  };
  $('muslink').value = st.link;
  vols();
  $('musin').addEventListener('input', () => { st.vIn = $('musin').value / 100; save(st); vols(); });
  $('musout').addEventListener('input', () => { st.vOut = $('musout').value / 100; save(st); vols(); });
  $('musplay').addEventListener('click', async () => {
    st.link = $('muslink').value.trim(); save(st);
    msg('Carregando…');
    const r = await linker.play(st.link);
    msg(r.ok ? (r.kind === 'youtube' ? 'Tocando (YouTube).' : 'Tocando.') : r.error);
  });
  $('musfile').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    msg('Carregando…');
    const r = await linker.playFile(f);
    msg(r.ok ? 'Tocando: ' + f.name : r.error);
  });
  $('musstop').addEventListener('click', () => { linker.stop(); msg('Nada tocando.'); });
  const toggle = (on = el.classList.contains('hidden')) => {
    el.classList.toggle('hidden', !on);
    if (on) hooks.onOpen?.();
  };
  addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape' && !el.classList.contains('hidden')) { toggle(false); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target?.tagName ?? '');
    if (ev.code !== 'KeyR' || ev.repeat || typing || ev.ctrlKey || ev.altKey || ev.metaKey) return;
    toggle();
    ev.preventDefault(); ev.stopImmediatePropagation();
  }, true);   // capture: R no longer reaches the vehicle's "recover" (Backspace still does)
  return { toggle, get open() { return !el.classList.contains('hidden'); }, setMuted: (m) => linker.setMuted(m), stop: () => linker.stop() };
}
