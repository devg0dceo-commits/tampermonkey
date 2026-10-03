// DEV/g0d - Instagram Addon

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  //  SHARED HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  // ─── URL change detection (SPA-safe) ──────────────────────────────────
  const urlChangeCallbacks = [];
  function onUrlChange(fn) { urlChangeCallbacks.push(fn); }
  let __dgLastUrl = location.href;
  function fireUrlChange() {
    if (location.href === __dgLastUrl) return;
    __dgLastUrl = location.href;
    urlChangeCallbacks.forEach(fn => { try { fn(); } catch (e) { console.error('[DEV/g0d]', e); } });
  }
  // hook pushState/replaceState
  ;['pushState', 'replaceState'].forEach(m => {
    const orig = history[m];
    history[m] = function () {
      const r = orig.apply(this, arguments);
      setTimeout(fireUrlChange, 0);
      return r;
    };
  });
  window.addEventListener('popstate', () => setTimeout(fireUrlChange, 0));
  // poll fallback (เผื่อ IG เปลี่ยน URL ผ่านวิธีอื่น)
  setInterval(fireUrlChange, 400);

  // ─── ShieldBypass (คลิกปุ่มไม่ให้ IG แย่ง) ───────────────────────────────
  ;['mousedown', 'mouseup', 'click'].forEach(type => {
    window.addEventListener(type, (e) => {
      if (!e.isTrusted) return;
      const els = document.querySelectorAll('.dg-feed-wrap button, .dg-reel-wrap button, .igStoryBtn');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          e.stopPropagation();
          e.preventDefault();
          el.dispatchEvent(new MouseEvent(e.type, { bubbles: false, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
          return;
        }
      }
    }, true);
  });

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

  // ─── React fiber: ดึง video URL จริง (ใช้ร่วมหลาย plugin) ─────────────
  function getVideoRealUrl(video) {
    const fiberKey = Object.keys(video).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;
    try {
      let fiber = video[fiberKey];
      for (let i = 0; i < 30 && fiber; i++) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props) {
          const impl = props.implementations
            ?? props.children?.[0]?.props?.children?.props?.implementations
            ?? props.children?.props?.children?.props?.implementations;
          if (impl) {
            for (const idx of [1, 0, 2]) {
              const s = impl[idx]?.data;
              const u = s?.hdSrc || s?.sdSrc || s?.hd_src || s?.sd_src;
              if (u) return u;
            }
          }
          if (props.src && !props.src.startsWith('blob:')) return props.src;
          const vd = props.videoData;
          if (vd) { const u = vd.hd_src || vd.sd_src || vd.$1?.hd_src || vd.$1?.sd_src; if (u) return u; }
        }
        fiber = fiber.return;
      }
    } catch(e) {}
    const propsKey = fiberKey.replace('__reactFiber', '__reactProps');
    let el = video;
    for (let i = 0; i < 8; i++) {
      el = el.parentElement; if (!el) break;
      const p = el[propsKey]; if (!p) continue;
      const impl = p.children?.[0]?.props?.children?.props?.implementations ?? p.children?.props?.children?.props?.implementations;
      if (impl) {
        for (const idx of [1, 0, 2]) {
          const s = impl[idx]?.data;
          const u = s?.hdSrc || s?.sdSrc || s?.hd_src || s?.sd_src;
          if (u) return u;
        }
      }
    }
    return null;
  }

  // ─── หา media URL ปัจจุบันของ story ─────────────────────────────────────
  // ใช้ร่วมกับ story + highlight
  function findCurrentStoryMedia() {
    // 1) video ที่มองเห็นได้
    const videos = Array.from(document.querySelectorAll('video'))
      .filter(v => v.offsetWidth > 100 && v.offsetHeight > 100)
      .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight));
    if (videos[0]) {
      const url = getVideoRealUrl(videos[0]);
      if (url) return { url, ext: 'mp4' };
    }
    // 2) img ขนาดใหญ่
    const imgs = Array.from(document.querySelectorAll('img'))
      .filter(i => i.offsetWidth > 200 && i.naturalWidth > 400 && i.src && i.src.includes('cdninstagram'))
      .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
    if (imgs[0]) return { url: imgs[0].src, ext: 'jpg' };
    return null;
  }

  // ─── หา topBar ของ story/highlight (หลาย fallback) ───────────────────────
  function findStoryTopBar() {
    // 1) IG story ปกติ — div.x1xmf6yo
    let bar = Array.from(document.querySelectorAll('div.x1xmf6yo'))
      .find(b => b instanceof HTMLElement && b.offsetHeight > 0);
    if (bar) return bar;

    // 2) หาจาก progress bar (div ที่มีลูกเป็น progress segments)
    const progressBar = document.querySelector('div[role="progressbar"]')
      || Array.from(document.querySelectorAll('div')).find(d =>
        d.querySelectorAll(':scope > div > div').length > 3 &&
        d.offsetHeight > 0 && d.offsetHeight < 20
      );
    if (progressBar) {
      let p = progressBar.parentElement;
      for (let i = 0; i < 3 && p; i++) {
        if (p.querySelectorAll('[role="button"], button').length >= 1) return p;
        p = p.parentElement;
      }
    }

    // 3) หาจากปุ่ม close
    const closeBtn = document.querySelector('div[role="button"][aria-label="Close"], svg[aria-label="Close"]');
    if (closeBtn) {
      let p = closeBtn;
      for (let i = 0; i < 5 && p; i++) {
        if (p.querySelectorAll('[role="button"], button').length >= 2) return p;
        p = p.parentElement;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 1: StorySaver (+ Highlight)
  // ═══════════════════════════════════════════════════════════════════════
  function initIgStorySaver() {
    if (window.__dgIgStoryInit) return;
    window.__dgIgStoryInit = true;

    function getStoryUsername() {
      // /stories/username/12345
      const parts = location.pathname.split('/').filter(Boolean);
      if (parts[0] === 'stories' && parts[1] && parts[1] !== 'highlights') return parts[1];
      // /stories/highlights/12345
      if (parts[0] === 'stories' && parts[1] === 'highlights') return 'highlight_' + (parts[2] || '');
      return parts[0] || 'unknown';
    }

    function getStoryId() {
      const parts = location.pathname.split('/').filter(Boolean);
      return parts.at(-1);
    }

    function getStoryProgressIndex() {
      const bars = document.querySelectorAll('div[role="progressbar"] > div, div.x1xmf6yo > div');
      let idx = 0;
      bars.forEach((bar, i) => { if (bar.children.length > 0) idx = i; });
      return idx;
    }

    async function fetchStoryMedia() {
      const username = getStoryUsername();
      if (!username || username.startsWith('highlight_')) return null;

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

      const urlId = getStoryId();
      let item = urlId ? items.find(i => i.id == urlId) : null;
      if (!item) { const idx = getStoryProgressIndex(); item = items[idx] || items[0]; }
      if (!item) return null;

      if (item.video_resources?.length) return { url: item.video_resources[0].src, ext: 'mp4' };
      if (item.display_resources?.length) return { url: item.display_resources.at(-1).src, ext: 'jpg' };
      if (item.display_url) return { url: item.display_url, ext: 'jpg' };
      return null;
    }

    async function detectCurrentMedia() {
      // ลอง API ก่อน (ถ้าไม่ใช่ highlight)
      try {
        const m = await fetchStoryMedia();
        if (m) return m;
      } catch(e) {
        console.warn('[DEV/g0d] fetchStoryMedia failed, falling back to DOM:', e);
      }
      // DOM fallback — ใช้ได้ทั้ง story และ highlight
      return findCurrentStoryMedia();
    }

    async function downloadCurrent() {
      const media = await detectCurrentMedia();
      if (!media) { console.warn('[DEV/g0d] No media found'); return; }
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
      if (document.getElementById('igStoryBtnWrap')) return true;
      const topBar = findStoryTopBar();
      if (!topBar) return false;

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
      return true;
    }

    // ─── Story mode detection: URL เป็น /stories/ หรือมี story UI ปรากฏ ───
    function isStoryView() {
      if (/\/stories\//.test(location.pathname)) return true;
      // บางที highlight เปิดใน modal โดย URL ไม่เปลี่ยน
      // เช็คว่ามี progressbar + topBar
      const pb = document.querySelector('div[role="progressbar"]');
      if (pb && pb.offsetHeight > 0) return true;
      return false;
    }

    let pollIv = null;
    function ensureButton() {
      if (!isStoryView()) {
        // ออกแล้ว — เคลียร์
        document.getElementById('igStoryBtnWrap')?.remove();
        clearInterval(pollIv); pollIv = null;
        return;
      }
      if (!injectButton()) {
        // ยัง inject ไม่ได้ — เริ่ม polling
        if (!pollIv) {
          let attempts = 0;
          pollIv = setInterval(() => {
            if (injectButton() || !isStoryView() || ++attempts > 40) {
              clearInterval(pollIv); pollIv = null;
            }
          }, 300);
        }
      }
    }

    // poll เร็ว — เพราะ IG re-render topBar ทุกครั้งที่เปลี่ยน story
    setInterval(ensureButton, 500);

    // URL change → รีเช็คทันที
    onUrlChange(ensureButton);

    // MutationObserver
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; ensureButton(); }, 250);
    }).observe(document.body, { childList: true, subtree: true });

    ensureButton();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 2: Content Downloader (feed posts + video page)
  // ═══════════════════════════════════════════════════════════════════════
  function initIgContentDownloader() {
    if (window.__dgIgContentInit) return;
    window.__dgIgContentInit = true;

    function getShortcode(article) {
      if (!article) return null;
      for (const a of article.querySelectorAll('a[href]')) {
        const m = a.href.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
        if (m) return m[2];
      }
      // fallback: URL เอง
      const m = location.pathname.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      return m ? m[2] : null;
    }

    function fetchMediaByShortcode(shortcode) {
      return new Promise((resolve, reject) => {
        const url = `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=%7B%22shortcode%22:%22${shortcode}%22%7D`;
        GM_xmlhttpRequest({
          method: 'GET', url,
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
        const url = `https://www.instagram.com/graphql/query/?query_id=9496392173716084&variables={%22shortcode%22:%22${shortcode}%22,%22__relay_internal__pv__PolarisFeedShareMenurelayprovider%22:true,%22__relay_internal__pv__PolarisIsLoggedInrelayprovider%22:true}`;
        GM_xmlhttpRequest({
          method: 'GET', url,
          onload: res => {
            try {
              const obj = JSON.parse(res.responseText);
              const item = obj.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
              resolve(item);
            } catch(e) { reject(e); }
          },
          onerror: reject,
        });
      });
    }

    function getCarouselIndex(article) {
      const hasBackButton = article.querySelector('button[aria-label*="Go back"], button._afxv, button[class*="back"]') !== null
        || (() => {
          const btns = article.querySelectorAll('button');
          for (const b of btns) {
            const rect = b.getBoundingClientRect();
            const articleRect = article.getBoundingClientRect();
            if (rect.width > 0 && rect.left < articleRect.left + articleRect.width * 0.2) return true;
          }
          return false;
        })();

      if (!hasBackButton) return 0;

      const ul = article.querySelector('ul[class]');
      if (!ul) return 0;

      const viewport = ul.parentElement?.parentElement;
      if (!viewport) return 0;

      const viewportRect = viewport.getBoundingClientRect();
      const itemWidth = viewportRect.width;
      if (itemWidth === 0) return 0;

      const slides = article.querySelectorAll('li[class]');
      let closestSlide = null;
      let minDistance = Infinity;

      for (const slide of slides) {
        const rect = slide.getBoundingClientRect();
        if (rect.width === 0) continue;
        const distance = Math.abs(rect.right - viewportRect.right);
        if (distance < minDistance) { minDistance = distance; closestSlide = slide; }
      }

      if (!closestSlide) return 0;

      const style = closestSlide.getAttribute('style') || '';
      const match = style.match(/translateX\(([^p]+)px\)/);
      if (match) {
        const totalOffset = parseFloat(match[1]);
        return Math.round(totalOffset / itemWidth);
      }
      return 0;
    }

    async function downloadFeedMedia(src, article) {
      const shortcode = getShortcode(article);
      const idx = getCarouselIndex(article);

      if (shortcode) {
        try {
          let media = await fetchMediaByShortcode(shortcode).catch(() => null);
          if (media) {
            if (media.video_url && idx === 0) { triggerDownload(media.video_url, 'mp4'); return; }
            if (media.edge_sidecar_to_children) {
              const items = media.edge_sidecar_to_children.edges.map(e => e.node);
              const item = items[idx] ?? items[0];
              if (item.video_url) { triggerDownload(item.video_url, 'mp4'); return; }
              if (item.display_url) { triggerDownload(item.display_url, 'jpg'); return; }
            }
            const imgUrl = media.display_resources?.at(-1)?.src || media.display_url;
            if (imgUrl) { triggerDownload(imgUrl, 'jpg'); return; }
          }
          const item = await fetchMediaByQueryID(shortcode).catch(() => null);
          if (item) {
            if (item.carousel_media?.length) {
              const slide = item.carousel_media[idx] ?? item.carousel_media[0];
              if (slide.video_versions?.length) { triggerDownload(slide.video_versions[0].url, 'mp4'); return; }
              if (slide.image_versions2?.candidates?.length) { triggerDownload(slide.image_versions2.candidates[0].url, 'jpg'); return; }
            }
            if (item.video_versions?.length) { triggerDownload(item.video_versions[0].url, 'mp4'); return; }
            if (item.image_versions2?.candidates?.length) { triggerDownload(item.image_versions2.candidates[0].url, 'jpg'); return; }
          }
        } catch(e) { console.error('[DEV/g0d] fetchMedia error:', e); }
      }
      if (src && !src.startsWith('blob:')) { triggerDownload(src, 'jpg'); return; }
      const video = article?.querySelector('video');
      if (video) { const url = getVideoRealUrl(video); if (url) { triggerDownload(url, 'mp4'); return; } }
      console.warn('[DEV/g0d] Could not get media URL');
    }

    async function openFeedMedia(article) {
      const shortcode = getShortcode(article);
      const idx = getCarouselIndex(article);
      if (!shortcode) return;
      try {
        let media = await fetchMediaByShortcode(shortcode).catch(() => null);
        if (media?.edge_sidecar_to_children) {
          const items = media.edge_sidecar_to_children.edges.map(e => e.node);
          const item = items[idx] ?? items[0];
          window.open(item?.video_url || item?.display_url, '_blank'); return;
        }
        if (media?.video_url) { window.open(media.video_url, '_blank'); return; }
        if (media?.display_url) { window.open(media.display_url, '_blank'); return; }
        const item = await fetchMediaByQueryID(shortcode).catch(() => null);
        if (item?.carousel_media?.length) {
          const slide = item.carousel_media[idx] ?? item.carousel_media[0];
          window.open(slide?.video_versions?.[0]?.url || slide?.image_versions2?.candidates?.[0]?.url, '_blank'); return;
        }
        if (item?.video_versions?.[0]?.url) { window.open(item.video_versions[0].url, '_blank'); return; }
        if (item?.image_versions2?.candidates?.[0]?.url) { window.open(item.image_versions2.candidates[0].url, '_blank'); return; }
      } catch(e) { console.error('[DEV/g0d] openFeedMedia error:', e); }
    }

    const DL_SVG   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    const OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;

    const style = document.createElement('style');
    style.textContent = `
      .dg-btn-wrap{position:absolute;top:12px;right:12px;display:flex;flex-flow:row-reverse;gap:2px;z-index:9999;line-height:0}
      .dg-btn-wrap button{
        width:36px;height:36px;border-radius:50%;
        background:transparent;border:none;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        color:white;padding:0;
        transition:opacity .2s;
        filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));
      }
      .dg-btn-wrap button:hover{opacity:.7}
      .dg-btn-wrap button svg{width:22px;height:22px}
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

      if (getComputedStyle(insertEl).position === 'static') insertEl.style.position = 'relative';

      const resourceLayout = childEls.find(el => el.offsetWidth > 100 && el.offsetHeight > 100);
      const isNewPostStyle = resourceLayout
        ? Array.from(resourceLayout.querySelectorAll('a[role="link"][tabindex="0"][href^="/"]'))
            .some(a => !a.getAttribute('href').startsWith('/p/') && !a.getAttribute('href').startsWith('/reels/'))
        : false;

      const topOffset = isNewPostStyle ? '45px' : '15px';

      const wrap = document.createElement('div');
      wrap.className = 'dg-btn-wrap';
      wrap.style.top = topOffset;

      const dlBtn = document.createElement('button');
      dlBtn.title = 'Download'; dlBtn.innerHTML = DL_SVG;
      dlBtn.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await downloadFeedMedia('', article); };

      const openBtn = document.createElement('button');
      openBtn.title = 'Open in new tab'; openBtn.innerHTML = OPEN_SVG;
      openBtn.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await openFeedMedia(article); };

      wrap.append(dlBtn, openBtn);
      insertEl.appendChild(wrap);
    }

    // ─── Video page: /p/, /reel/, /reels/, /tv/ ──────────────────────
    function isSinglePostPage() {
      return /^\/(p|reel|reels|tv)\//.test(location.pathname);
    }

    function injectSinglePostButtons() {
      if (!isSinglePostPage()) return;
      if (document.querySelector('.dg-single-post-wrap')) return;

      // หา container หลักของ post — เอา video หรือ img ใหญ่มาเป็น anchor
      const video = Array.from(document.querySelectorAll('video'))
        .filter(v => v.offsetWidth > 200 && v.offsetHeight > 200)
        .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
      const img = Array.from(document.querySelectorAll('img'))
        .filter(i => i.offsetWidth > 300 && i.naturalWidth > 400 && i.src?.includes('cdninstagram'))
        .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight))[0];
      const anchor = video || img;
      if (!anchor) return;

      // หา wrapper ที่ position ได้
      let container = anchor.parentElement;
      for (let i = 0; i < 4 && container; i++) {
        if (container.offsetWidth > 300 && container.offsetHeight > 300) break;
        container = container.parentElement;
      }
      if (!container) return;
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

      const wrap = document.createElement('div');
      wrap.className = 'dg-btn-wrap dg-single-post-wrap';
      wrap.style.top = '12px';
      wrap.style.right = '12px';

      // สำหรับ single post: ใช้ article = container, shortcode = URL
      const fakeArticle = container;
      fakeArticle.setAttribute('data-dg-shortcode-page', '1');

      const dlBtn = document.createElement('button');
      dlBtn.title = 'Download'; dlBtn.innerHTML = DL_SVG;
      dlBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        await downloadFeedMedia('', fakeArticle);
      };

      const openBtn = document.createElement('button');
      openBtn.title = 'Open in new tab'; openBtn.innerHTML = OPEN_SVG;
      openBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        await openFeedMedia(fakeArticle);
      };

      wrap.append(dlBtn, openBtn);
      container.appendChild(wrap);
    }

    // ─── Feed scan (article) ──────────────────────────────────────────
    function scanFeed() {
      document.querySelectorAll('article:not([data-dg-feed])').forEach(el => {
        if (el.offsetHeight > 0 && el.offsetWidth > 0) injectFeedButtons(el);
      });
    }

    function scanAll() {
      scanFeed();
      injectSinglePostButtons();
    }

    // scan เร็วขึ้น + ใช้ IntersectionObserver
    setInterval(scanAll, 600);

    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; scanAll(); }, 250);
    }).observe(document.body, { childList: true, subtree: true });

    // scroll → scan
    let scrollTimer = null;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(scanAll, 200);
    }, { passive: true });

    // URL change → ล้างปุ่มเก่า + scan ใหม่
    onUrlChange(() => {
      document.querySelectorAll('.dg-single-post-wrap').forEach(el => el.remove());
      setTimeout(scanAll, 300);
    });

    scanAll();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 3: Reels Downloader
  // ═══════════════════════════════════════════════════════════════════════
  function initIgReelsDownloader() {
    if (window.__dgIgReelsInit) return;
    window.__dgIgReelsInit = true;

    const DL_SVG   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    const OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;

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

    const style = document.createElement('style');
    style.textContent = `
      .dg-reel-wrap{position:absolute;right:40px;top:15px;display:flex;flex-direction:column;gap:4px;z-index:9999;line-height:0}
      .dg-reel-wrap button{
        width:36px;height:36px;border-radius:50%;
        background:transparent;border:none;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        color:white;padding:0;
        transition:opacity .2s;
        filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));
      }
      .dg-reel-wrap button:hover{opacity:.7}
      .dg-reel-wrap button svg{width:22px;height:22px}
    `;
    document.head.appendChild(style);

    function injectReelButtons(container) {
      if (container.querySelector('.dg-reel-wrap')) return;

      const children = Array.from(container.children);
      children.forEach(child => {
        if (getComputedStyle(child).position === 'static') child.style.position = 'relative';
      });

      const wrap = document.createElement('div');
      wrap.className = 'dg-reel-wrap';

      const dlBtn = document.createElement('button');
      dlBtn.title = 'Download'; dlBtn.innerHTML = DL_SVG;
      dlBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const shortcode = location.href.split('?')[0].split('instagram.com/reels/').at(-1).replace(/\//g, '');
        if (!shortcode) return;
        try {
          let media = await fetchMediaByShortcode(shortcode).catch(() => null);
          if (media?.video_url) { triggerDownload(media.video_url, 'mp4'); return; }
          const item = await fetchMediaByQueryID(shortcode).catch(() => null);
          if (item?.video_versions?.[0]?.url) { triggerDownload(item.video_versions[0].url, 'mp4'); return; }
          const video = container.querySelector('video');
          if (video) { const url = getVideoRealUrl(video); if (url) triggerDownload(url, 'mp4'); }
        } catch(e) { console.error('[DEV/g0d] reel download error:', e); }
      };

      const openBtn = document.createElement('button');
      openBtn.title = 'Open in new tab'; openBtn.innerHTML = OPEN_SVG;
      openBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const shortcode = location.href.split('?')[0].split('instagram.com/reels/').at(-1).replace(/\//g, '');
        if (!shortcode) return;
        try {
          let media = await fetchMediaByShortcode(shortcode).catch(() => null);
          if (media?.video_url) { window.open(media.video_url, '_blank'); return; }
          const item = await fetchMediaByQueryID(shortcode).catch(() => null);
          if (item?.video_versions?.[0]?.url) { window.open(item.video_versions[0].url, '_blank'); return; }
        } catch(e) {}
      };

      wrap.append(dlBtn, openBtn);
      if (children[0]) children[0].appendChild(wrap);
      else container.appendChild(wrap);
    }

    function isReelView() {
      return /^\/(reel|reels)\//.test(location.pathname);
    }

    function findReelContainer() {
      // เดิม: div[aria-busy][tabindex] > div
      let candidates = Array.from(document.querySelectorAll('div[aria-busy][tabindex] > div'));
      let found = candidates.find(el =>
        el.offsetWidth > window.innerWidth * 0.7 &&
        el.offsetHeight > window.innerHeight * 0.7 &&
        el.querySelector('video')
      );
      if (found) return found;

      // fallback: หา video ใหญ่อยู่กลางจอ แล้วขึ้นไป 3-5 ชั้น
      const video = Array.from(document.querySelectorAll('video'))
        .filter(v => v.offsetWidth > window.innerWidth * 0.4 && v.offsetHeight > window.innerHeight * 0.5)
        .sort((a, b) => (b.offsetWidth * b.offsetHeight) - (a.offsetWidth * a.offsetHeight))[0];
      if (!video) return null;

      let el = video;
      for (let i = 0; i < 6 && el; i++) {
        if (el.offsetWidth > window.innerWidth * 0.7 &&
            el.offsetHeight > window.innerHeight * 0.7) return el;
        el = el.parentElement;
      }
      return video.parentElement;
    }

    function scan() {
      if (!isReelView()) return;
      const container = findReelContainer();
      if (container) injectReelButtons(container);
    }

    setInterval(scan, 500);

    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; scan(); }, 250);
    }).observe(document.body, { childList: true, subtree: true });

    onUrlChange(() => {
      document.querySelectorAll('.dg-reel-wrap').forEach(el => el.remove());
      setTimeout(scan, 400);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 4: Profile Downloader
  // ═══════════════════════════════════════════════════════════════════════
  function initIgProfileDownloader() {
    if (window.__dgIgProfileInit) return;
    window.__dgIgProfileInit = true;

    const style = document.createElement('style');
    style.textContent = `
      .dg-profile-btn {
        position: absolute; right: 0; top: 0;
        width: 32px; height: 32px;
        background: rgba(0,0,0,0.6); border-radius: 50%;
        cursor: pointer; border: 2px solid rgba(255,255,255,0.8);
        z-index: 9999; display: flex;
        align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
        transition: transform .15s, background .15s;
      }
      .dg-profile-btn:hover { background: rgba(0,0,0,0.85); transform: scale(1.1); }
      .dg-profile-btn svg { width: 16px; height: 16px; color: white; fill: white; }
    `;
    document.head.appendChild(style);

    function getProfileUsername() {
      return location.pathname.replace(/(reels|tagged|saved)\/?$/i, '').split('/').filter(s => s).at(-1);
    }

    async function fetchUserId(username) {
      try {
        const res = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.instagram.com/web/search/topsearch/?query=${username}`,
            onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); } },
            onerror: reject,
          });
        });
        const match = res?.users?.find(u => u.user?.username?.toLowerCase() === username.toLowerCase());
        if (match?.user?.pk || match?.user?.id) return match.user.pk || match.user.id;
      } catch(e) {}

      const res = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
          headers: { 'X-IG-App-ID': getAppID() },
          onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); } },
          onerror: reject,
        });
      });
      const user = res?.data?.user;
      if (!user) throw new Error('no user id');
      return user.pk || user.id;
    }

    async function downloadProfilePic(username) {
      try {
        const userId = await fetchUserId(username);
        try {
          const infoRes = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: 'GET',
              url: `https://www.instagram.com/api/v1/users/${userId}/info/`,
              headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 7 XL)Build/RP1A.20845.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 Chrome/117.0.5938.60 Mobile Safari/537.36 Instagram 307.0.0.34.111' },
              onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); } },
              onerror: reject,
            });
          });
          if (infoRes?.status === 'ok') {
            const hdUrl = infoRes?.user?.hd_profile_pic_url_info?.url;
            if (hdUrl) { triggerDownload(hdUrl, 'jpg'); return; }
          }
        } catch(e) {}

        const profileRes = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
            headers: { 'X-IG-App-ID': getAppID() },
            onload: r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); } },
            onerror: reject,
          });
        });
        const fallbackUrl = profileRes?.data?.user?.profile_pic_url;
        if (fallbackUrl) { triggerDownload(fallbackUrl, 'jpg'); return; }
      } catch(e) {
        console.error('[DEV/g0d] profile pic download error:', e);
      }
    }

    function injectProfileButton() {
      if (document.querySelector('.dg-profile-btn')) return true;

      const selector = 'header > *[class]:first-child > *[class]:first-child img[alt]';
      const imgDraggable = document.querySelector(`${selector}[draggable]`);
      const imgNonDraggable = document.querySelector(`${selector}:not([draggable])`);

      let container = null;
      if (imgDraggable) {
        container = imgDraggable.parentElement?.parentElement;
      } else if (imgNonDraggable) {
        container = imgNonDraggable.parentElement?.parentElement?.parentElement;
      }
      if (!container) return false;

      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

      const btn = document.createElement('div');
      btn.className = 'dg-profile-btn';
      btn.title = 'Download profile picture';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const username = getProfileUsername();
        if (username) downloadProfilePic(username);
      };
      container.appendChild(btn);
      return true;
    }

    function isProfilePage() {
      const header = document.querySelector('header > *[class]:first-child img[alt]');
      if (!header) return false;
      if (/^\/(explore|stories|direct|accounts)\b/.test(location.pathname)) return false;
      if (/^\/(p|reel|reels|tv)\//.test(location.pathname)) return false;
      // profile URL pattern: /username/ หรือ /username/tagged
      return /^\/[0-9A-Za-z._]+\/?(tagged|reels|saved)?\/?$/i.test(location.pathname);
    }

    function check() {
      if (!isProfilePage()) {
        document.querySelector('.dg-profile-btn')?.remove();
        return;
      }
      if (!document.querySelector('.dg-profile-btn')) injectProfileButton();
    }

    setInterval(check, 400);
    onUrlChange(() => {
      document.querySelector('.dg-profile-btn')?.remove();
      setTimeout(check, 300);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 5: Video SeekBar
  // ═══════════════════════════════════════════════════════════════════════
  function initIgSeekbar() {
    if (window.__dgIgSeekbarInit) return;
    window.__dgIgSeekbarInit = true;

    const ShieldBypass = {
      init() {
        ['mousedown', 'mouseup', 'click'].forEach(eventType => {
          window.addEventListener(eventType, this.routeEvent.bind(this), true);
        });
      },
      routeEvent(e) {
        if (!e.isTrusted) return;
        const customControls = document.querySelectorAll('.dg-sb-timeline-container');
        for (const control of customControls) {
          const rect = control.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            e.stopPropagation();
            e.preventDefault();
            const clonedEvent = new MouseEvent(e.type, {
              bubbles: false, cancelable: true,
              clientX: e.clientX, clientY: e.clientY
            });
            control.dispatchEvent(clonedEvent);
            return;
          }
        }
      }
    };

    const style = document.createElement('style');
    style.textContent = `
      @keyframes dg-ig-grad {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      .dg-sb-controls-wrapper { opacity: 0.94; transition: opacity 0.18s ease; }
      .dg-sb-controls-wrapper:hover { opacity: 1; }
      .dg-sb-control {
        width: 100%;
        background: linear-gradient(180deg, rgba(8,8,10,0), rgba(8,8,10,0.5));
        display: flex; flex-direction: column;
        z-index: 9999999; position: relative;
        pointer-events: all; box-sizing: border-box; padding-top: 0;
      }
      .dg-sb-timeline-container {
        width: 100%; height: 20px; position: relative;
        cursor: pointer; padding: 8px 0 0;
        box-sizing: border-box; z-index: 9999999;
      }
      .dg-sb-timeline {
        width: 100%; height: 3px;
        background: rgba(255,255,255,0.2);
        position: relative; transition: height 0.1s;
      }
      .dg-sb-timeline-container:hover .dg-sb-timeline { height: 5px; }
      .dg-sb-progress {
        height: 100%; width: 0%;
        position: absolute; top: 0; left: 0;
        background: linear-gradient(90deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888, #9b59b6);
        background-size: 300% 100%;
        animation: dg-ig-grad 2s ease infinite;
      }
      .dg-sb-seek-handle {
        width: 12px; height: 12px; background: #fff;
        border-radius: 50%; position: absolute;
        right: -6px; top: 50%;
        transform: translateY(-50%) scale(0);
        transition: transform 0.1s;
        box-shadow: 0 0 4px rgba(0,0,0,.5);
      }
      .dg-sb-timeline-container:hover .dg-sb-seek-handle { transform: translateY(-50%) scale(1); }
    `;
    document.head.appendChild(style);

    class Seekbar {
      constructor(videoElement) {
        this.video = videoElement;
        this.isDragging = false;
        this.container = this.createContainer();
      }
      createContainer() {
        const control = document.createElement('div');
        control.className = 'dg-sb-control';
        control.appendChild(this.createTimeline());
        return control;
      }
      createTimeline() {
        const timeline = document.createElement('div');
        timeline.className = 'dg-sb-timeline';
        const progress = document.createElement('div');
        progress.className = 'dg-sb-progress';
        const seekHandle = document.createElement('div');
        seekHandle.className = 'dg-sb-seek-handle';
        const tooltip = document.createElement('div');
        tooltip.className = 'dg-sb-tooltip';
        Object.assign(tooltip.style, {
          position: 'absolute', bottom: 'calc(100% + 8px)',
          transform: 'translateX(-50%)', background: 'rgba(8,8,10,0.85)',
          color: '#fff', padding: '3px 7px', borderRadius: '4px',
          fontSize: '12px', fontFamily: 'Arial, sans-serif',
          display: 'none', zIndex: '10000000',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        });
        progress.appendChild(seekHandle);
        timeline.appendChild(progress);
        const container = document.createElement('div');
        container.className = 'dg-sb-timeline-container';
        container.appendChild(timeline);
        container.appendChild(tooltip);
        this.setupTimelineEvents(container, timeline, progress, seekHandle, tooltip);
        return container;
      }
      setupTimelineEvents(container, timeline, progress, seekHandle, tooltip) {
        const fmt = s => `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
        const getPos = (e) => {
          const rect = timeline.getBoundingClientRect();
          return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        };
        const showTooltip = (pos) => {
          if (!this.video.duration) return;
          tooltip.style.display = 'block';
          tooltip.style.left = `${pos * 100}%`;
          tooltip.textContent = fmt(this.video.duration * pos);
        };
        const hideTooltip = () => { tooltip.style.display = 'none'; };
        container.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          this.isDragging = true;
          timeline.style.height = '5px';
          seekHandle.style.transform = 'translateY(-50%) scale(1)';
          const pos = getPos(e);
          progress.style.width = `${pos * 100}%`;
          if (this.video.duration) this.video.currentTime = this.video.duration * pos;
          showTooltip(pos);
          const onMove = (e) => {
            const pos = getPos(e);
            progress.style.width = `${pos * 100}%`;
            if (this.video.duration) this.video.currentTime = this.video.duration * pos;
            showTooltip(pos);
          };
          const onUp = () => {
            this.isDragging = false;
            timeline.style.height = '';
            seekHandle.style.transform = 'translateY(-50%) scale(0)';
            hideTooltip();
            document.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp, true);
          };
          document.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp, true);
        });
        container.addEventListener('mousemove', (e) => { if (!this.isDragging) showTooltip(getPos(e)); });
        container.addEventListener('mouseleave', () => { if (!this.isDragging) hideTooltip(); });
        this.video.addEventListener('timeupdate', () => {
          if (!this.isDragging && this.video.duration) {
            progress.style.width = `${(this.video.currentTime / this.video.duration) * 100}%`;
          }
        });
      }
    }

    const processedVideos = new WeakSet();
    const addSeekbarToVideo = (videoElement) => {
      if (processedVideos.has(videoElement)) return;
      const videoContainer = videoElement.closest('div[class*="x5yr21d"][class*="x1uhb9sk"]');
      if (!videoContainer) return;
      processedVideos.add(videoElement);
      const seekbar = new Seekbar(videoElement);
      const controlsWrapper = document.createElement('div');
      controlsWrapper.className = 'dg-sb-controls-wrapper';
      Object.assign(controlsWrapper.style, {
        width: '100%', position: 'absolute',
        left: '0', right: '0', bottom: '0',
        zIndex: '9999999', pointerEvents: 'none'
      });
      controlsWrapper.appendChild(seekbar.container);
      videoContainer.style.position = 'relative';
      videoContainer.appendChild(controlsWrapper);
      new MutationObserver(() => {
        if (!document.contains(videoElement)) controlsWrapper.remove();
      }).observe(document.body, { childList: true, subtree: true });
    };

    new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeName === 'VIDEO') addSeekbarToVideo(node);
          else if (node.querySelectorAll) node.querySelectorAll('video').forEach(addSeekbarToVideo);
        });
      });
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });

    document.querySelectorAll('video').forEach(addSeekbarToVideo);
    ShieldBypass.init();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 6: AllowSave
  // ═══════════════════════════════════════════════════════════════════════
  function initIgAllowSave() {
    if (window.__dgIgAllowSaveInit) return;
    window.__dgIgAllowSaveInit = true;
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
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLUGIN 7: Anonymous Stories
  // ═══════════════════════════════════════════════════════════════════════
  function initIgAnonymousStories() {
    if (window.__dgIgAnonInit) return;
    window.__dgIgAnonInit = true;
    const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    const originalSend = win.XMLHttpRequest.prototype.send;
    win.XMLHttpRequest.prototype.send = function () {
      const body = arguments[0];
      if (typeof body === 'string' && body.includes('viewSeenAt')) return;
      originalSend.apply(this, arguments);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Register Plugins
  // ═══════════════════════════════════════════════════════════════════════
  const icon = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px">${d}</svg>`;

  window.DEVg0d_PLUGINS = [
    { name: icon('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>') + 'StorySaver', type: 'toggle', key: 'devg0d-ig-story', init: initIgStorySaver },
    { name: icon('<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#8b949e"/>') + 'ContentDownloader', type: 'toggle', key: 'devg0d-ig-content', init: initIgContentDownloader },
    { name: icon('<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>') + 'ReelsDownloader', type: 'toggle', key: 'devg0d-ig-reels', init: initIgReelsDownloader },
    { name: icon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') + 'ProfileDownloader', type: 'toggle', key: 'devg0d-ig-profile', init: initIgProfileDownloader },
    { name: icon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>') + 'VideoSeekBar', type: 'toggle', key: 'devg0d-ig-seekbar', init: initIgSeekbar },
    { name: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>') + 'AllowSave', type: 'toggle', key: 'devg0d-ig-allowsave', init: initIgAllowSave },
    { name: icon('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>') + 'AnonymousStories', type: 'toggle', key: 'devg0d-ig-anon-stories', init: initIgAnonymousStories },
  ];

  window.__dgPluginsReady = true;
  window.dispatchEvent(new Event('dg-plugins-ready'));

})();
