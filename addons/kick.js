// DEV/g0d - Kick Addon
// Register plugins via window.DEVg0d_PLUGINS for the main script to render

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  //  NETWORK HOOK (ติดตั้งทันทีที่ document-start)
  //  Wrap Worker constructor เพื่อดัก Amazon IVS WASM worker
  // ═══════════════════════════════════════════════════════════════════════

  // ─── 1. Force1080p ────────────────────────────────────────────────────────
  function initKickForce1080p() {
    if (window.__kickFixPatched) return;
    window.__kickFixPatched = true;

    const NativeWorker = window.Worker;
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
            while ((m = re.exec(s))) {
              out[m[1]] = m[2].replace(/^"|"$/g, '');
            }
            return out;
          }

          function heightOf(streamAttrs) {
            const m = String(streamAttrs.RESOLUTION || '').match(/^\\d+x(\\d+)$/);
            return m ? Number(m[1]) : 0;
          }

          function rewrite(text) {
            if (!text.includes('#EXTM3U') || !text.includes('#EXT-X-STREAM-INF')) {
              return text;
            }

            const lines = text.replace(/\\r\\n?/g, '\\n').split('\\n');
            const head = [];
            const media = [];
            const streams = [];

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];

              if (line.startsWith('#EXT-X-MEDIA:')) {
                media.push({ line, attrs: attrs(line) });
                continue;
              }

              if (line.startsWith('#EXT-X-STREAM-INF:')) {
                streams.push({
                  info: line,
                  uri: lines[++i] || '',
                  attrs: attrs(line),
                });
                continue;
              }

              if (line) head.push(line);
            }

            if (!streams.length) return text;

            let target = streams.find(s => {
              const group = s.attrs.VIDEO || '';
              const related = media.find(m => m.attrs.TYPE === 'VIDEO' && m.attrs['GROUP-ID'] === group);
              const name = String(related?.attrs.NAME || group).toLowerCase();

              return heightOf(s.attrs) === 1080 || /(^|\\D)1080(\\D|$)|fhd|full\\s*hd/.test(name);
            });

            if (!target) {
              target = streams.reduce((best, s) =>
                heightOf(s.attrs) > heightOf(best?.attrs || {}) ? s : best, null);
            }

            if (!target) return text;

            const groups = new Set(
              ['VIDEO', 'AUDIO', 'SUBTITLES', 'CLOSED-CAPTIONS']
                .map(k => target.attrs[k])
                .filter(Boolean)
            );

            const keptMedia = media.filter(m =>
              !m.attrs['GROUP-ID'] || groups.has(m.attrs['GROUP-ID'])
            );

            return [
              ...head,
              ...keptMedia.map(m => m.line),
              target.info,
              target.uri,
              ''
            ].join('\\n');
          }

          self.fetch = async function(input, init) {
            const url = urlOf(input);
            const response = await nativeFetch(abs(input), init);

            if (!/\\.m3u8(?:[?#]|$)/i.test(url)) {
              return response;
            }

            const text = await response.text();

            if (!text.includes('#EXT-X-STREAM-INF')) {
              return new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              });
            }

            let rewritten = cache.get(url);
            if (rewritten === undefined) {
              rewritten = rewrite(text);
              cache.set(url, rewritten);
            }

            if (rewritten === text) {
              return new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              });
            }

            const headers = new Headers(response.headers);
            headers.delete('content-length');
            headers.set('content-type', 'application/vnd.apple.mpegurl');

            return new Response(rewritten, {
              status: response.status,
              statusText: response.statusText,
              headers,
            });
          };

          importScripts(ORIGINAL_WORKER_URL);
        })();
      `;

      return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    }

    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        const absoluteUrl = new URL(String(url), location.href).href;

        if (IVS_WORKER_RE.test(absoluteUrl)) {
          super(makeWorkerBlob(absoluteUrl), options);
        } else {
          super(url, options);
        }
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Register Plugins
  // ═══════════════════════════════════════════════════════════════════════
  const icon = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px">${d}</svg>`;

  window.DEVg0d_PLUGINS = [
    {
      name: icon('<path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><text x="12" y="15" text-anchor="middle" font-size="8" fill="#8b949e" stroke="none" font-weight="bold">HD</text>') + 'Force1080p',
      type: 'toggle',
      key: 'devg0d-kick-1080p',
      init: initKickForce1080p,
    },
  ];

  // ═══════════════════════════════════════════════════════════════════════
  //  AUTO-INIT
  //  Kick เป็น SPA — Worker ต้อง hook ก่อน player สร้าง
  //  เพราะงั้นถ้า toggle เปิดอยู่ ให้ init ทันทีไม่ต้องรอ UI
  // ═══════════════════════════════════════════════════════════════════════
  if (localStorage.getItem('devg0d-kick-1080p') !== 'false') {
    try { initKickForce1080p(); } catch(e) { console.error('[DEV/g0d]', e); }
  }

  // แจ้ง main script ว่า plugin พร้อมแล้ว
  window.__dgPluginsReady = true;
  window.dispatchEvent(new Event('dg-plugins-ready'));

})();
