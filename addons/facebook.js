// DEV/g0d - Facebook Addon

(function () {

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getSetting = (key) => localStorage.getItem(key) !== 'false';

  // ─── VideoDownloader ──────────────────────────────────────────────────────
  function initFbVideoDownloader() {
    function getVideoIdFromVideoElement(video) {
      try {
        let key = '';
        for (let k in video.parentElement) if (k.startsWith('__reactProps')) { key = k; break; }
        if (key) { const props = video.parentElement[key].children.props; const id = props.videoFBID || props.coreVideoPlayerMetaData?.videoFBID; if (id) return id; }
      } catch (e) {}
      try {
        const wrapper = video.closest('[data-instancekey]');
        if (wrapper) { const m = wrapper.getAttribute('data-instancekey')?.match(/id-vpuid-([a-f0-9-]+)/); if (m) return m[1]; }
      } catch (e) {}
      try {
        let el = video;
        for (let i = 0; i < 10 && el; i++) {
          for (let k in el) if (k.startsWith('__reactProps') || k.startsWith('__reactInternalInstance')) {
            try {
              const p = el[k];
              if (p?.children?.props) { const id = p.children.props.videoFBID || p.children.props.videoId; if (id) return id; }
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
      try { const m = document.documentElement.innerHTML.match(/"token":"([^"]+)"/); if (m) return m[1]; } catch (e) {}
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
        f.push(b !== null && typeof b === 'object' ? stringifyVariables(b, g) : encodeURIComponent(g) + '=' + encodeURIComponent(b));
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
        body: stringifyVariables({ doc_id: '5279476072161634', variables: JSON.stringify({ UFI2CommentsProvider_commentsKey: 'CometTahoeSidePaneQuery', caller: 'CHANNEL_VIEW_FROM_PAGE_TIMELINE', videoID: videoId }), fb_dtsg: dtsg, server_timestamps: true })
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
      try { return await getLinkFbVideo2(videoId, dtsg); } catch (e) {
        try { return await getLinkFbVideo1(videoId, dtsg); } catch (e2) {
          throw new Error('Both download methods failed');
        }
      }
    }

    function downloadBlob(blobUrl, name) {
      const l = document.createElement('a'); l.href = blobUrl; l.download = name;
      l.style.display = 'none'; document.body.appendChild(l); l.click();
      document.body.removeChild(l); setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    }

    async function downloadURL(url, name) {
      if (typeof GM_download !== 'undefined') {
        GM_download({ url, name, saveAs: false, onload: () => {}, onerror: () => downloadUsingFetch(url, name) });
        return;
      }
      downloadUsingFetch(url, name);
    }

    async function downloadUsingFetch(url, name) {
      try {
        if (typeof GM_xmlhttpRequest !== 'undefined') {
          GM_xmlhttpRequest({ method: 'GET', url, responseType: 'blob', onload: (r) => downloadBlob(URL.createObjectURL(r.response), name), onerror: () => window.open(url, '_blank') });
        } else {
          const r = await fetch(url); downloadBlob(URL.createObjectURL(await r.blob()), name);
        }
      } catch (e) { console.error('Download failed:', e); }
    }

    function createDownloadIcon(videoWrapper) {
      const svgDL   = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
      const svgOpen = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
      const svgSpin = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><circle cx="12" cy="12" r="10"/></svg>`;
      const svgOK   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
      const svgErr  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;

      const btnStyle = 'width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:transparent;color:white;border:none;border-radius:50%;cursor:pointer;transition:opacity .2s ease;pointer-events:auto;padding:0;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6))';

      // Download button
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
          await downloadURL(videoUrl, `fb_video_${videoId}.mp4`);
          dlIcon.innerHTML = svgOK;
          setTimeout(() => { dlIcon.innerHTML = svgDL; dlIcon.classList.remove('downloading'); dlIcon.style.opacity = '1'; }, 2000);
        } catch (err) {
          dlIcon.innerHTML = svgErr;
          setTimeout(() => { dlIcon.innerHTML = svgDL; dlIcon.classList.remove('downloading'); dlIcon.style.opacity = '1'; }, 3000);
        }
      });

      // Open new tab button
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

      // Wrap both buttons in a container
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
      if (videoWrapper.getAttribute('data-dg-dl')) return;
      videoWrapper.setAttribute('data-dg-dl', '1');

      const wrap = createDownloadIcon(videoWrapper);
      const updatePos = () => {
        if (!document.body.contains(videoWrapper)) { wrap.remove(); clearInterval(interval); return; }
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

    // Inject spin animation
    const style = document.createElement('style');
    style.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(style);

    // Attach to existing videos
    setTimeout(() => document.querySelectorAll('video').forEach(addIconToVideo), 1000);

    // Watch for new videos
    new MutationObserver((mutations) => {
      for (const m of mutations) for (const node of m.addedNodes) if (node.nodeType === 1) {
        if (node.tagName === 'VIDEO') addIconToVideo(node);
        node.querySelectorAll?.('video').forEach(v => setTimeout(() => addIconToVideo(v), 300));
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ─── StorySaver ───────────────────────────────────────────────────────────
  function initFbStorySaver() {
    const MAX_ATTEMPTS = 10;

    class FacebookStoryDownloader {
      constructor() {
        this.mediaUrl = null;
        this.detectedVideo = null;
        this.setupMutationObserver();
      }

      setupMutationObserver() {
        new MutationObserver(() => this.checkPageStructure())
          .observe(document.body, { childList: true, subtree: true });
      }

      checkPageStructure() {
        const btn = document.getElementById('dg-story-dl-btn');
        if (/(\/stories\/)/.test(window.location.href)) {
          this.injectStyles();
          this.createButtonWithPolling();
        } else if (btn) {
          btn.remove();
          document.getElementById('dg-story-open-btn')?.remove();
        }
      }

      injectStyles() {
        if (document.getElementById('dg-story-dl-styles')) return;
        const style = document.createElement('style');
        style.id = 'dg-story-dl-styles';
        style.textContent = `#dg-story-dl-btn,#dg-story-open-btn{border:none;background:transparent;color:white;cursor:pointer;z-index:9999;width:48px;height:48px;padding:0;margin-top:-8px;display:flex;align-items:center;justify-content:center;transition:opacity .2s ease}#dg-story-dl-btn:hover,#dg-story-open-btn:hover{opacity:.7}#dg-story-dl-btn svg,#dg-story-open-btn svg{width:24px;height:24px}`;
        document.head.appendChild(style);
      }

      createButtonWithPolling() {
        let attempts = 0;
        const interval = setInterval(() => {
          if (document.getElementById('dg-story-dl-btn') || this.createButton() || ++attempts >= MAX_ATTEMPTS) clearInterval(interval);
        }, 500);
      }

      createButton() {
        if (document.getElementById('dg-story-dl-btn')) return null;
        const topBar = Array.from(document.querySelectorAll('div.xtotuo0')).find(b => b instanceof HTMLElement && b.offsetHeight > 0);
        if (!topBar) return null;

        const btn = document.createElement('button');
        btn.id = 'dg-story-dl-btn';
        btn.title = 'Download Story';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
        btn.addEventListener('click', () => this.handleDownload());

        const openBtn = document.createElement('button');
        openBtn.id = 'dg-story-open-btn';
        openBtn.className = 'igStoryBtn';
        openBtn.title = 'Open in new tab';
        openBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;
        openBtn.addEventListener('click', async () => {
          try {
            await this.detectMedia();
            if (this.mediaUrl) window.open(this.mediaUrl, '_blank');
          } catch (e) { console.error('[DEV/g0d] Story open tab failed:', e); }
        });

        topBar.appendChild(openBtn);
        topBar.appendChild(btn);
        return btn;
      }

      async handleDownload() {
        try {
          await this.detectMedia();
          if (!this.mediaUrl) throw new Error('No media found');
          await this.downloadMedia(this.mediaUrl, this.generateFileName());
        } catch (e) { console.error('[DEV/g0d] Story download failed:', e); }
      }

      async detectMedia() {
        const video = this.findVideo(), image = this.findImage();
        if (video) { this.mediaUrl = video; this.detectedVideo = true; }
        else if (image) { this.mediaUrl = image.src; this.detectedVideo = false; }
      }

      findVideo() {
        for (const v of document.querySelectorAll('video')) {
          if (v.offsetHeight > 0) { const url = this.searchVideoSource(v); if (url) return url; }
        }
        return null;
      }

      searchVideoSource(video) {
        const reactFiberKey = Object.keys(video).find(k => k.startsWith('__reactFiber'));
        if (!reactFiberKey) return null;
        const reactKey = reactFiberKey.replace('__reactFiber', '');
        const parent = video.parentElement?.parentElement?.parentElement?.parentElement;
        const reactProps = parent?.[`__reactProps${reactKey}`];
        const implementations = reactProps?.children?.[0]?.props?.children?.props?.implementations ?? reactProps?.children?.props?.children?.props?.implementations;
        if (implementations) {
          for (const index of [1, 0, 2]) {
            const source = implementations[index]?.data;
            const url = source?.hdSrc || source?.sdSrc || source?.hd_src || source?.sd_src;
            if (url) return url;
          }
        }
        const videoData = video[reactFiberKey]?.return?.stateNode?.props?.videoData?.$1;
        return videoData?.hd_src || videoData?.sd_src || null;
      }

      findImage() {
        const images = Array.from(document.querySelectorAll('img')).filter(img => img.offsetHeight > 0 && img.src.includes('cdn'));
        return images.find(img => img.height > 400) || null;
      }

      generateFileName() {
        const timestamp = new Date().toISOString().split('T')[0];
        const user = Array.from(document.querySelectorAll('span.xuxw1ft.xlyipyv')).find(e => e instanceof HTMLElement && e.offsetWidth > 0);
        const userName = user?.innerText || 'unknown';
        return `${userName}-${timestamp}.${this.detectedVideo ? 'mp4' : 'jpg'}`;
      }

      async downloadMedia(url, filename) {
        try {
          const r = await fetch(url), b = await r.blob();
          const l = document.createElement('a');
          l.href = URL.createObjectURL(b); l.download = filename;
          document.body.appendChild(l); l.click();
          document.body.removeChild(l); URL.revokeObjectURL(l.href);
        } catch (e) { console.error('[DEV/g0d] Story download error:', e); }
      }
    }

    new FacebookStoryDownloader();
  }

  // ─── Register Plugins ─────────────────────────────────────────────────────
  window.DEVg0d_PLUGINS = [
    {
      name: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>VideoDownloader',
      type: 'toggle',
      key: 'devg0d-fb-video',
      init: initFbVideoDownloader,
    },
    {
      name: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>StorySaver',
      type: 'toggle',
      key: 'devg0d-fb-story',
      init: initFbStorySaver,
    },
  ];

})();
