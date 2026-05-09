// ==UserScript==
// @name         DEV/g0d Instagram
// @namespace    FREELOADING
// @version      2.0
// @description  DEV/g0d - Instagram tools
// @author       DEV/g0d
// @license      MIT
// @match        *://www.instagram.com/*
// @match        *://instagram.com/*
// @exclude      *://www.facebook.com/*
// @exclude      *://facebook.com/*
// @exclude      *://*.facebook.com/*
// @exclude      *://*.fbcdn.net/*
// @icon         https://instagram.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @downloadURL  https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/instagram.user.js
// @updateURL    https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/instagram.user.js
// @require      https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/refs/heads/main/addons/instagram.js
// @run-at       document-body
// ==/UserScript==

(function () {
  'use strict';

  const getKey = (k) => localStorage.getItem(k) !== 'false';
  const setKey = (k, v) => localStorage.setItem(k, v ? 'true' : 'false');
  const L = (localStorage.getItem('devg0d-menu-pos') || 'right') === 'left';

  GM_addStyle(`
    #dg-ig-tab {
      position:fixed !important; top:50% !important; transform:translateY(-50%) !important;
      ${L?'left:0 !important':'right:0 !important'}; width:18px !important; height:48px !important;
      background:rgba(22,27,34,0.7) !important; border:1px solid rgba(48,54,61,0.5) !important;
      ${L?'border-left:none !important;border-radius:0 6px 6px 0 !important':'border-right:none !important;border-radius:6px 0 0 6px !important'};
      cursor:pointer !important; z-index:999999999 !important;
      display:flex !important; align-items:center !important; justify-content:center !important;
      color:rgba(88,166,255,0.7) !important; font-size:13px !important; user-select:none !important;
      backdrop-filter:blur(8px) !important; transition:all .15s !important;
    }
    #dg-ig-tab:hover { background:rgba(28,33,40,0.85) !important; color:#79c0ff !important; }

    #dg-ig-popup {
      position:fixed !important; top:50% !important; transform:translateY(-50%) !important;
      ${L?'left:24px !important':'right:24px !important'};
      background:rgba(13,17,23,0.75) !important; border:1px solid rgba(48,54,61,0.4) !important;
      border-radius:10px !important; padding:5px !important; min-width:200px !important;
      box-shadow:0 8px 32px rgba(0,0,0,.4) !important;
      backdrop-filter:blur(20px) !important; -webkit-backdrop-filter:blur(20px) !important;
      z-index:999999998 !important; display:none !important; flex-direction:column !important;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif !important;
    }
    #dg-ig-popup.show { display:flex !important; }

    .dg-ig-row {
      display:flex !important; align-items:center !important; gap:8px !important;
      padding:8px 10px !important; border-radius:6px !important; cursor:default !important;
      transition:background .15s !important;
    }
    .dg-ig-row:hover { background:rgba(255,255,255,0.05) !important; }
    .dg-ig-row.click { cursor:pointer !important; }
    .dg-ig-row-name { flex:1 !important; font-size:12px !important; color:rgba(201,209,217,0.9) !important; }

    .dg-ig-sw { position:relative !important; width:36px !important; height:20px !important; flex-shrink:0 !important; }
    .dg-ig-sw input { opacity:0 !important; width:0 !important; height:0 !important; }
    .dg-ig-sw span {
      position:absolute !important; inset:0 !important;
      background:rgba(33,38,45,0.8) !important; border:1px solid rgba(48,54,61,0.6) !important;
      border-radius:20px !important; cursor:pointer !important; transition:.25s !important;
    }
    .dg-ig-sw span:before {
      content:'' !important; position:absolute !important;
      width:12px !important; height:12px !important; left:3px !important; top:3px !important;
      background:#6e7681 !important; border-radius:50% !important; transition:.25s !important;
    }
    .dg-ig-sw input:checked+span { background:#238636 !important; border-color:#2ea043 !important; }
    .dg-ig-sw input:checked+span:before { transform:translateX(16px) !important; background:#fff !important; }
  `);

  const plugins = window.DEVg0d_PLUGINS || [];

  function init() {
    const tab = document.createElement('div');
    tab.id = 'dg-ig-tab';
    tab.textContent = L ? '›' : '‹';

    const popup = document.createElement('div');
    popup.id = 'dg-ig-popup';
    popup.innerHTML = plugins.map((p, i) =>
      `<div class="dg-ig-row${p.type==='click'?' click':''}" data-i="${i}">
         <span class="dg-ig-row-name">${p.name}</span>
         ${p.type==='toggle' ? `<label class="dg-ig-sw" onclick="event.stopPropagation()">
           <input type="checkbox" data-i="${i}" ${getKey(p.key)?'checked':''}><span></span>
         </label>` : ''}
       </div>`
    ).join('');

    document.body.append(tab, popup);

    tab.onclick = (e) => { e.stopPropagation(); popup.classList.toggle('show'); };
    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== tab) popup.classList.remove('show');
    });

    popup.querySelectorAll('.dg-ig-row.click').forEach(el => {
      const p = plugins[+el.dataset.i];
      if (p?.fn) el.onclick = () => p.fn();
    });

    popup.querySelectorAll('.dg-ig-sw input').forEach(input => {
      const p = plugins[+input.dataset.i];
      if (!p) return;
      input.onchange = (e) => {
        e.stopPropagation();
        setKey(p.key, input.checked);
        alert(`"${p.name}" ${input.checked?'enabled':'disabled'} — reload to apply.`);
      };
    });

    plugins.forEach(p => {
      if (p.type==='toggle' && p.init && getKey(p.key))
        try { p.init(); } catch(e) { console.error('[DEV/g0d]', e); }
    });
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

})();
