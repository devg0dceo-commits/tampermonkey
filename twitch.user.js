// ==UserScript==
// @name         DEV/g0d Twitch
// @namespace    FREELOADING
// @version      1.0
// @description  DEV/g0d - Watch sub-only VODs on Twitch
// @author       DEV/g0d
// @license      MIT
// @match        *://*.twitch.tv/*
// @icon         https://twitch.tv/favicon.ico
// @downloadURL  https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/twitch.user.js
// @updateURL    https://raw.githubusercontent.com/devg0dceo-commits/tampermonkey/main/twitch.user.js
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PATCH_URL = 'https://cdn.jsdelivr.net/gh/devg0dceo-commits/tampermonkey@master/addons/twitch.js';
  const KEY_NOSUB = 'devg0d-twitch-nosub';

  // ── UI (popup + toggle) ───────────────────────────────────────────────────
  function initUI() {
    const L = (localStorage.getItem('devg0d-menu-pos') || 'right') === 'left';
    const enabled = localStorage.getItem(KEY_NOSUB) !== 'false';

    const style = document.createElement('style');
    style.textContent = `
      #dg-tab {
        position:fixed; top:50%; transform:translateY(-50%);
        ${L?'left:0':'right:0'}; width:18px; height:48px;
        background:rgba(22,27,34,0.7); border:1px solid rgba(48,54,61,0.5);
        ${L?'border-left:none;border-radius:0 6px 6px 0':'border-right:none;border-radius:6px 0 0 6px'};
        cursor:pointer; z-index:999999999;
        display:flex; align-items:center; justify-content:center;
        color:rgba(88,166,255,0.7); font-size:13px; user-select:none;
        backdrop-filter:blur(8px); transition:all .15s;
      }
      #dg-tab:hover { background:rgba(28,33,40,0.85); color:#79c0ff; }
      #dg-popup {
        position:fixed; top:50%; transform:translateY(-50%);
        ${L?'left:24px':'right:24px'};
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
        padding:8px 10px; border-radius:6px;
        transition:background .15s;
      }
      .dg-row:hover { background:rgba(255,255,255,0.05); }
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
    `;
    document.head.appendChild(style);

    const tab = document.createElement('div');
    tab.id = 'dg-tab';
    tab.textContent = L ? '›' : '‹';

    const svgIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b949e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><path d="M21 2H3v16h5v4l4-4h5l4-4V2zM11 11V7m4 4V7"/></svg>`;

    const popup = document.createElement('div');
    popup.id = 'dg-popup';
    popup.innerHTML = `
      <div class="dg-row">
        <span class="dg-row-name">${svgIcon}SubBypass</span>
        <label class="dg-sw" onclick="event.stopPropagation()">
          <input type="checkbox" id="dg-twitch-toggle" ${enabled ? 'checked' : ''}>
          <span></span>
        </label>
      </div>`;

    document.body.append(tab, popup);

    tab.onclick = (e) => { e.stopPropagation(); popup.classList.toggle('show'); };
    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== tab) popup.classList.remove('show');
    });

    popup.querySelector('#dg-twitch-toggle').onchange = function (e) {
      e.stopPropagation();
      localStorage.setItem(KEY_NOSUB, this.checked ? 'true' : 'false');
      alert(`SubBypass ${this.checked ? 'enabled' : 'disabled'} — reload to apply.`);
    };
  }

  // ── Worker Patch (only when enabled) ─────────────────────────────────────
  function initPatch() {
    if (localStorage.getItem(KEY_NOSUB) === 'false') return;

    function getWasmWorkerJs(blobUrl) {
      const req = new XMLHttpRequest();
      req.open('GET', blobUrl.replaceAll("'", "%27"), false);
      req.overrideMimeType('text/javascript');
      req.send();
      return req.responseText;
    }

    const OrigWorker = window.Worker;
    window.Worker = class Worker extends OrigWorker {
      constructor(twitchBlobUrl) {
        const workerString = getWasmWorkerJs(twitchBlobUrl);
        const patched = URL.createObjectURL(new Blob([`
          importScripts('${PATCH_URL}');
          ${workerString}
        `]));
        super(patched);
      }
    };

    // Remove sub-only restriction badges
    const removeRestrictions = () =>
      document.querySelectorAll('.video-preview-card-restriction').forEach(el => el.remove());

    new MutationObserver((mutations) => {
      mutations.forEach(({ addedNodes }) => {
        addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.classList?.contains('video-preview-card-restriction')) { node.remove(); return; }
          node.querySelectorAll?.('.video-preview-card-restriction').forEach(el => el.remove());
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });

    removeRestrictions();
  }

  // Worker patch ต้อง run ก่อน document ready
  initPatch();

  // UI รอ body พร้อมก่อน
  if (document.body) initUI();
  else document.addEventListener('DOMContentLoaded', initUI);

})();
