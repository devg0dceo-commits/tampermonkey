// DEV/g0d - Instagram Addon

(function () {

  // ─── Shared helpers ───────────────────────────────────────────────────────
  function getAppID() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      const m = s.textContent.match(/"APP_ID":"(\d+)"/i); if (m) return m[1];
    }
    for (const s of document.querySelectorAll('body > script')) {
      const m = s.textContent.match(/"X-IG-App-ID":"(\d+)"/i); if (m) return m[1];
    }
    return '936619743392459';
  }

  async function triggerDownload(url, ext) {
    const filename = `ig_${Date.now()}.${ext}`;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch(e) { window.open(url, '_blank'); }
  }

  // ─── 1. Story Downloader ──────────────────────────────────────────────────
  function initIgStorySaver() {

    function getStoryUsername() {
      return location.pathname.split('/').filter(s => s.length > 0).at(1);
    }

    function getStoryUrlId() {
      return location.pathname.split('/').filter(s => /^[0-9]{10,}$/.test(s)).at(-1);
    }

    function getStoryProgressIndex() {
      const bars = document.querySelectorAll('div.x1xmf6yo > div');
      let idx = 0;
      bars.forEach((bar, i) => { if (bar.children.length > 0) idx = i; });
      return idx;
    }

    async function fetchStoryMedia() {
      const username = getStoryUsername();
      if (!username) return null;

      const userRes = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
          headers: { 'X-IG-App-ID': getAppID() },
          onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); } },
          onerror: reject,
        });
      });

      const userId = userRes?.data?.user?.pk || userRes?.data?.user?.id;
      if (!userId) return null;

      const storiesRes = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://www.instagram.com/graphql/query/?query_hash=15463e8449a83d3d60b06be7e90627c7&variables=%7B%22reel_ids%22:%5B%22${userId}%22%5D,%22precomposed_overlay%22:false%7D`,
          onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); } },
          onerror: reject,
        });
      });

      const items = storiesRes?.data?.reels_media?.[0]?.items;
      if (!items?.length) return null;

      const urlId = getStoryUrlId();
      let item = urlId ? items.find(i => i.id == urlId) : null;
      if (!item) { const idx = getStoryProgressIndex(); item = items[idx] || items[0]; }
      if (!item) return null;

      if (item.video_resources?.length) return { url: item.video_resources[0].src, ext: 'mp4' };
      if (item.display_resources?.length) return { url: item.display_resources.at(-1).src, ext: 'jpg' };
      if (item.display_url) return { url: item.display_url, ext: 'jpg' };
      return null;
    }

    async function detectCurrentMedia() {
      try { const m = await fetchStoryMedia(); if (m) return m; } catch(e) {}
      const video = document.querySelector('body > div section video[playsinline]');
      if (video && video.src && !video.src.startsWith('blob:')) return { url: video.src, ext: 'mp4' };
      const imgEl = document.querySelector('body > div section img[referrerpolicy][class]')
                 || document.querySelector('body > div section img._aa63');
      if (imgEl) {
        const srcset = imgEl.getAttribute('srcset');
        const url = srcset ? srcset.split(',')[0].split(' ')[0] : imgEl.src;
        if (url) return { url, ext: 'jpg' };
      }
      return null;
    }

    async function downloadCurrent() {
      const media = await detectCurrentMedia();
      if (!media) return;
      const username = getStoryUsername() || 'unknown';
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${username}_${ts}.${media.ext}`;
      try {
        const res = await fetch(media.url);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch(e) { window.open(media.url, '_blank'); }
    }

    const style = document.createElement('style');
    style.textContent = `
      #igStoryBtnWrap{display:flex;gap:0;align-items:center}
      .igStoryBtn{border:none;background:transparent;color:white;cursor:pointer;z-index:9999;
        width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;transition:opacity .2s}
      .igStoryBtn:hover{opacity:.7}
      .igStoryBtn svg{width:20px;height:20px}
    `;
    document.head.appendChild(style);

    function injectButton() {
      if (document.getElementById('igStoryBtnWrap')) return null;
      const topBar = Array.from(document.querySelectorAll('div.x1xmf6yo'))
        .find(b => b instanceof HTMLElement && b.offsetHeight > 0);
      if (!topBar) return null;

      const wrap = document.createElement('div');
      wrap.id = 'igStoryBtnWrap';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'igStoryBtn'; dlBtn.title = 'Download';
      dlBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
      dlBtn.addEventListener('click', (e) => { e.stopPropagation(); downloadCurrent(); });

      const openBtn = document.createElement('button');
      openBtn.className = 'igStoryBtn'; openBtn.title = 'Open source URL';
      openBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;
      openBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const media = await detectCurrentMedia();
        if (media?.url) window.open(media.url, '_blank');
      });

      wrap.append(dlBtn, openBtn);
      topBar.appendChild(wrap);
      return wrap;
    }

    let lastPath = '', pollIv = null;
    function checkPage() {
      const path = location.pathname;
      if (path === lastPath) return;
      lastPath = path;
      document.getElementById('igStoryBtnWrap')?.remove();
      clearInterval(pollIv);
      if (!/\/stories\//.test(path)) return;
      let attempts = 0;
      pollIv = setInterval(() => {
        if (injectButton() || ++attempts > 20) clearInterval(pollIv);
      }, 500);
    }

    new MutationObserver(checkPage).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(checkPage, 800);
    checkPage();
  }

  // ─── Allow Save ───────────────────────────────────────────────────────────
  function initIgAllowSave() {
    (function() {
      function allowSave() {
        document.querySelectorAll('img').forEach(img => {
          img.removeAttribute('srcset'); img.removeAttribute('sizes');
          const parent = img.parentElement;
          if (!parent || parent.tagName !== 'DIV') return;
          const next = parent.nextElementSibling;
          if (!next || next.tagName !== 'DIV') return;
          if (next.nextElementSibling?.className) return;
          next.style.display = next.children.length === 0 ? 'none' : '';
        });
      }
      const obs = new MutationObserver(() => { obs.disconnect(); allowSave(); obs.observe(document, { attributes: true, childList: true, subtree: true }); });
      obs.observe(document, { attributes: true, childList: true, subtree: true });
      allowSave();
    })();
  }

  // ─── Register Plugins ─────────────────────────────────────────────────────
  const icon = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px">${d}</svg>`;

  window.DEVg0d_PLUGINS = [
    {
      name: icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>') + 'StorySaver',
      type: 'toggle',
      key: 'devg0d-ig-story',
      init: initIgStorySaver,
    },
    {
      name: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>') + 'AllowSave',
      type: 'toggle',
      key: 'devg0d-ig-allowsave',
      init: initIgAllowSave,
    },
  ];

})();
