// ==UserScript==
// @name         DEV/g0d Twitter/X
// @namespace    FREELOADING
// @version      1.0
// @description  DEV/g0d - Twitter/X tools
// @author       DEV/g0d
// @license      MIT
// @match        *://twitter.com/*
// @match        *://x.com/*
// @icon         https://x.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      api.fxtwitter.com
// @connect      video.twimg.com
// @downloadURL  https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/x-twitter.user.js
// @updateURL    https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/x-twitter.user.js
// @require      https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/addons/x-twitter.js
// @run-at       document-body
// ==/UserScript==

(function () {
  'use strict';
  if (window.self !== window.top) return;

  const getKey = (k) => localStorage.getItem(k) !== 'false';
  const setKey = (k, v) => localStorage.setItem(k, v ? 'true' : 'false');
  const L = (localStorage.getItem('devg0d-menu-pos') || 'right') === 'left';

  GM_addStyle(`
    #dg-tab {
      position:fixed; top:50%; transform:translateY(-50%);
      ${L ? 'left:0' : 'right:0'}; width:18px; height:48px;
      background:rgba(22,27,34,0.7); border:1px solid rgba(48,54,61,0.5);
      ${L ? 'border-left:none;border-radius:0 6px 6px 0' : 'border-right:none;border-radius:6px 0 0 6px'};
      cursor:pointer; z-index:999999999;
      display:flex; align-items:center; justify-content:center;
      color:rgba(88,166,255,0.7); font-size:13px; user-select:none;
      backdrop-filter:blur(8px); transition:all .15s;
    }
    #dg-tab:hover { background:rgba(28,33,40,0.85); color:#79c0ff; }

    #dg-popup {
      position:fixed; top:50%; transform:translateY(-50%);
      ${L ? 'left:24px' : 'right:24px'};
      background:rgba(13,17,23,0.75); border:1px solid rgba(48,54,61,0.4);
      border-radius:10px; padding:5px; min-width:200px;
      box-shadow:0 8px 32px rgba(0,0,0,.4);
      backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
      z-index:999999998; display:none; flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    #dg-popup.show { display:flex; }

    .dg-row {
      display:flex; align-items:center; gap:8px;
      padding:8px 10px; border-radius:6px; cursor:default;
      transition:background .15s;
    }
    .dg-row:hover { background:rgba(255,255,255,0.05); }
    .dg-row.click { cursor:pointer; }
    .dg-row-name { flex:1; font-size:12px; color:rgba(201,209,217,0.9); }

    .dg-sw { position:relative; width:36px; height:20px; flex-shrink:0; }
    .dg-sw input { opacity:0; width:0; height:0; }
    .dg-sw span {
      position:absolute; inset:0;
      background:rgba(33,38,45,0.8); border:1px solid rgba(48,54,61,0.6);
      border-radius:20px; cursor:pointer; transition:.25s;
    }
    .dg-sw span:before {
      content:''; position:absolute;
      width:12px; height:12px; left:3px; top:3px;
      background:#6e7681; border-radius:50%; transition:.25s;
    }
    .dg-sw input:checked+span { background:#238636; border-color:#2ea043; }
    .dg-sw input:checked+span:before { transform:translateX(16px); background:#fff; }
  `);

  const plugins = window.DEVg0d_PLUGINS || [];

  const tab = document.createElement('div');
  tab.id = 'dg-tab';
  tab.textContent = L ? '›' : '‹';

  const popup = document.createElement('div');
  popup.id = 'dg-popup';
  popup.innerHTML = plugins.map((p, i) =>
    `<div class="dg-row${p.type === 'click' ? ' click' : ''}" data-i="${i}">
       <span class="dg-row-name">${p.name}</span>
       ${p.type === 'toggle' ? `<label class="dg-sw" onclick="event.stopPropagation()">
         <input type="checkbox" data-i="${i}" ${getKey(p.key) ? 'checked' : ''}><span></span>
       </label>` : ''}
     </div>`
  ).join('');

  document.body.append(tab, popup);

  tab.onclick = (e) => { e.stopPropagation(); popup.classList.toggle('show'); };
  document.addEventListener('click', (e) => {
    if (!popup.contains(e.target) && e.target !== tab) popup.classList.remove('show');
  });

  popup.querySelectorAll('.dg-row.click').forEach(el => {
    const p = plugins[+el.dataset.i];
    if (p?.fn) el.onclick = () => p.fn();
  });

  popup.querySelectorAll('.dg-sw input').forEach(input => {
    const p = plugins[+input.dataset.i];
    if (!p) return;
    input.onchange = (e) => {
      e.stopPropagation();
      setKey(p.key, input.checked);
      alert(`"${p.label ?? p.key}" ${input.checked ? 'enabled' : 'disabled'} — reload to apply.`);
    };
  });

  plugins.forEach(p => {
    if (p.type === 'toggle' && p.init && getKey(p.key))
      try { p.init(); } catch (e) { console.error('[DEV/g0d]', e); }
  });

})();
