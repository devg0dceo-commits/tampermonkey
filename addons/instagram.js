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

  // ─── 3. Reels Downloader ──────────────────────────────────────────────────
  function initIgReelsDownloader() {

    const DL_SVG   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    const OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;

    const style = document.createElement('style');
    style.textContent = `
      .dg-reel-wrap{position:absolute;right:40px;top:15px;display:flex;flex-direction:column;gap:6px;z-index:9999;line-height:0}
      .dg-reel-wrap button{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.92);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1a1a1a;box-shadow:0 1px 6px rgba(0,0,0,.25);transition:transform .15s,background .15s;padding:0}
      .dg-reel-wrap button:hover{background:#fff;transform:scale(1.1)}
      .dg-reel-wrap button svg{width:16px;height:16px}
    `;
    document.head.appendChild(style);

    function fetchReelMedia(shortcode) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=%7B%22shortcode%22:%22${shortcode}%22%7D`,
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 7 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.60 Mobile Safari/537.36 Instagram 307.0.0.34.111' },
          onload: res => {
            try {
              const obj = JSON.parse(res.responseText);
              const media = obj.data?.shortcode_media ?? obj.data;
              if (media?.video_url) resolve({ url: media.video_url, ext: 'mp4' });
              else reject('no video');
            } catch(e) { reject(e); }
          },
          onerror: reject,
        });
      });
    }

    function injectReelButtons(container) {
      if (container.querySelector('.dg-reel-wrap')) return;

      Array.from(container.children).forEach(child => {
        if (getComputedStyle(child).position === 'static') child.style.position = 'relative';
      });

      const wrap = document.createElement('div');
      wrap.className = 'dg-reel-wrap';

      const getShortcode = () => location.href.split('?')[0].split('instagram.com/reels/').at(-1).replace(/\//g, '');

      const dlBtn = document.createElement('button');
      dlBtn.title = 'Download'; dlBtn.innerHTML = DL_SVG;
      dlBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const sc = getShortcode(); if (!sc) return;
        try {
          const m = await fetchReelMedia(sc);
          triggerDownload(m.url, m.ext);
        } catch(e) { console.error('[DEV/g0d] reel download error:', e); }
      };

      const openBtn = document.createElement('button');
      openBtn.title = 'Open in new tab'; openBtn.innerHTML = OPEN_SVG;
      openBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const sc = getShortcode(); if (!sc) return;
        try {
          const m = await fetchReelMedia(sc);
          window.open(m.url, '_blank');
        } catch(e) {}
      };

      wrap.append(dlBtn, openBtn);
      if (container.children[0]) container.children[0].appendChild(wrap);
      else container.appendChild(wrap);
    }

    function scan() {
      if (!location.pathname.startsWith('/reels/')) return;
      document.querySelectorAll('div[aria-busy][tabindex] > div').forEach(el => {
        if (el.offsetWidth > window.innerWidth * 0.8 &&
            el.offsetHeight > window.innerHeight * 0.8 &&
            el.querySelector('video')) {
          injectReelButtons(el);
        }
      });
    }

    let lastPath = '';
    function checkReelPage() {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      if (location.pathname.startsWith('/reels/')) {
        document.querySelectorAll('.dg-reel-wrap').forEach(el => el.remove());
        let attempts = 0;
        const iv = setInterval(() => {
          scan();
          if (document.querySelector('.dg-reel-wrap') || ++attempts > 20) clearInterval(iv);
        }, 250);
      }
    }

    setInterval(checkReelPage, 500);
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

  // ─── 2. Content Downloader (feed posts, reels) ────────────────────────────
  function initIgContentDownloader() {

    function getShortcode(article) {
      for (const a of article.querySelectorAll('a[href]')) {
        const m = a.href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        if (m) return m[2];
      }
      const m = location.pathname.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
      return m ? m[2] : null;
    }

    function fetchMediaByShortcode(shortcode) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=%7B%22shortcode%22:%22${shortcode}%22%7D`,
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 7 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.60 Mobile Safari/537.36 Instagram 307.0.0.34.111' },
          onload: res => {
            try {
              const obj = JSON.parse(res.responseText);
              if (obj.status === 'fail') { reject('fail'); return; }
              resolve(obj.data?.shortcode_media ?? obj.data);
            } catch(e) { reject(e); }
          },
          onerror: reject,
        });
      });
    }

    function fetchMediaByQueryID(shortcode) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://www.instagram.com/graphql/query/?query_id=9496392173716084&variables={%22shortcode%22:%22${shortcode}%22,%22__relay_internal__pv__PolarisFeedShareMenurelayprovider%22:true,%22__relay_internal__pv__PolarisIsLoggedInrelayprovider%22:true}`,
          onload: res => {
            try { resolve(JSON.parse(res.responseText).data?.xdt_api__v1__media__shortcode__web_info?.items?.[0]); }
            catch(e) { reject(e); }
          },
          onerror: reject,
        });
      });
    }

    async function getMediaUrl(shortcode, openOnly = false) {
      let media = await fetchMediaByShortcode(shortcode).catch(() => null);
      if (media) {
        if (media.video_url) return { url: media.video_url, ext: 'mp4' };
        if (media.edge_sidecar_to_children) {
          const node = media.edge_sidecar_to_children.edges[0]?.node;
          if (node?.video_url) return { url: node.video_url, ext: 'mp4' };
          if (node?.display_url) return { url: node.display_url, ext: 'jpg' };
        }
        const imgUrl = media.display_resources?.at(-1)?.src || media.display_url;
        if (imgUrl) return { url: imgUrl, ext: 'jpg' };
      }
      const item = await fetchMediaByQueryID(shortcode).catch(() => null);
      if (item?.video_versions?.length) return { url: item.video_versions[0].url, ext: 'mp4' };
      if (item?.image_versions2?.candidates?.length) return { url: item.image_versions2.candidates[0].url, ext: 'jpg' };
      return null;
    }

    const DL_SVG   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    const OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;

    const style = document.createElement('style');
    style.textContent = `
      .dg-feed-wrap{position:absolute;top:12px;right:12px;display:flex;flex-flow:row-reverse;gap:6px;z-index:9999;line-height:0}
      .dg-feed-wrap button{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.92);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#1a1a1a;box-shadow:0 1px 6px rgba(0,0,0,.25);transition:transform .15s,background .15s;padding:0}
      .dg-feed-wrap button:hover{background:#fff;transform:scale(1.1)}
      .dg-feed-wrap button svg{width:16px;height:16px}
    `;
    document.head.appendChild(style);

    function injectFeedButtons(article) {
      if (article.getAttribute('data-dg-feed')) return;
      if (article.classList.contains('x1iyjqo2')) return;
      article.setAttribute('data-dg-feed', '1');

      const tagName = article.tagName;
      const childEls = Array.from(article.querySelectorAll(':scope > div > div'));
      if (!childEls.length) return;

      const targetIdx = (tagName === 'DIV') ? 0 : Math.max(0, childEls.length - 2);
      const insertEl = childEls[targetIdx];
      if (!insertEl) return;

      insertEl.style.position = 'relative';

      const resourceLayout = childEls.find(el => el.offsetWidth > 100 && el.offsetHeight > 100);
      const isNewPostStyle = resourceLayout
        ? Array.from(resourceLayout.querySelectorAll('a[role="link"][tabindex="0"][href^="/"]'))
            .some(a => !a.getAttribute('href').startsWith('/p/') && !a.getAttribute('href').startsWith('/reels/'))
        : false;

      const wrap = document.createElement('div');
      wrap.className = 'dg-feed-wrap';
      wrap.style.top = isNewPostStyle ? '45px' : '12px';

      const dlBtn = document.createElement('button');
      dlBtn.title = 'Download'; dlBtn.innerHTML = DL_SVG;
      dlBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const sc = getShortcode(article); if (!sc) return;
        const m = await getMediaUrl(sc);
        if (m) triggerDownload(m.url, m.ext);
      };

      const openBtn = document.createElement('button');
      openBtn.title = 'Open in new tab'; openBtn.innerHTML = OPEN_SVG;
      openBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const sc = getShortcode(article); if (!sc) return;
        const m = await getMediaUrl(sc);
        if (m) window.open(m.url, '_blank');
      };

      wrap.append(dlBtn, openBtn);
      insertEl.appendChild(wrap);
    }

    function scan() {
      document.querySelectorAll('article:not([data-dg-feed])').forEach(el => {
        if (el.offsetHeight > 0 && el.offsetWidth > 0) injectFeedButtons(el);
      });
    }

    setInterval(scan, 1000);
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
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
      name: icon('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#8b949e"/>') + 'ContentDownloader',
      type: 'toggle',
      key: 'devg0d-ig-content',
      init: initIgContentDownloader,
    },
    {
      name: icon('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>') + 'ReelsDownloader',
      type: 'toggle',
      key: 'devg0d-ig-reels',
      init: initIgReelsDownloader,
    },
    {
      name: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>') + 'AllowSave',
      type: 'toggle',
      key: 'devg0d-ig-allowsave',
      init: initIgAllowSave,
    },
  ];

})();
