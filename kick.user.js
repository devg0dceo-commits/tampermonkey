// ==UserScript==
// @name         DEV/g0d Kick
// @namespace    FREELOADING
// @version      1.1
// @description  DEV/g0d - Kick tools
// @author       DEV/g0d
// @license      MIT
// @match        *://kick.com/*
// @match        *://*.kick.com/*
// @icon         https://kick.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @downloadURL  https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/kick.user.js
// @updateURL    https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/kick.user.js
// @require      https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/refs/heads/main/addons/kick.js
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  if (window.self !== window.top) return;

  const getKey = (k) => localStorage.getItem(k) !== 'false';
  const setKey = (k, v) => localStorage.setItem(k, v ? 'true' : 'false');
  const L = (localStorage.getItem('devg0d-menu-pos') || 'right') === 'left';

  GM_addStyle(`
    #dg-kick-tab {
      position:fixed !important; top:50% !important; transform:translateY(-50%) !important;
      ${L?'left:0 !important':'right:0 !important'}; width:18px !important; height:48px !important;
      background:rgba(22,27,34,0.7) !important; border:1px solid rgba(48,54,61,0.5) !important;
      ${L?'border-left:none !important;border-radius:0 6px 6px 0 !important':'border-right:none !important;border-radius:6px 0 0 6px !important'};
      cursor:pointer !important; z-index:999999999 !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      color:rgba(88,166,255,0.7) !important; font-size:13px !important; user-select:none !important;
      backdrop-filter:blur(8px) !important; transition:all .15s !important;
    }
    #dg-kick-tab:hover { background:rgba(28,33,40,0.85) !important; color:#79c0ff !important; }

    #dg-kick-popup {
      position:fixed !important; top:50% !important; transform:translateY(-50%) !important;
      ${L?'left:24px !important':'right:24px !important'};
      background:rgba(13,17,23,0.75) !important; border:1px solid rgba(48,54,61,0.4) !important;
      border-radius:10px !important; padding:5px !important; min-width:200px !important;
      box-shadow:0 8px 32px rgba(0,0,0,.4) !important;
      backdrop-filter:blur(20px) !important; -webkit-backdrop-filter:blur(20px) !important;
      z-index:999999998 !important; display:none !important; flex-direction:column !important;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif !important;
    }
    #dg-kick-popup.show { display:flex !important; }

    .dg-kick-row {
      display:flex !important; align-items:center !important; gap:8px !important;
      padding:8px 10px !important; border-radius:6px !important; cursor:default !important;
      transition:background .15s !important;
    }
    .dg-kick-row:hover { background:rgba(255,255,255,0.05) !important; }
    .dg-kick-row.click { cursor:pointer !important; }
    .dg-kick-row-name { flex:1 !important; font-size:12px !important; color:rgba(201,209,217,0.9) !important; }

    .dg-kick-sw { position:relative !important; width:36px !important; height:20px !important; flex-shrink:0 !important; }
    .dg-kick-sw input { opacity:0 !important; width:0 !important; height:0 !important; }
    .dg-kick-sw span {
      position:absolute !important; inset:0 !important;
      background:rgba(33,38,45,0.8) !important; border:1px solid rgba(48,54,61,0.6) !important;
      border-radius:20px !important; cursor:pointer !important; transition:.25s !important;
    }
    .dg-kick-sw span:before {
      content:'' !important; position:absolute !important;
      width:12px !important; height:12px !important; left:3px !important; top:3px !important;
      background:#6e7681 !important; border-radius:50% !important; transition:.25s !important;
    }
    .dg-kick-sw input:checked+span { background:#238636 !important; border-color:#2ea043 !important; }
    .dg-kick-sw input:checked+span:before { transform:translateX(16px) !important; background:#fff !important; }
  `);

  const plugins = window.DEVg0d_PLUGINS || [];

  function buildUI() {
    const tab = document.createElement('div');
    tab.id = 'dg-kick-tab';
    tab.textContent = L ? '›' : '‹';

    const popup = document.createElement('div');
    popup.id = 'dg-kick-popup';
    popup.innerHTML = plugins.map((p, i) =>
      `<div class="dg-kick-row${p.type==='click'?' click':''}" data-i="${i}">
         <span class="dg-kick-row-name">${p.name}</span>
         ${p.type==='toggle' ? `<label class="dg-kick-sw" onclick="event.stopPropagation()">
           <input type="checkbox" data-i="${i}" ${getKey(p.key)?'checked':''}><span></span>
         </label>` : ''}
       </div>`
    ).join('');

    document.body.append(tab, popup);

    tab.onclick = (e) => { e.stopPropagation(); popup.classList.toggle('show'); };
    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== tab) popup.classList.remove('show');
    });

    popup.querySelectorAll('.dg-kick-row.click').forEach(el => {
      const p = plugins[+el.dataset.i];
      if (p?.fn) el.onclick = () => p.fn();
    });

    popup.querySelectorAll('.dg-kick-sw input').forEach(input => {
      const p = plugins[+input.dataset.i];
      if (!p) return;
      input.onchange = (e) => {
        e.stopPropagation();
        setKey(p.key, input.checked);
        alert(`"${p.name.replace(/<[^>]+>/g, '')}" ${input.checked?'enabled':'disabled'} — reload to apply.`);
      };
    });

    // เรียก init ของ plugin ที่เปิดอยู่ (Force1080p ถูก init ไปแล้วใน addon
    // แต่ถ้ามี plugin อื่นในอนาคต จะ init ที่นี่)
    plugins.forEach(p => {
      if (p.type==='toggle' && p.init && getKey(p.key))
        try { p.init(); } catch(e) { console.error('[DEV/g0d]', e); }
    });
  }

  function whenReady(fn) {
    if (window.__dgPluginsReady) { fn(); return; }
    window.addEventListener('dg-plugins-ready', fn, { once: true });
    let tries = 0;
    const iv = setInterval(() => {
      if (window.__dgPluginsReady) {
        clearInterval(iv);
        window.removeEventListener('dg-plugins-ready', fn);
        fn();
      } else if (++tries > 100) {
        clearInterval(iv);
        console.warn('[DEV/g0d] plugins not loaded — building UI with empty list');
        fn();
      }
    }, 100);
  }

  whenReady(() => {
    if (document.body) {
      buildUI();
    } else {
      const obs = new MutationObserver(() => {
        if (document.body) { obs.disconnect(); buildUI(); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
  });

})();
