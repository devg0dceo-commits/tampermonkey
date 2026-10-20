(function () {
  'use strict';
  if (window.self !== window.top) return;

  const KEY_NOSUB = 'devg0d-kick-nosub';
  const isEnabled = () => localStorage.getItem(KEY_NOSUB) !== 'false';

  function note(...args) {
    try { console.log('[DEV/g0d Kick]', ...args); } catch (e) {}
  }

  const dbg = () => {};

  const KEY_1080P = 'devg0d-kick-1080p';

  function initForce1080p() {
    const pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    if (pageWindow.__kickFixPatched) return;

    const NativeWorker = pageWindow.Worker;
    if (typeof NativeWorker !== 'function') return;
    pageWindow.__kickFixPatched = true;

    const IVS_WORKER_RE = /amazon-ivs-wasmworker/i;

    function makeWorkerBlob(originalWorkerUrl) {
      const code = `
        (() => {
          'use strict';

          const ORIGINAL_WORKER_URL = ${JSON.stringify(originalWorkerUrl)};
          const ORIGIN = new URL(ORIGINAL_WORKER_URL).origin;
          const nativeFetch = self.fetch.bind(self);
          const cache = new Map();

          function abs(input) {
            if (typeof input === 'string') return new URL(input, ORIGIN).href;
            if (input instanceof Request) {
              const url = new URL(input.url, ORIGIN).href;
              return url === input.url ? input : new Request(url, input);
            }
            return input;
          }
          function urlOf(input) {
            if (typeof input === 'string') return new URL(input, ORIGIN).href;
            if (input instanceof Request) return new URL(input.url, ORIGIN).href;
            if (input && typeof input.url === 'string') return new URL(input.url, ORIGIN).href;
            return '';
          }
          function attrs(line) {
            const out = {};
            const s = line.slice(line.indexOf(':') + 1);
            const re = /([A-Z0-9-]+)=("(?:[^"\\\\]|\\\\.)*"|[^,]*)/g;
            let m;
            while ((m = re.exec(s))) out[m[1]] = m[2].replace(/^"|"$/g, '');
            return out;
          }
          function heightOf(a) {
            const m = String(a.RESOLUTION || '').match(/^\\d+x(\\d+)$/);
            return m ? Number(m[1]) : 0;
          }
          function rewrite(text) {
            if (!text.includes('#EXTM3U') || !text.includes('#EXT-X-STREAM-INF')) return text;
            const lines = text.replace(/\\r\\n?/g, '\\n').split('\\n');
            const head = [], media = [], streams = [];
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line.startsWith('#EXT-X-MEDIA:')) { media.push({ line, attrs: attrs(line) }); continue; }
              if (line.startsWith('#EXT-X-STREAM-INF:')) { streams.push({ info: line, uri: lines[++i] || '', attrs: attrs(line) }); continue; }
              if (line) head.push(line);
            }
            if (!streams.length) return text;

            let target = streams.find(s => {
              const group = s.attrs.VIDEO || '';
              const rel = media.find(m => m.attrs.TYPE === 'VIDEO' && m.attrs['GROUP-ID'] === group);
              const name = String(rel?.attrs.NAME || group).toLowerCase();
              return heightOf(s.attrs) === 1080 || /(^|\\D)1080(\\D|$)|fhd|full\\s*hd/.test(name);
            });
            if (!target) target = streams.reduce((b, s) => heightOf(s.attrs) > heightOf(b?.attrs || {}) ? s : b, null);
            if (!target) return text;

            const groups = new Set(['VIDEO','AUDIO','SUBTITLES','CLOSED-CAPTIONS'].map(k => target.attrs[k]).filter(Boolean));
            const kept = media.filter(m => !m.attrs['GROUP-ID'] || groups.has(m.attrs['GROUP-ID']));
            return [...head, ...kept.map(m => m.line), target.info, target.uri, ''].join('\\n');
          }

          self.fetch = async function(input, init) {
            const url = urlOf(input);
            const response = await nativeFetch(abs(input), init);
            if (!/\\.m3u8(?:[?#]|$)/i.test(url)) return response;
            const text = await response.text();
            if (!text.includes('#EXT-X-STREAM-INF')) {
              return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
            }
            let rewritten = cache.get(url);
            if (rewritten === undefined) { rewritten = rewrite(text); cache.set(url, rewritten); }
            if (rewritten === text) {
              return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
            }
            const headers = new Headers(response.headers);
            headers.delete('content-length');
            headers.set('content-type', 'application/vnd.apple.mpegurl');
            return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
          };

          importScripts(ORIGINAL_WORKER_URL);
        })();
      `;
      return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    }

    pageWindow.Worker = class extends NativeWorker {
      constructor(url, options) {
        const absoluteUrl = new URL(String(url), location.href).href;
        if (IVS_WORKER_RE.test(absoluteUrl)) super(makeWorkerBlob(absoluteUrl), options);
        else super(url, options);
      }
    };
  }

  if (localStorage.getItem(KEY_1080P) !== 'false') {
    try { initForce1080p(); } catch (e) {}
  }

  function gmRequest(details) {
    return new Promise((resolve, reject) => {
      const fn = (typeof GM_xmlhttpRequest === 'function' && GM_xmlhttpRequest)
        || (typeof GM !== 'undefined' && GM && GM.xmlHttpRequest);
      if (!fn) return reject(new Error('GM_xmlhttpRequest unavailable'));

      fn(Object.assign({ timeout: 8000 }, details, {
        onload: resolve,
        onerror: () => reject(new Error('network error')),
        ontimeout: () => reject(new Error('timeout'))
      }));
    });
  }

  async function gmJson(url, timeout = 8000) {
    try {
      const res = await gmRequest({
        method: 'GET',
        url,
        timeout,
        headers: { Accept: 'application/json, text/plain, */*' }
      });
      if (res.status < 200 || res.status >= 300) return null;
      return JSON.parse(res.responseText);
    } catch (e) {
      return undefined;
    }
  }

  async function fetchJson(url, { timeout = 8000 } = {}) {
    const viaGm = await gmJson(url, timeout);
    if (viaGm !== undefined) return viaGm;

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json, text/plain, */*' },
        credentials: 'include'
      });
      if (res.ok) return await res.json();
    } catch (e) { /* give up */ }

    return null;
  }

  async function checkStreamUrl(url) {
    try {
      const res = await gmRequest({ method: 'GET', url, timeout: 6000 });
      if (res.status < 200 || res.status >= 300) return null;

      const body = res.responseText || '';
      if (!body.startsWith('#EXTM3U')) return null;
      if (!/#EXT-X-(STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE|EXTINF)/.test(body)) return null;

      return url;
    } catch (e) {
      return null;
    }
  }

  async function mintPlaybackUrl(videoId, channelSlug, anonymous = false) {
    try {
      const res = await gmRequest({
        method: 'POST',
        url: `https://web.kick.com/api/v1/stream/${videoId}/playback`,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        anonymous,
        data: JSON.stringify({
          video_player: {
            player: {
              player_name: 'web',
              player_version: '1.0.0',
              player_software: 'IVS Player',
              player_software_version: '1.28.0'
            },
            mux_sdk: { sdk_available: false },
            pal_sdk: { sdk_available: false, nonce: '' },
            datazoom_sdk: { sdk_available: false, datazoom_sdk_version: '', om_sdk_version: '' },
            google_ads_sdk: { sdk_available: false }
          },
          video_session: {
            page_type: 'vod',
            player_remote_played: false,
            enable_sampling: false,
            url_path: `/${channelSlug || 'channel'}/videos/${videoId}`,
            autoplay_behaviour: 'auto',
            play_muted: false,
            viewer_connection_type: ''
          },
          user_session: {
            session_id: '',
            player_device_id: 'unknown',
            browser_lang: navigator.language || 'en-US',
            non_personalised_ads: false,
            ad_targeting: ''
          }
        })
      });
      if (res.status < 200 || res.status >= 300) {
        dbg('mint rejected', res.status, (res.responseText || '').slice(0, 160));
        return { url: null, status: res.status, retryable: true };
      }
      const data = JSON.parse(res.responseText);
      const url = data?.playback_url?.vod || data?.playback_url?.live || null;
      dbg('mint result', { status: res.status, hasVod: Boolean(data?.playback_url?.vod), url });
      return { url, status: res.status, retryable: false };
    } catch (e) {
      dbg('mint failed', e.message);
      return { url: null, status: 0, retryable: true };
    }
  }

  let activeHls = null;
  let isUnlocking = false;
  let activePlayerUi = null;
  let activeChatController = null;
  let globalPlayerListenersBound = false;
  let lastUnlockContainer = null;

  const ICONS = {
    play: `<svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:white;"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:white;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    maximize: `<svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:white;"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`,
    bigPlay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:1;width:40px;height:40px;"><path fill="none" d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>`,
    backward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:1;"><path d="M12 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 12 18z"/><path d="M22 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 22 18z"/></svg>`,
    forward: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:1;"><path d="M12 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 12 18z"/><path d="M2 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 2 18z"/></svg>`,
    volumeHigh: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:1;"><path fill="none" d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298zM16 9a5 5 0 0 1 0 6m3.364 3.364a9 9 0 0 0 0-12.728"/></svg>`,
    volumeMedium: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:1;"><path fill="none" d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298zM16 9a5 5 0 0 1 0 6"/></svg>`,
    volumeLow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:1;"><path fill="none" d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/></svg>`,
    volumeMute: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:1;"><path fill="none" d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298zM22 9l-6 6m0-6l6 6"/></svg>`
  };

  const PLAYER_CSS = `
    #k-player { background:#000; border-radius:14px; overflow:hidden; }
    #k-video { width:100%; height:100%; object-fit:contain; background:#000; }
    #k-track { height:6px; border-radius:999px; background:rgba(255,255,255,0.25); }
    #k-progress { height:100%; border-radius:999px; background:linear-gradient(90deg,#53fc18,#9dff57); }
    #k-track-tooltip {
      position:absolute; bottom:calc(100% + 10px); left:0;
      transform:translateX(-50%) scale(0.96);
      padding:4px 8px; border-radius:8px;
      border:1px solid rgba(255,255,255,0.18); background:rgba(7,7,7,0.72);
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      box-shadow:0 8px 28px rgba(0,0,0,0.45);
      color:#fff; font-size:12px; line-height:1.2; white-space:nowrap;
      pointer-events:none; opacity:0;
      transition:opacity .12s ease, transform .12s ease; z-index:35;
    }
    #k-track-tooltip-time { font-variant-numeric:tabular-nums; }
    #k-track-tooltip.visible { opacity:1; transform:translateX(-50%) scale(1); }
    #k-track:hover { height:8px; }
    #k-controls { z-index:20; }
    #k-controls button { transition:transform .15s ease, opacity .15s ease; }
    #k-controls button:hover { transform:scale(1.15); opacity:1; }
    #k-big-play {
      opacity:0; pointer-events:none;
      transform:translate(-50%,-50%) scale(0.92);
      transition:opacity .15s ease, transform .15s ease;
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      box-shadow:0 8px 28px rgba(0,0,0,0.45); z-index:16;
    }
    #k-big-play.visible { opacity:1; pointer-events:auto; transform:translate(-50%,-50%) scale(1); }
    #k-loading {
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      background:radial-gradient(circle, rgba(0,0,0,0.18), rgba(0,0,0,0.5));
      opacity:0; pointer-events:none; transition:opacity .18s ease; z-index:14;
    }
    #k-loading.visible { opacity:1; }
    .k-loading-spinner {
      width:54px; height:54px; border-radius:999px;
      border:4px solid rgba(255,255,255,0.18); border-top-color:#53fc18;
      box-shadow:0 8px 28px rgba(0,0,0,0.35);
      animation:kick-unlocker-spin .8s linear infinite;
    }
    @keyframes kick-unlocker-spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
    #k-seek-indicator {
      position:absolute; top:50%; left:50%; width:76px; height:76px;
      display:flex; align-items:center; justify-content:center;
      border-radius:999px; border:1px solid rgba(255,255,255,0.18);
      background:rgba(7,7,7,0.72);
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      box-shadow:0 8px 28px rgba(0,0,0,0.45);
      opacity:0; pointer-events:none;
      transform:translate(-50%,-50%) scale(0.92);
      transition:opacity .15s ease, transform .15s ease; z-index:15;
    }
    #k-seek-indicator svg { width:40px; height:40px; }
    #k-seek-indicator[data-direction="backward"] { left:34%; }
    #k-seek-indicator[data-direction="forward"] { left:66%; }
    #k-seek-indicator.visible { opacity:1; transform:translate(-50%,-50%) scale(1); }
    #k-quality-wrap { position:relative; }
    #k-quality-btn, #k-speed-btn {
      background:rgba(10,10,10,0.58); border:1px solid rgba(255,255,255,0.2);
      color:#fff; border-radius:8px; padding:4px 8px; font-size:12px; cursor:pointer;
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
    }
    #k-quality-menu, #k-speed-menu {
      position:absolute; right:0; bottom:calc(100% + 8px);
      max-height:190px; overflow-y:auto; display:none; flex-direction:column;
      padding:6px 0; border-radius:10px;
      border:1px solid rgba(255,255,255,0.18); background:rgba(7,7,7,0.72);
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      box-shadow:0 8px 28px rgba(0,0,0,0.45); z-index:30;
    }
    #k-quality-menu { min-width:92px; }
    #k-speed-menu { min-width:84px; }
    #k-quality-wrap.open #k-quality-menu, #k-speed-wrap.open #k-speed-menu { display:flex; }
    #k-quality-menu .k-quality-option, #k-speed-menu .k-speed-option {
      width:100%; background:transparent; border:0; color:#fff; border-radius:0;
      padding:7px 12px; font-size:12px; cursor:pointer; text-align:left;
      transition:none; opacity:1;
    }
    #k-quality-menu .k-quality-option:hover, #k-speed-menu .k-speed-option:hover {
      transform:none; opacity:1; background:rgba(255,255,255,0.08);
    }
    #k-quality-menu .k-quality-option.active, #k-speed-menu .k-speed-option.active {
      background:rgba(83,252,24,0.08); color:#53fc18;
    }
    #k-time { min-width:90px; text-align:center; }
    #k-volume-wrap { display:inline-flex; align-items:center; gap:5px; }
    #k-volume-btn {
      display:inline-flex; align-items:center; justify-content:center;
      width:22px; height:22px; padding:0; background:none; border:0;
      color:#fff; cursor:pointer; opacity:0.9;
    }
    #k-volume-btn svg { width:18px; height:18px; }
    #k-volume {
      --k-volume-percent:100%; width:96px; height:8px; padding:0; border:0;
      border-radius:999px;
      background:linear-gradient(90deg,#53fc18 0%,#53fc18 var(--k-volume-percent),rgba(7,7,7,0.72) var(--k-volume-percent),rgba(7,7,7,0.72) 100%);
      backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      appearance:none; -webkit-appearance:none; cursor:pointer; overflow:hidden;
    }
    #k-volume::-webkit-slider-runnable-track { height:8px; border-radius:999px; background:transparent; }
    #k-volume::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:0; height:0; margin-top:4px; border:0; background:transparent; }
    #k-volume::-moz-range-track { height:8px; border-radius:999px; background:rgba(7,7,7,0.72); }
    #k-volume::-moz-range-progress { height:8px; border-radius:999px; background:#53fc18; }
    #k-volume::-moz-range-thumb { width:0; height:0; border:0; background:transparent; }
    #k-volume-value { min-width:34px; color:#ddd; font-size:12px; font-variant-numeric:tabular-nums; text-align:right; }
    .k-retry-btn {
      margin-top:12px; padding:8px 18px; background:#53fc18; color:#000;
      font-weight:bold; font-size:14px; border:none; border-radius:8px; cursor:pointer;
      transition:transform .15s ease, background-color .15s ease;
    }
    .k-retry-btn:hover { background:#6cff3b; transform:scale(1.04); }
  `;

  let playerStyleEl = null;
  function ensurePlayerStyles() {
    if (playerStyleEl && playerStyleEl.isConnected) return;
    playerStyleEl = document.createElement('style');
    playerStyleEl.id = 'k-unlocker-styles';
    playerStyleEl.textContent = PLAYER_CSS;
    document.head.appendChild(playerStyleEl);
  }

  const getResumeKey = (c, v) => `kick_unlocker_resume:${c}:${v}`;
  const getPlayerSettingsKey = (c, v) => `kick_unlocker_settings:${c}:${v}`;

  function loadPlayerSettings(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function savePlayerSettings(key, partial) {
    try {
      localStorage.setItem(key, JSON.stringify({ ...loadPlayerSettings(key), ...partial }));
    } catch (e) { /* quota */ }
  }

  function parseUtcDate(value) {
    if (!value) return null;
    let text = String(value).trim().replace(' ', 'T');
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += 'Z';
    const date = new Date(text);
    return isNaN(date.getTime()) ? null : date;
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  }

  function getVolumeIcon(volume) {
    if (volume <= 0) return ICONS.volumeMute;
    if (volume < 0.2) return ICONS.volumeLow;
    if (volume < 0.5) return ICONS.volumeMedium;
    return ICONS.volumeHigh;
  }

  function thumbnailHasIvsPath(video) {
    const thumb = video?.thumbnail;
    const src = typeof thumb === 'string' ? thumb : (thumb?.src || thumb?.url || '');
    if (!src) return false;
    const parts = src.split('/');
    if (parts.includes('ivs')) return true;
    const cid = parts[4];
    const vid = parts[5];
    return Boolean(cid && vid && parts[3] !== 'api'
      && /^[0-9A-Za-z_-]{8,}$/.test(cid) && /^[0-9A-Za-z_-]{8,}$/.test(vid));
  }

  function bindGlobalPlayerListeners() {
    if (globalPlayerListenersBound) return;

    document.addEventListener('click', (event) => {
      const qualWrap = activePlayerUi?.qualWrap;
      if (qualWrap && qualWrap.isConnected && !qualWrap.contains(event.target)) {
        qualWrap.classList.remove('open');
      }
      const speedWrap = activePlayerUi?.speedWrap;
      if (speedWrap && speedWrap.isConnected && !speedWrap.contains(event.target)) {
        speedWrap.classList.remove('open');
      }
    });

    document.addEventListener('keydown', (event) => {
      const playerUi = activePlayerUi;
      const videoElement = playerUi?.vid;
      if (!videoElement || !videoElement.isConnected || !isFinite(videoElement.duration)) return;

      const target = event.target;
      const tagName = target?.tagName;
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tagName)) return;

      const key = event.key;

      if (key === ' ' || key === 'k' || key === 'K') {
        event.preventDefault();
        playerUi.togglePlay?.();
      } else if (key === 'f' || key === 'F') {
        event.preventDefault();
        playerUi.toggleFullscreen?.();
      } else if (key === 'm' || key === 'M') {
        event.preventDefault();
        playerUi.toggleMute?.();
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        videoElement.currentTime = Math.min(videoElement.currentTime + 5, videoElement.duration);
        playerUi.showSeekIndicator('forward');
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        videoElement.currentTime = Math.max(videoElement.currentTime - 5, 0);
        playerUi.showSeekIndicator('backward');
      } else if (key === 'l' || key === 'L') {
        event.preventDefault();
        videoElement.currentTime = Math.min(videoElement.currentTime + 10, videoElement.duration);
        playerUi.showSeekIndicator('forward');
      } else if (key === 'j' || key === 'J') {
        event.preventDefault();
        videoElement.currentTime = Math.max(videoElement.currentTime - 10, 0);
        playerUi.showSeekIndicator('backward');
      } else if (key === 'ArrowUp') {
        event.preventDefault();
        playerUi.applyVolume?.(Math.min(1, videoElement.volume + 0.1));
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        playerUi.applyVolume?.(Math.max(0, videoElement.volume - 0.1));
      } else if (key >= '0' && key <= '9') {
        event.preventDefault();
        const pct = parseInt(key, 10) / 10;
        videoElement.currentTime = pct * videoElement.duration;
      }
    });

    globalPlayerListenersBound = true;
  }

  const IVS_ACCOUNT = '196233775518';
  const IVS_BASES = [
    `https://stream.kick.com/3c81249a5ce0/ivs/v1/${IVS_ACCOUNT}`,
    `https://stream.kick.com/0f3cb0ebce7/ivs/v1/${IVS_ACCOUNT}`,
    `https://stream.kick.com/ivs/v1/${IVS_ACCOUNT}`
  ];

  const channelCache = new Map();

  async function getChannelData(slug) {
    if (!slug) return null;
    if (channelCache.has(slug)) return channelCache.get(slug);
    const data = await fetchJson(`https://kick.com/api/v1/channels/${slug}`, { timeout: 7000 });
    channelCache.set(slug, data);
    return data;
  }

  let pageVideoCache = { key: null, value: null };

  function readPageVideo(slug) {
    const key = String(slug || '');
    if (pageVideoCache.key === key && pageVideoCache.value) return pageVideoCache.value;
    let value = null;
    try {
      const html = document.documentElement.outerHTML.replace(/\\"/g, '"');
      const needle = `"id":"${key}"`;
      let index = key ? html.indexOf(needle) : -1;
      while (index !== -1) {
        const win = html.slice(Math.max(0, index - 1200), index + 1200);
        const start = /"start_time":"([^"]+)"/.exec(win);
        if (start) {
          const end = /"end_time":"([^"]+)"/.exec(win);
          const dur = /"duration":(\d+)/.exec(win);
          const status = /"status":"([^"]+)"/.exec(win);
          const chan = /"channel":\{"id":(\d+),"slug":"([^"]+)"/.exec(win);
          value = {
            id: key,
            start_time: start[1],
            end_time: end ? end[1] : null,
            duration: dur ? Number(dur[1]) : null,
            status: status ? status[1] : null,
            channelId: chan ? Number(chan[1]) : null,
            channelSlug: chan ? chan[2] : null
          };
          dbg('page payload', value);
          break;
        }
        index = html.indexOf(needle, index + 1);
      }
    } catch (e) {
      dbg('page payload read failed', e.message);
    }
    pageVideoCache = { key, value };
    return value;
  }

  function ivsIdsFromEntry(entry) {
    const thumb = entry && entry.thumbnail;
    const src = typeof thumb === 'string' ? thumb : (thumb && (thumb.src || thumb.url)) || '';
    const flat = /video_thumbnails\/([0-9A-Za-z_-]+)\/([0-9A-Za-z_-]+)\//.exec(src);
    if (flat) return { cid: flat[1], vid: flat[2] };
    const nested = /ivs\/v1\/\d+\/([0-9A-Za-z_-]+)\/([0-9A-Za-z_-]+)\//.exec(src);
    if (nested) return { cid: nested[1], vid: nested[2] };
    return null;
  }

  function ivsUrl(ids, at, base) {
    const y = at.getUTCFullYear();
    const m = at.getUTCMonth() + 1;
    const d = at.getUTCDate();
    const h = at.getUTCHours();
    const min = at.getUTCMinutes();
    return `${base}/${ids.cid}/${y}/${m}/${d}/${h}/${min}/${ids.vid}/media/hls/master.m3u8`;
  }

  async function probeIvsPath(ids, startDate) {
    for (const offset of [0, -1, 1, -2, 2]) {
      const at = new Date(startDate.getTime() + offset * 60000);
      const urls = IVS_BASES.map((base) => ivsUrl(ids, at, base));
      const hits = await Promise.all(urls.map((url) => checkStreamUrl(url)));
      const hit = hits.find(Boolean);
      if (hit) {
        note(`ivs path hit (offset ${offset}m)`);
        return hit;
      }
    }
    return null;
  }

  async function resolveVodPlayback(channelSlug, pageVideo) {
    if (!channelSlug || !pageVideo) return null;

    const cacheKey = `devg0d-kick-ivs-${channelSlug}-${pageVideo.id}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const probe = await probePlaylist(cached);
        if (probe.ok) {
          dbg('ivs path from cache');
          return cached;
        }
      }
    } catch (e) {}

    const chan = await getChannelData(channelSlug);
    const list = Array.isArray(chan && chan.previous_livestreams) ? chan.previous_livestreams : [];
    if (!list.length) {
      dbg('channel has no previous_livestreams');
      return null;
    }

    const target = parseUtcDate(pageVideo.start_time);
    const ranked = list
      .map((item) => ({
        item,
        ids: ivsIdsFromEntry(item),
        at: parseUtcDate(item && (item.start_time || item.created_at))
      }))
      .filter((x) => x.ids && x.at);

    if (!ranked.length) {
      dbg('no thumbnail ids in previous_livestreams');
      return null;
    }

    ranked.sort((a, b) => {
      if (!target) return 0;
      return Math.abs(a.at.getTime() - target.getTime()) - Math.abs(b.at.getTime() - target.getTime());
    });

    const exact = target
      ? ranked.find((x) => Math.abs(x.at.getTime() - target.getTime()) <= 2000)
      : null;
    const candidates = exact ? [exact] : ranked.slice(0, 3);

    dbg('ivs candidates', {
      total: ranked.length,
      exact: Boolean(exact),
      first: candidates[0] && { at: candidates[0].at.toISOString(), ids: candidates[0].ids }
    });

    for (const candidate of candidates) {
      const url = await probeIvsPath(candidate.ids, candidate.at);
      if (url) {
        try { sessionStorage.setItem(cacheKey, url); } catch (e) {}
        return url;
      }
    }

    return null;
  }

  async function getVideoMetadata(channelSlug, videoSlug) {
    const findVideoInList = (list) => {
      if (!Array.isArray(list) || list.length === 0) return null;
      const target = String(videoSlug || '').toLowerCase().trim();

      let found = list.find((v) => {
        if (!v) return false;
        const slug = String(v.slug || '').toLowerCase();
        const uuid = String(v.uuid || v.video?.uuid || '').toLowerCase();
        const id = String(v.id || '').toLowerCase();
        return target && (slug === target || uuid === target || id === target);
      });

      if (!found && target.length > 5) {
        found = list.find((v) => v && JSON.stringify(v).toLowerCase().includes(target));
      }

      if (!found && list.length === 1) found = list[0];
      return found;
    };

    let meta = null;
    let record = null;
    const pageVideo = readPageVideo(videoSlug);

    const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));

    if (pageVideo && (pageVideo.start_time || pageVideo.channelId)) {
      meta = {
        video: {
          id: pageVideo.id,
          uuid: pageVideo.id,
          start_time: pageVideo.start_time,
          end_time: pageVideo.end_time,
          duration: pageVideo.duration,
          status: pageVideo.status,
          thumbnail: { src: '' }
        },
        channelId: pageVideo.channelId,
        channelSlug: channelSlug || pageVideo.channelSlug
      };
      note('page payload metadata', { start: pageVideo.start_time, status: pageVideo.status });
    }

    if (!meta && isUuid(videoSlug)) {
      record = await fetchJson(`https://kick.com/api/v1/video/${videoSlug}`, { timeout: 6000 });
      if (record?.livestream) {
        meta = {
          video: record.livestream,
          channelId: record.livestream.channel_id || record.livestream.channel?.id,
          channelSlug: channelSlug || record.livestream.channel?.slug
        };
      }
    }

    let channelData = null;
    let previousLivestreams = null;
    let numericalChannelId = meta?.channelId || null;

    if (channelSlug && (!meta || !numericalChannelId)) {
      for (const chanUrl of [
        `https://kick.com/api/v1/channels/${channelSlug}`,
        `https://web.kick.com/api/v1/channels/${channelSlug}`
      ]) {
        dbg('GET', chanUrl);
        const resData = await fetchJson(chanUrl, { timeout: 6000 });
        if (resData && (resData.id || resData.channel_id || resData.user_id)) {
          channelData = resData;
          numericalChannelId = numericalChannelId || resData.id || resData.channel_id || resData.user_id;
          previousLivestreams = Array.isArray(resData.previous_livestreams)
            ? resData.previous_livestreams
            : null;
          break;
        }
      }
    }

    if (!meta && previousLivestreams) {
      const entry = findVideoInList(previousLivestreams);
      if (entry) {
        const uuid = entry.video?.uuid;
        if (uuid) record = await fetchJson(`https://kick.com/api/v1/video/${uuid}`, { timeout: 6000 });
        meta = {
          video: record?.livestream || entry,
          channelId: numericalChannelId || entry.channel_id,
          channelSlug: channelSlug || entry.channel?.slug
        };
        dbg('matched via previous_livestreams', { uuid, hasSource: Boolean(record?.source) });
      }
    }

    if (!meta && videoSlug) {
      for (const endpoint of [
        `https://kick.com/api/v1/video/${videoSlug}`,
        `https://web.kick.com/api/v1/video/${videoSlug}`,
        `https://kick.com/api/v1/videos/${videoSlug}`
      ]) {
        const data = await fetchJson(endpoint, { timeout: 5000 });
        if (data && (data.id || data.uuid || data.livestream)) {
          record = data.livestream ? data : record;
          const vid = data.livestream || data.video || data.data || data;
          meta = {
            video: vid,
            channelId: vid.channel_id || vid.channel?.id || vid.user_id || numericalChannelId,
            channelSlug: channelSlug || vid.channel?.slug || vid.channel_slug
          };
        }
        if (meta) break;
      }
    }

    if (!meta) {
      if (numericalChannelId && videoSlug) {
        meta = {
          video: {
            id: videoSlug,
            uuid: videoSlug,
            start_time: new Date().toISOString(),
            thumbnail: { url: '' }
          },
          channelId: numericalChannelId,
          channelSlug
        };
        note('synthetic metadata fallback');
      } else {
        note('Unable to find video metadata');
        return null;
      }
    }

    meta.record = record;
    meta.pageVideo = pageVideo;

    if (channelSlug && previousLivestreams && meta.video && !thumbnailHasIvsPath(meta.video)) {
      const target = parseUtcDate(meta.video.start_time || meta.video.created_at);
      if (target) {
        const match = previousLivestreams.find((entry) => {
          const entryDate = parseUtcDate(entry?.start_time || entry?.created_at);
          return entryDate && entryDate.getTime() === target.getTime();
        });
        if (match?.thumbnail) {
          meta.video = { ...meta.video, thumbnail: match.thumbnail };
        }
      }
    }

    return meta;
  }

  async function probePlaylist(url) {
    try {
      const res = await gmRequest({ method: 'GET', url, timeout: 8000 });
      const body = res.responseText || '';
      if (res.status >= 200 && res.status < 300 && body.startsWith('#EXTM3U')) return { ok: true };
      return { ok: false, status: res.status, sample: body.slice(0, 180).replace(/\s+/g, ' ') };
    } catch (e) {
      return { ok: false, status: 0, sample: e.message };
    }
  }

  async function findStreamUrlFromMetadata(metadata) {
    const { video, channelId } = metadata;
    if (!video && !channelId) return null;

    if (metadata.pageVideo && metadata.channelSlug) {
      const vod = await resolveVodPlayback(metadata.channelSlug, metadata.pageVideo);
      if (vod) {
        note('vod playback resolved via ivs path');
        return vod;
      }
    }

    if (metadata.record?.source) {
      const probe = await probePlaylist(metadata.record.source);
      if (probe.ok) {
        note('direct HLS source from video API');
        return metadata.record.source;
      }
      note('source rejected', { status: probe.status, body: probe.sample });
    }

    const recordUuid = metadata.record?.uuid || video?.video?.uuid || video?.uuid;
    if (recordUuid && /^[0-9a-f-]{36}$/i.test(String(recordUuid))) {
      const rec = await fetchJson(`https://kick.com/api/v1/video/${recordUuid}`, { timeout: 6000 });
      if (rec?.source && rec.source !== metadata.record?.source) {
        const probe = await probePlaylist(rec.source);
        if (probe.ok) {
          note('direct HLS source (uuid lookup)');
          return rec.source;
        }
        note('lookup source rejected', { status: probe.status, body: probe.sample });
      }
      dbg('video API has no usable source', { status: rec?.status, isPrivate: rec?.is_private });
    }

    const mintVideoId = video?.video?.uuid || video?.uuid || video?.id;
    if (mintVideoId) {
      for (let attempt = 1; attempt <= 4; attempt++) {
        const anonymous = attempt > 2;
        const minted = await mintPlaybackUrl(String(mintVideoId), metadata.channelSlug, anonymous);
        if (minted.url) {
          note(`minted (attempt ${attempt}${anonymous ? ', no cookies' : ''})`);
          return minted.url;
        }
        if (!minted.retryable) {
          note('mint returned no URL - gated, going to sweep');
          break;
        }
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }

    const thumbUrl = video?.thumbnail
      ? (video.thumbnail.src || video.thumbnail.url || (typeof video.thumbnail === 'string' ? video.thumbnail : ''))
      : '';

    const channelPlayback = metadata.record?.livestream?.channel?.playback_url
      || metadata.record?.channel?.playback_url || '';
    const playbackCid = /channel\.([A-Za-z0-9_-]+)\.m3u8/.exec(channelPlayback)?.[1];

    const pairs = [];
    if (thumbUrl) {
      const parts = thumbUrl.split('/');
      const ivsIndex = parts.indexOf('ivs');
      if (ivsIndex !== -1 && parts[ivsIndex + 1] === 'v1') {
        pairs.push({ cid: parts[ivsIndex + 2], vid: parts[ivsIndex + 3] });
      } else if (parts.length > 5 && /^[0-9A-Za-z_-]{8,}$/.test(parts[4]) && /^[0-9A-Za-z_-]{8,}$/.test(parts[5])) {
        pairs.push({ cid: parts[4], vid: parts[5] });
      }
    }
    const vidUuid = video?.video?.uuid || video?.uuid || video?.id;
    if (channelId && vidUuid) pairs.push({ cid: channelId, vid: vidUuid });

    const candidates = pairs.slice();
    if (playbackCid) {
      for (const p of pairs) candidates.push({ cid: playbackCid, vid: p.vid });
    }

    const uniqueCandidates = candidates.filter((item, index, self) =>
      item.vid && index === self.findIndex((t) => t.cid === item.cid && t.vid === item.vid)
    );

    const startTime = parseUtcDate(video?.start_time || video?.created_at) || new Date();

    const baseUrls = [
      'https://stream.kick.com/3c81249a5ce0/ivs/v1/196233775518',
      'https://stream.kick.com/ivs/v1/196233775518',
      'https://stream.kick.com/0f3cb0ebce7/ivs/v1/196233775518'
    ];

    const tasks = [];
    const offsets = [0, -1, 1];

    for (const offset of offsets) {
      const t = new Date(startTime.getTime() + (offset * 60000));
      const y = t.getUTCFullYear();
      const m = t.getUTCMonth() + 1;
      const d = t.getUTCDate();
      const h = t.getUTCHours();
      const min = t.getUTCMinutes();
      for (const candidate of uniqueCandidates) {
        for (const base of baseUrls) {
          tasks.push(`${base}/${candidate.cid}/${y}/${m}/${d}/${h}/${min}/${candidate.vid}/media/hls/master.m3u8`);
        }
      }
    }

    const BATCH = 12;
    const sweepStart = Date.now();
    let probed = 0;

    for (let i = 0; i < tasks.length; i += BATCH) {
      const slice = tasks.slice(i, i + BATCH);
      const results = await Promise.all(slice.map((url) => checkStreamUrl(url)));
      probed += slice.length;

      const hit = results.find(Boolean);
      if (hit) {
        note(`sweep hit (${probed} probed, ${Date.now() - sweepStart}ms)`);
        return hit;
      }
    }

    note(`sweep exhausted (${probed} probed, ${Date.now() - sweepStart}ms)`);
    return null;
  }

  class ChatController {
    constructor(channelId, videoStartTime, container) {
      this.channelId = channelId;
      this.videoStartTime = videoStartTime;
      this.container = container;
      this.messages = [];
      this.videoElement = null;
      this.activeSessionId = 0;
      this.lastRenderedMsgId = null;
    }

    destroy() {
      this.activeSessionId = -1;
      this.messages = [];
      if (this.container) this.container.innerHTML = '';
    }

    init(initialVideoElement = null) {
      if (this.container) {
        this.container.innerHTML = `
          <div style="height:100%;display:flex;flex-direction:column;font-family:Inter,sans-serif;">
            <div id="kick-unlocker-chat-list" style="flex:1;overflow-y:auto;padding:10px;font-size:13px;color:#fff;">
              <br><div style="text-align:center;color:#888;">Connecting...</div>
            </div>
          </div>`;
        this.chatList = this.container.querySelector('#kick-unlocker-chat-list');
      }
      if (initialVideoElement) this.connectVideo(initialVideoElement);
      this.fetchLoop(this.activeSessionId);
    }

    connectVideo(videoElement) {
      this.videoElement = videoElement;
      videoElement.addEventListener('timeupdate', () => this.updateUI(videoElement.currentTime));
      videoElement.addEventListener('seeking', () => {
        this.activeSessionId++;
        this.messages = [];
        if (this.chatList) {
          this.chatList.innerHTML = '<br><div style="text-align:center;color:#888;">Syncing...</div>';
        }
        this.fetchLoop(this.activeSessionId);
      });
      if (this.messages.length) this.updateUI(videoElement.currentTime);
    }

    parseContent(content) {
      if (!content) return '';
      return String(content)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\[emote:(\d+):([^\]]+)\]/g, (match, id, name) =>
          `<img src="https://files.kick.com/emotes/${id}/fullsize" alt="${name}" title="${name}" style="height:1.8em;vertical-align:middle;display:inline-block;margin:0 2px;">`
        );
    }

    async fetchLoop(sessionId) {
      let currentCursor = null;
      while (this.activeSessionId === sessionId) {
        try {
          let url = `https://kick.com/api/v2/channels/${this.channelId}/messages`;
          if (currentCursor) {
            url += `?cursor=${currentCursor}`;
          } else {
            let targetTime = this.videoStartTime;
            if (this.videoElement) {
              targetTime = new Date(this.videoStartTime.getTime() + (this.videoElement.currentTime * 1000));
            }
            url += `?start_time=${targetTime.toISOString()}`;
          }

          let data = await fetchJson(url);
          if (!data) data = await fetchJson(url.replace('kick.com/api', 'web.kick.com/api'));
          if (!data) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          if (this.activeSessionId !== sessionId) break;

          const msgs = data.messages || (data.data && data.data.messages) || [];
          if (msgs.length) {
            msgs.forEach((msg) => {
              if (!this.messages.some((m) => m.id === msg.id)) this.messages.push(msg);
            });
            this.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            if (this.videoElement) this.updateUI(this.videoElement.currentTime);
          }

          currentCursor = data.cursor || (data.data && data.data.cursor) || data.next_cursor;
          if (!currentCursor) {
            currentCursor = null;
            await new Promise((r) => setTimeout(r, 2000));
          } else if (this.messages.length && this.videoElement) {
            const lastT = new Date(this.messages[this.messages.length - 1].created_at).getTime();
            const vidT = this.videoStartTime.getTime() + (this.videoElement.currentTime * 1000);
            await new Promise((r) => setTimeout(r, lastT > vidT + 60000 ? 1000 : 50));
          } else {
            await new Promise((r) => setTimeout(r, 50));
          }
        } catch (e) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    updateUI(cwdSeconds) {
      if (!this.chatList) return;
      const absTime = this.videoStartTime.getTime() + (cwdSeconds * 1000);
      let limit = -1;
      for (let i = this.messages.length - 1; i >= 0; i--) {
        if (new Date(this.messages[i].created_at).getTime() <= absTime) { limit = i; break; }
      }
      if (limit === -1) return;

      const subset = this.messages.slice(Math.max(0, limit - 75), limit + 1);
      const lastM = subset[subset.length - 1];
      if (!lastM || (this.lastRenderedMsgId === lastM.id && subset.length >= 50)) return;

      this.chatList.innerHTML = subset.map((msg) => `
        <div style="margin-bottom:4px;line-height:1.4;word-wrap:break-word;">
          <span style="color:${msg.sender?.identity?.color || '#53fc18'};font-weight:bold;margin-right:5px;">${msg.sender?.username || 'User'}:</span>
          <span style="color:#efeff1;">${this.parseContent(msg.content)}</span>
        </div>`).join('');
      this.chatList.scrollTop = this.chatList.scrollHeight;
      this.lastRenderedMsgId = lastM.id;
    }
  }

  function findPlayerContainer(triggerElement) {
    let node = triggerElement;
    for (let depth = 0; depth < 12 && node && node !== document.body; depth++) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= 320 && rect.height >= 180) return node;
      node = node.parentElement;
    }
    return triggerElement.closest('.relative.flex.flex-col')
      || triggerElement.closest('div[class*="overflow-hidden"][class*="rounded"]')
      || triggerElement.closest('div[class*="relative"][class*="flex"]')
      || triggerElement.parentElement;
  }

  let fitTimer = null;
  let fitListenerBound = false;

  function fitPlayer(container, aspect) {
    if (!container) return 360;

    const rect = container.getBoundingClientRect();
    const width = Math.round(rect.width || container.clientWidth || 0)
      || Math.round((window.innerWidth || 1280) * 0.75);

    const parent = container.parentElement;
    const parentHeight = parent ? Math.round(parent.clientHeight || 0) : 0;
    const viewportHeight = Math.round(window.innerHeight || 720);

    const cap = parentHeight >= 220
      ? parentHeight
      : Math.round(viewportHeight * 0.92);

    const ratio = Number.isFinite(aspect) && aspect > 0.2 && aspect < 4 ? aspect : 9 / 16;
    let height = Math.round(width * ratio);
    if (cap >= 200) height = Math.min(height, cap);
    height = Math.max(height, 200);

    container.style.width = '100%';
    container.style.height = `${height}px`;
    container.style.minHeight = '0';
    container.style.maxHeight = 'none';
    container.style.aspectRatio = 'auto';
    container.style.boxSizing = 'border-box';
    container.style.overflow = 'hidden';

    return height;
  }

  function scheduleFit(container) {
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      fitTimer = null;
      if (!container || !container.querySelector('#k-player')) return;
      fitPlayer(container);
    }, 180);
  }

  function findPlayerSlot(container) {
    let node = container.parentElement;
    for (let i = 0; i < 6 && node && node !== document.body; i++) {
      const cs = getComputedStyle(node);
      const h = Math.round(node.clientHeight || 0);
      const w = Math.round(node.clientWidth || 0);
      if (h >= 200 && w >= 320 && /hidden|clip/.test(cs.overflow)) return node;
      node = node.parentElement;
    }
    return container.parentElement;
  }

  function slotVisibleHeight(container) {
    const slot = findPlayerSlot(container);
    if (!slot) return 0;

    let height = Math.round(slot.clientHeight || 0);
    let node = slot.parentElement;
    for (let i = 0; i < 6 && node && node !== document.body; i++) {
      const cs = getComputedStyle(node);
      if (/hidden|clip/.test(cs.overflow)) {
        const h = Math.round(node.clientHeight || 0);
        if (h >= 120 && h < height) height = h;
      }
      node = node.parentElement;
    }
    return height;
  }

  function syncToSlot(container) {
    if (!container || !container.querySelector('#k-player')) return;

    const height = slotVisibleHeight(container);
    if (height < 200) return;

    const width = Math.round(container.clientWidth || 0);
    if (width >= 320 && height > width * 1.2) return;

    const current = Math.round(container.getBoundingClientRect().height || 0);
    if (Math.abs(current - height) > 2) {
      container.style.height = `${height}px`;
      container.style.minHeight = '0';
      container.style.maxHeight = 'none';
      container.style.aspectRatio = 'auto';
      container.style.boxSizing = 'border-box';
      container.style.overflow = 'hidden';
      note('player resized to slot', { from: current, to: height });
    }

  }

  function scheduleSync(container) {
    [0, 250, 900, 2000, 4000].forEach((delay) => {
      setTimeout(() => syncToSlot(container), delay);
    });
  }

  function showError(container, triggerElement, title, subtitle, minHeight) {
    container.innerHTML = `
      <div style="width:100%;height:100%;min-height:${minHeight}px;background:#000;display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:Inter,sans-serif;">
        <div style="font-size:22px;color:#ff4444;font-weight:bold;margin-bottom:8px;">${title}</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:16px;text-align:center;max-width:340px;">${subtitle}</div>
        <button class="k-retry-btn" id="k-retry-unlock">Retry Stream</button>
      </div>`;
    const retryBtn = container.querySelector('#k-retry-unlock');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        delete container.dataset.kickUnlockerProcessing;
        unlockVideo(container, container);
      });
    }
  }

  async function unlockVideo(triggerElement, knownContainer) {
    if (isUnlocking) return;
    if (!isEnabled()) return;

    const container = knownContainer || findPlayerContainer(triggerElement);
    if (!container || container.dataset.kickUnlockerProcessing) return;

    container.dataset.kickUnlockerProcessing = 'true';
    lastUnlockContainer = container;

    const playerHeight = fitPlayer(container);

    if (!fitListenerBound) {
      fitListenerBound = true;
      window.addEventListener('resize', () => {
        if (lastUnlockContainer && lastUnlockContainer.querySelector('#k-player')) {
          scheduleFit(lastUnlockContainer);
          scheduleSync(lastUnlockContainer);
        }
      });
    }

    if (activeChatController) { activeChatController.destroy(); activeChatController = null; }
    if (activeHls) { activeHls.destroy(); activeHls = null; }

    ensurePlayerStyles();

    try {
      isUnlocking = true;

      container.innerHTML = `
        <div style="width:100%;height:100%;background:#000;display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:Inter,sans-serif;">
          <div style="font-size:24px;font-weight:bold;color:#53fc18;margin-bottom:8px;">DEV/g0d Kick</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.7);">Searching stream...</div>
        </div>`;

      const url = new URL(window.location.href);
      const queryVideo = url.searchParams.get('video') || url.searchParams.get('vod');
      const pathParts = url.pathname.split('/').filter(Boolean);
      let channelSlug = null;
      let videoSlug = null;

      if (queryVideo) {
        channelSlug = pathParts[0] || null;
        videoSlug = queryVideo;
      } else if (pathParts.length >= 3 && (pathParts[1] === 'video' || pathParts[1] === 'videos')) {
        channelSlug = pathParts[0];
        videoSlug = pathParts[2];
      } else if (pathParts.length >= 2 && pathParts[0] === 'video') {
        videoSlug = pathParts[1];
      } else if (pathParts.length >= 2 && pathParts[1] !== 'videos' && pathParts[1] !== 'video') {
        channelSlug = pathParts[0];
        videoSlug = pathParts[1];
      } else if (pathParts.length > 0) {
        channelSlug = pathParts[0];
        videoSlug = pathParts[pathParts.length - 1];
      }

      const resumeKey = getResumeKey(channelSlug || 'unknown', videoSlug || 'unknown');
      const playerSettingsKey = getPlayerSettingsKey(channelSlug || 'unknown', videoSlug || 'unknown');
      const savedPlayerSettings = loadPlayerSettings(playerSettingsKey);

      let result = await getVideoMetadata(channelSlug, videoSlug);
      if (!result) {
        await new Promise((r) => setTimeout(r, 1500));
        result = await getVideoMetadata(channelSlug, videoSlug);
      }
      if (!result) {
        showError(container, triggerElement, 'Stream Not Found', 'Could not retrieve video details.', playerHeight);
        return;
      }

      note('metadata resolved', {
        channelId: result.channelId,
        uuid: result.video?.uuid || result.video?.id,
        start: result.video?.start_time || result.video?.created_at
      });

      const streamUrl = await findStreamUrlFromMetadata(result);
      if (!streamUrl) {
        showError(container, triggerElement, 'Stream Not Found', 'Could not locate HLS stream URL for this video.', playerHeight);
        return;
      }

      container.dataset.kickUnlockerProcessing = 'true';
      container.innerHTML = '';
      container.style.background = '#000';

      const existingChat = document.querySelector('#chatroom-messages');
      let chatRoot = null;
      if (existingChat) {
        existingChat.innerHTML = '';
        existingChat.style.display = 'block';
        chatRoot = existingChat;
      } else {
        container.innerHTML = `<div style="display:flex;width:100%;height:100%;"><div id="unlocker-video-area" style="flex:1;background:#000;position:relative;"></div><div id="unlocker-chat-area" style="width:320px;height:100%;border-left:1px solid #333;"></div></div>`;
        chatRoot = container.querySelector('#unlocker-chat-area');
      }

      const rawStart = result.video?.start_time || result.video?.created_at || '';
      const startTime = parseUtcDate(rawStart);
      let chatController = null;

      if (startTime && result.channelId) {
        chatController = new ChatController(result.channelId, startTime, chatRoot);
        activeChatController = chatController;
        chatController.init(null);
      } else if (chatRoot) {
        chatRoot.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;font-family:Inter,sans-serif;font-size:12px;color:#888;">Chat replay unavailable for this video.</div>`;
      }

      const finalUrl = streamUrl;
      const videoParent = existingChat ? container : container.querySelector('#unlocker-video-area');

      videoParent.innerHTML = `
        <div id="k-player" style="width:100%;height:100%;box-sizing:border-box;position:relative;background:black;overflow:hidden;font-family:Inter,sans-serif;">
          <video id="k-video" playsinline style="width:100%;height:100%;object-fit:contain;"></video>
          <div id="k-loading" class="visible" aria-hidden="true">
            <div class="k-loading-spinner"></div>
          </div>
          <div id="k-controls" style="position:absolute;bottom:0;left:0;width:100%;box-sizing:border-box;padding:20px 15px 10px 15px;background:linear-gradient(to top, rgba(0,0,0,0.9), transparent);display:flex;flex-direction:column;opacity:0;transition:opacity 0.2s;">
            <div id="k-track" style="width:100%;height:6px;padding:8px 0;background:rgba(255,255,255,0.3);background-clip:content-box;box-sizing:content-box;cursor:pointer;position:relative;margin-bottom:4px;border-radius:2px;">
              <div id="k-track-tooltip"><div id="k-track-tooltip-time">0:00</div></div>
              <div id="k-progress" style="width:0%;height:100%;background:#53fc18;position:relative;border-radius:2px;"></div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:15px;">
                <button id="k-play" style="background:none;border:none;cursor:pointer;opacity:0.9;" aria-label="Play/Pause">${ICONS.play}</button>
                <span id="k-time" style="font-size:13px;color:#ddd;font-variant-numeric:tabular-nums;">0:00 / 0:00</span>
                <div id="k-volume-wrap">
                  <button id="k-volume-btn" type="button" aria-label="Mute volume">${ICONS.volumeHigh}</button>
                  <input id="k-volume" type="range" min="0" max="1" step="0.01" value="1">
                  <span id="k-volume-value">100%</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:15px;">
                <div id="k-speed-wrap">
                  <button id="k-speed-btn" type="button">1x ▴</button>
                  <div id="k-speed-menu"></div>
                </div>
                <div id="k-quality-wrap">
                  <button id="k-quality-btn" type="button">Auto ▴</button>
                  <div id="k-quality-menu"></div>
                </div>
                <button id="k-fs" style="background:none;border:none;cursor:pointer;opacity:0.9;" aria-label="Fullscreen">${ICONS.maximize}</button>
              </div>
            </div>
          </div>
          <div id="k-seek-indicator" aria-hidden="true"></div>
          <button id="k-big-play" style="position:absolute;top:50%;left:50%;width:70px;height:70px;background:rgba(7,7,7,0.72);border-radius:50%;border:1px solid rgba(255,255,255,0.18);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Play">
            ${ICONS.bigPlay}
          </button>
        </div>`;

      const pRoot = videoParent.querySelector('#k-player');
      const vid = videoParent.querySelector('#k-video');
      const controls = videoParent.querySelector('#k-controls');
      scheduleSync(container);
      const btnPlay = videoParent.querySelector('#k-play');
      const btnFs = videoParent.querySelector('#k-fs');
      const btnBig = videoParent.querySelector('#k-big-play');
      const progressBar = videoParent.querySelector('#k-progress');
      const track = videoParent.querySelector('#k-track');
      const trackTooltip = videoParent.querySelector('#k-track-tooltip');
      const trackTooltipTime = videoParent.querySelector('#k-track-tooltip-time');
      const timeDisplay = videoParent.querySelector('#k-time');
      const qualWrap = videoParent.querySelector('#k-quality-wrap');
      const qualBtn = videoParent.querySelector('#k-quality-btn');
      const qualMenu = videoParent.querySelector('#k-quality-menu');
      const speedWrap = videoParent.querySelector('#k-speed-wrap');
      const speedBtn = videoParent.querySelector('#k-speed-btn');
      const speedMenu = videoParent.querySelector('#k-speed-menu');
      const seekIndicator = videoParent.querySelector('#k-seek-indicator');
      const loadingOverlay = videoParent.querySelector('#k-loading');
      const volumeWrap = videoParent.querySelector('#k-volume-wrap');
      const volumeButton = videoParent.querySelector('#k-volume-btn');
      const volumeSlider = videoParent.querySelector('#k-volume');
      const volumeValue = videoParent.querySelector('#k-volume-value');

      const initialVolume = Number.isFinite(savedPlayerSettings.volume) ? savedPlayerSettings.volume : 1;
      let seekIndicatorTimeout = null;
      let hasStartedPlayback = false;
      let loadingStateTimeout = null;
      let previousVolumeBeforeMute = initialVolume > 0 ? initialVolume : 1;

      const updateVolumeSliderVisual = (volume) => {
        const percent = Math.max(0, Math.min(100, Math.round(volume * 100)));
        volumeSlider.style.setProperty('--k-volume-percent', `${percent}%`);
        volumeValue.textContent = `${percent}%`;
        volumeButton.innerHTML = getVolumeIcon(volume);
        volumeButton.setAttribute('aria-label', percent === 0 ? 'Unmute volume' : 'Mute volume');
        volumeWrap.dataset.muted = percent === 0 ? 'true' : 'false';
      };

      const applyVolume = (volume, { persist = true } = {}) => {
        const normalizedVolume = Math.max(0, Math.min(1, Number(volume) || 0));
        if (normalizedVolume > 0) previousVolumeBeforeMute = normalizedVolume;

        vid.muted = normalizedVolume === 0;
        vid.volume = normalizedVolume;
        volumeSlider.value = String(normalizedVolume);
        updateVolumeSliderVisual(normalizedVolume);

        if (persist) savePlayerSettings(playerSettingsKey, { volume: normalizedVolume });
      };

      const setLoadingState = (isLoading, { immediate = false } = {}) => {
        clearTimeout(loadingStateTimeout);
        if (!isLoading) {
          loadingOverlay.classList.remove('visible');
          return;
        }
        if (immediate) {
          loadingOverlay.classList.add('visible');
          return;
        }
        loadingStateTimeout = setTimeout(() => {
          if (!vid.paused && !vid.ended) loadingOverlay.classList.add('visible');
        }, 250);
      };

      const showSeekIndicator = (direction) => {
        seekIndicator.innerHTML = direction === 'forward' ? ICONS.forward : ICONS.backward;
        seekIndicator.dataset.direction = direction;
        seekIndicator.classList.remove('visible');
        void seekIndicator.offsetWidth;
        seekIndicator.classList.add('visible');
        clearTimeout(seekIndicatorTimeout);
        seekIndicatorTimeout = setTimeout(() => seekIndicator.classList.remove('visible'), 850);
      };

      const togglePlay = () => { if (vid.paused) vid.play(); else vid.pause(); };

      activePlayerUi = {
        vid,
        qualWrap,
        speedWrap,
        showSeekIndicator,
        togglePlay,
        toggleFullscreen: () => btnFs.click(),
        toggleMute: () => volumeButton.click(),
        applyVolume
      };
      bindGlobalPlayerListeners();

      applyVolume(initialVolume, { persist: false });

      const setSpeed = (rate, label) => {
        vid.playbackRate = rate;
        vid.preservesPitch = true;
        speedBtn.textContent = `${label} ▴`;
        [...speedMenu.querySelectorAll('.k-speed-option')].forEach((opt) => opt.classList.remove('active'));
        const matched = [...speedMenu.querySelectorAll('.k-speed-option')].find((opt) => opt.textContent === label);
        if (matched) matched.classList.add('active');
        savePlayerSettings(playerSettingsKey, { speed: rate });
        speedWrap.classList.remove('open');
      };

      const speeds = [
        { rate: 0.5, label: '0.5x' },
        { rate: 0.75, label: '0.75x' },
        { rate: 1.0, label: '1x (Normal)' },
        { rate: 1.25, label: '1.25x' },
        { rate: 1.5, label: '1.5x' },
        { rate: 1.75, label: '1.75x' },
        { rate: 2.0, label: '2.0x' }
      ];

      speeds.forEach((sp) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'k-speed-option';
        item.textContent = sp.label;
        if (sp.rate === (savedPlayerSettings.speed || 1.0)) item.classList.add('active');
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          setSpeed(sp.rate, sp.label);
        });
        speedMenu.appendChild(item);
      });

      speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        qualWrap.classList.remove('open');
        speedWrap.classList.toggle('open');
      });

      const initialSpeed = savedPlayerSettings.speed || 1.0;
      const matchedSpeedObj = speeds.find((s) => s.rate === initialSpeed) || speeds[2];
      setSpeed(matchedSpeedObj.rate, matchedSpeedObj.label);

      qualBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        speedWrap.classList.remove('open');
        qualWrap.classList.toggle('open');
      });

      volumeSlider.addEventListener('input', () => applyVolume(parseFloat(volumeSlider.value)));

      volumeButton.addEventListener('click', () => {
        if (vid.volume <= 0 || vid.muted) {
          applyVolume(previousVolumeBeforeMute > 0 ? previousVolumeBeforeMute : 1);
          return;
        }
        previousVolumeBeforeMute = vid.volume > 0 ? vid.volume : previousVolumeBeforeMute;
        applyVolume(0);
      });

      if (chatController) chatController.connectVideo(vid);

      vid.addEventListener('click', togglePlay);
      btnPlay.addEventListener('click', togglePlay);
      btnBig.addEventListener('click', togglePlay);
      vid.addEventListener('play', () => {
        btnPlay.innerHTML = ICONS.pause;
        btnBig.classList.remove('visible');
      });
      vid.addEventListener('pause', () => {
        btnPlay.innerHTML = ICONS.play;
        btnBig.classList.add('visible');
      });
      vid.addEventListener('playing', () => {
        hasStartedPlayback = true;
        setLoadingState(false);
      });
      vid.addEventListener('waiting', () => { if (!vid.paused) setLoadingState(true); });
      vid.addEventListener('seeking', () => { if (hasStartedPlayback) setLoadingState(true); });
      vid.addEventListener('seeked', () => { if (!vid.paused && vid.readyState >= 3) setLoadingState(false); });
      vid.addEventListener('canplay', () => { if (!vid.paused && hasStartedPlayback) setLoadingState(false); });
      vid.addEventListener('stalled', () => { if (!vid.paused) setLoadingState(true); });
      vid.addEventListener('loadeddata', () => { if (vid.paused && !hasStartedPlayback) setLoadingState(false); });
      vid.addEventListener('ended', () => setLoadingState(false));

      let lastSave = 0;
      vid.addEventListener('timeupdate', () => {
        if (Date.now() - lastSave > 4000) {
          try { localStorage.setItem(resumeKey, vid.currentTime); } catch (e) { /* ignore */ }
          lastSave = Date.now();
        }
        if (isFinite(vid.duration)) {
          progressBar.style.width = (vid.currentTime / vid.duration * 100) + '%';
          timeDisplay.textContent = `${formatTime(vid.currentTime)} / ${formatTime(vid.duration)}`;
        }
      });
      vid.addEventListener('ended', () => {
        try { localStorage.removeItem(resumeKey); } catch (e) { /* ignore */ }
      });

      let isDraggingTrack = false;
      const updateTrackPosition = (e) => {
        if (!isFinite(vid.duration)) return;
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        vid.currentTime = ratio * vid.duration;
      };

      track.addEventListener('mousedown', (e) => {
        isDraggingTrack = true;
        updateTrackPosition(e);
      });
      window.addEventListener('mousemove', (e) => {
        if (isDraggingTrack && pRoot.isConnected) updateTrackPosition(e);
      });
      window.addEventListener('mouseup', () => { isDraggingTrack = false; });

      track.addEventListener('mousemove', (e) => {
        if (!isFinite(vid.duration)) return;
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        trackTooltipTime.textContent = formatTime(ratio * vid.duration);
        trackTooltip.style.left = `${ratio * rect.width}px`;
        trackTooltip.classList.add('visible');
      });
      track.addEventListener('mouseenter', () => {
        if (isFinite(vid.duration)) trackTooltip.classList.add('visible');
      });
      track.addEventListener('mouseleave', () => trackTooltip.classList.remove('visible'));

      let hideControlsTimeout = null;
      const showControls = () => {
        controls.style.opacity = '1';
        clearTimeout(hideControlsTimeout);
        if (!vid.paused) {
          hideControlsTimeout = setTimeout(() => {
            if (!vid.paused && !qualWrap.classList.contains('open') && !speedWrap.classList.contains('open')) {
              controls.style.opacity = '0';
            }
          }, 2500);
        }
      };

      pRoot.addEventListener('mousemove', showControls);
      pRoot.addEventListener('mouseenter', showControls);
      pRoot.addEventListener('mouseleave', () => {
        qualWrap.classList.remove('open');
        speedWrap.classList.remove('open');
        trackTooltip.classList.remove('visible');
        if (!vid.paused) controls.style.opacity = '0';
      });

      btnFs.addEventListener('click', () => {
        if (!document.fullscreenElement) pRoot.requestFullscreen();
        else document.exitFullscreen();
      });
      vid.addEventListener('dblclick', () => btnFs.click());

      vid.addEventListener('loadedmetadata', () => {
        if (vid.videoWidth && vid.videoHeight) {
          fitPlayer(container, vid.videoHeight / vid.videoWidth);
        }
      }, { once: true });

      const savedTime = parseFloat(localStorage.getItem(resumeKey));
      if (Number.isFinite(savedTime) && savedTime > 1) {
        vid.addEventListener('loadedmetadata', () => {
          if (Number.isFinite(vid.duration)) {
            vid.currentTime = Math.min(savedTime, vid.duration - 1);
          } else {
            vid.currentTime = savedTime;
          }
        }, { once: true });
      }

      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({ debug: false, enableWorker: false, lowLatencyMode: true });
        activeHls = hls;
        hls.loadSource(finalUrl);
        hls.attachMedia(vid);
        hls.on(Hls.Events.MANIFEST_LOADING, () => setLoadingState(true, { immediate: true }));
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoadingState(false);

          const setQuality = (level, label, optionRef = null, qualitySettings = null) => {
            hls.currentLevel = level;
            qualBtn.textContent = `${label} ▴`;
            [...qualMenu.querySelectorAll('.k-quality-option')].forEach((option) => option.classList.remove('active'));
            if (optionRef) optionRef.classList.add('active');
            if (qualitySettings) savePlayerSettings(playerSettingsKey, { quality: qualitySettings });
            qualWrap.classList.remove('open');
          };

          const addQualityItem = (level, label, qualitySettings, isActive = false) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'k-quality-option';
            item.textContent = label;
            if (isActive) item.classList.add('active');
            item.addEventListener('click', (e) => {
              e.stopPropagation();
              setQuality(level, label, item, qualitySettings);
            });
            qualMenu.appendChild(item);
            return item;
          };

          const qualityItems = [];
          const autoItem = addQualityItem(-1, 'Auto', { mode: 'auto' }, true);

          hls.levels
            .map((lvl, idx) => ({ lvl, idx }))
            .sort((a, b) => (b.lvl.height || 0) - (a.lvl.height || 0))
            .forEach(({ lvl, idx }) => {
              qualityItems.push({
                height: lvl.height,
                level: idx,
                label: `${lvl.height}p`,
                element: addQualityItem(idx, `${lvl.height}p`, { mode: 'manual', height: lvl.height })
              });
            });

          const savedQuality = savedPlayerSettings.quality;
          if (savedQuality?.mode === 'manual') {
            const matchedQuality = qualityItems.find((item) => item.height === savedQuality.height);
            if (matchedQuality) {
              setQuality(matchedQuality.level, matchedQuality.label, matchedQuality.element,
                { mode: 'manual', height: matchedQuality.height });
            } else {
              setQuality(-1, 'Auto', autoItem, { mode: 'auto' });
            }
          } else {
            setQuality(-1, 'Auto', autoItem, { mode: 'auto' });
          }

          vid.play().catch(() => btnBig.classList.add('visible'));
        });

        let networkRetries = 0;
        let mediaRetries = 0;
        let playerFailed = false;
        const MAX_NETWORK_RETRIES = 3;
        const MAX_MEDIA_RETRIES = 2;

        const failPlayer = (reason) => {
          if (playerFailed) return;
          playerFailed = true;
          setLoadingState(false);
          try { hls.destroy(); } catch (e) { /* already gone */ }
          activeHls = null;
          note('playback failed:', reason);
          showError(container, triggerElement, 'Playback Failed', reason, playerHeight);
        };

        hls.on(Hls.Events.ERROR, (e, data) => {
          if (!data.fatal) return;

          const status = data.response?.code || data.networkDetails?.status || 0;
          const detail = String(data.details || '');
          dbg('hls fatal', { type: data.type, detail, status });

          const hardFail = status === 401 || status === 403 || status === 404
            || detail === 'manifestParsingError';

          if (hardFail) {
            let extra = '';
            if (detail === 'manifestParsingError') {
              const body = String(data.response?.text || '').slice(0, 200).replace(/\s+/g, ' ');
              note('manifest did not parse', { url: finalUrl, body });
              if (body) extra = ` Response: ${body.slice(0, 90)}`;
            }
            failPlayer(
              (status === 401 || status === 403)
                ? `Kick rejected this stream URL (HTTP ${status}). The link is expired or not playable for this video - try Retry.`
                : `Kick returned a stream URL that is not a playable playlist.${extra}`
            );
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (++networkRetries > MAX_NETWORK_RETRIES) {
              failPlayer(`Network kept failing while loading the video (${networkRetries} retries).`);
              return;
            }
            setLoadingState(true);
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            if (++mediaRetries > MAX_MEDIA_RETRIES) {
              failPlayer('The video could not be decoded (media error).');
              return;
            }
            hls.recoverMediaError();
          } else {
            failPlayer(`Unexpected player error: ${detail || 'unknown'}.`);
          }
        });
      } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
        vid.src = finalUrl;
      } else {
        showError(container, triggerElement, 'Player Unavailable',
          'hls.js did not load. Check that cdn.jsdelivr.net is reachable, then retry.', playerHeight);
      }

    } catch (e) {
      console.error('[DEV/g0d Kick]', e);
      if (container) delete container.dataset.kickUnlockerProcessing;
    } finally {
      isUnlocking = false;
    }
  }

  const GATE_SELECTORS = [
    '[data-testid="video-subscriber-only"]',
    '[data-testid*="subscriber"]',
    '[data-testid*="sub-only"]',
    '[class*="subscriber-only"]',
    '[class*="subscriberOnly"]',
    '[class*="sub-only"]'
  ];

  const GATE_PATTERNS = [
    /subscribers?\s*only/i,
    /sub[-\s]?only/i,
    /only\s+(?:available\s+)?(?:to|for)\s+(?:subscribers|members)/i,
    /subscribe\s+to\s+(?:watch|view|continue|unlock)/i,
    /this\s+(?:video|content|stream)\s+is\s+(?:only\s+)?(?:for|available)/i,
    /สิทธิพิเศษสำหรับสมาชิก/,
    /สำหรับสมาชิกเท่านั้น/,
    /สมัครสมาชิกเพื่อ/,
    /เนื้อหานี้.*สมาชิก/
  ];

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return true;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function matchesGateText(text) {
    if (!text || text.length > 240) return false;
    return GATE_PATTERNS.some((re) => re.test(text));
  }

  function findGate({ deep = false } = {}) {
    for (const sel of GATE_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    if (!deep) return null;

    const scope = document.querySelector('main') || document.body;
    if (!scope) return null;

    let best = null;
    for (const el of scope.querySelectorAll('p, h1, h2, h3, h4, span, div')) {
      if (el.childElementCount > 3) continue;
      if (el.closest('#k-player, #dg-kick-popup, #dg-kick-tab')) continue;

      const text = (el.textContent || '').trim();
      if (text.length < 8 || text.length > 200) continue;
      if (!matchesGateText(text)) continue;
      if (!isVisible(el)) continue;

      if (!best || text.length < best.text.length) best = { el, text };
    }
    return best ? best.el : null;
  }

  let scanScheduled = false;
  let pendingDeep = false;

  function scheduleScan(deep) {
    pendingDeep = pendingDeep || deep;
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(() => {
      scanScheduled = false;
      const runDeep = pendingDeep;
      pendingDeep = false;
      scan(runDeep);
    }, 150);
  }

  function scan(deep = false) {
    if (!isEnabled() || isUnlocking) return;

    const gate = findGate({ deep });
    if (!gate) return;

    const container = findPlayerContainer(gate);
    if (!container) return;
    if (container === document.body || container.tagName === 'MAIN') return;
    if (container.dataset.kickUnlockerProcessing) return;
    if (container.querySelector('#k-player')) return;

    const rect = container.getBoundingClientRect();
    note('gate detected', {
      text: gate.textContent.trim().slice(0, 70),
      container: container.tagName,
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`
    });
    unlockVideo(gate, container);
  }

  function boot() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
      return;
    }

    if (!isEnabled()) {
      note('SubBypass disabled');
      return;
    }

    ensurePlayerStyles();

    const observer = new MutationObserver(() => scheduleScan(false));
    observer.observe(document.body, { childList: true, subtree: true });

    scan(false);
    scheduleScan(true);
    setInterval(() => {
      if (isEnabled()) scheduleScan(true);
    }, 1200);

    note('payload ready');
  }

  const ICON_1080 = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

  window.DEVg0d_PLUGINS = (window.DEVg0d_PLUGINS || []).concat([
    { name: ICON_1080 + 'Force1080p', type: 'toggle', key: KEY_1080P, init: initForce1080p },
    { name: 'SubBypass', type: 'toggle', key: KEY_NOSUB, init: boot }
  ]);

  window.__dgPluginsReady = true;
  window.dispatchEvent(new Event('dg-plugins-ready'));
})();
