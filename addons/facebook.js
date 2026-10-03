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
  //  PLUGIN 1: VideoDownloader
  // ═══════════════════════════════════════════════════════════════════════
  function initFbVideoDownloader() {
    if (window.__dgVideoInit) return;
    window.__dgVideoInit = true;

    function getVideoIdFromVideoElement(video) {
      try {
        let key = '';
        for (let k in video.parentElement) if (k.startsWith('__reactProps')) { key = k; break; }
        if (key) {
          const props = video.parentElement[key].children.props;
          const id = props.videoFBID || props.coreVideoPlayerMetaData?.videoFBID;
          if (id) return id;
        }
      } catch (e) {}
      try {
        const wrapper = video.closest('[data-instancekey]');
        if (wrapper) {
          const m = wrapper.getAttribute('data-instancekey')?.match(/id-vpuid-([a-f0-9-]+)/);
          if (m) return m[1];
        }
      } catch (e) {}
      try {
        let el = video;
        for (let i = 0; i < 10 && el; i++) {
          for (let k in el) if (k.startsWith('__reactProps') || k.startsWith('__reactInternalInstance')) {
            try {
              const p = el[k];
              if (p?.children?.props) {
                const id = p.children.props.videoFBID || p.children.props.videoId;
                if (id) return id;
              }
              if (p?.videoFBID) return p.videoFBID;
              if (p?.videoId) return p.videoId;
            } catch (e) {}
          }
          el = el.parentElement;
        }
      } catch (e) {}
      try {
        const url = window.location.href;
        const m1 = url.match(/\/videos\/(\d+)/); if (m1) return m1[1];
        const m2 = url.match(/\/watch\/?\?.*[&?]v=(\d+)/); if (m2) return m2[1];
      } catch (e) {}
      return null;
    }

    async function getDtsg() {
      try { if (window.require) return require('DTSGInitialData').token; } catch (e) {}
      try {
        const m = document.documentElement.innerHTML.match(/"token":"([^"]+)"/);
        if (m) return m[1];
      } catch (e) {}
      try {
        for (const s of document.querySelectorAll('script')) {
          if (s.textContent?.includes('DTSGInitialData')) {
            const match = s.textContent.match(/"token":"([^"]+)"/);
            if (match) return match[1];
          }
        }
      } catch (e) {}
      throw new Error('Could not find DTSG token');
    }

    function stringifyVariables(d, e) {
      const f = [];
      for (const a in d) if (d.hasOwnProperty(a)) {
        const g = e ? e + '[' + a + ']' : a, b = d[a];
        f.push(b !== null && typeof b === 'object'
          ? stringifyVariables(b, g)
          : encodeURIComponent(g) + '=' + encodeURIComponent(b));
      }
      return f.join('&');
    }

    async function getLinkFbVideo2(videoId, dtsg) {
      const res = await fetch('https://www.facebook.com/video/video_data_async/?video_id=' + videoId, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' },
        body: stringifyVariables({ __a: '1', fb_dtsg: dtsg })
      });
      const json = JSON.parse((await res.text()).replace('for (;;);', ''));
      const { hd_src, hd_src_no_ratelimit, sd_src, sd_src_no_ratelimit } = json?.payload || {};
      const videoUrl = hd_src_no_ratelimit || hd_src || sd_src_no_ratelimit || sd_src;
      if (!videoUrl) throw new Error('No video URL found');
      return videoUrl;
    }

    async function getLinkFbVideo1(videoId, dtsg) {
      const res = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-requested-with': 'XMLHttpRequest' },
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
      if (!lines.length) throw new Error('Empty response');
      const a = JSON.parse(lines[0]);
      if (!a.data?.video) throw new Error('No video data');
      const videoUrl = a.data.video.playable_url_quality_hd || a.data.video.playable_url;
      if (!videoUrl) throw new Error('No playable URL');
      return videoUrl;
    }

    async function getVideoUrl(videoId) {
      const dtsg = await getDtsg();
      try { return await getLinkFbVideo2(videoId, dtsg); }
      catch (e) {
        try { return await getLinkFbVideo1(videoId, dtsg); }
        catch (e2) { throw new Error('Both download methods failed'); }
      }
    }

    function downloadBlob(blobUrl, name) {
      const l = document.createElement('a');
      l.href = blobUrl; l.download = name;
      l.style.display = 'none';
      document.body.appendChild(l);
      l.click();
      document.body.removeChild(l);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    }

    function downloadURL(url, name) {
      if (typeof GM_download !== 'undefined') {
        GM_download({
          url, name, saveAs: false,
          onload: () => {},
          onerror: () => downloadUsingFetch(url, name)
        });
        return;
      }
      downloadUsingFetch(url, name);
    }

    function downloadUsingFetch(url, name) {
      try {
        if (typeof GM_xmlhttpRequest !== 'undefined') {
          GM_xmlhttpRequest({
            method: 'GET', url, responseType: 'blob',
            onload: (r) => downloadBlob(URL.createObjectURL(r.response), name),
            onerror: () => window.open(url, '_blank')
          });
        } else {
          fetch(url)
            .then(r => r.blob())
            .then(b => downloadBlob(URL.createObjectURL(b), name))
            .catch(() => window.open(url, '_blank'));
        }
      } catch (e) { console.error('[DEV/g0d] Download failed:', e); }
    }

    function createDownloadIcon(videoWrapper) {
      const svgDL   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      const svgOpen = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
      const svgSpin = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><circle cx="12" cy="12" r="10"/></svg>`;
      const svgOK   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
      const svgErr  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

      const btnStyle = 'width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:transparent;color:white;border:none;border-radius:50%;cursor:pointer;transition:opacity .2s ease;pointer-events:auto;padding:0;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))';

      const dlIcon = document.createElement('button');
      dlIcon.className = 'fb-dl-icon';
      dlIcon.innerHTML = svgDL;
      dlIcon.style.cssText = btnStyle;
      dlIcon.title = 'Download video';
      dlIcon.addEventListener('mouseenter', () => { dlIcon.style.opacity = '.7'; });
      dlIcon.addEventListener('mouseleave', () => { if (!dlIcon.classList.contains('downloading')) dlIcon.style.opacity = '1'; });

      dlIcon.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (dlIcon.classList.contains('downloading')) return;
        dlIcon.classList.add('downloading'); dlIcon.innerHTML = svgSpin;
        try {
          const video = videoWrapper.querySelector('video');
          if (!video) throw new Error('Video not found');
          const videoId = getVideoIdFromVideoElement(video);
          if (!videoId) throw new Error('Could not get video ID');
          const videoUrl = await getVideoUrl(videoId);
          downloadURL(videoUrl, `fb_video_${videoId}.mp4`);
          dlIcon.innerHTML = svgOK;
          setTimeout(() => {
            dlIcon.innerHTML = svgDL;
            dlIcon.classList.remove('downloading');
            dlIcon.style.opacity = '1';
          }, 2000);
        } catch (err) {
          console.error('[DEV/g0d] Video download failed:', err);
          dlIcon.innerHTML = svgErr;
          setTimeout(() => {
            dlIcon.innerHTML = svgDL;
            dlIcon.classList.remove('downloading');
            dlIcon.style.opacity = '1';
          }, 3000);
        }
      });

      const openIcon = document.createElement('button');
      openIcon.className = 'fb-open-icon';
      openIcon.innerHTML = svgOpen;
      openIcon.style.cssText = btnStyle;
      openIcon.title = 'Open in new tab';
      openIcon.addEventListener('mouseenter', () => { openIcon.style.opacity = '.7'; });
      openIcon.addEventListener('mouseleave', () => { openIcon.style.opacity = '1'; });

      openIcon.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        try {
          const video = videoWrapper.querySelector('video');
          if (!video) return;
          const videoId = getVideoIdFromVideoElement(video);
          if (!videoId) return;
          const videoUrl = await getVideoUrl(videoId);
          window.open(videoUrl, '_blank');
        } catch (err) { console.error('[DEV/g0d] FB open tab failed:', err); }
      });

      const wrap = document.createElement('div');
      wrap.className = 'fb-btn-wrap';
      wrap.style.cssText = 'position:fixed;display:flex;gap:2px;align-items:center;z-index:9999999;pointer-events:auto';
      wrap.appendChild(openIcon);
      wrap.appendChild(dlIcon);
      return wrap;
    }

    function addIconToVideo(videoElement) {
      const url = window.location.href;
      if (/\/watch\?v=/.test(url) || /\/stories\//.test(url)) return;

      const videoWrapper = videoElement.closest('div.x5yr21d.x1uhb9sk') || videoElement.parentElement;
      if (!videoWrapper || videoWrapper.getAttribute('data-dg-dl')) return;
      videoWrapper.setAttribute('data-dg-dl', '1');

      const wrap = createDownloadIcon(videoWrapper);
      const updatePos = () => {
        if (!document.body.contains(videoWrapper)) {
          wrap.remove();
          clearInterval(interval);
          return;
        }
        const r = videoWrapper.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          wrap.style.display = 'flex';
          wrap.style.top  = (r.top + 8) + 'px';
          wrap.style.left = (r.right - 76) + 'px';
        } else {
          wrap.style.display = 'none';
        }
      };
      document.body.appendChild(wrap);
      updatePos();
      const interval = setInterval(updatePos, 100);
    }

    const style = document.createElement('style');
    style.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(style);

    setTimeout(() => document.querySelectorAll('video').forEach(addIconToVideo), 1000);

    new MutationObserver((mutations) => {
      for (const m of mutations) for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'VIDEO') addIconToVideo(node);
        node.querySelectorAll?.('video').forEach(v => setTimeout(() => addIconToVideo(v), 300));
      }
    }).observe(document.body, { childList: true, subtree: true });
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
        'div[aria-label="Close"][role="button"], div[aria-label="ปิด"][role="button"]'
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

      console.log('[DEV/g0d] story changed — reset window at',
        new Date(activeStoryStartTime).toLocaleTimeString());
    }

    function findStoryTopBar() {
      let bar = Array.from(document.querySelectorAll('div.xtotuo0'))
        .find(b => b instanceof HTMLElement && b.offsetHeight > 0);
      if (bar) return bar;

      const closeBtn = document.querySelector(
        'div[aria-label="Close"][role="button"], div[aria-label="ปิด"][role="button"]'
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
            if (u) { found.push({ url: u, path: path + `[${i}]` }); return; }
            walk(obj[i], depth + 1, path + `[${i}]`, visited);
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
          if (fiber.memoizedProps) walk(fiber.memoizedProps, 0, `fiber[${i}].memoizedProps`, visited);
          if (fiber.memoizedState) walk(fiber.memoizedState, 0, `fiber[${i}].memoizedState`, visited);
          if (fiber.stateNode && typeof fiber.stateNode === 'object') {
            walk(fiber.stateNode, 0, `fiber[${i}].stateNode`, visited);
          }
          if (fiber.updateQueue) walk(fiber.updateQueue, 0, `fiber[${i}].updateQueue`, visited);
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
          debug.push(`video.currentSrc: ${v.currentSrc.slice(0, 100)}`);
          return { url: v.currentSrc, type: 'video', debug };
        }
        if (v.src && v.src.startsWith('http')) {
          debug.push(`video.src: ${v.src.slice(0, 100)}`);
          return { url: v.src, type: 'video', debug };
        }
        const hits = deepScanVideo(v);
        if (hits.length) {
          debug.push(`fiber hit: ${hits[0].url.slice(0, 100)}`);
          return { url: hits[0].url, type: 'video', debug };
        }
      }

      const since = activeStoryStartTime || (Date.now() - 30000);
      const captured = __dgCaptured.videos
        .filter(x => x.time >= since)
        .sort((a, b) => b.time - a.time);

      debug.push(`captured videos since story start: ${captured.length}`);
      if (captured.length) {
        const best = captured.reduce((a, b) => a.url.length >= b.url.length ? a : b);
        debug.push(`  best: ${best.url.slice(0, 100)}`);
        return { url: best.url, type: 'video', debug };
      }

      const capturedImgs = __dgCaptured.images
        .filter(x => x.time >= since)
        .sort((a, b) => b.time - a.time);
      debug.push(`captured images since story start: ${capturedImgs.length}`);
      if (capturedImgs.length) {
        const best = capturedImgs.reduce((a, b) => a.url.length >= b.url.length ? a : b);
        debug.push(`  best img: ${best.url.slice(0, 100)}`);
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

      debug.push(`DOM imgs (filtered): ${domImgs.length}`);
      if (domImgs.length) {
        debug.push(`  best: ${domImgs[0].src.slice(0, 100)}`);
        return { url: domImgs[0].src, type: 'image', debug };
      }

      for (const el of scope.querySelectorAll('*')) {
        const bg = getComputedStyle(el).backgroundImage;
        const m = bg && bg.match(/url\(["']?(https:\/\/[^"')]+)["']?\)/);
        if (m && m[1].includes('fbcdn') && !m[1].includes('/v/t1.30497/')) {
          debug.push(`bg-image: ${m[1].slice(0, 100)}`);
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
      return `${userName}-${timestamp}.${type === 'video' ? 'mp4' : 'jpg'}`;
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
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const media = detectMedia();
        if (!media) {
          console.warn('[DEV/g0d] StorySaver: no media found');
          alert('DEV/g0d: ไม่พบสื่อ — ลองเล่นสตอรี่สัก 1-2 วิแล้วกดใหม่');
          return;
        }
        console.log('[DEV/g0d] StorySaver: downloading', media.type, media.url.slice(0, 100));
        downloadMedia(media.url, buildFileName(media.type));
      });

      const openBtn = document.createElement('button');
      openBtn.id = 'dg-story-open-btn';
      openBtn.title = 'Open in new tab';
      openBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;
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
  //  PLUGIN 3: ProfileViewer (Unlock Full HD profile picture)
  // ═══════════════════════════════════════════════════════════════════════
  function getHDUrl(targetSVG) {
    if (!targetSVG) return null;
    const img = targetSVG.querySelector('image');
    if (!img) return null;

    const href = img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || img.getAttribute('href') || '';
    if (!href.includes('cstp=mx')) return null;

    const mxMatch = href.match(/cstp=mx(\d+x\d+)/);
    if (!mxMatch) return null;

    return href.replace(/ctp=s\d+x\d+/, `ctp=s${mxMatch[1]}`).replace(/&amp;/g, '&');
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
          alert('ไม่พบรูปโปรไฟล์ ลองรีเฟรชแล้วลองอีกครั้ง');
          return false;
        }

        const hdUrl = getHDUrl(svg);
        if (hdUrl) {
          window.open(hdUrl, '_blank');
          return true;
        }
      }
    }

    alert('ไม่พบรูปโปรไฟล์ ลองรีเฟรชแล้วลองอีกครั้ง');
    return false;
  }

  // register GM menu
  try { GM_registerMenuCommand("🔍 Profile Viewer", actionFindAndOpenHD); } catch(e) {}

  // ═══════════════════════════════════════════════════════════════════════
  //  Register Plugins
  // ═══════════════════════════════════════════════════════════════════════
  const icon = (d) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px">${d}</svg>`;

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
      name: icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') + 'ProfileViewer',
      type: 'click',
      key: 'devg0d-fb-profile',
      fn: actionFindAndOpenHD,
    },
  ];

  // แจ้ง main script ว่า plugin พร้อมแล้ว
  window.__dgPluginsReady = true;
  window.dispatchEvent(new Event('dg-plugins-ready'));

})();
