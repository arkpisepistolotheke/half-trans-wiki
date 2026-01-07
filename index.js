// ==UserScript==
// @name         半跨wiki跳转（从 wiki 加载映射）
// @namespace    https://akp.fandom.com/zh/*
// @version      1.2
// @description  将短码链接直接跳转到外部站点
// @author       ChatGPT
// @match        https://akp.fandom.com/zh/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 配置：wiki 上的 JSON 页面（raw）
  const WIKI_CONFIG_PAGE = 'Help:HTW/map.json';
  let SHORT_MAP = {};

  function parseShortcode(text) {
    if (!text) return null;
    const raw = decodeURIComponent(text);
    const m = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!m) return null;
    return { code: m[1], path: m[2] };
  }

  function resolveShortcode(short) {
    const map = SHORT_MAP[short.code];
    if (!map) return null;
    // map 期望为数组: [protocol, subdomain, sld, tld, pathTemplate]
    const [protocol, part1, part2, part3, pathTemplate] = map;
    const domainParts = [part1, part2, part3].filter(Boolean);
    const domain = domainParts.join('.');
    const pathTmpl = pathTemplate || '/$1';
    const path = pathTmpl.replace(/\$1/g, encodeURIComponent(short.path).replace(/%2F/g, '/'));
    return `${protocol}://${domain}${path}`;
  }

  function processHelpLinks(root = document) {
    const anchors = Array.from(root.querySelectorAll('a[href*="/zh/wiki/Help:HTW"]'));
    anchors.forEach(a => {
      if (!a.hash || a.dataset.halfCrossProcessed) return;
      const frag = a.hash.startsWith('#') ? a.hash.slice(1) : a.hash;
      const short = parseShortcode(frag);
      if (!short) { a.dataset.halfCrossProcessed = 'no-short'; return; }
      a.dataset.halfCrossProcessed = '1';
      const finalUrl = resolveShortcode(short);
      if (!finalUrl) { a.dataset.halfCrossProcessed = 'no-map'; return; }
      a.href = finalUrl;
      a.target = '_blank';
      a.rel = 'nofollow noreferrer noopener';
      a.className = 'external text transwiki-source-link';
    });
  }

  // 从 wiki 读取 JSON 映射表
  async function loadMapFromWiki(pageTitle) {
    if (!pageTitle) return null;
    const url = `/zh/index.php?title=${encodeURIComponent(pageTitle)}&action=raw`;
    try {
      const resp = await fetch(url, { credentials: 'same-origin' });
      if (!resp.ok) {
        console.warn('HalfTransWiki：无法读取映射表，HTTP', resp.status);
        return null;
      }
      const text = await resp.text();
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          console.info('HalfTransWiki：已从 wiki 加载 JSON 映射表', pageTitle);
          return parsed;
        }
      } catch (e) {
        console.warn('HalfTransWiki：读取的内容不是有效 JSON');
      }
      return null;
    } catch (err) {
      console.warn('HalfTransWiki：读取 wiki 映射表时发生错误', err);
      return null;
    }
  }

  (async function init() {
    const remote = await loadMapFromWiki(WIKI_CONFIG_PAGE);
    if (remote && typeof remote === 'object') {
      SHORT_MAP = remote; // 直接替换，简单处理
    } else {
      console.info('HalfTransWiki：未加载到远端映射表，当前映射表为空');
    }

    processHelpLinks(document);

    const observer = new MutationObserver(() => processHelpLinks(document));
    observer.observe(document.body, { childList: true, subtree: true });
  })();

})();
