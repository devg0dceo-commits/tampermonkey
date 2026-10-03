// ==UserScript==
// @name         DEVg0d Freetp.org
// @namespace    FREELOADING
// @description  DEV/g0d - เพิ่มภาษาไทยตรงเปลี่ยนภาษาบนหน้าเว็ป
// @author       DEV/g0d
// @license      MIT
// @icon         https://freetp.org/favicon.ico
// @version      1.0
// @match        https://freetp.org/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    function replaceLang() {
        const target = document.querySelector('a.nturl[data-gt-lang="zh-TW"]');
        if (!target) return;
        if (target.getAttribute('data-gt-lang') !== 'th') {
            target.setAttribute('data-gt-lang', 'th');
            target.innerHTML = `<img data-gt-lazy-src="https://cdn.gtranslate.net/flags/svg/th.svg" alt="th" src="https://cdn.gtranslate.net/flags/svg/th.svg"> ไทย`;
        }
    }
    replaceLang();
    const observer = new MutationObserver(() => {
        replaceLang();
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
