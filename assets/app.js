/* ==========================================================================
   xma1Soap · 补丁存档
   逻辑：主题切换 / 搜索 / 筛选 / 排序（FLIP）/ 入场观察 / 数字滚动
   动效原则：只用 transform 与 opacity，布局只在 Fragment 替换时发生一次。
   ========================================================================== */
(function () {
  'use strict';

  var doc = document.documentElement;
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = mqReduce.matches;
  var EASE = 'cubic-bezier(.22,.61,.36,1)';
  /* 从卡片转场进来时，卡片入场交由 transit.js 播，避免两套动画抢同一个 transform */
  var vtEnter = doc.classList.contains('vt-enter-home');

  if (mqReduce.addEventListener) {
    mqReduce.addEventListener('change', function (e) { reduce = e.matches; });
  }

  /* ---------------- 主题 ---------------- */
  var themeBtn = document.getElementById('themeBtn');
  var mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  var vtBusy = false;

  function readChoice() {
    try { return localStorage.getItem('soap-theme'); } catch (e) { return null; }
  }
  function applyTheme(t) {
    doc.setAttribute('data-theme', t);
    try { localStorage.setItem('soap-theme', t); } catch (e) {}
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      if (vtBusy) return;
      var next = doc.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      var rect = themeBtn.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var far = Math.hypot(
        Math.max(cx, window.innerWidth - cx),
        Math.max(cy, window.innerHeight - cy)
      );
      doc.style.setProperty('--tx', cx + 'px');
      doc.style.setProperty('--ty', cy + 'px');
      doc.style.setProperty('--tr', Math.ceil(far) + 'px');

      if (document.startViewTransition && !reduce) {
        vtBusy = true;
        var vt = document.startViewTransition(function () { applyTheme(next); });
        vt.finished.then(function () { vtBusy = false; }, function () { vtBusy = false; });
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

  /* ---------------- 存档列表 ---------------- */
  var grid = document.getElementById('grid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.children);
  var searchInput = document.getElementById('searchInput');
  var searchClear = document.getElementById('searchClear');
  var sortBtn = document.getElementById('sortBtn');
  var sortLabel = sortBtn ? sortBtn.querySelector('.sort-label') : null;
  var resultNote = document.getElementById('resultNote');
  var emptyBox = document.getElementById('empty');
  var emptyReset = document.getElementById('emptyReset');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));

  /* 筛选胶囊：宽度和位置都跟选中的 chip 走，弹性靠 CSS 的过冲曲线 */
  var filtersBox = document.querySelector('.filters');
  var pill = document.querySelector('.filter-pill');

  function placePill(instant) {
    if (!filtersBox || !pill) return;
    var on = filtersBox.querySelector('.chip.is-on');
    if (!on) return;
    var r = on.getBoundingClientRect();
    var fr = filtersBox.getBoundingClientRect();
    if (!r.width) return;
    if (instant) pill.style.transition = 'none';
    pill.style.width = r.width + 'px';
    pill.style.height = r.height + 'px';
    pill.style.transform =
      'translate3d(' + (r.left - fr.left + filtersBox.scrollLeft).toFixed(2) + 'px,' +
      (r.top - fr.top + filtersBox.scrollTop).toFixed(2) + 'px,0)';
    if (instant) {
      void pill.offsetWidth;
      pill.style.transition = '';
    }
  }

  if (filtersBox && pill) {
    placePill(true);
    requestAnimationFrame(function () { filtersBox.classList.add('is-ready'); });
    window.addEventListener('resize', function () { placePill(true); }, { passive: true });
    filtersBox.addEventListener('scroll', function () { placePill(true); }, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { placePill(true); });
    }
  }

  var state = { q: '', game: 'all', dir: 'desc' };

  cards.forEach(function (c) {
    c.__text = (c.textContent || '').replace(/\s+/g, ' ').toLowerCase();
    c.__date = c.getAttribute('data-date') || '';
  });

  function isVisible(c) { return !c.classList.contains('is-hidden'); }

  function sortCards() {
    var sorted = cards.slice().sort(function (a, b) {
      var cmp = a.__date < b.__date ? -1 : a.__date > b.__date ? 1 : 0;
      return state.dir === 'asc' ? cmp : -cmp;
    });
    var frag = document.createDocumentFragment();
    for (var i = 0; i < sorted.length; i++) frag.appendChild(sorted[i]);
    grid.appendChild(frag);
  }

  /* FLIP：先量旧位置，改动后量新位置，用 transform 反向偏移再回零 */
  function flip(mutate) {
    if (reduce) { mutate(); return; }
    var visible = cards.filter(isVisible);
    var before = new Map();
    visible.forEach(function (c) { before.set(c, c.getBoundingClientRect()); });

    mutate();

    var moved = [];
    visible.forEach(function (c) {
      if (!isVisible(c)) return;
      var f = before.get(c);
      var l = c.getBoundingClientRect();
      var dx = Math.round(f.left - l.left);
      var dy = Math.round(f.top - l.top);
      if (!dx && !dy) return;
      c.classList.remove('reveal');
      c.style.transition = 'none';
      c.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0)';
      moved.push(c);
    });
    if (!moved.length) return;

    /* 强制一次样式刷新，让起点站住 */
    void grid.offsetHeight;

    moved.forEach(function (c) {
      c.style.transition = 'transform 400ms ' + EASE;
      c.style.transform = 'translate3d(0,0,0)';
    });

    var cleanup = function (c) {
      return function (e) {
        if (e && e.propertyName !== 'transform') return;
        c.style.transition = '';
        c.style.transform = '';
        c.removeEventListener('transitionend', c.__flipEnd);
        c.__flipEnd = null;
      };
    };
    moved.forEach(function (c) {
      if (c.__flipEnd) c.removeEventListener('transitionend', c.__flipEnd);
      c.__flipEnd = cleanup(c);
      c.addEventListener('transitionend', c.__flipEnd);
      c.style.willChange = 'transform';
      setTimeout(function () {
        if (!c.__flipEnd) return;
        c.style.transition = '';
        c.style.transform = '';
        c.style.willChange = '';
        c.removeEventListener('transitionend', c.__flipEnd);
        c.__flipEnd = null;
      }, 460);
    });
  }

  function stagger(cardsShown) {
    if (reduce) return;
    for (var i = 0; i < cardsShown.length; i++) {
      (function (c, idx) {
        c.classList.remove('reveal', 'flash');
        c.style.setProperty('--fd', Math.min(idx, 9) * 22 + 'ms');
        void c.offsetWidth;
        c.classList.add('flash');
        c.addEventListener('animationend', function handler() {
          c.classList.remove('flash');
          c.removeEventListener('animationend', handler);
        });
      })(cardsShown[i], i);
    }
  }

  function render(opts) {
    opts = opts || {};
    var q = state.q.trim().toLowerCase();
    var shown = [];

    flip(function () {
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var ok = (state.game === 'all' || c.getAttribute('data-game') === state.game) &&
                 (!q || c.__text.indexOf(q) !== -1);
        c.classList.toggle('is-hidden', !ok);
        if (ok) shown.push(c);
      }
    });

    if (resultNote) {
      resultNote.textContent = shown.length === cards.length
        ? shown.length + ' 篇'
        : '筛出 ' + shown.length + ' / ' + cards.length + ' 篇';
    }
    if (emptyBox) emptyBox.hidden = shown.length !== 0;
    if (opts.flash) stagger(shown);
  }

  /* 搜索：输入节流 120ms，回车立刻执行 */
  var searchTimer = null;
  function runSearch(v, instant) {
    if (searchTimer) clearTimeout(searchTimer);
    var commit = function () { state.q = v; render({ flash: true }); };
    if (instant) commit();
    else searchTimer = setTimeout(commit, 120);
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      if (searchClear) searchClear.hidden = !searchInput.value;
      runSearch(searchInput.value, false);
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        runSearch(searchInput.value, true);
      } else if (e.key === 'Escape') {
        searchInput.value = '';
        if (searchClear) searchClear.hidden = true;
        runSearch('', true);
        searchInput.blur();
      }
    });
    searchInput.addEventListener('search', function () {
      if (!searchInput.value && searchClear) searchClear.hidden = true;
    });
  }

  if (searchClear) {
    searchClear.addEventListener('click', function () {
      searchInput.value = '';
      searchClear.hidden = true;
      runSearch('', true);
      searchInput.focus();
    });
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var next = chip.getAttribute('data-filter');
      if (next === state.game) return;
      state.game = next;
      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      render({ flash: true });
      placePill();
    });
  });

  if (sortBtn) {
    sortBtn.addEventListener('click', function () {
      state.dir = state.dir === 'desc' ? 'asc' : 'desc';
      sortBtn.setAttribute('data-dir', state.dir);
      sortBtn.setAttribute('aria-label', state.dir === 'desc' ? '当前新到旧，点击切换' : '当前旧到新，点击切换');
      if (sortLabel) sortLabel.textContent = state.dir === 'desc' ? '新→旧' : '旧→新';
      flip(sortCards);
    });
  }

  if (emptyReset) {
    emptyReset.addEventListener('click', function () {
      if (searchInput) { searchInput.value = ''; }
      if (searchClear) searchClear.hidden = true;
      state.q = '';
      state.game = 'all';
      chips.forEach(function (c, i) {
        var on = i === 0;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      render({ flash: true });
      placePill();
    });
  }

  /* 首屏：同步入场，不等观察器回调，避免首帧空白 */
  var vh = window.innerHeight || 800;
  var above = [];
  cards.forEach(function (c) {
    if (c.getBoundingClientRect().top < vh * 0.94) above.push(c);
  });
  if (!reduce && !vtEnter) {
    above.forEach(function (c, i) {
      c.style.setProperty('--d', Math.min(i, 6) * 45 + 'ms');
      c.classList.add('reveal');
    });
  }

  /* 首屏之外：进入视口时错峰浮现 */
  if ('IntersectionObserver' in window && !reduce && !vtEnter) {
    var io = new IntersectionObserver(function (entries) {
      var step = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var c = en.target;
        c.style.setProperty('--d', Math.min(step, 6) * 45 + 'ms');
        c.classList.add('reveal');
        step++;
        io.unobserve(c);
      });
    }, { rootMargin: '120px 0px -4% 0px', threshold: 0 });

    cards.forEach(function (c) { if (above.indexOf(c) === -1) io.observe(c); });
  }

  /* 数字滚动 */
  var statCount = document.getElementById('statCount');
  if (statCount) {
    var target = parseInt(statCount.textContent, 10) || 0;
    if (reduce) {
      statCount.textContent = target;
    } else {
      statCount.textContent = '0';
      var t0 = 0;
      var tick = function (now) {
        if (!t0) t0 = now;
        var p = Math.min(1, (now - t0) / 620);
        var eased = 1 - Math.pow(1 - p, 3);
        statCount.textContent = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(tick);
        else statCount.textContent = target;
      };
      setTimeout(function () { requestAnimationFrame(tick); }, 260);
    }
  }

  /* 键盘：/ 聚焦搜索 */
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;
    if (!searchInput) return;
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  });
  /* 工具栏吸顶：上方标题滑出视口时浮起阴影 */
  var toolbar = document.querySelector('.toolbar');
  var archiveHead = document.querySelector('.archive-head');
  if (toolbar && archiveHead && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      toolbar.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }, { rootMargin: '-1px 0px 0px 0px', threshold: 0 }).observe(archiveHead);
  }
})();
