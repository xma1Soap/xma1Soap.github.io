/* ==========================================================================
   xma1Soap · 页面转场
   去程：点卡片 → 克隆卡片原地放大，其余卡片向四周散开缩小，克隆里的
         文字先淡出，纸块继续铺满整屏，然后导航。
   回程：正文收拢淡出 → 首页卡片从下方聚合归位，滚动位置跟着还原。
   跨文档没法共用 View Transitions，所以用 sessionStorage 传一次意图，
   两边各自播半段，颜色对齐 body 底色，接缝看不出来。
   只用 transform / opacity，且尊重 prefers-reduced-motion。
   ========================================================================== */
(function () {
  'use strict';

  var doc = document.documentElement;
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var KEY = 'soap-vt';
  var EASE = 'cubic-bezier(.16,.84,.28,1)';
  var EASE_SOFT = 'cubic-bezier(.22,.61,.36,1)';

  var isHome = !!document.getElementById('grid');
  var isPost = !!document.getElementById('post');
  var busy = false;
  var entryScroll = 0;
  var entryHref = '';

  window.__soapVTReady = true;

  function reduce() { return mqReduce.matches; }

  function readEntry() {
    try {
      var raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s.t !== 'number') return null;
      return s;
    } catch (e) { return null; }
  }
  function writeEntry(obj) {
    try { sessionStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function clearEntry() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }

  /* ---------------- 进入页面 ---------------- */
  function revealBody() {
    if (reduce()) {
      doc.classList.remove('vt-in', 'vt-reveal');
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        doc.classList.add('vt-reveal');
      });
    });
    /* 收尾：把遮罩状态摘掉，body 回到正常不透明 */
    setTimeout(function () {
      doc.classList.remove('vt-in', 'vt-reveal');
    }, 460);
  }

  function enterHome(entry) {
    if (entry && entry.scroll > 0) {
      try { history.scrollRestoration = 'manual'; } catch (e) {}
      try {
        window.scrollTo({ top: entry.scroll, left: 0, behavior: 'instant' });
      } catch (e) {
        window.scrollTo(0, entry.scroll);
      }
    }
    revealBody();

    var vh = window.innerHeight || 800;
    if (!reduce()) {
      var cards = document.querySelectorAll('#grid .card');
      var n = 0;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        if (c.classList.contains('is-hidden')) continue;
        var r = c.getBoundingClientRect();
        if (!r.width || r.top > vh + 60 || r.bottom < -80) continue;
        c.animate([
          { opacity: 0, transform: 'translate3d(0,24px,0) scale(0.9)' },
          { opacity: 1, transform: 'none' }
        ], {
          duration: 480,
          delay: 40 + Math.min(n, 9) * 28,
          easing: EASE,
          fill: 'backwards'
        });
        n++;
      }

      var chrome = document.querySelectorAll('.masthead-inner, .archive-head, .toolbar');
      for (var j = 0; j < chrome.length; j++) {
        chrome[j].animate(
          [{ opacity: 0 }, { opacity: 1 }],
          { duration: 420, delay: 40 + j * 55, easing: 'ease-out', fill: 'backwards' }
        );
      }
    }

    /* 把“你刚从这张卡进去”标出来，回来时能一眼找到位置 */
    if (entry && entry.href) {
      var back = document.querySelector('#grid .card[href="' + entry.href + '"]');
      if (back) {
        setTimeout(function () { back.classList.add('is-return'); }, 340);
        setTimeout(function () { back.classList.remove('is-return'); }, 1700);
      }
    }
    clearEntry();
  }

  function enterPost(entry) {
    entryScroll = (entry && entry.scroll) || 0;
    entryHref = (entry && entry.href) || '';
    revealBody();
    clearEntry();
    if (reduce()) return;

    var sels = ['.post .hero-tag', '.post h1', '.post .subtitle', '.post .meta', '.post .intro'];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (!el) continue;
      el.animate([
        { opacity: 0, transform: 'translate3d(0,16px,0)' },
        { opacity: 1, transform: 'none' }
      ], {
        duration: 400,
        delay: 90 + i * 38,
        easing: EASE_SOFT,
        fill: 'backwards'
      });
    }

    var rail = document.querySelector('.rail');
    if (rail) {
      rail.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 400, delay: 120, easing: 'ease-out', fill: 'backwards'
      });
    }
  }

  /* ---------------- 离开首页：卡片放大 ---------------- */
  function scatter(except, rect) {
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var vh = window.innerHeight;
    var cards = document.querySelectorAll('#grid .card');

    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c === except) continue;
      if (c.classList.contains('is-hidden')) continue;
      var r = c.getBoundingClientRect();
      if (!r.width || r.bottom < -100 || r.top > vh + 100) continue;

      var dx = r.left + r.width / 2 - cx;
      var dy = r.top + r.height / 2 - cy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var push = 22 + Math.min(52, d / 16);

      c.animate([
        { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
        {
          transform: 'translate3d(' + (dx / d * push).toFixed(1) + 'px,' +
                     (dy / d * push).toFixed(1) + 'px,0) scale(0.86)',
          opacity: 0.18
        }
      ], {
        duration: 480,
        delay: Math.min(90, d / 16),
        easing: 'cubic-bezier(.3,.7,.35,1)',
        fill: 'both'
      });
    }
  }

  function fadeChrome() {
    var els = document.querySelectorAll('.masthead-inner, .archive-head, .toolbar');
    for (var i = 0; i < els.length; i++) {
      els[i].animate([{ opacity: 1 }, { opacity: 0.1 }], {
        duration: 420, delay: i * 20, easing: 'ease-out', fill: 'both'
      });
    }
  }

  function leaveFromCard(card, url) {
    var rect = card.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var maxW = Math.min(760, vw - Math.max(40, vw * 0.12));
    var s = Math.min(maxW / rect.width, (vh * 0.64) / rect.height, 2.5);
    if (!(s > 0)) s = 1;
    s = Math.max(s, 1.05);

    var top = Math.max(72, Math.min(134, vh * 0.13));
    var tx = (vw - rect.width * s) / 2 - rect.left;
    var ty = top - rect.top;

    var layer = document.createElement('div');
    layer.className = 'vt-layer';

    var sheet = card.cloneNode(true);
    sheet.classList.remove('reveal', 'flash', 'flipping', 'is-hidden');
    sheet.classList.add('vt-sheet');
    sheet.removeAttribute('href');
    var ripples = sheet.querySelectorAll('.ripple');
    for (var i = 0; i < ripples.length; i++) ripples[i].remove();
    sheet.style.left = rect.left + 'px';
    sheet.style.top = rect.top + 'px';
    sheet.style.width = rect.width + 'px';
    sheet.style.height = rect.height + 'px';
    sheet.style.setProperty('--vt-s', s.toFixed(4));

    layer.appendChild(sheet);
    document.body.appendChild(layer);

    /* 原卡片留位但不可见，避免和克隆重影 */
    card.style.visibility = 'hidden';

    scatter(card, rect);
    fadeChrome();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        sheet.style.transform =
          'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) scale(' + s.toFixed(4) + ')';
      });
    });

    /* 卡片内容先淡出：标签、摘要、日期先走，标题和版本号再留一拍 */
    setTimeout(function () { sheet.classList.add('is-fading'); }, 150);
    setTimeout(function () { sheet.classList.add('is-fading-late'); }, 380);

    /* 纸块铺满整屏 */
    setTimeout(function () {
      layer.classList.add('is-fill');
      sheet.classList.add('is-fill');
      sheet.style.transform =
        'translate3d(' + (-rect.left).toFixed(2) + 'px,' + (-rect.top).toFixed(2) + 'px,0) ' +
        'scale(' + (vw / rect.width).toFixed(4) + ',' + (vh / rect.height).toFixed(4) + ')';
    }, 430);

    writeEntry({
      t: Date.now(),
      dir: 'post',
      href: url.split('/').pop(),
      scroll: window.pageYOffset || 0
    });

    setTimeout(function () {
      location.href = url;
    }, 750);
  }

  /* ---------------- 离开文章页：正文收拢 ---------------- */
  function leaveToHome() {
    writeEntry({ t: Date.now(), dir: 'home', scroll: entryScroll, href: entryHref });
    if (reduce()) {
      location.href = 'index.html';
      return;
    }

    var post = document.querySelector('.post');
    if (post) {
      post.animate([
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translate3d(0,-18px,0) scale(0.982)' }
      ], { duration: 330, easing: EASE, fill: 'both' });
    }
    var rail = document.querySelector('.rail');
    if (rail) {
      rail.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 260, easing: 'ease-out', fill: 'both'
      });
    }
    var head = document.querySelector('.site-head');
    if (head) {
      head.animate([{ opacity: 1 }, { opacity: 0.3 }], {
        duration: 300, easing: 'ease-out', fill: 'both'
      });
    }

    setTimeout(function () { document.body.classList.add('is-leaving'); }, 150);
    setTimeout(function () { location.href = 'index.html'; }, 350);
  }

  /* ---------------- 点击接管 ---------------- */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (reduce() || busy) return;

    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;

    var url;
    try {
      url = new URL(a.getAttribute('href'), location.href);
    } catch (err) {
      return;
    }
    if (url.origin !== location.origin) return;
    if (url.href.split('#')[0] === location.href.split('#')[0]) return;

    if (isHome && a.classList.contains('card')) {
      e.preventDefault();
      busy = true;
      leaveFromCard(a, url.href);
      return;
    }

    if (isPost && (a.classList.contains('back') || a.classList.contains('brand'))) {
      if (!/(index\.html|\/)$/.test(url.pathname)) return;
      e.preventDefault();
      busy = true;
      leaveToHome();
    }
  }, true);

  /* ---------------- 返回/复用时收拾残局 ---------------- */
  function cleanup() {
    busy = false;
    var layer = document.querySelector('.vt-layer');
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    var cards = document.querySelectorAll('#grid .card');
    for (var i = 0; i < cards.length; i++) cards[i].style.visibility = '';
    doc.classList.remove('vt-in', 'vt-reveal');
    document.body.classList.remove('is-leaving');
    try {
      document.getAnimations().forEach(function (a) { a.cancel(); });
    } catch (err) {}
  }

  window.addEventListener('pageshow', function (e) {
    if (e.persisted) cleanup();
  });

  /* ---------------- 启动 ---------------- */
  var entry = readEntry();
  var cls = doc.classList;
  var enteringHome = cls.contains('vt-enter-home');
  var enteringPost = cls.contains('vt-enter-post');
  var fresh = entry && (Date.now() - entry.t) < 5000;

  if (entry && !fresh) {
    clearEntry();
    entry = null;
  }

  if (enteringHome && isHome) {
    enterHome(entry);
  } else if (enteringPost && isPost) {
    enterPost(entry);
  } else {
    if (cls.contains('vt-in')) cls.remove('vt-in', 'vt-reveal');
    cls.remove('vt-enter-home', 'vt-enter-post');
    if (entry) clearEntry();
  }
})();
