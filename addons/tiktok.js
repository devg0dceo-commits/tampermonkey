// DEV/g0d - TikTok Addon

(function () {
  'use strict';

  function initTtDownloader() {
    if (window.__dgTtDlInit) return;
    window.__dgTtDlInit = true;

    const REFRESH_DELAY = 500;
    const hashCode = s => { if (!s) return 0; let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h >>> 0; };
    const downloads = new Map();

    const style = document.createElement('style');
    style.textContent = `
      #tt-dl-box{position:fixed;bottom:20px;right:20px;z-index:99999999;display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;font-family:system-ui,sans-serif}
      .tt-item{background:rgba(30,30,30,.95);backdrop-filter:blur(10px);border-radius:12px;padding:12px 16px;min-width:260px;box-shadow:0 4px 20px rgba(0,0,0,.3);animation:ttSlideIn .3s}
      @keyframes ttSlideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
      .tt-item.done{animation:ttFadeOut .5s 3s forwards}
      @keyframes ttFadeOut{to{opacity:0;transform:translateX(20px)}}
      .tt-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
      .tt-name{color:#fff;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
      .tt-x{background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:0}
      .tt-x:hover{color:#fff}
      .tt-bar{height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;margin-bottom:6px}
      .tt-fill{height:100%;background:linear-gradient(90deg,#FE2C55,#25F4EE);border-radius:3px;transition:width .3s;width:0}
      .tt-item.queued .tt-fill{background:#666;width:100%}
      .tt-item.done .tt-fill{background:linear-gradient(90deg,#4CAF50,#8BC34A);width:100%}
      .tt-item.err .tt-fill{background:#f44336;width:100%}
      .tt-stat{display:flex;justify-content:space-between;align-items:center}
      .tt-pct{color:#aaa;font-size:12px}
      .tt-retry{background:none;border:none;color:#FE2C55;font-size:12px;cursor:pointer;text-decoration:underline}
      .tt-btn{display:inline-flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);border:none;cursor:pointer;width:40px;height:40px;padding:0;border-radius:50%;transition:background .2s;position:absolute;color:white;z-index:9999999;font-size:16px;font-weight:bold;line-height:1;box-sizing:border-box}
      .tt-btn:hover{background:rgba(0,0,0,0.8)}
      .tt-btn svg{width:20px;height:20px;fill:currentColor;display:block}
    `;
    document.head.appendChild(style);

    const box = document.createElement('div'); box.id = 'tt-dl-box'; document.body.appendChild(box);

    const createItem = (id, name) => {
      let el = document.getElementById('tt-' + id);
      if (!el) {
        el = document.createElement('div');
        el.id = 'tt-' + id;
        el.className = 'tt-item';
        el.innerHTML = `<div class="tt-hdr"><span class="tt-name">${name}</span><button class="tt-x">&times;</button></div><div class="tt-bar"><div class="tt-fill"></div></div><div class="tt-stat"><span class="tt-pct">0%</span></div>`;
        el.querySelector('.tt-x').onclick = () => { el.remove(); downloads.delete(id); resumeNext(); };
        box.appendChild(el);
      }
      if (box.querySelectorAll('.tt-item:not(.queued):not(.done):not(.err)').length > 2) {
        el.classList.add('queued');
        el.querySelector('.tt-pct').textContent = 'Queued';
      }
      return el;
    };
    const updateItem = (id, name, pct) => {
      const el = document.getElementById('tt-' + id); if (!el) return;
      el.querySelector('.tt-name').textContent = name;
      el.querySelector('.tt-fill').style.width = pct + '%';
      el.querySelector('.tt-pct').textContent = pct + '%';
    };
    const doneItem = id => {
      const el = document.getElementById('tt-' + id); if (!el) return;
      el.classList.add('done'); el.querySelector('.tt-pct').textContent = 'Completed';
      setTimeout(() => { el?.remove(); downloads.delete(id); }, 3500);
      resumeNext();
    };
    const errItem = (id, msg) => {
      const el = document.getElementById('tt-' + id); if (!el) return;
      el.classList.add('err');
      el.querySelector('.tt-stat').innerHTML = `<span class="tt-pct">Failed ${msg ? '— ' + msg : ''}</span>`;
      resumeNext();
    };
    const resumeNext = () => {
      if (box.querySelectorAll('.tt-item:not(.queued):not(.done):not(.err)').length < 2) {
        const next = box.querySelector('.tt-item.queued');
        if (next) {
          const id = next.id.replace('tt-', '');
          const d = downloads.get(id);
          if (d?.resume) {
            next.classList.remove('queued');
            next.querySelector('.tt-pct').textContent = '0%';
            d.resume();
          }
        }
      }
    };

    const dlVideo = (url, id) => {
      if (!url || typeof url !== 'string') {
        console.warn('[DEV/g0d] dlVideo: invalid url', url);
        return;
      }
      id = id || Math.random().toString(36).slice(2, 10) + '_' + Date.now();
      let name = hashCode(url).toString(36) + '.mp4';
      const urlPath = url.split('?')[0];
      if (urlPath.endsWith('.mp4')) name = urlPath.split('/').pop();

      createItem(id, name);

      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        headers: { 'Referer': 'https://www.tiktok.com/' },
        onprogress: (e) => {
          if (e.lengthComputable && e.total) {
            updateItem(id, name, Math.floor(e.loaded * 100 / e.total));
          }
        },
        onload: (r) => {
          if (r.status < 200 || r.status >= 300) {
            console.warn('[DEV/g0d] dlVideo HTTP', r.status);
            errItem(id, 'HTTP ' + r.status);
            return;
          }
          const blob = r.response;
          if (!blob || blob.size === 0) { errItem(id, 'empty'); return; }
          const mime = blob.type || 'video/mp4';
          const ext = mime.split('/')[1]?.split(';')[0] || 'mp4';
          name = name.replace(/\.[^.]+$/, '.' + ext);
          updateItem(id, name, 100);
          saveBlob(blob, name);
          doneItem(id);
        },
        onerror: (e) => {
          console.warn('[DEV/g0d] dlVideo error:', e);
          errItem(id, 'network');
        },
        ontimeout: () => errItem(id, 'timeout'),
        timeout: 60000,
      });
    };

    const saveBlob = (blob, n) => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = n;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    };

    async function getTikTokVideoUrl() {
      function findVideoIdFromDom() {
        const urlMatch = location.href.match(/\/video\/(\d+)/);
        if (urlMatch) return urlMatch[1];

        const video = document.querySelector('video');
        if (video) {
          let p = video.parentElement;
          for (let i = 0; i < 15 && p; i++) {
            const btn = p.querySelector?.('[data-e2e="more-menu-icon"]');
            if (btn) {
              const id = btn.getAttribute('data-more-menu-item-id');
              if (id) return id;
            }
            p = p.parentElement;
          }
        }

        const visibleBtns = Array.from(document.querySelectorAll('[data-e2e="more-menu-icon"]'))
          .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
        if (visibleBtns.length) {
          const id = visibleBtns[visibleBtns.length - 1].getAttribute('data-more-menu-item-id');
          if (id) return id;
        }

        const el = document.querySelector('[data-video-id]');
        if (el) {
          const direct = el.getAttribute('data-video-id');
          if (direct) return direct;
        }

        if (video) {
          let pp = video.parentElement;
          for (let i = 0; i < 12 && pp; i++) {
            const link = pp.querySelector?.('a[href*="/video/"]');
            if (link) {
              const m = link.href.match(/\/video\/(\d+)/);
              if (m) return m[1];
            }
            pp = pp.parentElement;
          }
        }

        return null;
      }

      const videoId = findVideoIdFromDom();
      const videoUrl = videoId ? `https://www.tiktok.com/@_/video/${videoId}` : location.href;
      console.log('[DEV/g0d] videoId:', videoId);

      if (videoId) {
        try {
          const apiRes = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: 'GET',
              url: `https://tikwm.com/api/?url=${encodeURIComponent(videoUrl)}`,
              onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); } },
              onerror: reject,
            });
          });
          console.log('[DEV/g0d] TikWM response:', apiRes);
          if (apiRes?.code === 0 && apiRes?.data) {
            const d = apiRes.data;
            let url = d.hdplay || d.play || d.wmplay;
            if (url) {
              // ★ patch: ถ้าเป็น SD (btag=e000b0000) → เปลี่ยนเป็น HD
              if (!d.hdplay && /btag=e000b\d+/.test(url)) {
                const origUrl = url;
                url = url.replace(/btag=e000b\d+/, 'btag=e000b2000');
                console.log('[DEV/g0d] Patched btag → e000b2000');
                console.log('[DEV/g0d] Old URL:', origUrl.slice(0, 120));
                console.log('[DEV/g0d] New URL:', url.slice(0, 120));
              }
              return { url, name: (d.title || 'tiktok').slice(0, 60) };
            }
          }
        } catch(e) { console.warn('[DEV/g0d] TikWM failed:', e); }
      }

      return null;
    }

    const DL_SVG = `<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

    function injectButton() {
      const wrapper = document.querySelector('[class*="DivBasicPlayerWrapper"]')
                   || document.querySelector('[class*="DivVideoContainer"]')
                   || document.querySelector('.xgplayer-container');
      if (!wrapper) return;
      if (wrapper.querySelector('.dg-tt-btn')) return;

      const btn = document.createElement('button');
      btn.className = 'tt-btn dg-tt-btn';
      btn.title = 'Download';
      btn.innerHTML = DL_SVG;
      btn.style.top = '12px';
      btn.style.left = '50%';
      btn.style.transform = 'translateX(-50%)';
      if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';

      btn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.innerHTML = '...';
        const info = await getTikTokVideoUrl();
        btn.innerHTML = DL_SVG;
        if (!info?.url) { alert('[DEV/g0d] ไม่สามารถดึง video URL ได้'); return; }
        dlVideo(info.url, null);
      };

      wrapper.appendChild(btn);
    }

    setInterval(injectButton, REFRESH_DELAY);
    new MutationObserver(injectButton).observe(document.body, { childList: true, subtree: true });
    injectButton();
  }

  // ─── Register Plugins ─────────────────────────────────────────────────────
  const icon = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px">${d}</svg>`;

  window.DEVg0d_PLUGINS = [
    {
      name: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>') + 'MediaDownloader',
      type: 'toggle',
      key: 'devg0d-tt-downloader',
      init: initTtDownloader,
    },
  ];

  window.__dgPluginsReady = true;
  window.dispatchEvent(new Event('dg-plugins-ready'));

})();
