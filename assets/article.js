/* ==========================================================================
   xma1Soap · 文章页
   主题切换 / 阅读进度 / 回到顶部。进度条只写 transform，读数缓存在 resize 时更新。
   ========================================================================== */
(function () {
  'use strict';

  var doc = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 主题 ---------------- */
  var themeBtn = document.getElementById('themeBtn');
  var mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  var busy = false;

  function readChoice() {
    try { return localStorage.getItem('soap-theme'); } catch (e) { return null; }
  }
  function applyTheme(t) {
    doc.setAttribute('data-theme', t);
    try { localStorage.setItem('soap-theme', t); } catch (e) {}
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      if (busy) return;
      var next = doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      var r = themeBtn.getBoundingClientRect();
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var far = Math.hypot(
        Math.max(cx, window.innerWidth - cx),
        Math.max(cy, window.innerHeight - cy)
      );
      doc.style.setProperty('--tx', cx + 'px');
      doc.style.setProperty('--ty', cy + 'px');
      doc.style.setProperty('--tr', Math.ceil(far) + 'px');

      if (document.startViewTransition && !reduce) {
        busy = true;
        var vt = document.startViewTransition(function () { applyTheme(next); });
        vt.finished.then(function () { busy = false; }, function () { busy = false; });
      } else {
        applyTheme(next);
      }
    });
  }

  if (mqDark.addEventListener) {
    mqDark.addEventListener('change', function (e) {
      if (!readChoice()) applyTheme(e.matches ? 'dark' : 'light');
    });
  }

  /* ---------------- 进度条 + 回到顶部 ---------------- */
  var bar = document.getElementById('readProgress');
  var toTop = document.getElementById('toTop');
  var maxScroll = 0;
  var ticking = false;

  function measure() {
    var h = doc;
    maxScroll = Math.max(0, h.scrollHeight - h.clientHeight);
  }

  function update() {
    ticking = false;
    var y = window.pageYOffset || doc.scrollTop || 0;
    if (bar) {
      var p = maxScroll > 0 ? y / maxScroll : 0;
      if (p < 0) p = 0; else if (p > 1) p = 1;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      bar.classList.toggle('is-done', p > 0.995);
    }
    if (toTop) toTop.classList.toggle('is-on', y > 520);
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  measure();
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measure(); update(); }, { passive: true });
  window.addEventListener('load', function () { measure(); update(); });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measure(); update(); });
  }

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  }

  /* 移动端目录：按钮展开，选完自动收起 */
  var railMobile = document.getElementById('railMobile');
  var railToggle = document.getElementById('railToggle');
  if (railMobile && railToggle) {
    railToggle.addEventListener('click', function () {
      var open = railMobile.classList.toggle('is-open');
      railToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    railMobile.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a.rail-link');
      if (!link) return;
      railMobile.classList.remove('is-open');
      railToggle.setAttribute('aria-expanded', 'false');
    });
  }

  /* 目录锚点：平滑滚动并补偿吸顶高度 */
  var post = document.getElementById('post');
  if (post) {
    post.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var head = document.querySelector('.site-head');
      var offset = (head ? head.offsetHeight : 0) + 14;
      var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
      history.replaceState(null, '', '#' + id);
    });
  }
})();
