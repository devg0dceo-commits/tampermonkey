// DEV/g0d - VK Addon

(function () {

  // ─── VideoDownloader ──────────────────────────────────────────────────────
  function initVkVideoDownloader() {
    const SVG_DL   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const SVG_SPIN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:dg-vk-spin 1s linear infinite"><circle cx="12" cy="12" r="10"/></svg>`;
    const SVG_ERR  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

    // Inject styles
    if (!document.getElementById('dg-vk-video-style')) {
      const style = document.createElement('style');
      style.id = 'dg-vk-video-style';
      style.textContent = `
        @keyframes dg-vk-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .dg-vk-dl-btn {
          position:absolute; top:8px; left:8px; width:30px; height:30px;
          display:flex; align-items:center; justify-content:center;
          background:rgba(0,0,0,0.65); color:white; border-radius:50%; cursor:pointer;
          z-index:9999; backdrop-filter:blur(4px); opacity:0.8; border:none; outline:none;
          transition:opacity .2s, background .2s, transform .2s;
          box-shadow:0 1px 6px rgba(0,0,0,0.5);
        }
        .dg-vk-dl-btn:hover { opacity:1 !important; background:rgba(0,119,255,0.92) !important; transform:scale(1.12); }
        #dg-vk-dl-box { position:fixed; bottom:20px; right:20px; z-index:9999999; display:flex; flex-direction:column; gap:8px; max-height:400px; overflow-y:auto; font-family:system-ui,sans-serif; }
        .dg-vk-item { background:rgba(30,30,30,.95); backdrop-filter:blur(10px); border-radius:12px; padding:12px 16px; min-width:260px; box-shadow:0 4px 20px rgba(0,0,0,.3); animation:dg-vk-slideIn .3s; }
        @keyframes dg-vk-slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        .dg-vk-item.done { animation:dg-vk-fadeOut .5s 3s forwards; }
        @keyframes dg-vk-fadeOut { to{opacity:0;transform:translateX(20px)} }
        .dg-vk-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .dg-vk-name { color:#fff; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px; }
        .dg-vk-close { background:none; border:none; color:#888; font-size:18px; cursor:pointer; padding:0; line-height:1; }
        .dg-vk-close:hover { color:#fff; }
        .dg-vk-bar { height:6px; background:rgba(255,255,255,.1); border-radius:3px; overflow:hidden; margin-bottom:6px; }
        .dg-vk-fill { height:100%; background:linear-gradient(90deg,#0077ff,#00b4ff); border-radius:3px; transition:width .3s; width:0; }
        .dg-vk-item.done .dg-vk-fill { background:linear-gradient(90deg,#4CAF50,#8BC34A); width:100%; }
        .dg-vk-item.err .dg-vk-fill { background:#f44336; width:100%; }
        .dg-vk-stat { display:flex; justify-content:space-between; align-items:center; }
        .dg-vk-pct { color:#aaa; font-size:12px; }
        .dg-vk-retry { background:none; border:none; color:#0077ff; font-size:12px; cursor:pointer; text-decoration:underline; }
      `;
      document.head.appendChild(style);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    function getCurrentVideoId() {
      try { const a = document.querySelector('.VideoRecomsItem--active'); if (a?.dataset?.vid) return a.dataset.vid; } catch (e) {}
      try { const w = document.querySelector('[id^="video_box_wrap"]'); if (w) { const m = w.id.match(/video_box_wrap(\d+_\d+)/); if (m) return m[1]; } } catch (e) {}
      try { const m = window.location.pathname.match(/\/video(-?\d+_\d+)/); if (m) return m[1].replace(/^-/, ''); } catch (e) {}
      return null;
    }

    function getVideoTitle() {
      return (
        document.querySelector('[data-testid="video_modal_title"]')?.textContent?.trim() ||
        document.querySelector('#mv_min_title')?.textContent?.trim() ||
        document.querySelector('.mv_title')?.textContent?.trim() ||
        'vk_video'
      ).replace(/[/\\?%*:|"<>]/g, '_');
    }

    function getSourcesFromPlayer() {
      const sources = {};
      try {
        const pageWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        const vars = pageWindow.mvcur?.player?.vars;
        if (!vars) return sources;
        for (const key of Object.keys(vars)) {
          const m = key.match(/^url(\d+)$/);
          if (m && typeof vars[key] === 'string' && vars[key].startsWith('http')) {
            sources[m[1] + 'p'] = vars[key];
          }
        }
      } catch (e) {}
      return sources;
    }

    function fetchVideoSources(videoId) {
      return new Promise((resolve, reject) => {
        const [ownerId, vid] = videoId.split('_');
        if (!ownerId || !vid) return reject(new Error('Invalid video ID'));
        GM_xmlhttpRequest({
          method: 'POST',
          url: 'https://vk.com/al_video.php',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
          data: `act=show&al=1&video=${ownerId}_${vid}&module=videoview`,
          onload(res) {
            try {
              const sources = {};
              const re = /"url(\d+)"\s*:\s*"(https?:[^"]+)"/g;
              let m;
              while ((m = re.exec(res.responseText)) !== null) {
                const url = m[2].replace(/\\/g, '');
                if (url.includes('.mp4') || url.includes('video')) sources[m[1] + 'p'] = url;
              }
              if (Object.keys(sources).length > 0) return resolve(sources);
              reject(new Error('No sources found'));
            } catch (e) { reject(e); }
          },
          onerror() { reject(new Error('Network error')); }
        });
      });
    }

    // ── Progress UI ───────────────────────────────────────────────────────────
    let dlBox = null;
    function getDlBox() {
      if (!dlBox || !document.body.contains(dlBox)) {
        dlBox = document.createElement('div'); dlBox.id = 'dg-vk-dl-box'; document.body.appendChild(dlBox);
      }
      return dlBox;
    }

    function createDlItem(id, name) {
      const box = getDlBox();
      let el = document.getElementById('dg-vk-dl-' + id);
      if (!el) {
        el = document.createElement('div'); el.id = 'dg-vk-dl-' + id; el.className = 'dg-vk-item';
        el.innerHTML = `<div class="dg-vk-hdr"><span class="dg-vk-name">${name}</span><button class="dg-vk-close">&times;</button></div><div class="dg-vk-bar"><div class="dg-vk-fill"></div></div><div class="dg-vk-stat"><span class="dg-vk-pct">0%</span></div>`;
        el.querySelector('.dg-vk-close').onclick = () => el.remove();
        box.appendChild(el);
      }
      return el;
    }

    function updateDlItem(id, pct) {
      const el = document.getElementById('dg-vk-dl-' + id); if (!el) return;
      el.querySelector('.dg-vk-fill').style.width = pct + '%';
      el.querySelector('.dg-vk-pct').textContent = pct + '%';
    }

    function doneDlItem(id) {
      const el = document.getElementById('dg-vk-dl-' + id); if (!el) return;
      el.classList.add('done'); el.querySelector('.dg-vk-pct').textContent = 'Completed ✓';
      setTimeout(() => el?.remove(), 3500);
    }

    function errDlItem(id, url, name) {
      const el = document.getElementById('dg-vk-dl-' + id); if (!el) return;
      el.classList.add('err');
      el.querySelector('.dg-vk-stat').innerHTML = `<span class="dg-vk-pct">Failed</span><button class="dg-vk-retry">Retry</button>`;
      el.querySelector('.dg-vk-retry').onclick = () => {
        el.classList.remove('err'); el.querySelector('.dg-vk-fill').style.width = '0';
        el.querySelector('.dg-vk-stat').innerHTML = '<span class="dg-vk-pct">0%</span>';
        downloadWithProgress(url, name, id);
      };
    }

    function downloadWithProgress(url, filename, id) {
      id = id || Math.random().toString(36).slice(2, 10);
      createDlItem(id, filename);
      GM_xmlhttpRequest({
        method: 'GET', url, responseType: 'blob',
        onprogress(e) {
          if (e.lengthComputable && e.total > 0) updateDlItem(id, Math.min(Math.floor(e.loaded * 100 / e.total), 99));
        },
        onload(res) {
          if (res.status < 200 || res.status >= 300) { errDlItem(id, url, filename); return; }
          try {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(res.response); a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            doneDlItem(id);
          } catch (e) { errDlItem(id, url, filename); }
        },
        onerror() { errDlItem(id, url, filename); },
        ontimeout() { errDlItem(id, url, filename); }
      });
    }

    function downloadBest(sources, title) {
      const order = ['2160', '1440', '1080', '720', '480', '360', '240', '144'];
      let url = null, label = '';
      for (const q of order) { if (sources[q + 'p']) { url = sources[q + 'p']; label = q + 'p'; break; } }
      if (!url) { const f = Object.entries(sources)[0]; if (f) { url = f[1]; label = f[0]; } }
      if (!url) return;
      downloadWithProgress(url, `${title}_${label}.mp4`);
    }

    // ── Button state ──────────────────────────────────────────────────────────
    function setBtnState(btn, state) {
      const map = {
        idle:    { icon: SVG_DL,   bg: 'rgba(0,0,0,0.65)',    opacity: '0.8' },
        loading: { icon: SVG_SPIN, bg: 'rgba(0,119,255,0.9)', opacity: '1'   },
        error:   { icon: SVG_ERR,  bg: 'rgba(244,67,54,0.9)', opacity: '1'   },
      };
      const s = map[state] ?? map.idle;
      btn.innerHTML = s.icon; btn.style.background = s.bg; btn.style.opacity = s.opacity;
      if (state === 'loading') btn.dataset.loading = '1'; else delete btn.dataset.loading;
      if (state === 'error') setTimeout(() => setBtnState(btn, 'idle'), 3500);
    }

    // ── Attach button ─────────────────────────────────────────────────────────
    function attachButton(playerEl) {
      if (playerEl.dataset.dgVk) return;
      playerEl.dataset.dgVk = '1';
      if (getComputedStyle(playerEl).position === 'static') playerEl.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'dg-vk-dl-btn'; btn.title = 'Download video'; btn.innerHTML = SVG_DL;

      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (btn.dataset.loading) return;
        setBtnState(btn, 'loading');
        try {
          const playerSources = getSourcesFromPlayer();
          if (Object.keys(playerSources).length > 0) {
            setBtnState(btn, 'idle'); downloadBest(playerSources, getVideoTitle()); return;
          }
          const videoId = getCurrentVideoId();
          if (!videoId) { setBtnState(btn, 'error'); return; }
          const sources = await fetchVideoSources(videoId);
          setBtnState(btn, 'idle'); downloadBest(sources, getVideoTitle());
        } catch (err) {
          console.error('[DEV/g0d VK]', err); setBtnState(btn, 'error');
        }
      });

      playerEl.appendChild(btn);
    }

    function scan() {
      const player = document.getElementById('video_player');
      if (player) attachButton(player);
    }

    setTimeout(scan, 1000);
    new MutationObserver(() => {
      const player = document.getElementById('video_player');
      if (player && !player.dataset.dgVk) attachButton(player);
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ─── BlurRemover ──────────────────────────────────────────────────────────
  function initVkBlurRemover() {
    if (document.getElementById('dg-vk-blur-style')) return;
    const style = document.createElement('style');
    style.id = 'dg-vk-blur-style';
    style.textContent = `
      .vkitImageSingle__imageBlur--rN9MH { filter: none !important; }
      .vkitgetColorClass__colorTextContrastThemed--ugaQC.vkitOverlay__root--VPuXG { display: none !important; }
      .VideoRestriction--blur .VideoRecomsItem__thumb { filter: none !important; }
      .VideoRestriction__boxWrap { display: none !important; }
      [data-testid="video_card_restriction_overlay"] { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  // ─── Register Plugins ─────────────────────────────────────────────────────
  window.DEVg0d_PLUGINS = [
    {
      label: 'VideoDownloader',
      name: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>VideoDownloader',
      type: 'toggle',
      key: 'devg0d-vk-video',
      init: initVkVideoDownloader,
    },
    {
      label: 'BlurRemover',
      name: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><rect x="3" y="3" width="18" height="18" rx="2"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="bold" fill="#8b949e" stroke="none" font-family="Arial,sans-serif">18+</text></svg>BlurRemover',
      type: 'toggle',
      key: 'devg0d-vk-blur',
      init: initVkBlurRemover,
    },
  ];

})();
