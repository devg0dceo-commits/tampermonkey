// DEV/g0d - Instagram Addon

(function () {

  // ─── Shared helpers ───────────────────────────────────────────────────────

  // ShieldBypass: intercept clicks before IG overlay (same as Instagram_Video_Controls)
  ;['mousedown','mouseup','click'].forEach(type => {
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

  // ─── 1. Story Downloader (เฉพาะ video) ────────────────────────────────────
  function initIgStorySaver() {

    function getStoryUsername() {
      return location.pathname.split('/').filter(s => s.length > 0).at(1);
    }

    // React fiber walk — ดึง video URL จริง
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

    // หา video element ในสตอรี่ (เฉพาะ video — ไม่สนใจรูป)
    function findStoryVideo() {
      return document.querySelector('body > div section video[playsinline]')
          || document.querySelector('video[playsinline]');
    }

    function detectCurrentMedia() {
      const video = findStoryVideo();
      if (!video) return null;
      const url = getVideoRealUrl(video);
      if (url) return { url, ext: 'mp4' };
      return null;
    }

    async function downloadCurrent() {
      const media = await detectCurrentMedia();
      if (!media) { console.warn('[DEV/g0d] No video found'); return; }
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
      // ไม่มี video → เอาปุ่มออก (กรณีเลื่อนจาก video → รูป)
      if (!findStoryVideo()) {
        document.getElementById('igStoryBtnWrap')?.remove();
        return null;
      }

      const topBar = Array.from(document.querySelectorAll('div.x1xmf6yo'))
        .find(b => b instanceof HTMLElement && b.offsetHeight > 0);
      if (!topBar) return null;

      // ถ้ามีปุ่มอยู่แล้ว + เกาะ topBar ตัวปัจจุบัน → ไม่ทำอะไร
      const existing = document.getElementById('igStoryBtnWrap');
      if (existing && existing.parentElement === topBar) return null;
      // ถ้ามีปุ่มเก่าแต่เกาะ topBar อันเก่า → เอาออก
      if (existing) existing.remove();

      const wrap = document.createElement('div');
      wrap.id = 'igStoryBtnWrap';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'igStoryBtn'; dlBtn.title = 'Download video';
      dlBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
      dlBtn.addEventListener('click', (e) => { e.stopPropagation(); downloadCurrent(); });

      const openBtn = document.createElement('button');
      openBtn.className = 'igStoryBtn'; openBtn.title = 'Open video URL';
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

    // poll ทุก 400ms — ใช้ได้ทั้ง story ปกติ + highlight
    setInterval(injectButton, 400);

    // MutationObserver เร่งความเร็ว
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => { pending = false; injectButton(); }, 100);
    }).observe(document.body, { childList: true, subtree: true });

    injectButton();
  }

  // ─── 3. Reels Downloader ──────────────────────────────────────────────────
  function initIgReelsDownloader() {

    const DL_SVG   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    const OPEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;

    // exact same as ig-story-test.user.js
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

    // exact same React fiber walk as ig-story-test.user.js
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

    // exact same as ig-story-test.user.js injectReelButtons
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
          // fallback: React fiber
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

  // ─── 4. Profile Downloader ────────────────────────────────────────────────
  function initIgProfileDownloader() {

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
      // Primary: topsearch (same as ighelper)
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
      } catch(e) { /* fall through */ }

      // Fallback: web_profile_info
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

        // HD via www.instagram.com (not i.instagram.com — matches ighelper)
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
        } catch(e) { /* fall through to fallback */ }

        // Fallback: profile_pic_url from web_profile_info
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

        console.warn('[DEV/g0d] Could not get profile picture URL');
      } catch(e) {
        console.error('[DEV/g0d] profile pic download error:', e);
      }
    }

    function injectProfileButton() {
      if (document.querySelector('.dg-profile-btn')) return;

      const selector = 'header > *[class]:first-child > *[class]:first-child img[alt]';
      const imgDraggable = document.querySelector(`${selector}[draggable]`);
      const imgNonDraggable = document.querySelector(`${selector}:not([draggable])`);

      let container = null;
      if (imgDraggable) {
        container = imgDraggable.parentElement?.parentElement;
      } else if (imgNonDraggable) {
        container = imgNonDraggable.parentElement?.parentElement?.parentElement;
      }

      if (!container) return;

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
    }

    function isProfilePage() {
      return document.querySelector('header > *[class]:first-child img[alt]') !== null &&
        /^(\/)([0-9A-Za-z.\-_]+)\/?(?:tagged|reels|saved)?\/?$/i.test(location.pathname) &&
        !/^(\/explore\/?$|\/stories(\/.*)?$|\/p\/)/.test(location.pathname);
    }

    let lastProfilePath = '';
    let profileObserver = null;

    function checkProfilePage() {
      const path = location.pathname;

      if (!isProfilePage()) {
        document.querySelector('.dg-profile-btn')?.remove();
        return;
      }

      if (!document.querySelector('.dg-profile-btn')) {
        injectProfileButton();
      }

      if (path !== lastProfilePath) {
        lastProfilePath = path;
        profileObserver?.disconnect();
        const header = document.querySelector('header');
        if (header) {
          profileObserver = new MutationObserver(() => {
            if (!document.querySelector('.dg-profile-btn')) {
              injectProfileButton();
            }
          });
          profileObserver.observe(header, { childList: true, subtree: true });
        }
      }
    }

    setInterval(checkProfilePage, 300);
  }
  // ─── 5. Video SeekBar ─────────────────────────────────────────────────────
  function initIgSeekbar() {

    // ShieldBypass: exact copy from ig-seekbar.user.js
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

  // ─── 2. Content Downloader (feed posts) ──────────────────────────────────
  function initIgContentDownloader() {

    function getShortcode(article) {
      if (!article) return null;
      for (const a of article.querySelectorAll('a[href]')) {
        const m = a.href.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
        if (m) return m[2];
      }
      const m = location.pathname.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
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

    function getVideoRealUrl(video) {
      const fiberKey = Object.keys(video).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return null;
      try {
        let fiber = video[fiberKey];
        for (let i = 0; i < 30 && fiber; i++) {
          const props = fiber.memoizedProps || fiber.pendingProps;
          if (props) {
            const impl = props.implementations ?? props.children?.[0]?.props?.children?.props?.implementations ?? props.children?.props?.children?.props?.implementations;
            if (impl) { for (const idx of [1,0,2]) { const s=impl[idx]?.data; const u=s?.hdSrc||s?.sdSrc||s?.hd_src||s?.sd_src; if (u) return u; } }
            if (props.src && !props.src.startsWith('blob:')) return props.src;
            const vd = props.videoData;
            if (vd) { const u=vd.hd_src||vd.sd_src||vd.$1?.hd_src||vd.$1?.sd_src; if (u) return u; }
          }
          fiber = fiber.return;
        }
      } catch(e) {}
      const propsKey = fiberKey.replace('__reactFiber','__reactProps');
      let el = video;
      for (let i=0;i<8;i++) {
        el=el.parentElement; if (!el) break;
        const p=el[propsKey]; if (!p) continue;
        const impl=p.children?.[0]?.props?.children?.props?.implementations??p.children?.props?.children?.props?.implementations;
        if (impl) { for (const idx of [1,0,2]) { const s=impl[idx]?.data; const u=s?.hdSrc||s?.sdSrc||s?.hd_src||s?.sd_src; if (u) return u; } }
      }
      return null;
    }

    // Get current carousel index — ported from ighelper's getVisibleNodeIndex
    function getCarouselIndex(article) {
      // If no "back" button exists, we're on the first slide
      const hasBackButton = article.querySelector('button[aria-label*="Go back"], button._afxv, button[class*="back"]') !== null
        || (() => {
          // Check for any button that's a "previous" nav (left arrow area)
          const btns = article.querySelectorAll('button');
          for (const b of btns) {
            const rect = b.getBoundingClientRect();
            const articleRect = article.getBoundingClientRect();
            // Button on the left side of the article = back button
            if (rect.width > 0 && rect.left < articleRect.left + articleRect.width * 0.2) return true;
          }
          return false;
        })();

      if (!hasBackButton) return 0;

      // Find the carousel viewport: parent of parent of ul[class]
      const ul = article.querySelector('ul[class]');
      if (!ul) return 0;

      const viewport = ul.parentElement?.parentElement;
      if (!viewport) return 0;

      const viewportRect = viewport.getBoundingClientRect();
      const itemWidth = viewportRect.width;
      if (itemWidth === 0) return 0;

      // Find the <li> whose right edge is closest to viewport's right edge
      const slides = article.querySelectorAll('li[class]');
      let closestSlide = null;
      let minDistance = Infinity;

      for (const slide of slides) {
        const rect = slide.getBoundingClientRect();
        if (rect.width === 0) continue;
        const distance = Math.abs(rect.right - viewportRect.right);
        if (distance < minDistance) {
          minDistance = distance;
          closestSlide = slide;
        }
      }

      if (!closestSlide) return 0;

      // Extract translateX from style to calculate index
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
            // carousel_media contains all slides
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

      insertEl.style.position = 'relative';

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

    function scanArticles() {
      document.querySelectorAll('article:not([data-dg-feed])').forEach(el => {
        if (el.offsetHeight > 0 && el.offsetWidth > 0) injectFeedButtons(el);
      });
    }

    setInterval(scanArticles, 1000);
    new MutationObserver(scanArticles).observe(document.body, { childList: true, subtree: true });
  }

  // ─── 6. Anonymous Stories ─────────────────────────────────────────────────
  function initIgAnonymousStories() {
    const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    const originalSend = win.XMLHttpRequest.prototype.send;

    win.XMLHttpRequest.prototype.send = function () {
      const body = arguments[0];
      if (typeof body === 'string' && body.includes('viewSeenAt')) {
        // Block the "seen" notification — do not call original
        return;
      }
      originalSend.apply(this, arguments);
    };
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
      name: icon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') + 'ProfileDownloader',
      type: 'toggle',
      key: 'devg0d-ig-profile',
      init: initIgProfileDownloader,
    },
    {
      name: icon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>') + 'VideoSeekBar',
      type: 'toggle',
      key: 'devg0d-ig-seekbar',
      init: initIgSeekbar,
    },
    {
      name: icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>') + 'AllowSave',
      type: 'toggle',
      key: 'devg0d-ig-allsave',
      init: initIgAllowSave,
    },
    {
      name: icon('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>') + 'AnonymousStories',
      type: 'toggle',
      key: 'devg0d-ig-anon-stories',
      init: initIgAnonymousStories,
    },
  ];

})();
