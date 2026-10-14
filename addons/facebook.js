// DEV/g0d - Facebook Addon
// Register plugins via window.DEVg0d_PLUGINS for the main script to render

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  //  GLOBAL: NETWORK HOOK (ติดตั้งทันทีที่ document-start)
  //  ดัก URL .mp4/.jpg ที่ FB โหลดผ่าน fetch/XHR ไว้ให้ StorySaver ใช้
  // ═══════════════════════════════════════════════════════════════════════
  const __dgCaptured = {
    videos: [],
    images: [],
    remember(list, url) {
      if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
      if (list.some(x => x.url === url)) return;
      list.push({ url, time: Date.now() });
      if (list.length > 100) list.shift();
    }
  };
  window.__dgCaptured = __dgCaptured;

  const isVideoUrl = (u) =>
    typeof u === 'string' &&
    u.startsWith('http') &&
    (u.includes('.fbcdn.net') || u.includes('video.')) &&
    (u.includes('.mp4') || u.includes('/v/t42.') || u.includes('/o1/v/') ||
     u.includes('efg=') || /\/v\/t\d+\.\d+-\d+\//.test(u));

  const isImageUrl = (u) =>
    typeof u === 'string' &&
    u.startsWith('http') &&
    u.includes('.fbcdn.net') &&
    !u.includes('/v/t1.30497') &&
    !u.includes('/v/t1.6435-');

  const __origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (isVideoUrl(url)) {
        console.log('[DEV/g0d] fetch video:', url.slice(0, 120));
        __dgCaptured.remember(__dgCaptured.videos, url);
      } else if (isImageUrl(url)) {
        __dgCaptured.remember(__dgCaptured.images, url);
      }
    } catch (e) {}
    return __origFetch.apply(this, arguments);
  };

  const __origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (isVideoUrl(url)) {
        console.log('[DEV/g0d] xhr video:', url.slice(0, 120));
        __dgCaptured.remember(__dgCaptured.videos, url);
      } else if (isImageUrl(url)) {
        __dgCaptured.remember(__dgCaptured.images, url);
      }
    } catch (e) {}
    return __origOpen.apply(this, arguments);
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 1: VideoDownloader v2.6
  // ═══════════════════════════════════════════════════════════════════════
  function initFbVideoDownloader() {
    if (window.__dgVdInit) return;
    window.__dgVdInit = true;

    const VERSION = '2.6';
    console.log('[DEV/g0d] VideoDownloader v' + VERSION + ' loaded');

    const CONFIG = {
      minW: 150,
      minH: 84,
      gap: 10,
      idleOpacity: 0.35,
      tickMs: 30,
      rescanMs: 800,
      excludeChat: true,
      navPad: 6,
      fallbackNavH: 60
    };

    const EXCLUDE_ZONES = '[role="navigation"],[role="banner"],[role="complementary"]';

    const CSS = `
      .dgvd-bar {
        position: fixed;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        gap: 1px;
        padding: 3px;
        border-radius: 10px;
        background: rgba(13, 17, 23, .82);
        border: 1px solid rgba(255, 255, 255, .10);
        box-shadow: 0 6px 22px rgba(0, 0, 0, .5);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        transition: opacity .16s ease;
      }
      .dgvd-bar button {
        width: 30px; height: 30px; padding: 0;
        display: flex; align-items: center; justify-content: center;
        background: transparent; border: none; border-radius: 7px;
        color: #e6edf3; cursor: pointer;
        transition: background .12s, color .12s;
      }
      .dgvd-bar button:hover { background: rgba(255, 255, 255, .13); }
      .dgvd-bar button:active { transform: scale(.93); }
      .dgvd-bar button.ok { color: #3fb950; }
      .dgvd-bar button.err { color: #f85149; }
      .dgvd-bar button.busy { color: #58a6ff; }
      .dgvd-bar svg { display: block; }
      .dgvd-spin { animation: dgvd-rot .9s linear infinite; }
      @keyframes dgvd-rot { to { transform: rotate(360deg); } }

      #dgvd-toast {
        position: fixed;
        z-index: 2147483001;
        right: 18px; bottom: 18px;
        max-width: 320px;
        padding: 10px 14px;
        border-radius: 10px;
        background: rgba(13, 17, 23, .94);
        border: 1px solid rgba(255, 255, 255, .12);
        color: #e6edf3;
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 10px 30px rgba(0, 0, 0, .55);
        opacity: 0; transform: translateY(8px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: none;
      }
      #dgvd-toast.on { opacity: 1; transform: translateY(0); }
      #dgvd-toast b { color: #79c0ff; }
      #dgvd-toast.err { border-color: rgba(248, 81, 73, .5); }
      #dgvd-toast.err b { color: #ffa198; }
    `;

    function injectCSS() {
      if (document.getElementById('dgvd-style')) return;
      const s = document.createElement('style');
      s.id = 'dgvd-style';
      s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    }

    const ICON = {
      dl: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      open: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
      spin: '<svg class="dgvd-spin" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>',
      ok: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
      err: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    };

    let toastEl = null;
    let toastTimer = null;

    function toast(html, isErr, ms) {
      injectCSS();
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'dgvd-toast';
        (document.body || document.documentElement).appendChild(toastEl);
      }
      toastEl.className = isErr ? 'err' : '';
      toastEl.innerHTML = html;
      requestAnimationFrame(() => toastEl.classList.add('on'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms || 2600);
    }

    function inChat(v) {
      if (!CONFIG.excludeChat) return false;
      if (v.closest('[data-pagelet^="MW"],[data-pagelet^="MAW"]')) return true;
      if (/\/(messages|messaging)(\/|$)/.test(location.pathname)) return true;
      try {
        if (v.closest('[data-pagelet*="Chat"],[aria-label="Chats"],[aria-label="\u0e41\u0e0a\u0e17"]')) return true;
      } catch (e) {}
      const dlg = v.closest('[role="dialog"]');
      if (dlg &&
          !dlg.querySelector('[aria-label="Video player"],[data-instancekey]') &&
          dlg.querySelector('[role="textbox"],[contenteditable="true"]')) {
        return true;
      }
      return false;
    }

    function isVideoOk(v) {
      if (!v || !v.isConnected) return false;
      if (v.closest(EXCLUDE_ZONES)) return false;
      if (inChat(v)) return false;
      const src = v.currentSrc || v.src || '';
      if (/\/v\/t1\./.test(src)) return false;
      const cs = getComputedStyle(v);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return true;
    }

    function playerRoot(node) {
      if (!node || !node.closest) return null;
      return node.closest('[data-instancekey]') || node.closest('[aria-label="Video player"]');
    }

    function videoOfPlayer(root) {
      if (!root) return null;
      const inside = root.querySelector('video');
      if (inside) return inside;
      const p = root.parentElement;
      if (!p) return null;
      const vids = p.querySelectorAll('video');
      return vids.length === 1 ? vids[0] : null;
    }

    function occludedAt(v, r) {
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      if (cx < 1 || cy < 1 || cx >= window.innerWidth - 1 || cy >= window.innerHeight - 1) return false;
      const el = document.elementFromPoint(cx, cy);
      if (!el) return true;
      if (el.closest && el.closest('.dgvd-bar,#dgvd-toast')) return false;
      const oRoot = playerRoot(el);
      if (oRoot) {
        const pv = videoOfPlayer(oRoot);
        if (pv) return pv !== v;
        return !oRoot.contains(v);
      }
      let node = el;
      for (let i = 0; i < 15 && node && node !== document.body; i++) {
        if (node === v || (node.contains && node.contains(v))) return false;
        node = node.parentElement;
      }
      return true;
    }

    function isBigEnough(r) {
      return r.width >= CONFIG.minW && r.height >= CONFIG.minH;
    }

    function isOnScreen(r) {
      return r.width > 1 && r.height > 1 &&
        r.bottom > 0 && r.top < window.innerHeight &&
        r.right > 0 && r.left < window.innerWidth;
    }

    const tracked = new Map();

    function createBar(video) {
      injectCSS();
      const bar = document.createElement('div');
      bar.className = 'dgvd-bar';
      bar.style.opacity = String(CONFIG.idleOpacity);

      const btnOpen = document.createElement('button');
      btnOpen.title = '\u0e40\u0e1b\u0e34\u0e14\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e43\u0e19\u0e41\u0e17\u0e47\u0e1a\u0e43\u0e2b\u0e21\u0e48';
      btnOpen.innerHTML = ICON.open;
      btnOpen.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        runAction(btnOpen, async () => {
          const url = await resolveVideoUrl(video);
          window.open(url, '_blank', 'noopener');
        }, '\u0e40\u0e1b\u0e34\u0e14\u0e43\u0e19\u0e41\u0e17\u0e47\u0e1a\u0e43\u0e2b\u0e21\u0e48');
      });

      const btnDl = document.createElement('button');
      btnDl.title = '\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d';
      btnDl.innerHTML = ICON.dl;
      btnDl.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        runAction(btnDl, async () => {
          const url = await resolveVideoUrl(video);
          const id = (url.match(/(\d{8,})/) || [])[1] || Date.now();
          download(url, 'fb_video_' + id + '.mp4');
        }, '\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14');
      });

      bar.appendChild(btnOpen);
      bar.appendChild(btnDl);
      bar.style.display = 'none';

      const entry = { bar, btnDl, btnOpen, hover: false };
      bar.addEventListener('mouseenter', () => { entry.hover = true; });
      bar.addEventListener('mouseleave', () => { entry.hover = false; });

      (document.body || document.documentElement).appendChild(bar);
      tracked.set(video, entry);
      return entry;
    }

    function destroyBar(video) {
      const entry = tracked.get(video);
      if (!entry) return;
      entry.bar.remove();
      tracked.delete(video);
    }

    async function runAction(btn, fn, label) {
      if (btn.classList.contains('busy')) return;
      const original = btn.innerHTML;
      btn.classList.add('busy');
      btn.classList.remove('ok', 'err');
      btn.innerHTML = ICON.spin;
      try {
        await fn();
        btn.classList.remove('busy');
        btn.classList.add('ok');
        btn.innerHTML = ICON.ok;
        setTimeout(() => {
          btn.classList.remove('ok');
          btn.innerHTML = original;
        }, 1800);
      } catch (err) {
        console.error('[DEV/g0d] ' + label + ' failed:', err);
        btn.classList.remove('busy');
        btn.classList.add('err');
        btn.innerHTML = ICON.err;
        toast('<b>' + label + '\u0e44\u0e21\u0e48\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08</b><br>' + String((err && err.message) || err), true, 4200);
        setTimeout(() => {
          btn.classList.remove('err');
          btn.innerHTML = original;
        }, 2600);
      }
    }

    const pointer = { x: -1, y: -1 };

    function scan() {
      if (!document.body) return;
      const all = document.querySelectorAll('video');
      const seen = new Set();
      for (let i = 0; i < all.length; i++) {
        const v = all[i];
        seen.add(v);
        if (tracked.has(v)) continue;
        if (!isVideoOk(v)) continue;
        const r = v.getBoundingClientRect();
        if (!isBigEnough(r)) continue;
        createBar(v);
      }
      tracked.forEach((entry, v) => {
        if (!seen.has(v) || !v.isConnected) destroyBar(v);
      });
      ensureLoop();
    }

    let navCache = { at: 0, value: 0 };

    function looksLikeTopBar(node) {
      if (!node || !node.tagName || !node.getBoundingClientRect) return false;
      if (node.tagName.toLowerCase() === 'video') return false;
      if (node.querySelector && node.querySelector('video')) return false;
      const r = node.getBoundingClientRect();
      if (r.top > 12) return false;
      if (r.height < 20 || r.height > 220) return false;
      if (r.width < window.innerWidth * 0.5) return false;
      return true;
    }

    function computeNavBottom() {
      const vw = window.innerWidth;
      let best = 0;
      const nav = document.querySelector('[role="banner"]');
      if (nav && looksLikeTopBar(nav)) best = nav.getBoundingClientRect().bottom;
      if (best === 0) {
        const xs = [0.5, 0.2, 0.8, 0.35, 0.65];
        for (let i = 0; i < xs.length; i++) {
          const el = document.elementFromPoint(Math.round(vw * xs[i]), 3);
          if (!el || (el.closest && el.closest('.dgvd-bar'))) continue;
          let node = el;
          for (let d = 0; d < 15 && node && node !== document.documentElement; d++) {
            if (looksLikeTopBar(node)) { best = node.getBoundingClientRect().bottom; break; }
            node = node.parentElement;
          }
          if (best > 0) break;
        }
      }
      return Math.max(0, Math.min(best, 220));
    }

    function navBottom() {
      const now = Date.now();
      if (now - navCache.at < 500) return navCache.value;
      navCache.at = now;
      navCache.value = computeNavBottom();
      return navCache.value;
    }

    function safeTopFor(r) {
      const nb = navBottom();
      if (nb > 0) return nb + CONFIG.navPad;
      if (r.top < 0) return CONFIG.fallbackNavH;
      return 0;
    }

    function placeBar(entry, r) {
      const bw = entry.bar.offsetWidth || 70;
      const bh = entry.bar.offsetHeight || 36;
      const safeTop = safeTopFor(r);
      const visTop = Math.max(r.top, safeTop);
      const visBottom = Math.min(r.bottom, window.innerHeight);
      const visLeft = Math.max(r.left, 0);
      const visRight = Math.min(r.right, window.innerWidth);
      if (visBottom - visTop < bh + 2 || visRight - visLeft < bw + 2) return false;
      let left = Math.min(r.right - bw - CONFIG.gap, visRight - bw - 2);
      if (left < visLeft + 2) left = visLeft + 2;
      let top = Math.min(r.top + CONFIG.gap, visBottom - bh - 2);
      if (top < visTop + 2) top = visTop + 2;
      entry.bar.style.left = Math.round(left) + 'px';
      entry.bar.style.top = Math.round(top) + 'px';
      return true;
    }

    function pointerOn(r) {
      return pointer.x >= r.left && pointer.x <= r.right &&
             pointer.y >= r.top && pointer.y <= r.bottom;
    }

    let rafId = 0;
    let lastTick = 0;

    function loop(ts) {
      rafId = requestAnimationFrame(loop);
      if (ts - lastTick < CONFIG.tickMs) return;
      lastTick = ts;
      if (!tracked.size) { stopLoop(); return; }
      if (document.hidden) return;
      tracked.forEach((entry, v) => {
        if (!v.isConnected) { destroyBar(v); return; }
        const r = v.getBoundingClientRect();
        if (!isOnScreen(r) || !isBigEnough(r)) {
          if (entry.bar.style.display !== 'none') entry.bar.style.display = 'none';
          return;
        }
        if (!entry.occAt || ts - entry.occAt > 120) {
          entry.occAt = ts;
          entry.occluded = occludedAt(v, r);
        }
        if (entry.occluded) {
          if (entry.bar.style.display !== 'none') entry.bar.style.display = 'none';
          return;
        }
        if (entry.bar.style.display !== 'flex') entry.bar.style.display = 'flex';
        if (!placeBar(entry, r)) {
          entry.bar.style.display = 'none';
          return;
        }
        const hot = entry.hover || pointerOn(r);
        const want = hot ? 1 : CONFIG.idleOpacity;
        if (entry.opacity !== want) {
          entry.opacity = want;
          entry.bar.style.opacity = String(want);
          entry.bar.style.pointerEvents = want > 0 ? 'auto' : 'none';
        }
      });
    }

    function ensureLoop() {
      if (!rafId) rafId = requestAnimationFrame(loop);
    }

    function stopLoop() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }

    document.addEventListener('mousemove', (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }, true);

    document.addEventListener('mouseleave', () => {
      pointer.x = -1;
      pointer.y = -1;
    }, true);

    window.addEventListener('blur', () => {
      pointer.x = -1;
      pointer.y = -1;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        tracked.forEach((entry) => { entry.hover = false; });
      }
    }, true);

    function digId(obj, depth, seen) {
      if (depth > 4 || !obj || typeof obj !== 'object') return null;
      if (seen.has(obj)) return null;
      seen.add(obj);
      if (typeof obj.videoFBID === 'string' && obj.videoFBID) return obj.videoFBID;
      if (typeof obj.videoId === 'string' && /^\d{6,}$/.test(obj.videoId)) return obj.videoId;
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length && i < 25; i++) {
        const k = keys[i];
        if (k === 'return' || k === 'child' || k === 'sibling' || k === 'stateNode') continue;
        try {
          const hit = digId(obj[k], depth + 1, seen);
          if (hit) return hit;
        } catch (e) {}
      }
      return null;
    }

    function idFromNode(node) {
      if (!node || typeof node !== 'object') return null;
      for (const k in node) {
        if (!k.startsWith('__react')) continue;
        let o;
        try { o = node[k]; } catch (e) { continue; }
        if (!o || typeof o !== 'object') continue;
        const direct = o.videoFBID || o.videoId ||
          (o.props && (o.props.videoFBID || o.props.videoId)) ||
          (o.children && o.children.props &&
            (o.children.props.videoFBID || o.children.props.videoId ||
             o.children.props.coreVideoPlayerMetaData?.videoFBID));
        if (direct && /^[a-zA-Z0-9_-]{6,}$/.test(String(direct))) return String(direct);
        try {
          const hit = digId(o.memoizedProps, 0, new WeakSet()) ||
                      digId(o.memoizedState, 0, new WeakSet());
          if (hit) return hit;
        } catch (e) {}
      }
      return null;
    }

    function idFromUrl(s) {
      if (!s) return null;
      const m1 = String(s).match(/\/videos\/(?:[^/]+\/)?(\d{6,})/);
      if (m1) return m1[1];
      const m2 = String(s).match(/[?&]v=(\d{6,})/);
      if (m2) return m2[1];
      const m3 = String(s).match(/\/reel\/(\d{6,})/);
      if (m3) return m3[1];
      return null;
    }

    function resolveVideoId(video) {
      if (!video) throw new Error('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d');
      try {
        const w = video.closest('[data-video-id]');
        if (w) {
          const id = w.getAttribute('data-video-id');
          if (id && /^\d{6,}$/.test(id)) return id;
        }
      } catch (e) {}
      let el = video;
      for (let i = 0; i < 15 && el; i++) {
        const id = idFromNode(el);
        if (id) return id;
        el = el.parentElement;
      }
      try {
        const a = video.closest('a[href*="/videos/"], a[href*="/watch"], a[href*="/reel/"]');
        if (a) {
          const id = idFromUrl(a.getAttribute('href'));
          if (id) return id;
        }
        const scope = video.closest('[role="article"], div[data-pagelet]') || document;
        const a2 = scope.querySelector('a[href*="/videos/"], a[href*="/watch"], a[href*="/reel/"]');
        if (a2) {
          const id = idFromUrl(a2.getAttribute('href'));
          if (id) return id;
        }
      } catch (e) {}
      const fromPage = idFromUrl(location.href);
      if (fromPage) return fromPage;
      try {
        const inst = video.closest('[data-instancekey]');
        if (inst) {
          const m = (inst.getAttribute('data-instancekey') || '').match(/id-vpuid-([a-zA-Z0-9-]+)/);
          if (m) return m[1];
        }
      } catch (e) {}
      throw new Error('\u0e2b\u0e32\u0e04\u0e48\u0e32 video ID \u0e44\u0e21\u0e48\u0e40\u0e08\u0e2d \u2014 \u0e25\u0e2d\u0e07\u0e01\u0e14\u0e40\u0e25\u0e48\u0e19\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e2a\u0e31\u0e01 1\u20132 \u0e27\u0e34\u0e41\u0e25\u0e49\u0e27\u0e25\u0e2d\u0e07\u0e43\u0e2b\u0e21\u0e48');
    }

    function directSrc(video) {
      const d = (video && (video.currentSrc || video.src)) || '';
      return (d.startsWith('http') && /\.mp4(\?|$)/.test(d)) ? d : null;
    }

    const VIDEO_URL_KEYS = [
      'playable_url_quality_hd', 'playable_url', 'browser_native_hd_url', 'browser_native_sd_url',
      'hd_src_no_ratelimit', 'hd_src', 'sd_src_no_ratelimit', 'sd_src', 'download_url', 'video_url'
    ];

    function looksPlayable(u) {
      return typeof u === 'string' && u.startsWith('http') &&
        (u.indexOf('.mp4') !== -1 || u.indexOf('/v/t42.') !== -1 ||
         u.indexOf('/o1/v/') !== -1 || u.indexOf('efg=') !== -1);
    }

    function digVideoUrl(obj, depth, seen, budget) {
      if (depth > 5 || !obj || typeof obj !== 'object' || budget.n <= 0) return null;
      if (seen.has(obj)) return null;
      seen.add(obj);
      budget.n--;
      for (let i = 0; i < VIDEO_URL_KEYS.length; i++) {
        const v = obj[VIDEO_URL_KEYS[i]];
        if (looksPlayable(v)) return v;
      }
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length && i < 30; i++) {
        const k = keys[i];
        if (k === 'return' || k === 'child' || k === 'sibling') continue;
        try {
          const hit = digVideoUrl(obj[k], depth + 1, seen, budget);
          if (hit) return hit;
        } catch (e) {}
      }
      return null;
    }

    function fiberVideoUrl(video) {
      const budget = { n: 400 };
      let el = video;
      for (let i = 0; i < 10 && el; i++) {
        for (const k in el) {
          if (!k.startsWith('__react')) continue;
          let o;
          try { o = el[k]; } catch (e) { continue; }
          if (!o || typeof o !== 'object') continue;
          try {
            const hit = digVideoUrl(o, 0, new WeakSet(), budget) ||
                        (o.memoizedProps && digVideoUrl(o.memoizedProps, 0, new WeakSet(), budget)) ||
                        (o.memoizedState && digVideoUrl(o.memoizedState, 0, new WeakSet(), budget));
            if (hit) return hit;
          } catch (e) {}
          if (budget.n <= 0) return null;
        }
        el = el.parentElement;
      }
      return null;
    }

    function looksLikeToken(s) {
      return typeof s === 'string' && s.length >= 12 && /^[A-Za-z0-9_\-:+/=.$]+$/.test(s);
    }

    function getDtsg() {
      try { if (window.require) return require('DTSGInitialData').token; } catch (e) {}
      try {
        for (const s of document.querySelectorAll('script')) {
          const t = s.textContent;
          if (!t || t.indexOf('DTSGInitialData') === -1) continue;
          const m = t.match(/"token":"([^"]+)"/);
          if (m && looksLikeToken(m[1])) return m[1];
        }
      } catch (e) {}
      try {
        const m = document.documentElement.innerHTML.match(/"DTSGInitialData".{0,200}?"token":"([^"]+)"/);
        if (m && looksLikeToken(m[1])) return m[1];
      } catch (e) {}
      throw new Error('\u0e2d\u0e48\u0e32\u0e19 DTSG token \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49 \u2014 \u0e25\u0e2d\u0e07\u0e23\u0e35\u0e40\u0e1f\u0e23\u0e0a\u0e2b\u0e19\u0e49\u0e32');
    }

    function stringifyVariables(d, prefix) {
      const out = [];
      for (const a in d) {
        if (!Object.prototype.hasOwnProperty.call(d, a)) continue;
        const key = prefix ? prefix + '[' + a + ']' : a;
        const val = d[a];
        out.push(val !== null && typeof val === 'object'
          ? stringifyVariables(val, key)
          : encodeURIComponent(key) + '=' + encodeURIComponent(val));
      }
      return out.join('&');
    }

    async function fetchViaVideoData(videoId, dtsg) {
      const res = await fetch('https://www.facebook.com/video/video_data_async/?video_id=' + videoId, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-requested-with': 'XMLHttpRequest'
        },
        body: stringifyVariables({ __a: '1', fb_dtsg: dtsg })
      });
      const json = JSON.parse((await res.text()).replace('for (;;);', ''));
      const p = (json && json.payload) || {};
      const url = p.hd_src_no_ratelimit || p.hd_src || p.sd_src_no_ratelimit || p.sd_src;
      if (!url) throw new Error('video_data_async \u0e44\u0e21\u0e48\u0e04\u0e37\u0e19\u0e25\u0e34\u0e07\u0e01\u0e4c');
      return url;
    }

    async function fetchViaGraphQL(videoId, dtsg) {
      const res = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-requested-with': 'XMLHttpRequest'
        },
        body: stringifyVariables({
          doc_id: '5279476072161634',
          variables: JSON.stringify({
            UFI2CommentsProvider_commentsKey: 'CometTahoeSidePaneQuery',
            caller: 'CHANNEL_VIEW_FROM_PAGE_TIMELINE',
            videoID: videoId
          }),
          fb_dtsg: dtsg,
          server_timestamps: true
        })
      });
      const lines = (await res.text()).split('\n');
      if (!lines.length) throw new Error('graphql \u0e15\u0e2d\u0e1a\u0e01\u0e25\u0e31\u0e1a\u0e27\u0e48\u0e32\u0e07');
      const a = JSON.parse(lines[0]);
      const v = a && a.data && a.data.video;
      if (!v) throw new Error('graphql \u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d');
      const url = v.playable_url_quality_hd || v.playable_url;
      if (!url) throw new Error('graphql \u0e44\u0e21\u0e48\u0e21\u0e35 playable URL');
      return url;
    }

    async function resolveVideoUrl(video) {
      if (!video) throw new Error('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d');
      const direct = directSrc(video);
      if (direct) return direct;
      const fromFiber = fiberVideoUrl(video);
      if (fromFiber) return fromFiber;
      const id = await resolveVideoId(video);
      const dtsg = getDtsg();
      try {
        return await fetchViaVideoData(id, dtsg);
      } catch (e1) {
        try {
          return await fetchViaGraphQL(id, dtsg);
        } catch (e2) {
          throw new Error('\u0e14\u0e36\u0e07\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e17\u0e31\u0e49\u0e07 2 \u0e27\u0e34\u0e18\u0e35 \u2014 \u0e2d\u0e32\u0e08\u0e40\u0e1b\u0e47\u0e19\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e2a\u0e48\u0e27\u0e19\u0e15\u0e31\u0e27\u0e2b\u0e23\u0e37\u0e2d\u0e16\u0e39\u0e01\u0e25\u0e1a');
        }
      }
    }

    function saveBlob(blobUrl, name) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
    }

    function notifySaved(name) {
      toast('<b>\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14\u0e41\u0e25\u0e49\u0e27</b><br>' + name, false, 2600);
    }

    function download(url, name) {
      if (typeof GM_download === 'function') {
        GM_download({
          url, name, saveAs: false,
          onload: () => notifySaved(name),
          onerror: () => fallbackDownload(url, name)
        });
        return;
      }
      fallbackDownload(url, name);
    }

    function fallbackDownload(url, name) {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          responseType: 'blob',
          onload: (r) => { saveBlob(URL.createObjectURL(r.response), name); notifySaved(name); },
          onerror: () => window.open(url, '_blank', 'noopener')
        });
        return;
      }
      fetch(url)
        .then((r) => r.blob())
        .then((b) => { saveBlob(URL.createObjectURL(b), name); notifySaved(name); })
        .catch(() => window.open(url, '_blank', 'noopener'));
    }

    let scanTimer = null;

    function scheduleScan(delay) {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scan, delay || 350);
    }

    function start() {
      scan();
      let pending = false;
      new MutationObserver(() => {
        if (pending) return;
        pending = true;
        setTimeout(() => { pending = false; scan(); }, 350);
      }).observe(document.documentElement, { childList: true, subtree: true });

      setInterval(scan, CONFIG.rescanMs);
      document.addEventListener('click', () => scheduleScan(350), true);

      let lastHref = location.href;
      setInterval(() => {
        if (location.href === lastHref) return;
        lastHref = location.href;
        tracked.forEach((entry, v) => destroyBar(v));
        scheduleScan(400);
      }, 600);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }

    function listVideos() {
      return Array.from(document.querySelectorAll('video')).map((v) => {
        const r = v.getBoundingClientRect();
        return {
          rect: { w: Math.round(r.width), h: Math.round(r.height) },
          ok: isVideoOk(v),
          inChat: inChat(v),
          bigEnough: isBigEnough(r),
          tracked: tracked.has(v),
          currentSrc: String(v.currentSrc || '').slice(0, 80),
          src: String(v.src || '').slice(0, 80),
          srcObject: v.srcObject ? String(v.srcObject.constructor.name) : null,
          duration: Number.isFinite(v.duration) ? Math.round(v.duration) : null,
          readyState: v.readyState,
          fiberUrl: String(fiberVideoUrl(v) || '').slice(0, 90),
          pagelet: (v.closest('[data-pagelet]') || { getAttribute: () => null }).getAttribute('data-pagelet'),
          dataVideoId: (v.closest('[data-video-id]') || { getAttribute: () => null }).getAttribute('data-video-id'),
          instancekey: (v.closest('[data-instancekey]') || { getAttribute: () => null }).getAttribute('data-instancekey')
        };
      });
    }

    function probe() {
      const rows = listVideos();
      const info = {
        version: VERSION,
        trackedCount: tracked.size,
        pointer: { x: pointer.x, y: pointer.y },
        excludeChat: CONFIG.excludeChat,
        onChatPage: /\/(messages|messaging)(\/|$)/.test(location.pathname),
        navBottom: Math.round(navBottom()),
        navBottomRaw: Math.round(computeNavBottom()),
        videos: rows,
        reason: rows.length === 0
          ? '\u0e44\u0e21\u0e48\u0e1e\u0e1a <video> \u0e43\u0e19\u0e2b\u0e19\u0e49\u0e32\u0e40\u0e25\u0e22'
          : (rows.filter((r) => r.tracked).length + ' \u0e15\u0e31\u0e27\u0e21\u0e35\u0e1b\u0e38\u0e48\u0e21 / ' + rows.length + ' \u0e15\u0e31\u0e27\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14')
      };
      return info;
    }

    try {
      GM_registerMenuCommand('\u0e14\u0e35\u0e43\u0e08 \u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d\u0e17\u0e35\u0e48\u0e15\u0e23\u0e27\u0e08\u0e1e\u0e1a (v' + VERSION + ')', () => {
        const rows = listVideos();
        console.log('[DEV/g0d] videos = ' + rows.length);
        rows.forEach((x, i) => {
          console.log(
            (i + 1) + '. ' + (x.ok ? '\u2705' : '\u274c \u0e01\u0e23\u0e2d\u0e07\u0e2d\u0e2d\u0e01') + (x.bigEnough ? '' : ' \u274c \u0e40\u0e25\u0e47\u0e01\u0e40\u0e01\u0e34\u0e19') +
            (x.inChat ? ' \u0d9e \u0e43\u0e19\u0e41\u0e0a\u0e17' : '') +
            (x.tracked ? ' \u0d9e \u0e21\u0e35\u0e1b\u0e38\u0e48\u0e21' : '') +
            ' video=' + x.rect.w + 'x' + x.rect.h +
            ' dur=' + x.duration + ' rs=' + x.readyState +
            ' srcObject=' + x.srcObject +
            ' pagelet=' + x.pagelet + ' key=' + x.instancekey +
            '\n   currentSrc=' + (x.currentSrc || '(\u0e27\u0e48\u0e32\u0e07)') +
            '\n   src=' + (x.src || '(\u0e27\u0e48\u0e32\u0e07)') +
            '\n   fiberUrl=' + (x.fiberUrl || '(\u0e44\u0e21\u0e48\u0e1e\u0e1a)')
          );
        });
        toast('<b>\u0e1e\u0e1a\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d ' + rows.length + ' \u0e15\u0e31\u0e27</b><br>\u0e14\u0e39\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e43\u0e19 Console (F12)', false, 3200);
      });

      GM_registerMenuCommand('\u0e27\u0e34\u0e18\u0e35 probe', () => {
        const info = probe();
        console.log('[DEV/g0d] probe:', info);
        toast('<b>probe</b><br>' + info.reason, false, 3600);
      });
    } catch (e) {}

    window.__dgVd = {
      version: VERSION,
      probe: probe,
      listVideos: listVideos,
      tracked: tracked,
      scan: scan,
      inChat: inChat,
      navBottom: navBottom,
      navBottomRaw: computeNavBottom,
      safeTopFor: safeTopFor,
      fiberVideoUrl: fiberVideoUrl,
      occludedAt: occludedAt,
      playerRoot: playerRoot,
      videoOfPlayer: videoOfPlayer,
      resolveVideoId: resolveVideoId,
      resolveVideoUrl: resolveVideoUrl,
      config: CONFIG
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 2: StorySaver v5
  // ═══════════════════════════════════════════════════════════════════════
  function initFbStorySaver() {
    if (window.__dgStoryInit) return;
    window.__dgStoryInit = true;

    let pollingInterval = null;
    let lastDialogOpen = false;
    let activeVideoEl = null;
    let activeStoryStartTime = 0;

    function isViewingStory() {
      if (/\/stories\//.test(location.href)) return true;
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return false;
      const closeBtn = dialog.querySelector(
        'div[aria-label="Close"][role="button"], div[aria-label="\u0e1b\u0e34\u0e14"][role="button"]'
      );
      if (!closeBtn) return false;
      const hasBigVideo = Array.from(dialog.querySelectorAll('video'))
        .some(v => v.offsetWidth > 200 && v.offsetHeight > 200);
      const hasBigImg = Array.from(dialog.querySelectorAll('img'))
        .some(i => i.offsetWidth > 300 && i.naturalWidth > 400);
      return hasBigVideo || hasBigImg;
    }

    function findActiveVideo() {
      const dialog = document.querySelector('div[role="dialog"]');
      const scope = dialog || document;
      const videos = Array.from(scope.querySelectorAll('video'))
        .filter(v => v.offsetWidth > 100 && v.offsetHeight > 100)
        .sort((a, b) => {
          const aPlaying = !a.paused && !a.ended ? 1 : 0;
          const bPlaying = !b.paused && !b.ended ? 1 : 0;
          if (aPlaying !== bPlaying) return bPlaying - aPlaying;
          return (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight);
        });
      return videos[0] || null;
    }

    function onStoryChanged() {
      const v = findActiveVideo();
      if (!v || v === activeVideoEl) return;
      activeVideoEl = v;
      activeStoryStartTime = Date.now();
      const cutoff = activeStoryStartTime - 10000;
      __dgCaptured.videos = __dgCaptured.videos.filter(x => x.time >= cutoff);
      __dgCaptured.images = __dgCaptured.images.filter(x => x.time >= cutoff);
      console.log('[DEV/g0d] story changed \u2014 reset window at',
        new Date(activeStoryStartTime).toLocaleTimeString());
    }

    function findStoryTopBar() {
      let bar = Array.from(document.querySelectorAll('div.xtotuo0'))
        .find(b => b instanceof HTMLElement && b.offsetHeight > 0);
      if (bar) return bar;
      const closeBtn = document.querySelector(
        'div[aria-label="Close"][role="button"], div[aria-label="\u0e1b\u0e34\u0e14"][role="button"]'
      );
      if (closeBtn) {
        let p = closeBtn.parentElement;
        for (let i = 0; i < 4 && p; i++) {
          if (p.querySelectorAll('[role="button"]').length >= 2) return p;
          p = p.parentElement;
        }
      }
      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        const header = dialog.querySelector('div[role="banner"], header');
        if (header) return header;
        for (const c of dialog.children) {
          if (c.offsetHeight > 40 && c.offsetHeight < 120) return c;
        }
      }
      return null;
    }

    function injectStyles() {
      if (document.getElementById('dg-story-dl-styles')) return;
      const style = document.createElement('style');
      style.id = 'dg-story-dl-styles';
      style.textContent = `
        #dg-story-dl-btn,#dg-story-open-btn{
          border:none;background:transparent;color:white;cursor:pointer;
          z-index:9999;width:28px;height:28px;padding:0;margin:0;
          align-self:center;display:flex;align-items:center;justify-content:center;
          transition:opacity .2s ease;
        }
        #dg-story-dl-btn:hover,#dg-story-open-btn:hover{opacity:.7}
        #dg-story-dl-btn svg,#dg-story-open-btn svg{width:22px;height:22px}
      `;
      document.head.appendChild(style);
    }

    function deepScanVideo(video) {
      const found = [];
      function pickUrl(o) {
        if (!o || typeof o !== 'object') return null;
        const keys = [
          'hd_src','sd_src','hdSrc','sdSrc',
          'playable_url','playable_url_quality_hd','playable_url_quality_sd',
          'browser_native_hd_url','browser_native_sd_url',
          'video_url','url','src'
        ];
        for (const k of keys) {
          const v = o[k];
          if (typeof v === 'string' && v.startsWith('http') && v.includes('fbcdn')) return v;
        }
        return null;
      }
      function walk(obj, depth, path, visited) {
        if (depth > 8 || !obj || typeof obj !== 'object') return;
        if (visited.has(obj)) return;
        visited.add(obj);
        if (Array.isArray(obj)) {
          for (let i = 0; i < Math.min(obj.length, 10); i++) {
            const u = pickUrl(obj[i]);
            if (u) { found.push({ url: u, path: path + '[' + i + ']' }); return; }
            walk(obj[i], depth + 1, path + '[' + i + ']', visited);
          }
          return;
        }
        const u = pickUrl(obj);
        if (u) { found.push({ url: u, path }); return; }
        for (const k of Object.keys(obj)) {
          if (k.startsWith('__')) continue;
          if (k === 'return' || k === 'child' || k === 'sibling') continue;
          try {
            walk(obj[k], depth + 1, path + '.' + k, visited);
          } catch (e) {}
          if (found.length > 3) return;
        }
      }
      try {
        const fiberKey = Object.keys(video).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) return found;
        let fiber = video[fiberKey];
        for (let i = 0; i < 30 && fiber; i++) {
          const visited = new WeakSet();
          if (fiber.memoizedProps) walk(fiber.memoizedProps, 0, 'fiber[' + i + '].memoizedProps', visited);
          if (fiber.memoizedState) walk(fiber.memoizedState, 0, 'fiber[' + i + '].memoizedState', visited);
          if (fiber.stateNode && typeof fiber.stateNode === 'object') {
            walk(fiber.stateNode, 0, 'fiber[' + i + '].stateNode', visited);
          }
          if (fiber.updateQueue) walk(fiber.updateQueue, 0, 'fiber[' + i + '].updateQueue', visited);
          if (found.length > 0) break;
          fiber = fiber.return;
        }
      } catch (e) {}
      return found;
    }

    function detectMedia() {
      const debug = [];
      const v = findActiveVideo();
      if (v && v !== activeVideoEl) {
        onStoryChanged();
      }
      if (v) {
        if (v.currentSrc && v.currentSrc.startsWith('http')) {
          debug.push('video.currentSrc: ' + v.currentSrc.slice(0, 100));
          return { url: v.currentSrc, type: 'video', debug };
        }
        if (v.src && v.src.startsWith('http')) {
          debug.push('video.src: ' + v.src.slice(0, 100));
          return { url: v.src, type: 'video', debug };
        }
        const hits = deepScanVideo(v);
        if (hits.length) {
          debug.push('fiber hit: ' + hits[0].url.slice(0, 100));
          return { url: hits[0].url, type: 'video', debug };
        }
      }
      const since = activeStoryStartTime || (Date.now() - 30000);
      const captured = __dgCaptured.videos
        .filter(x => x.time >= since)
        .sort((a, b) => b.time - a.time);
      debug.push('captured videos since story start: ' + captured.length);
      if (captured.length) {
        const best = captured.reduce((a, b) => a.url.length >= b.url.length ? a : b);
        debug.push('  best: ' + best.url.slice(0, 100));
        return { url: best.url, type: 'video', debug };
      }
      const capturedImgs = __dgCaptured.images
        .filter(x => x.time >= since)
        .sort((a, b) => b.time - a.time);
      debug.push('captured images since story start: ' + capturedImgs.length);
      if (capturedImgs.length) {
        const best = capturedImgs.reduce((a, b) => a.url.length >= b.url.length ? a : b);
        debug.push('  best img: ' + best.url.slice(0, 100));
        return { url: best.url, type: 'image', debug };
      }
      const scope = document.querySelector('div[role="dialog"]') || document;
      const domImgs = Array.from(scope.querySelectorAll('img'))
        .filter(img => {
          if (!img.src || !img.src.includes('fbcdn')) return false;
          if (img.src.includes('/v/t1.30497/')) return false;
          if (img.src.includes('/v/t1.6435-')) return false;
          return img.offsetWidth > 0 && img.naturalWidth > 400;
        })
        .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
      debug.push('DOM imgs (filtered): ' + domImgs.length);
      if (domImgs.length) {
        debug.push('  best: ' + domImgs[0].src.slice(0, 100));
        return { url: domImgs[0].src, type: 'image', debug };
      }
      for (const el of scope.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundImage;
        const m = bg && bg.match(/url\(["']?(https:\/\/[^"')]+)["']?\)/);
        if (m && m[1].includes('fbcdn') && !m[1].includes('/v/t1.30497/')) {
          debug.push('bg-image: ' + m[1].slice(0, 100));
          return { url: m[1], type: 'image', debug };
        }
      }
      console.log('[DEV/g0d] detectMedia debug:\n' + debug.join('\n'));
      return null;
    }

    function buildFileName(type) {
      const timestamp = new Date().toISOString().split('T')[0];
      const userSelectors = [
        'span.xuxw1ft.xlyipyv',
        'h2 span',
        'a[role="link"] span',
        'div[role="dialog"] span'
      ];
      let userName = 'unknown';
      for (const sel of userSelectors) {
        const el = Array.from(document.querySelectorAll(sel))
          .find(e => e instanceof HTMLElement && e.offsetWidth > 0 && e.innerText.trim());
        if (el) { userName = el.innerText.trim().split('\n')[0]; break; }
      }
      userName = userName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
      return userName + '-' + timestamp + '.' + (type === 'video' ? 'mp4' : 'jpg');
    }

    function downloadMedia(url, filename) {
      if (typeof GM_download !== 'undefined') {
        GM_download({
          url, name: filename, saveAs: false,
          onerror: () => fetchDownload(url, filename)
        });
        return;
      }
      if (typeof GM_xmlhttpRequest !== 'undefined') {
        GM_xmlhttpRequest({
          method: 'GET', url, responseType: 'blob',
          onload: (r) => {
            const blobUrl = URL.createObjectURL(r.response);
            const a = document.createElement('a');
            a.href = blobUrl; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
          },
          onerror: () => window.open(url, '_blank')
        });
        return;
      }
      fetchDownload(url, filename);
    }

    async function fetchDownload(url, filename) {
      try {
        const r = await fetch(url);
        const b = await r.blob();
        const blobUrl = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = blobUrl; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch (e) {
        console.error('[DEV/g0d] Story download error:', e);
        window.open(url, '_blank');
      }
    }

    function createButtons() {
      if (document.getElementById('dg-story-dl-btn')) return true;
      const topBar = findStoryTopBar();
      if (!topBar) return false;

      const btn = document.createElement('button');
      btn.id = 'dg-story-dl-btn';
      btn.title = 'Download Story';
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const media = detectMedia();
        if (!media) {
          console.warn('[DEV/g0d] StorySaver: no media found');
          alert('DEV/g0d: \u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e2a\u0e37\u0e48\u0e2d \u2014 \u0e25\u0e2d\u0e07\u0e40\u0e25\u0e48\u0e19\u0e2a\u0e15\u0e2d\u0e23\u0e35\u0e48\u0e2a\u0e31\u0e01 1-2 \u0e27\u0e34\u0e41\u0e25\u0e49\u0e27\u0e01\u0e14\u0e43\u0e2b\u0e21\u0e48');
          return;
        }
        console.log('[DEV/g0d] StorySaver: downloading', media.type, media.url.slice(0, 100));
        downloadMedia(media.url, buildFileName(media.type));
      });

      const openBtn = document.createElement('button');
      openBtn.id = 'dg-story-open-btn';
      openBtn.title = 'Open in new tab';
      openBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';
      openBtn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const media = detectMedia();
        if (media) window.open(media.url, '_blank');
      });

      topBar.appendChild(openBtn);
      topBar.appendChild(btn);
      return true;
    }

    function startPolling() {
      if (pollingInterval) return;
      let attempts = 0;
      pollingInterval = setInterval(() => {
        const ok = createButtons();
        if (ok || ++attempts >= 30) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
      }, 400);
    }

    function stopPolling() {
      if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    }

    function checkDialogState() {
      const nowViewing = isViewingStory();
      if (nowViewing && !lastDialogOpen) {
        activeVideoEl = null;
        activeStoryStartTime = Date.now();
        console.log('[DEV/g0d] story dialog opened');
      }
      if (!nowViewing && lastDialogOpen) {
        document.getElementById('dg-story-dl-btn')?.remove();
        document.getElementById('dg-story-open-btn')?.remove();
        stopPolling();
        activeVideoEl = null;
        activeStoryStartTime = 0;
      }
      lastDialogOpen = nowViewing;
      if (nowViewing) {
        injectStyles();
        onStoryChanged();
        if (!document.getElementById('dg-story-dl-btn')) startPolling();
      }
    }

    setInterval(() => {
      if (!lastDialogOpen) return;
      const v = findActiveVideo();
      if (v && v !== activeVideoEl) {
        onStoryChanged();
        if (!document.getElementById('dg-story-dl-btn')) startPolling();
      }
    }, 250);

    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; checkDialogState(); }, 300);
    }).observe(document.body, { childList: true, subtree: true });

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        checkDialogState();
      }
    }, 500);

    checkDialogState();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 3: HoverZoom v1.7
  // ═══════════════════════════════════════════════════════════════════════
  function initFbHoverZoom() {
    if (window.__dgHzInit) return;
    window.__dgHzInit = true;

    const CONFIG = {
      maxBox: 720,
      minBox: 200,
      gap: 12,
      padding: 6,
      showDelayMs: 110,
      hideDelayMs: 90,
      requestMaxSize: true,
      hoverPadding: 0,
      minDisplayedSize: 12,
      skipDisplayedWiderThan: 300,
      maxWalkUp: 10,
      scanDebounceMs: 400,
      accent: '#1877f2'
    };

    const SIZE_RE = /([a-z]*)(\d+)x(\d+)/i;

    const style = document.createElement('style');
    style.textContent = `
      #fbz-preview {
        position: fixed;
        z-index: 2147483646;
        display: none;
        box-sizing: border-box;
        padding: ${CONFIG.padding}px;
        background: #18191a;
        border-radius: 12px;
        overflow: hidden;
        pointer-events: none;
        opacity: 0;
        transform: scale(.96);
        transition: opacity .14s ease, transform .14s ease, width .14s ease, height .14s ease;
        box-shadow: 0 18px 50px rgba(0,0,0,.72), 0 0 0 1px rgba(255,255,255,.09);
        will-change: opacity, transform;
      }
      #fbz-preview.fbz-on { opacity: 1; transform: scale(1); }
      #fbz-img {
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 7px;
        object-fit: contain;
        opacity: 0;
        transition: opacity .16s ease;
      }
      #fbz-preview.fbz-ready #fbz-img { opacity: 1; }
      #fbz-preview.fbz-loading::before {
        content: '';
        position: absolute;
        top: 50%; left: 50%;
        width: 28px; height: 28px;
        margin: -14px 0 0 -14px;
        border: 3px solid rgba(255,255,255,.18);
        border-top-color: ${CONFIG.accent};
        border-radius: 50%;
        animation: fbz-spin .75s linear infinite;
      }
      @keyframes fbz-spin { to { transform: rotate(360deg); } }
      #fbz-badge {
        position: absolute;
        right: 12px; bottom: 12px;
        padding: 3px 8px;
        border-radius: 6px;
        background: rgba(0,0,0,.62);
        color: #bcc0c4;
        font: 600 11px/1.35 -apple-system, "Segoe UI", Roboto, sans-serif;
        letter-spacing: .2px;
        opacity: 0;
        transition: opacity .16s ease;
      }
      #fbz-preview.fbz-ready #fbz-badge { opacity: 1; }
      #fbz-badge.fbz-max { background: ${CONFIG.accent}; color: #fff; }
      #fbz-preview.fbz-alt #fbz-badge { background: ${CONFIG.accent}; color: #fff; }
    `;
    (document.head || document.documentElement).appendChild(style);

    let previewEl = null;
    let previewImg = null;
    let badgeEl = null;

    function createPreview() {
      if (previewEl) return;
      previewEl = document.createElement('div');
      previewEl.id = 'fbz-preview';
      previewImg = document.createElement('img');
      previewImg.id = 'fbz-img';
      previewImg.decoding = 'async';
      badgeEl = document.createElement('div');
      badgeEl.id = 'fbz-badge';
      previewEl.appendChild(previewImg);
      previewEl.appendChild(badgeEl);
      (document.body || document.documentElement).appendChild(previewEl);
    }

    function parseUrl(raw) {
      try { return new URL(raw, location.href); } catch (e) { return null; }
    }

    function isFbCdn(u) {
      return /(^|\.)fbcdn\.net$/.test(u.hostname) && u.hostname.indexOf('static.') !== 0;
    }

    function maxDims(raw) {
      const u = parseUrl(raw);
      if (!u) return null;
      const m = (u.searchParams.get('cstp') || '').match(/(\d+)x(\d+)/);
      if (!m) return null;
      const w = parseInt(m[1], 10);
      const h = parseInt(m[2], 10);
      if (!(w > 0 && h > 0)) return null;
      return { w: w, h: h };
    }

    function dimsList(raw) {
      const cap = maxDims(raw);
      const lim = cap ? Math.min(cap.w, cap.h) : Infinity;
      const out = [];
      const seen = {};
      const push = function (w, h) {
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        const k = w + 'x' + h;
        if (seen[k]) return;
        seen[k] = 1;
        out.push({ w: w, h: h });
      };
      if (cap && CONFIG.requestMaxSize) {
        push(cap.w, cap.h);
        push(cap.w * 0.5, cap.h * 0.5);
      }
      [960, 720].forEach(function (s) {
        if (s >= lim) return;
        push(s, s);
      });
      out.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
      return out;
    }

    function retoken(value, dims, forceS) {
      const m = value.match(SIZE_RE);
      if (!m) return null;
      const prefix = forceS ? 's' : (m[1] || 's');
      return value.replace(m[0], prefix + dims.w + 'x' + dims.h);
    }

    function bumpSize(raw, dims, forceS) {
      const u = parseUrl(raw);
      if (!u || !isFbCdn(u)) return null;
      const token = dims.w + 'x' + dims.h;
      let changed = false;
      const ctp = u.searchParams.get('ctp');
      if (ctp) {
        const nv = retoken(ctp, dims, forceS);
        if (nv && nv !== ctp) {
          u.searchParams.set('ctp', nv);
          changed = true;
        }
      }
      if (!changed) {
        const stp = u.searchParams.get('stp');
        if (stp) {
          let nv = retoken(stp, dims, forceS);
          if (!nv && /dst-jpg/.test(stp)) {
            nv = stp.replace(/dst-jpg/, 'dst-jpg_s' + token);
          }
          if (nv && nv !== stp) {
            u.searchParams.set('stp', nv);
            changed = true;
          }
        }
      }
      if (/\/[a-z]\d+x\d+\//i.test(u.pathname)) {
        u.pathname = u.pathname.replace(/\/([a-z])\d+x\d+\//i, function (m, p) {
          return '/' + (forceS ? 's' : p) + token + '/';
        });
        changed = true;
      }
      return changed ? u.toString() : null;
    }

    function buildCandidates(raw) {
      const dims = dimsList(raw);
      const out = [];
      const add = function (u) { if (u && out.indexOf(u) === -1) out.push(u); };
      dims.forEach(function (d) { add(bumpSize(raw, d, false)); });
      if (dims.length) add(bumpSize(raw, dims[0], true));
      add(raw);
      return out;
    }

    function isNoise(url) {
      if (!url) return true;
      if (url.indexOf('/rsrc.php/') !== -1) return true;
      if (url.indexOf('static.xx.fbcdn.net') !== -1) return true;
      if (url.indexOf('emoji') !== -1) return true;
      if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return true;
      const path = url.split('?')[0].split('#')[0].toLowerCase();
      if (/\.svgz?$/.test(path)) return true;
      return false;
    }

    function isImageTag(el) {
      if (!el || !el.tagName) return false;
      const t = el.tagName.toLowerCase();
      return t === 'img' || t === 'image';
    }

    function ownImage(node) {
      if (!node) return null;
      if (isImageTag(node)) return node;
      if (!node.querySelector) return null;
      return node.querySelector('img, image');
    }

    function svgHref(el) {
      const a = el.getAttribute('xlink:href') || el.getAttribute('href');
      if (a) return a;
      if (el.href && el.href.baseVal) return el.href.baseVal;
      return null;
    }

    function urlOf(el) {
      if (!el) return null;
      const t = el.tagName ? el.tagName.toLowerCase() : '';
      if (t === 'img') return el.currentSrc || el.src;
      if (t === 'image') return svgHref(el);
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg ? bg.match(/url\(["']?(.*?)["']?\)/) : null;
      return (m && m[1]) ? m[1] : null;
    }

    function hasBgImage(el) {
      if (!el || !el.tagName || isImageTag(el)) return false;
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === 'none' || bg.indexOf('url(') === -1) return false;
      const r = el.getBoundingClientRect();
      if (r.width < CONFIG.minDisplayedSize || r.height < CONFIG.minDisplayedSize) return false;
      if (r.width > CONFIG.skipDisplayedWiderThan) return false;
      return true;
    }

    const targetCache = new WeakMap();

    function findTargetFromEvent(target) {
      if (!(target instanceof Element)) return null;
      const btn = target.closest('[role="button"], button');
      if (btn && !ownImage(btn)) return null;
      if (isImageTag(target)) return target;
      const cached = targetCache.get(target);
      if (cached && cached.isConnected) return cached;
      let node = target;
      let found = null;
      for (let i = 0; i < CONFIG.maxWalkUp && node; i++) {
        found = ownImage(node);
        if (found) break;
        if (hasBgImage(node)) { found = node; break; }
        node = node.parentElement;
      }
      if (found && found.isConnected) targetCache.set(target, found);
      return found;
    }

    function pointOnTarget(el, x, y) {
      if (!el || !el.isConnected) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      const p = CONFIG.hoverPadding;
      return x >= r.left - p && x <= r.right + p &&
             y >= r.top - p && y <= r.bottom + p;
    }

    function fitBox(ratio, naturalW) {
      const max = CONFIG.maxBox - CONFIG.padding * 2;
      if (!isFinite(ratio) || ratio <= 0) ratio = 1;
      let w = max;
      let h = max / ratio;
      if (h > max) { h = max; w = max * ratio; }
      if (naturalW && w > naturalW) {
        w = Math.max(naturalW, CONFIG.minBox);
        h = w / ratio;
        if (h < CONFIG.minBox) { h = CONFIG.minBox; w = h * ratio; }
        if (w > max) { w = max; h = w / ratio; }
      }
      return { w: Math.round(w), h: Math.round(h) };
    }

    function applyBox(box) {
      previewEl.style.width = (box.w + CONFIG.padding * 2) + 'px';
      previewEl.style.height = (box.h + CONFIG.padding * 2) + 'px';
    }

    function positionPreview(rect) {
      const bw = previewEl.offsetWidth;
      const bh = previewEl.offsetHeight;
      const gap = CONFIG.gap;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = rect.right + gap;
      if (left + bw > vw - 8) left = rect.left - bw - gap;
      if (left < 8) left = 8;
      if (left + bw > vw - 8) left = Math.max(8, vw - bw - 8);
      let top = rect.top + rect.height / 2 - bh / 2;
      if (top + bh > vh - 8) top = vh - bh - 8;
      if (top < 8) top = 8;
      previewEl.style.left = Math.round(left) + 'px';
      previewEl.style.top = Math.round(top) + 'px';
    }

    let hoverToken = 0;
    let lastImg = null;
    let pendingImg = null;
    let showTimer = null;
    let hideTimer = null;
    let altHeld = false;
    let fullUrl = null;
    let dimsText = '';
    let isMax = false;

    function clearShow() {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    }

    function clearHide() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }

    function isVisible() {
      return !!previewEl && previewEl.classList.contains('fbz-on');
    }

    function hide() {
      if (!previewEl) return;
      hoverToken++;
      fullUrl = null;
      previewEl.classList.remove('fbz-on');
      const el = previewEl;
      setTimeout(function () {
        if (el.classList.contains('fbz-on')) return;
        el.style.display = 'none';
        el.classList.remove('fbz-loading', 'fbz-ready');
        previewImg.removeAttribute('src');
      }, 170);
    }

    function updateBadge() {
      if (!badgeEl) return;
      if (altHeld && fullUrl) {
        badgeEl.textContent = '\u2197 \u0e40\u0e1b\u0e34\u0e14\u0e20\u0e32\u0e1e\u0e40\u0e15\u0e47\u0e21';
      } else {
        badgeEl.textContent = dimsText;
      }
    }

    function setAlt(on) {
      if (altHeld === on) return;
      altHeld = on;
      if (!previewEl) return;
      previewEl.classList.toggle('fbz-alt', on);
      updateBadge();
    }

    function resolveFullUrl(e) {
      if (fullUrl) return fullUrl;
      const img = findTargetFromEvent(e.target);
      if (!img || !pointOnTarget(img, e.clientX, e.clientY)) return null;
      const src = urlOf(img);
      if (isNoise(src)) return null;
      const list = buildCandidates(src);
      return list.length > 1 ? list[0] : src;
    }

    function scheduleHide() {
      if (hideTimer) return;
      hideTimer = setTimeout(function () {
        hideTimer = null;
        lastImg = null;
        pendingImg = null;
        hide();
      }, CONFIG.hideDelayMs);
    }

    function dismiss() {
      clearShow();
      clearHide();
      pendingImg = null;
      lastImg = null;
      hide();
    }

    function onLoaded(cap, img) {
      previewEl.classList.remove('fbz-loading');
      previewEl.classList.add('fbz-ready');
      const nw = previewImg.naturalWidth;
      const nh = previewImg.naturalHeight;
      dimsText = nw + ' \u00d7 ' + nh;
      isMax = !!(cap && nw >= cap.w && nh >= cap.h);
      fullUrl = previewImg.currentSrc || previewImg.src;
      if (isMax) badgeEl.classList.add('fbz-max');
      else badgeEl.classList.remove('fbz-max');
      updateBadge();
      if (nw && nh) {
        applyBox(fitBox(nw / nh, nw));
        positionPreview(img.getBoundingClientRect());
      }
    }

    function loadChain(candidates, token, cap, img) {
      let i = 0;
      function next() {
        if (token !== hoverToken) return;
        if (i >= candidates.length) {
          previewEl.classList.remove('fbz-loading');
          lastImg = null;
          pendingImg = null;
          hide();
          return;
        }
        previewImg.onerror = next;
        previewImg.onload = function () {
          if (token !== hoverToken) return;
          onLoaded(cap, img);
        };
        previewImg.src = candidates[i++];
      }
      next();
    }

    function showFor(img) {
      const src = urlOf(img);
      if (isNoise(src)) return;
      const rect = img.getBoundingClientRect();
      if (rect.width < CONFIG.minDisplayedSize || rect.height < CONFIG.minDisplayedSize) return;
      const candidates = buildCandidates(src);
      if (candidates.length === 1 && rect.width > CONFIG.skipDisplayedWiderThan) return;
      createPreview();
      hoverToken++;
      const token = hoverToken;
      const cap = maxDims(src);
      previewEl.style.display = 'block';
      previewEl.classList.remove('fbz-on', 'fbz-ready');
      previewEl.classList.add('fbz-loading');
      const ratio = (img.naturalWidth && img.naturalHeight)
        ? img.naturalWidth / img.naturalHeight
        : rect.width / rect.height;
      applyBox(fitBox(ratio, cap ? cap.w : null));
      positionPreview(rect);
      void previewEl.offsetWidth;
      previewEl.classList.add('fbz-on');
      loadChain(candidates, token, cap, img);
    }

    function requestShow(img) {
      clearHide();
      if (isVisible()) { showFor(img); return; }
      clearShow();
      pendingImg = img;
      showTimer = setTimeout(function () {
        showTimer = null;
        if (pendingImg) showFor(pendingImg);
      }, CONFIG.showDelayMs);
    }

    let rafPending = false;
    let lastEvent = null;

    function evaluate() {
      const e = lastEvent;
      if (!e) return;
      if (altHeld && isVisible()) return;
      const img = findTargetFromEvent(e.target);
      if (img && pointOnTarget(img, e.clientX, e.clientY)) {
        clearHide();
        if (img !== lastImg) {
          lastImg = img;
          requestShow(img);
        }
        return;
      }
      if (!lastImg) { clearShow(); return; }
      if (lastImg.isConnected && pointOnTarget(lastImg, e.clientX, e.clientY)) return;
      clearShow();
      scheduleHide();
    }

    document.addEventListener('mousemove', function (e) {
      lastEvent = e;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        evaluate();
      });
    }, true);

    document.addEventListener('mouseleave', dismiss, true);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', function () {
      setAlt(false);
      dismiss();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Alt') setAlt(true);
      if (e.key === 'Escape') dismiss();
    }, true);

    document.addEventListener('keyup', function (e) {
      if (e.key === 'Alt') setAlt(false);
    }, true);

    const ALT_BLOCK = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'auxclick', 'dragstart'];

    function altBlock(e) {
      if (!e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    ALT_BLOCK.forEach(function (t) {
      document.addEventListener(t, altBlock, true);
    });

    document.addEventListener('click', function (e) {
      if (!e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const url = resolveFullUrl(e);
      if (url) window.open(url, '_blank', 'noopener');
    }, true);

    const seen = new WeakSet();

    function scan() {
      const nodes = document.querySelectorAll('img, image');
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (seen.has(node)) continue;
        seen.add(node);
        const url = urlOf(node);
        if (!url || url.indexOf('fbcdn.net') === -1) continue;
        if (isNoise(url)) continue;
        node.dataset.fbzReady = '1';
      }
    }

    let scanTimer = null;
    const observer = new MutationObserver(function () {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scan, CONFIG.scanDebounceMs);
    });

    function start() {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      scan();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
    window.addEventListener('load', scan);

    window.__dgHz = {
      scan: scan,
      candidatesFor: buildCandidates,
      stats: function () {
        return { found: document.querySelectorAll('[data-fbz-ready="1"]').length };
      },
      currentSrc: function () { return urlOf(lastImg); },
      currentFull: function () { return fullUrl; },
      altHeld: function () { return altHeld; },
      probe: function (x, y) {
        if (x === undefined) {
          if (!lastEvent) return { reason: '\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e01\u0e32\u0e23\u0e02\u0e22\u0e31\u0e1a\u0e40\u0e21\u0e32\u0e2a\u0e4c' };
          x = lastEvent.clientX;
          y = lastEvent.clientY;
        }
        const el = document.elementFromPoint(x, y);
        if (!el) return { reason: '\u0e44\u0e21\u0e48\u0e21\u0e35 element \u0e17\u0e35\u0e48\u0e1e\u0e34\u0e01\u0e31\u0e14\u0e19\u0e35\u0e49' };
        const info = {
          at: { x: x, y: y },
          element: el.tagName + (el.className ? '.' + String(el.className).slice(0, 60) : ''),
          insideSvg: !!el.closest('svg'),
          insideButton: !!el.closest('[role="button"], button')
        };
        const t = findTargetFromEvent(el);
        if (!t) {
          info.reason = '\u0e40\u0e14\u0e34\u0e19\u0e02\u0e36\u0e49\u0e19\u0e44\u0e1b ' + CONFIG.maxWalkUp + ' \u0e0a\u0e31\u0e49\u0e19\u0e41\u0e25\u0e49\u0e27\u0e44\u0e21\u0e48\u0e40\u0e08\u0e2d <img> \u0e2b\u0e23\u0e37\u0e2d background-image';
          return info;
        }
        const r = t.getBoundingClientRect();
        const url = urlOf(t);
        info.target = t.tagName;
        info.rect = { w: Math.round(r.width), h: Math.round(r.height) };
        info.url = url;
        if (!url) { info.reason = '\u0e44\u0e14\u0e49 element \u0e21\u0e32\u0e41\u0e15\u0e48\u0e14\u0e36\u0e07 URL \u0e44\u0e21\u0e48\u0e44\u0e14\u0e49'; return info; }
        if (isNoise(url)) { info.reason = 'URL \u0e16\u0e39\u0e01\u0e01\u0e23\u0e2d\u0e07\u0e40\u0e1b\u0e47\u0e19 noise (svg/rsrc/static/emoji)'; return info; }
        if (!pointOnTarget(t, x, y)) {
          info.reason = '\u0e40\u0e08\u0e2d target \u0e41\u0e25\u0e49\u0e27 \u0e41\u0e15\u0e48\u0e1e\u0e34\u0e01\u0e31\u0e14\u0e40\u0e21\u0e32\u0e2a\u0e4c\u0e44\u0e21\u0e48\u0e44\u0e14\u0e49\u0e2d\u0e22\u0e39\u0e48\u0e43\u0e19\u0e01\u0e23\u0e2d\u0e1a (\u0e01\u0e23\u0e2d\u0e1a ' +
                        Math.round(r.width) + 'x' + Math.round(r.height) + ')';
          return info;
        }
        if (r.width < CONFIG.minDisplayedSize || r.height < CONFIG.minDisplayedSize) {
          info.reason = '\u0e02\u0e19\u0e32\u0e14\u0e17\u0e35\u0e48\u0e41\u0e2a\u0e14\u0e07 ' + Math.round(r.width) + 'x' + Math.round(r.height) +
                        ' \u0e40\u0e25\u0e47\u0e01\u0e01\u0e27\u0e48\u0e32 minDisplayedSize=' + CONFIG.minDisplayedSize;
          return info;
        }
        info.candidates = buildCandidates(url);
        info.reason = '\u0e1c\u0e48\u0e32\u0e19\u0e17\u0e38\u0e01\u0e40\u0e07\u0e37\u0e48\u0e2d\u0e19\u0e44\u0e02 \u0e04\u0e27\u0e23\u0e1e\u0e23\u0e35\u0e27\u0e34\u0e27\u0e44\u0e14\u0e49';
        return info;
      },
      config: CONFIG
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 4: ProfileViewer (Unlock Full HD profile picture)
  // ═══════════════════════════════════════════════════════════════════════
  function getHDUrl(targetSVG) {
    if (!targetSVG) return null;
    const img = targetSVG.querySelector('image');
    if (!img) return null;
    const href = img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || img.getAttribute('href') || '';
    if (!href.includes('cstp=mx')) return null;
    const mxMatch = href.match(/cstp=mx(\d+x\d+)/);
    if (!mxMatch) return null;
    return href.replace(/ctp=s\d+x\d+/, 'ctp=s' + mxMatch[1]).replace(/&amp;/g, '&');
  }

  function actionFindAndOpenHD() {
    const dialogs = document.querySelectorAll('div[role="dialog"], div[role="main"] ~ div');
    for (const dialog of dialogs) {
      const svgs = dialog.querySelectorAll('svg');
      for (const svg of svgs) {
        const hdUrl = getHDUrl(svg);
        if (hdUrl) {
          window.open(hdUrl, '_blank');
          return true;
        }
      }
    }
    const allSVGs = document.querySelectorAll('svg');
    for (const svg of allSVGs) {
      const width = svg.viewBox?.baseVal?.width || svg.clientWidth || parseInt(svg.style.width) || 0;
      const height = svg.viewBox?.baseVal?.height || svg.clientHeight || parseInt(svg.style.height) || 0;
      if (width >= 100 && height >= 100) {
        if (svg.closest('div[role="navigation"]')) continue;
        let label = '';
        let el = svg;
        for (let i = 0; i < 5; i++) {
          if (!el) break;
          label = el.getAttribute('aria-label') || '';
          if (label) break;
          el = el.parentElement;
        }
        if (label.trim() === 'Your profile') {
          alert('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e39\u0e1b\u0e42\u0e1b\u0e23\u0e44\u0e1f\u0e25\u0e4c \u0e25\u0e2d\u0e07\u0e23\u0e35\u0e40\u0e1f\u0e23\u0e0a\u0e41\u0e25\u0e49\u0e27\u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07');
          return false;
        }
        const hdUrl = getHDUrl(svg);
        if (hdUrl) {
          window.open(hdUrl, '_blank');
          return true;
        }
      }
    }
    alert('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e39\u0e1b\u0e42\u0e1b\u0e23\u0e44\u0e1f\u0e25\u0e4c \u0e25\u0e2d\u0e07\u0e23\u0e35\u0e40\u0e1f\u0e23\u0e0a\u0e41\u0e25\u0e49\u0e27\u0e25\u0e2d\u0e07\u0e2d\u0e35\u0e01\u0e04\u0e23\u0e31\u0e49\u0e07');
    return false;
  }

  try { GM_registerMenuCommand("\ud83d\udd0d Profile Viewer", actionFindAndOpenHD); } catch(e) {}

  // ═══════════════════════════════════════════════════════════════════════
  //  Register Plugins
  // ═══════════════════════════════════════════════════════════════════════
  const icon = (d) => '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px">' + d + '</svg>';

  window.DEVg0d_PLUGINS = [
    {
      name: icon('<path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>') + 'VideoDownloader',
      type: 'toggle',
      key: 'devg0d-fb-video',
      init: initFbVideoDownloader,
    },
    {
      name: icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>') + 'StorySaver',
      type: 'toggle',
      key: 'devg0d-fb-story',
      init: initFbStorySaver,
    },
    {
      name: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>') + 'HoverZoom',
      type: 'toggle',
      key: 'devg0d-fb-hoverzoom',
      init: initFbHoverZoom,
    },
    {
      name: icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') + 'ProfileViewer',
      type: 'click',
      key: 'devg0d-fb-profile',
      fn: actionFindAndOpenHD,
    },
  ];

  window.__dgPluginsReady = true;
  window.dispatchEvent(new Event('dg-plugins-ready'));

})();
