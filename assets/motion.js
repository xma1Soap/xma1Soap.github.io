/* ==========================================================================
   xma1Soap · 交互反馈
   1) 点击涟漪：pointerdown 时在被点元素内插入一个扩散圆
   2) 站内跳转：先淡出再导航，并由 bfcache 返回时复位
   动效只有 transform / opacity，且尊重 prefers-reduced-motion。
   ========================================================================== */
(function () {
  'use strict';

  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var HOSTS = [
    '.chip', '.sort-btn', '.theme-btn', '.back', '.pn', '.card',
    '.empty-reset', '.about-links a', '.search-clear', '.to-top',
    '.rail-link', '.rail-toggle'
  ].join(',');

  /* ---------------- 点击涟漪 ---------------- */
  document.addEventListener('pointerdown', function (e) {
    if (mqReduce.matches) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    var el = e.target && e.target.closest ? e.target.closest(HOSTS) : null;
    if (!el) return;

    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var d = Math.max(rect.width, rect.height) * 1.15;
    var span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = d + 'px';
    span.style.height = d + 'px';
    span.style.left = (e.clientX - rect.left - d / 2) + 'px';
    span.style.top = (e.clientY - rect.top - d / 2) + 'px';

    el.appendChild(span);

    var kill = function () {
      if (span.parentNode) span.parentNode.removeChild(span);
    };
    span.addEventListener('animationend', kill);
    setTimeout(kill, 900);
  }, { passive: true });

  /* ---------------- 站内跳转淡出 ---------------- */
  var leaving = false;

  function reset() {
    leaving = false;
    document.body.classList.remove('is-leaving');
  }

  document.addEventListener('click', function (e) {
    if (leaving || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (mqReduce.matches) return;

    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

    var url;
    try {
      url = new URL(a.getAttribute('href'), location.href);
    } catch (err) {
      return;
    }
    if (url.origin !== location.origin) return;
    /* 同一页面的锚点交给平滑滚动，不走淡出 */
    if (url.pathname === location.pathname && url.hash) return;

    leaving = true;
    document.body.classList.add('is-leaving');
    setTimeout(function () { location.href = url.href; }, 120);
    setTimeout(reset, 1600);
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) reset();
  });

  if (mqReduce.addEventListener) {
    mqReduce.addEventListener('change', function (e) {
      if (e.matches) reset();
    });
  }
})();
