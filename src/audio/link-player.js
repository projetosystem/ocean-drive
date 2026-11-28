// Music from a link, for the F1 panel: an .mp3 (or any audio file / stream the browser plays) is
// played with an <audio> element; a YouTube link (video, short or playlist) with YouTube's own
// embedded player, hidden, since YouTube gives no audio file. Where the page may not embed other
// sites (the hosted test page), the YouTube part cannot load and the panel says so.
let yt = null, ytReady = null, ytHost = null;

export function parseYouTube(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  const h = url.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (h === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (h.endsWith('youtube.com') || h === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else { const m = /^\/(embed|shorts|live|v)\/([\w-]{6,})/.exec(url.pathname); if (m) id = m[2]; }
  } else return null;
  const list = url.searchParams.get('list');
  return id || list ? { id, list } : null;
}

function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytReady = null; reject(new Error('youtube blocked')); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.YT?.Player) { ytReady = null; reject(new Error('youtube timeout')); } }, 8000);
  });
  return ytReady;
}

// hooks (all optional): { out(): {ctx, out: GainNode}|null, anchor(): () => {x,y,z}|null, listener(): {x,y,z}|null }
// With them the music is 3D: it comes out of the car's speakers (a PannerNode where the browser lets the
// page process the audio; otherwise, and for YouTube, only the volume follows the distance).
export function createLinkPlayer(hooks = {}) {
  let el = null, muted = false, vol = 0.8, kind = null, pan = null, src = null, where = null, raf = 0;
  const REF = 3;
  const gainAt = (d) => Math.min(1, REF / Math.max(d, REF)) ** 1.3;
  function tick() {
    raf = 0;
    if (!kind) return;
    const p = where?.();
    if (p) {
      if (pan) { const t = pan.context.currentTime; pan.positionX.setTargetAtTime(p.x, t, 0.05); pan.positionY.setTargetAtTime(p.y, t, 0.05); pan.positionZ.setTargetAtTime(p.z, t, 0.05); }
      else {
        const l = hooks.listener?.();
        if (l) { const d = Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z); const g = gainAt(d) * vol; if (el) el.volume = g; if (yt?.setVolume) yt.setVolume(Math.round(g * 100)); }
      }
    }
    raf = requestAnimationFrame(tick);
  }
  function route() {
    // plays the <audio> through a PannerNode placed at the speakers
    pan = null; src = null;
    const h = hooks.out?.();
    if (!h || !el) return;
    try {
      src = h.ctx.createMediaElementSource(el);
      pan = new PannerNode(h.ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: REF, rolloffFactor: 1.3, maxDistance: 400 });
      src.connect(pan); pan.connect(h.out);
    } catch { pan = null; src = null; }
  }
  function startTick() { where = hooks.anchor?.() ?? null; if (!raf) raf = requestAnimationFrame(tick); }
  const apply = () => {
    if (el) { el.muted = muted; if (pan || !where) el.volume = vol; }
    if (yt?.setVolume && !where) { yt.setVolume(Math.round(vol * 100)); muted ? yt.mute() : yt.unMute(); }
  };
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    try { src?.disconnect(); pan?.disconnect(); } catch { /* already gone */ }
    src = pan = null;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); el = null; }
    try { yt?.stopVideo?.(); } catch { /* player gone */ }
    kind = null;
  }
  return {
    get playing() { return kind; },
    setMuted(m) { muted = !!m; apply(); },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); apply(); },
    stop,
    // plays a file picked from the device (works on any host, incl. the hosted test page)
    async playFile(file) {
      if (!file) return { ok: false, error: 'Escolha um arquivo de áudio.' };
      stop();
      el = new Audio(URL.createObjectURL(file)); el.loop = true; route(); apply();
      try { await el.play(); kind = 'audio'; startTick(); return { ok: true, kind }; } catch (e) {
        el = null; return { ok: false, error: 'Não consegui tocar esse arquivo (' + (e?.message || 'formato não suportado') + ').' };
      }
    },
    // resolves to { ok, kind } or { ok: false, error }
    async play(link) {
      const u = (link ?? '').trim();
      if (!u) return { ok: false, error: 'Cole um link.' };
      stop();
      const y = parseYouTube(u);
      if (y) {
        try {
          const YT = await loadYT();
          if (!ytHost) { ytHost = document.createElement('div'); ytHost.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:200px;pointer-events:none'; ytHost.innerHTML = '<div id="od-yt"></div>'; document.body.appendChild(ytHost); }
          await new Promise((resolve) => {
            const opts = { playerVars: { autoplay: 1, controls: 0, playsinline: 1, ...(y.list ? { listType: 'playlist', list: y.list } : {}) }, events: { onReady: () => resolve() } };
            if (yt) { resolve(); return; }
            yt = new YT.Player('od-yt', { width: 200, height: 200, videoId: y.id ?? undefined, ...opts });
          });
          if (y.id) yt.loadVideoById(y.id); else yt.loadPlaylist({ listType: 'playlist', list: y.list });
          kind = 'youtube'; startTick(); apply(); yt.playVideo?.();
          return { ok: true, kind };
        } catch {
          return { ok: false, error: 'Não deu para carregar o YouTube aqui (a página não pode incorporar o YouTube). No jogo publicado funciona; aqui use um link .mp3.' };
        }
      }
      if (!/^https?:\/\//i.test(u)) return { ok: false, error: 'O link precisa começar com http:// ou https://' };
      el = new Audio();
      el.crossOrigin = 'anonymous';
      el.loop = true;
      el.src = u;
      route(); apply();
      try { await el.play(); kind = 'audio'; startTick(); return { ok: true, kind }; } catch {
        // (a host without CORS headers can still be played without the flag)
        try { try { src?.disconnect(); pan?.disconnect(); } catch { /* */ } src = pan = null; el = new Audio(u); el.loop = true; apply(); await el.play(); kind = 'audio'; startTick(); return { ok: true, kind }; } catch {
          el = null;
          return { ok: false, error: 'Não consegui tocar esse link. Links do Discord expiram/exigem assinatura e algumas páginas (como o teste hospedado) bloqueiam áudio de outros sites. Use \"Arquivo\" para tocar um .mp3 do seu aparelho.' };
        }
      }
    },
  };
}
