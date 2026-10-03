// ==UserScript==
// @name         DEV/g0d playmusictheory
// @namespace    FREELOADING
// @version      1.1
// @description  DEV/g0d - PRO Unlock
// @author       DEV/g0d
// @license      MIT
// @match        *://playmusictheory.net/*
// @match        *://*.playmusictheory.net/*
// @icon         https://playmusictheory.net/favicon.svg
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TARGET = '/instrument-unlock';
  const UNLOCK_CODE = '1337';
  const RESPONSE_BODY = JSON.stringify({ ok: true });

  const of = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.includes(TARGET)) {
      const resp = new Response(RESPONSE_BODY, {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
      resp.json = () => Promise.resolve({ ok: true });
      resp.text = () => Promise.resolve(RESPONSE_BODY);
      return Promise.resolve(resp);
    }
    return of.apply(this, arguments);
  };

  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (m, u) {
    this.__m = String(m).toUpperCase();
    this.__u = u;
    return XO.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this.__u && String(this.__u).includes(TARGET)) {
      const self = this;
      setTimeout(function () {
        const d = (k, v) => Object.defineProperty(self, k, { configurable: true, value: v });
        d('readyState', 4);
        d('status', 200);
        d('statusText', 'OK');
        d('responseText', RESPONSE_BODY);
        Object.defineProperty(self, 'response', {
          configurable: true,
          get: function () { return self.responseType === 'json' ? { ok: true } : RESPONSE_BODY; }
        });
        self.dispatchEvent(new Event('readystatechange'));
        self.dispatchEvent(new Event('load'));
        self.dispatchEvent(new Event('loadend'));
      }, 0);
      return;
    }
    return XS.apply(this, arguments);
  };

  function unlockNow() {
    if (typeof window.grantPro === 'function') {
      try { window.grantPro(UNLOCK_CODE); return true; } catch (e) {}
    }
    localStorage.setItem('pmt.pro', '1');
    localStorage.setItem('pmt.procode', UNLOCK_CODE);
    location.reload();
    return true;
  }

  function hook() {
    const btn = document.getElementById('codego');
    const input = document.getElementById('codein');

    if (!btn) { setTimeout(hook, 500); return; }

    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      unlockNow();
    };

    if (input) {
      input.onkeydown = function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          unlockNow();
        }
      };
    }

    const sw = document.getElementById('proswitch');
    if (sw) {
      const old = sw.onclick;
      sw.onclick = function (e) {
        e.stopPropagation();
        if (localStorage.getItem('pmt.pro') === '1') {
          if (old) old.call(this, e);
        } else {
          unlockNow();
        }
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hook);
  } else {
    hook();
  }

})();
