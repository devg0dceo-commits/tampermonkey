// DEV/g0d - Twitter/X Addon

(function () {

  // ─── VideoDownloader ──────────────────────────────────────────────────────
  function initTwitterVideoDownloader() {
    const SVG_DL   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const SVG_SPIN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:dg-tw-spin 1s linear infinite"><circle cx="12" cy="12" r="10"/></svg>`;
    const SVG_OK   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
    const SVG_ERR  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

    // Inject styles
    if (!document.getElementById('dg-tw-style')) {
      const style = document.createElement('style');
      style.id = 'dg-tw-style';
      style.textContent = `
        @keyframes dg-tw-spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        .dg-tw-btn {
          position:fixed; width:30px; height:30px;
          display:flex; align-items:center; justify-content:center;
          background:rgba(0,0,0,0.65); color:white;
          border-radius:50%; cursor:pointer;
          z-index:9999999; backdrop-filter:blur(4px);
          opacity:0.75; pointer-events:auto; border:none; outline:none;
          transition:opacity .2s ease, background .2s ease, transform .2s ease;
          box-shadow:0 1px 6px rgba(0,0,0,0.5);
        }
        .dg-tw-btn:hover {
          opacity:1 !important;
          background:rgba(29,155,240,0.92) !important;
          transform:scale(1.12);
        }
      `;
      document.head.appendChild(style);
    }

    // ── Get real video URL from React fiber ──────────────────────────────────
    function getRealVideoUrlFromFiber(videoEl) {
      try {
        const fiberKey = Object.keys(videoEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (!fiberKey) return null;
        let fiber = videoEl[fiberKey];
        let depth = 0;
        while (fiber && depth < 40) {
          const props = fiber.memoizedProps ?? fiber.pendingProps;
          if (props) {
            if (typeof props.src === 'string' && props.src.includes('video.twimg.com')) return props.src;
            if (props.source?.src?.includes('video.twimg.com')) return props.source.src;
            if (typeof props.url === 'string' && props.url.includes('video.twimg.com')) return props.url;
          }
          fiber = fiber.return;
          depth++;
        }
      } catch (e) {}
      return null;
    }

    // ── Get Tweet ID ─────────────────────────────────────────────────────────
    function getTweetId(videoEl) {
      try {
        const article = videoEl.closest('article');
        if (article) {
          const links = article.querySelectorAll('a[href*="/status/"]');
          for (const link of links) {
            const m = link.href.match(/\/status\/(\d+)/);
            if (m) return m[1];
          }
        }
      } catch (e) {}
      try {
        const m = window.location.pathname.match(/\/status\/(\d+)/);
        if (m) return m[1];
      } catch (e) {}
      return null;
    }

    // ── Get video index within tweet (multi-video support) ───────────────────
    function getVideoIndexInTweet(playerEl) {
      try {
        const article = playerEl.closest('article');
        if (!article) return 0;
        const allPlayers = Array.from(article.querySelectorAll('[data-testid="videoPlayer"]'));
        return allPlayers.indexOf(playerEl);
      } catch (e) {}
      return 0;
    }

    // ── Fetch video URL via fxtwitter API ────────────────────────────────────
    function getVideoUrl(tweetId, videoIndex) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://api.fxtwitter.com/i/status/${tweetId}`,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          onload(res) {
            try {
              const data = JSON.parse(res.responseText);
              const media = data?.tweet?.media?.videos ?? data?.tweet?.media?.all ?? [];
              const videos = media.filter(m => m.type === 'video');
              if (!videos.length) return reject(new Error('No video in tweet'));
              const videoItem = videos[videoIndex] ?? videos[0];
              const variants = (videoItem.variants ?? [])
                .filter(v => v.content_type === 'video/mp4')
                .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
              if (!variants.length) return reject(new Error('No mp4 variants'));
              resolve(variants[0].url);
            } catch (e) { reject(e); }
          },
          onerror(e) { reject(new Error('Network error: ' + e)); }
        });
      });
    }

    // ── Download ─────────────────────────────────────────────────────────────
    function downloadFile(url, filename) {
      GM_download({
        url, name: filename, saveAs: false,
        onerror() { window.open(url, '_blank'); }
      });
    }

    // ── Button state ─────────────────────────────────────────────────────────
    function setStatus(btn, state) {
      const map = {
        idle:    { icon: SVG_DL,   bg: 'rgba(0,0,0,0.65)',     opacity: '0.75', delay: 0    },
        loading: { icon: SVG_SPIN, bg: 'rgba(29,155,240,0.92)', opacity: '1',    delay: 0    },
        ok:      { icon: SVG_OK,   bg: 'rgba(76,175,80,0.92)',  opacity: '1',    delay: 2500 },
        error:   { icon: SVG_ERR,  bg: 'rgba(244,67,54,0.92)', opacity: '1',    delay: 3000 },
      };
      const s = map[state];
      btn.innerHTML = s.icon;
      btn.style.background = s.bg;
      btn.style.opacity = s.opacity;
      if (state === 'loading') btn.dataset.loading = '1';
      else delete btn.dataset.loading;
      if (s.delay) setTimeout(() => setStatus(btn, 'idle'), s.delay);
    }

    // ── Create & attach button ────────────────────────────────────────────────
    function createButton(playerEl) {
      const btn = document.createElement('button');
      btn.className = 'dg-tw-btn';
      btn.title = 'Download video';
      btn.innerHTML = SVG_DL;

      const fixedUpdate = () => {
        if (!document.body.contains(playerEl)) {
          btn.remove();
          clearInterval(interval);
          window.removeEventListener('scroll', fixedUpdate, true);
          window.removeEventListener('resize', fixedUpdate);
          return;
        }
        const r = playerEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          btn.style.display = 'flex';
          btn.style.top  = (r.top  + 8) + 'px';
          btn.style.left = (r.left + 8) + 'px';
        } else {
          btn.style.display = 'none';
        }
      };

      document.body.appendChild(btn);
      fixedUpdate();
      const interval = setInterval(fixedUpdate, 200);
      window.addEventListener('scroll', fixedUpdate, true);
      window.addEventListener('resize', fixedUpdate);

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.loading) return;

        const videoEl = playerEl.querySelector('video');
        if (!videoEl) return;

        setStatus(btn, 'loading');

        try {
          // Strategy 1: React fiber (most accurate for multi-video)
          const fiberUrl = getRealVideoUrlFromFiber(videoEl);
          if (fiberUrl) {
            const idMatch = fiberUrl.match(/\/(\d+)\//) ?? [];
            downloadFile(fiberUrl, `twitter_${idMatch[1] ?? Date.now()}.mp4`);
            setStatus(btn, 'ok');
            return;
          }

          // Strategy 2: fxtwitter API + video index
          const tweetId = getTweetId(videoEl);
          if (!tweetId) { setStatus(btn, 'error'); return; }
          const videoIndex = getVideoIndexInTweet(playerEl);
          const url = await getVideoUrl(tweetId, videoIndex);
          downloadFile(url, `twitter_${tweetId}_${videoIndex}.mp4`);
          setStatus(btn, 'ok');
        } catch (err) {
          console.error('[DEV/g0d Twitter]', err);
          setStatus(btn, 'error');
        }
      });
    }

    // ── Attach to player ──────────────────────────────────────────────────────
    function attachToPlayer(playerEl) {
      if (playerEl.dataset.dgTw) return;
      playerEl.dataset.dgTw = '1';
      createButton(playerEl);
    }

    function scan() {
      document.querySelectorAll('[data-testid="videoPlayer"]').forEach(attachToPlayer);
    }

    setTimeout(scan, 800);
    setTimeout(scan, 2000);

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.dataset?.testid === 'videoPlayer') setTimeout(() => attachToPlayer(node), 300);
          node.querySelectorAll?.('[data-testid="videoPlayer"]').forEach(p => setTimeout(() => attachToPlayer(p), 300));
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ─── ContentWarningRemover ────────────────────────────────────────────────
  function initContentWarningRemover() {
    const waitValue = (func, timeout = 10000) =>
      new Promise((resolve, reject) => {
        const val = func();
        if (val) { resolve(val); return; }
        const timeoutTimer = setTimeout(() => { clearInterval(timer); reject(); }, timeout);
        const timer = setInterval(() => {
          const val = func();
          if (val) { clearTimeout(timeoutTimer); clearInterval(timer); resolve(val); }
        }, 500);
      });

    const findBlurCssRule = () => {
      for (const ss of document.styleSheets) {
        try {
          for (const rule of ss.cssRules) {
            if (!(rule instanceof CSSStyleRule)) continue;
            if (rule.style.filter === 'blur(30px)') return rule;
          }
        } catch (e) {}
      }
    };

    waitValue(findBlurCssRule).then(rule => {
      if (!rule) { console.warn('[DEV/g0d] trcw: css rule not found'); return; }
      const style = document.createElement('style');
      style.textContent = `
        ${rule.selectorText} { filter: none !important; }
        ${rule.selectorText} + div { display: none !important; }
      `;
      document.head.appendChild(style);
      console.log('[DEV/g0d] trcw: done', rule.selectorText);
    }).catch(() => console.warn('[DEV/g0d] trcw: timed out'));
  }

  // ─── Register Plugins ─────────────────────────────────────────────────────
  window.DEVg0d_PLUGINS = [
    {
      name: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>VideoDownloader',
      type: 'toggle',
      key: 'devg0d-tw-video',
      init: initTwitterVideoDownloader,
    },
    {
      name: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><rect x="3" y="3" width="18" height="18" rx="2"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="bold" fill="#8b949e" stroke="none" font-family="Arial,sans-serif">18+</text></svg>ContentWarning',
      type: 'toggle',
      key: 'devg0d-tw-cw',
      init: initContentWarningRemover,
    },
  ];

})();
