// DEV/g0d - Telegram Addon

(function () {

  function initTgDownloader() {
    const REFRESH_DELAY = 500, contentRangeRegex = /^bytes (\d+)-(\d+)\/(\d+)$/;
    const hashCode = s => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return h >>> 0; };
    const downloads = new Map();

    const style = document.createElement('style');
    style.textContent = `#tel-dl-box{position:fixed;bottom:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;font-family:system-ui,sans-serif}.tel-item{background:rgba(30,30,30,.95);backdrop-filter:blur(10px);border-radius:12px;padding:12px 16px;min-width:260px;box-shadow:0 4px 20px rgba(0,0,0,.3);animation:slideIn .3s}@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}.tel-item.done{animation:fadeOut .5s 3s forwards}@keyframes fadeOut{to{opacity:0;transform:translateX(20px)}}.tel-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.tel-name{color:#fff;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}.tel-x{background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:0}.tel-x:hover{color:#fff}.tel-bar{height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden;margin-bottom:6px}.tel-fill{height:100%;background:linear-gradient(90deg,#6B8DD6,#8E37D7);border-radius:3px;transition:width .3s;width:0}.tel-item.queued .tel-fill{background:#666;width:100%}.tel-item.done .tel-fill{background:linear-gradient(90deg,#4CAF50,#8BC34A);width:100%}.tel-item.err .tel-fill{background:#f44336;width:100%}.tel-stat{display:flex;justify-content:space-between;align-items:center}.tel-pct{color:#aaa;font-size:12px}.tel-retry{background:none;border:none;color:#6B8DD6;font-size:12px;cursor:pointer;text-decoration:underline}.tel-btn{display:flex;align-items:center;justify-content:center;background:transparent;border:none;cursor:pointer;padding:8px;border-radius:50%;transition:background .2s}.tel-btn:hover{background:rgba(255,255,255,.1)}.tel-btn svg{width:24px;height:24px;fill:currentColor}`;
    document.head.appendChild(style);

    const box = document.createElement('div'); box.id = 'tel-dl-box'; document.body.appendChild(box);

    const createItem = (id, name) => { let el = document.getElementById('tel-' + id); if (!el) { el = document.createElement('div'); el.id = 'tel-' + id; el.className = 'tel-item'; el.innerHTML = `<div class="tel-hdr"><span class="tel-name">${name}</span><button class="tel-x">&times;</button></div><div class="tel-bar"><div class="tel-fill"></div></div><div class="tel-stat"><span class="tel-pct">0%</span></div>`; el.querySelector('.tel-x').onclick = () => { el.remove(); downloads.delete(id); resumeNext(); }; box.appendChild(el); } if (box.querySelectorAll('.tel-item:not(.queued):not(.done):not(.err)').length > 2) { el.classList.add('queued'); el.querySelector('.tel-pct').textContent = 'Queued'; } return el; };
    const updateItem = (id, name, pct, url) => { const el = document.getElementById('tel-' + id); if (!el) return; el.querySelector('.tel-name').textContent = name; el.querySelector('.tel-fill').style.width = pct + '%'; el.querySelector('.tel-pct').textContent = pct + '%'; el.setAttribute('data-url', url); };
    const doneItem = id => { const el = document.getElementById('tel-' + id); if (!el) return; el.classList.add('done'); el.querySelector('.tel-pct').textContent = 'Completed'; setTimeout(() => { el?.remove(); downloads.delete(id); }, 3500); resumeNext(); };
    const errItem = id => { const el = document.getElementById('tel-' + id); if (!el) return; el.classList.add('err'); el.querySelector('.tel-stat').innerHTML = `<span class="tel-pct">Failed</span><button class="tel-retry">Retry</button>`; el.querySelector('.tel-retry').onclick = () => { el.classList.remove('err'); el.querySelector('.tel-fill').style.width = '0'; el.querySelector('.tel-stat').innerHTML = '<span class="tel-pct">0%</span>'; dlVideo(el.getAttribute('data-url'), id); }; resumeNext(); };
    const resumeNext = () => { if (box.querySelectorAll('.tel-item:not(.queued):not(.done):not(.err)').length < 2) { const next = box.querySelector('.tel-item.queued'); if (next) { const id = next.id.replace('tel-', ''); const d = downloads.get(id); if (d?.resume) { next.classList.remove('queued'); next.querySelector('.tel-pct').textContent = '0%'; d.resume(); } } } };

    const dlVideo = (url, id) => {
      let blobs = [], offset = 0, total = null, ext = 'mp4';
      id = id || Math.random().toString(36).slice(2, 10) + '_' + Date.now();
      let name = hashCode(url).toString(36) + '.' + ext;
      try { const m = JSON.parse(decodeURIComponent(url.split('/').pop())); if (m.fileName) name = m.fileName; } catch {}
      const fetchPart = w => {
        fetch(url, { method: 'GET', headers: { Range: `bytes=${offset}-` } })
          .then(r => { if (![200, 206].includes(r.status)) throw new Error('Status ' + r.status); const mime = r.headers.get('Content-Type')?.split(';')[0]; if (mime?.startsWith('video/')) { ext = mime.split('/')[1]; name = name.replace(/\.[^.]+$/, '.' + ext); } const m = r.headers.get('Content-Range')?.match(contentRangeRegex); if (m) { if (parseInt(m[1]) !== offset) throw new Error('Gap'); offset = parseInt(m[2]) + 1; total = parseInt(m[3]); updateItem(id, name, Math.floor(offset * 100 / total), url); } return r.blob(); })
          .then(b => w ? w.write(b) : blobs.push(b))
          .then(() => { if (!total) throw new Error('No size'); if (offset < total) { const el = document.getElementById('tel-' + id); if (el?.classList.contains('queued')) downloads.set(id, { resume: () => fetchPart(w) }); else fetchPart(w); } else { if (w) w.close(); else saveBlob(blobs, name); doneItem(id); } })
          .catch(() => errItem(id));
      };
      const saveBlob = (b, n) => { const url = URL.createObjectURL(new Blob(b, { type: 'video/mp4' })); const a = document.createElement('a'); a.href = url; a.download = n; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); };
      if ('showSaveFilePicker' in window && window.self === window.top) window.showSaveFilePicker({ suggestedName: name }).then(h => h.createWritable()).then(w => { createItem(id, name); fetchPart(w); }).catch(() => { createItem(id, name); fetchPart(null); }); else { createItem(id, name); fetchPart(null); }
    };

    const dlAudio = url => {
      let blobs = [], offset = 0, total = null; const name = hashCode(url).toString(36) + '.ogg';
      const fetchPart = w => {
        fetch(url, { method: 'GET', headers: { Range: `bytes=${offset}-` } })
          .then(r => { if (![200, 206].includes(r.status)) return; const m = r.headers.get('Content-Range')?.match(contentRangeRegex); if (m) { offset = parseInt(m[2]) + 1; total = parseInt(m[3]); } return r.blob(); })
          .then(b => w ? w.write(b) : blobs.push(b))
          .then(() => { if (offset < total) fetchPart(w); else { if (w) w.close(); else { const url = URL.createObjectURL(new Blob(blobs, { type: 'audio/ogg' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); } } })
          .catch(console.error);
      };
      if ('showSaveFilePicker' in window && window.self === window.top) window.showSaveFilePicker({ suggestedName: name }).then(h => h.createWritable()).then(w => fetchPart(w)).catch(() => fetchPart(null)); else fetchPart(null);
    };

    const dlImage = url => { const a = document.createElement('a'); a.href = url; a.download = Math.random().toString(36).slice(2, 10) + '.jpeg'; document.body.appendChild(a); a.click(); a.remove(); };
    const dlSvg = `<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    const DOWNLOAD_ICON = '\uE95A';

    setInterval(() => {
      const stories = document.getElementById('StoryViewer');
      if (stories && !stories.querySelector('.tel-btn')) { const hdr = stories.querySelector('.GrsJNw3y') || stories.querySelector('.DropdownMenu')?.parentNode; if (hdr) { const btn = document.createElement('button'); btn.className = 'Button tiny translucent-white round tel-btn'; btn.title = 'Download'; btn.innerHTML = dlSvg; btn.onclick = () => { const v = stories.querySelector('video'); if (v?.src || v?.currentSrc) dlVideo(v.src || v.currentSrc); else { const img = stories.querySelectorAll('img.PVZ8TOWS'); if (img.length) dlImage(img[img.length - 1].src); } }; hdr.insertBefore(btn, hdr.querySelector('button')); } }
      const mv = document.querySelector('#MediaViewer .MediaViewerSlide--active'), ma = document.querySelector('#MediaViewer .MediaViewerActions');
      if (mv && ma && !ma.querySelector('.tel-btn')) { const vp = mv.querySelector('.VideoPlayer video'), img = mv.querySelector('.MediaViewerContent > div > img'); if (vp?.currentSrc) { const btn = document.createElement('button'); btn.className = 'Button smaller translucent-white round tel-btn'; btn.title = 'Download'; btn.innerHTML = dlSvg; btn.onclick = () => dlVideo(vp.currentSrc); ma.prepend(btn); } else if (img?.src) { const btn = document.createElement('button'); btn.className = 'Button smaller translucent-white round tel-btn'; btn.title = 'Download'; btn.innerHTML = dlSvg; btn.onclick = () => dlImage(img.src); ma.prepend(btn); } }
      const sk = document.getElementById('stories-viewer');
      if (sk) { const hdr = sk.querySelector("[class^='_ViewerStoryHeaderRight']"), ftr = sk.querySelector("[class^='_ViewerStoryFooterRight']"); [hdr, ftr].forEach(el => { if (el && !el.querySelector('.tel-btn')) { const btn = document.createElement('button'); btn.className = 'btn-icon rp tel-btn'; btn.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span>`; btn.title = 'Download'; btn.onclick = () => { const v = sk.querySelector('video.media-video'); if (v?.src || v?.currentSrc) dlVideo(v.src || v.currentSrc); else { const img = sk.querySelector('img.media-photo'); if (img?.src) dlImage(img.src); } }; el.prepend(btn); } }); }
      const mc = document.querySelector('.media-viewer-whole'), asp = mc?.querySelector('.media-viewer-movers .media-viewer-aspecter'), btns = mc?.querySelector('.media-viewer-topbar .media-viewer-buttons');
      if (asp && btns) { const v = asp.querySelector('video'), img = asp.querySelector('img.thumbnail'); if (v?.src && !btns.querySelector('.tel-btn')) { const btn = document.createElement('button'); btn.className = 'btn-icon tel-btn'; btn.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span>`; btn.title = 'Download'; btn.style.color = 'white'; btn.onclick = () => dlVideo(v.src); btns.prepend(btn); } else if (img?.src && !btns.querySelector('.tel-btn')) { const btn = document.createElement('button'); btn.className = 'btn-icon tel-btn'; btn.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span>`; btn.title = 'Download'; btn.style.color = 'white'; btn.onclick = () => dlImage(img.src); btns.prepend(btn); } const ctrl = asp.querySelector('.default__controls.ckin__controls .bottom-controls .right-controls'); if (ctrl && v?.src && !ctrl.querySelector('.tel-btn')) { const btn = document.createElement('button'); btn.className = 'btn-icon default__button tel-btn'; btn.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span>`; btn.title = 'Download'; btn.style.color = 'white'; btn.onclick = () => dlVideo(v.src); ctrl.prepend(btn); } }
      document.querySelectorAll('audio-element').forEach(el => { const bubble = el.closest('.bubble'); if (bubble && !bubble.querySelector('.tel-btn') && el.audio?.src) { const btn = document.createElement('button'); btn.className = 'btn-icon tel-btn'; btn.innerHTML = `<span class="tgico">${DOWNLOAD_ICON}</span>`; btn.title = 'Download'; btn.onclick = e => { e.stopPropagation(); dlAudio(el.audio.src); }; bubble.querySelector('.audio-wrapper')?.appendChild(btn); } });
    }, REFRESH_DELAY);
  }

  // ─── Register Plugins ─────────────────────────────────────────────────────
  window.DEVg0d_PLUGINS = [
    {
      name: '📥 MediaDownloader',
      desc: 'Download videos, images, audio',
      type: 'toggle',
      key: 'devg0d-tg-downloader',
      init: initTgDownloader,
    },
  ];

})();
