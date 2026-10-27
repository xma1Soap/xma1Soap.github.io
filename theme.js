/* ============================================================
   xma1Soap · NOCTURNE — motion engine
   ------------------------------------------------------------
   与 theme.css 共用动效令牌（--t-1..4 / --ease-out）。
   职责：
     1. 气氛层（网格光晕 / 尘埃 / 光标热区）
     2. 滚动进度 + 返回顶部环形进度
     3. 揭示观察器（IntersectionObserver + 分组错峰）
     4. 卡片 3D 倾斜与光标高光
     5. 分类切换 FLIP
     6. 主题切换 / 移动端菜单
     7. 同站路由过渡（波浪退场 → 波浪入场）
   class 名与 tema.css 的契约保持不变，改这里要一起改。
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "xma1soap-theme";
  var ROUTE_KEY = "xma1soap-page-transition";
  var SITE_ORIGIN = "https://xma1soap.github.io";

  /* ---------- 环境探测 ---------- */
  var mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mqFine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduceMotion = mqMotion.matches;

  /* ---------- 主题引导（尽量早，避免闪白） ---------- */
  var current = (function () {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
    if (saved === "dark" || saved === "light") return saved;
    var attr = root.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
    } catch (_) {}
    return "dark";
  })();

  var state = {
    transitionActive: false,
    starfieldReady: false,
    controlsBound: false,
    revealObserver: null,
    tocObserver: null,
    scrollRaf: 0,
    themeButton: null,
    revealSeed: 0
  };

  /* ============================================================
     小工具
     ============================================================ */

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function raf2(cb) {
    var done = false;
    function run() { if (done) return; done = true; cb(); }
    requestAnimationFrame(function () { requestAnimationFrame(run); });
    window.setTimeout(run, 60);
  }

  function centerOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  function isShown(el) {
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function maxRadiusFrom(o) {
    var c = [
      { x: 0, y: 0 },
      { x: window.innerWidth, y: 0 },
      { x: 0, y: window.innerHeight },
      { x: window.innerWidth, y: window.innerHeight }
    ];
    return c.reduce(function (m, p) {
      return Math.max(m, Math.hypot(p.x - o.x, p.y - o.y));
    }, 1);
  }

  function isLocalHost(h) {
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "";
  }

  function isHomePath(p) { return p === "/" || p.endsWith("/index.html"); }

  /* ============================================================
     气氛层
     ============================================================ */

  function initAtmos() {
    if (!document.getElementById("atmos")) {
      var atmos = document.createElement("div");
      atmos.id = "atmos";
      atmos.setAttribute("aria-hidden", "true");
      var dust = document.createElement("div");
      dust.id = "dust";
      atmos.appendChild(dust);
      document.body.insertBefore(atmos, document.body.firstChild);
    }
    if (!document.getElementById("progress")) {
      var bar = document.createElement("div");
      bar.id = "progress";
      bar.setAttribute("aria-hidden", "true");
      document.body.appendChild(bar);
    }
    if (!document.getElementById("cursor-glow")) {
      var glow = document.createElement("div");
      glow.id = "cursor-glow";
      glow.setAttribute("aria-hidden", "true");
      document.body.appendChild(glow);
    }
    var legacy = document.querySelector(".site-bg");
    if (!legacy) {
      legacy = document.createElement("div");
      legacy.className = "site-bg";
      legacy.setAttribute("aria-hidden", "true");
      document.body.insertBefore(legacy, document.body.firstElementChild);
    }
  }

  function initDust() {
    if (state.starfieldReady || reduceMotion) return;
    var host = document.getElementById("dust");
    if (!host) return;
    state.starfieldReady = true;

    /* 粒子数：实测超过 20 个就会把滚动拖到 40fps，这里控在 8~20 */
    var count = clamp(Math.round(window.innerWidth / 90), 8, 20);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var m = document.createElement("span");
      m.className = "mote";
      var size = (Math.random() * 1.6 + .9).toFixed(2);
      m.style.setProperty("--s", size + "px");
      m.style.left = (Math.random() * 100).toFixed(2) + "%";
      m.style.top = (Math.random() * 100).toFixed(2) + "%";
      m.style.setProperty("--dur", (Math.random() * 26 + 24).toFixed(1) + "s");
      m.style.setProperty("--delay", (-Math.random() * 48).toFixed(1) + "s");
      m.style.setProperty("--dx", (Math.random() * 50 - 25).toFixed(0) + "px");
      m.style.setProperty("--peak", (Math.random() * .3 + .18).toFixed(2));
      frag.appendChild(m);
    }
    host.appendChild(frag);
  }

  /* 光标热区：用 lerp 追随，永远滞后一点点，才有重量感 */
  function initCursorGlow() {
    var glow = document.getElementById("cursor-glow");
    if (!glow || !mqFine.matches || reduceMotion) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, running = false, shown = false;

    function loop() {
      cx += (tx - cx) * 0.14;
      cy += (ty - cy) * 0.14;
      glow.style.transform = "translate3d(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px,0)";
      if (Math.abs(tx - cx) > .4 || Math.abs(ty - cy) > .4) {
        requestAnimationFrame(loop);
      } else {
        running = false;
      }
    }

    window.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        cx = tx; cy = ty; shown = true;
        glow.classList.add("on");
      }
      if (!running) { running = true; requestAnimationFrame(loop); }
    }, { passive: true });

    window.addEventListener("pointerleave", function () {
      shown = false;
      glow.classList.remove("on");
    }, { passive: true });
  }

  /* ============================================================
     滚动状态（导航收缩 / 进度 / 返回顶部）
     ============================================================ */

  function updateScrollState() {
    var nav = document.getElementById("navbar");
    var back = document.getElementById("backToTop");
    var bar = document.getElementById("progress");
    var y = window.scrollY || root.scrollTop || 0;
    var max = Math.max(1, root.scrollHeight - window.innerHeight);
    var p = clamp(y / max, 0, 1);

    if (nav) nav.classList.toggle("scrolled", y > 10);
    if (bar) bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    if (back) {
      back.classList.toggle("visible", y > 420);
      if (window.CSS && CSS.supports && CSS.supports("--x", "0")) {
        back.style.setProperty("--p", (p * 100).toFixed(2));
      }
    }
  }

  function onScroll() {
    if (state.scrollRaf) return;
    state.scrollRaf = requestAnimationFrame(function () {
      updateScrollState();
      state.scrollRaf = 0;
    });
  }

  /* ============================================================
     揭示观察器
     ============================================================ */

  function markSettled(el) {
    window.setTimeout(function () { el.classList.add("is-settled"); }, 1200);
  }

  function revealNow(el) {
    el.classList.add("is-revealed");
    markSettled(el);
  }

  /* 给文章正文批量挂上揭示属性：
     可视区内的元素直接显示，绝不闪。
     其余按文档顺序错峰，滚动到才动。 */
  function decorateArticle() {
    var article = document.querySelector(".article");
    if (!article) return;

    var nodes = article.querySelectorAll(
      ".article > .hero, .article > .intro, .article > .toc, .article > h2, .article > h3, .article > p, .article > ul, .article > ol, .article > figure, .article > table, .article > hr, .article > blockquote, .article > .note"
    );
    var vh = window.innerHeight;
    var i = 0;

    Array.prototype.forEach.call(nodes, function (el) {
      if (el.hasAttribute("data-reveal")) return;
      var top = el.getBoundingClientRect().top;
      if (top < vh * 0.92) {
        /* 已在首屏：不隐藏，直接标记完成 */
        el.setAttribute("data-reveal", "");
        el.classList.add("is-revealed", "is-settled");
        return;
      }
      var kind = "up";
      if (/^H2$/.test(el.tagName)) kind = "mask";
      else if (/^HR$/.test(el.tagName)) kind = "line";
      el.setAttribute("data-reveal", kind === "up" ? "" : kind);
      el.style.setProperty("--ry", kind === "mask" ? "0px" : "22px");
      el.style.setProperty("--rd", (Math.min(i, 5) * 45) + "ms");
      i++;
    });
  }

  function initReveal() {
    if (state.revealObserver) {
      try { state.revealObserver.disconnect(); } catch (_) {}
      state.revealObserver = null;
    }

    /* 首屏卡片错峰 */
    var cards = document.querySelectorAll(".posts .card:not([hidden])");
    Array.prototype.forEach.call(cards, function (c, idx) {
      if (!c.hasAttribute("data-reveal")) c.setAttribute("data-reveal", "");
      c.style.setProperty("--ry", "26px");
      c.style.setProperty("--rd", (idx % 4) * 70 + "ms");
    });

    decorateArticle();

    var els = document.querySelectorAll("[data-reveal]:not(.is-revealed)");
    if (!els.length) return;

    if (reduceMotion || !("IntersectionObserver" in window) || document.body.classList.contains("route-enter-owned")) {
      Array.prototype.forEach.call(els, revealNow);
      return;
    }

    state.revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        revealNow(entry.target);
        state.revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0 });

    Array.prototype.forEach.call(els, function (el) { state.revealObserver.observe(el); });
  }

  /* ============================================================
     卡片 3D 倾斜 + 光标高光
     ============================================================ */

  function bindCardMotion() {
    if (!mqFine.matches || reduceMotion) return;
    Array.prototype.forEach.call(document.querySelectorAll(".card:not([data-motion])"), function (card) {
      card.setAttribute("data-motion", "");

      card.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse") return;
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        card.style.setProperty("--tilt-x", ((.5 - y) * 5).toFixed(2) + "deg");
        card.style.setProperty("--tilt-y", ((x - .5) * 5).toFixed(2) + "deg");
      }, { passive: true });

      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      }, { passive: true });
    });
  }

  /* ============================================================
     分类筛选：FLIP
     ============================================================ */

  function filterCards(btn) {
    var cards = Array.prototype.slice.call(document.querySelectorAll(".card[data-category]"));
    var cat = btn.dataset.category;

    Array.prototype.forEach.call(document.querySelectorAll(".category-btn[data-category]"), function (b) {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-pressed", b === btn ? "true" : "false");
    });

   /* 第一帧：记录可视卡片位置 */
    var first = new Map();
    cards.forEach(function (c) {
      if (!c.hidden && isShown(c)) first.set(c, c.getBoundingClientRect());
    });

    cards.forEach(function (c) {
      c.hidden = !(cat === "all" || c.dataset.category === cat);
    });

    if (reduceMotion || !Element.prototype.animate) {
      initReveal();
      return;
    }

    var appearIdx = 0;
    cards.forEach(function (c) {
      if (c.hidden) return;

      var before = first.get(c);
      if (before) {
        /* 已在场景里：位移回原处，FLIP 归位 */
        var after = c.getBoundingClientRect();
        var dx = before.left - after.left;
        var dy = before.top - after.top;
        if (Math.abs(dx) > .5 || Math.abs(dy) > .5) {
          c.animate([
            { transform: "translate3d(" + dx + "px," + dy + "px,0)" },
            { transform: "translate3d(0,0,0)" }
          ], { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
        }
      } else {
        /* 新出现：错峰入场 */
        c.animate([
          { opacity: 0, transform: "translate3d(0,16px,0) scale(.975)" },
          { opacity: 1, transform: "translate3d(0,0,0) scale(1)" }
        ], {
          duration: 520,
          easing: "cubic-bezier(.16,1,.3,1)",
          delay: Math.min(appearIdx, 6) * 42
        });
        appearIdx++;
        c.classList.add("is-revealed", "is-settled");
      }
    });

    bindCardMotion();
  }

  /* ============================================================
     主题
     ============================================================ */

  function setTheme(theme) {
    current = theme;
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
    updateThemeButton(true);
  }

  function updateThemeButton(animate) {
    var btn = state.themeButton;
    if (!btn) return;
    var dark = current === "dark";
    var label = dark ? "切换到日间模式" : "切换到夜间模式";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.setAttribute("aria-pressed", dark ? "true" : "false");

    var icon = btn.querySelector(".toggle-icon");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "toggle-icon";
      btn.appendChild(icon);
    }
    var next = dark ? "\u2600" : "\u263E";
    if (animate && icon.textContent !== next) {
      btn.classList.add("toggling");
      window.setTimeout(function () {
        icon.textContent = next;
        btn.classList.remove("toggling");
      }, 200);
    } else {
      icon.textContent = next;
    }
  }

  function initThemeButton() {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-toggle";
    }
    if (btn.parentElement !== document.body) document.body.appendChild(btn);
    state.themeButton = btn;
    updateThemeButton(false);
  }

  /* ============================================================
     移动端菜单 / 返回顶部
     ============================================================ */

  function closeNav() {
    var links = document.getElementById("navLinks");
    var toggle = document.getElementById("navToggle");
    var ov = document.getElementById("navOverlay");
    if (links) links.classList.remove("open");
    if (toggle) { toggle.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    if (ov) ov.classList.remove("visible");
    document.body.style.overflow = "";
  }

  function toggleNav() {
    var links = document.getElementById("navLinks");
    var toggle = document.getElementById("navToggle");
    var ov = document.getElementById("navOverlay");
    if (!links || !toggle || !ov) return;
    if (links.classList.contains("open")) { closeNav(); return; }
    links.classList.add("open");
    toggle.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    ov.classList.add("visible");
    document.body.style.overflow = "hidden";
  }

  /* ============================================================
     路由过渡
     ============================================================ */

  function transitionItems() {
    var selectors = [".hero", ".category-bar", ".posts .card:not([hidden])", ".content-wrapper>.article", ".article", ".sidebar"];
    var out = [];
    selectors.forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        if (el.id === "atmos" || el.id === "dust") return;
        if (out.indexOf(el) === -1 && isShown(el)) out.push(el);
      });
    });
    return out.filter(function (el) {
      var p = el.parentElement;
      while (p) {
        if (out.indexOf(p) !== -1) return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  function clearTransitionItems() {
    transitionItems().forEach(function (el) {
      el.removeAttribute("data-page-transition-item");
      el.style.removeProperty("--pt-delay");
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-page-transition-item]"), function (el) {
      el.removeAttribute("data-page-transition-item");
      el.style.removeProperty("--pt-delay");
    });
  }

  function storeOrigin(o) {
    try {
      sessionStorage.setItem(ROUTE_KEY, JSON.stringify({
        x: o.x / window.innerWidth,
        y: o.y / window.innerHeight,
        at: Date.now()
      }));
    } catch (_) {}
  }

  function takeOrigin() {
    var raw = null;
    try { raw = sessionStorage.getItem(ROUTE_KEY); sessionStorage.removeItem(ROUTE_KEY); } catch (_) {}
    if (!raw) return null;
    try {
      var d = JSON.parse(raw);
      if (!d || Date.now() - d.at > 8000) return null;
      return { x: clamp(d.x, 0, 1) * window.innerWidth, y: clamp(d.y, 0, 1) * window.innerHeight };
    } catch (_) { return null; }
  }

  function prepareExit(origin, clicked) {
    var items = transitionItems();
    var maxR = maxRadiusFrom(origin);
    var maxDelay = 0;
    items.forEach(function (el) {
      var c = centerOf(el);
      var norm = clamp(Math.hypot(c.x - origin.x, c.y - origin.y) / maxR, 0, 1);
      var delay = el === clicked ? 0 : Math.round(30 + norm * 90);
      el.setAttribute("data-page-transition-item", "");
      el.style.setProperty("--pt-delay", delay + "ms");
      maxDelay = Math.max(maxDelay, delay);
    });
    return maxDelay;
  }

  function toRouteUrl(url) {
    var u = new URL(url.href);
    if (u.origin === SITE_ORIGIN && u.origin !== window.location.origin && isLocalHost(window.location.hostname)) {
      u = new URL(u.pathname + u.search + u.hash, window.location.origin);
    }
    return u;
  }

  function normalizeRouteUrl(url, keepHash) {
    var u = toRouteUrl(url);
    if (isHomePath(u.pathname)) u.pathname = u.pathname.replace(/index\.html$/, "");
    if (!keepHash) u.hash = "";
    return u;
  }

  function isCurrentRoute(url) {
    return normalizeRouteUrl(new URL(window.location.href), false).href === normalizeRouteUrl(url, false).href;
  }

  function pageUrlOf(link) {
    try { return new URL(link.getAttribute("href"), window.location.href); } catch (_) { return null; }
  }

  function canRoute(link, ev) {
    if (!link || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return false;
    if (link.target && link.target !== "_self") return false;
    if (link.hasAttribute("download")) return false;
    var href = link.getAttribute("href");
    if (!href || href.charAt(0) === "#" || href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0) return false;
    var u = pageUrlOf(link);
    if (!u) return false;
    if (u.origin !== window.location.origin && u.origin !== SITE_ORIGIN) return false;
    return u.pathname.endsWith(".html") || isHomePath(u.pathname);
  }

  var routeCache = {};

  function parseRouteDoc(text) {
    var doc = new DOMParser().parseFromString(text, "text/html");
    var title = doc.querySelector("title");
    var pageStyle = Array.prototype.find.call(doc.querySelectorAll("style"), function (s) {
      return s.id !== "theme-boot-css";
    });
    var header = doc.querySelector("header");
    var main = doc.querySelector("main");
    var footer = doc.querySelector("footer");
    var back = doc.querySelector("#backToTop");
    if (!header || !main || !footer) throw new Error("route shell missing");
    return {
      title: title ? title.textContent : document.title,
      pageStyle: pageStyle ? pageStyle.textContent : "",
      header: header.innerHTML,
      main: main.innerHTML,
      footer: footer.innerHTML,
      backToTop: back ? back.outerHTML : '<button class="back-to-top" id="backToTop" aria-label="Back to top">&#8593;</button>'
    };
  }

  function fetchRoute(url) {
    var u = normalizeRouteUrl(url, true);
    var key = normalizeRouteUrl(url, false).href;
    if (routeCache[key]) return Promise.resolve(routeCache[key]);
    return fetch(u.href, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("route fetch failed");
        return r.text();
      })
      .then(function (text) {
        var route = parseRouteDoc(text);
        routeCache[key] = route;
        return route;
      });
  }

  function swapShell(route, url, push) {
    var header = document.querySelector("header");
    var main = document.querySelector("main");
    var footer = document.querySelector("footer");
    var oldBack = document.getElementById("backToTop");

    document.body.classList.add("route-enter-owned");

    if (header) header.innerHTML = route.header;
    if (main) main.innerHTML = route.main;
    if (footer) footer.innerHTML = route.footer;
    if (oldBack) oldBack.outerHTML = route.backToTop;

    var style = document.querySelector("style:not(#theme-boot-css)");
    if (style && route.pageStyle) style.textContent = route.pageStyle;

    document.title = route.title;
    if (push !== false) history.pushState({ xma1soap: true }, "", normalizeRouteUrl(url, true).href);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.body.classList.remove("page-exiting");
  }

  function applyEnter(origin) {
    document.body.classList.add("page-transitioning", "page-pre-enter");
    var items = transitionItems();
    var maxR = maxRadiusFrom(origin);
    var maxDelay = 0;

    items.forEach(function (el, idx) {
      var c = centerOf(el);
      var norm = clamp(Math.hypot(c.x - origin.x, c.y - origin.y) / maxR, 0, 1);
      var delay = Math.round(20 + norm * 110 + Math.min(idx, 6) * 8);
      el.setAttribute("data-page-transition-item", "");
      el.style.setProperty("--pt-delay", delay + "ms");
      maxDelay = Math.max(maxDelay, delay);
    });

    decodeFirstPaint(40);

    raf2(function () {
      document.body.classList.remove("page-pre-enter");
      document.body.classList.add("page-entering");
      window.setTimeout(function () {
        document.body.classList.remove("page-transitioning", "page-entering", "route-enter-owned");
        clearTransitionItems();
        /* 路由过渡已把元素带到最终态，补上标记防止观察器再藏一次 */
        Array.prototype.forEach.call(document.querySelectorAll("[data-reveal]"), function (el) {
          el.classList.add("is-revealed", "is-settled");
        });
      }, maxDelay + 620);
    });
  }

  function swapAndEnter(route, url, push, origin) {
    swapShell(route, url, push);
    initDynamic();

    if (origin && !reduceMotion) {
      applyEnter(origin);
    } else {
      clearTransitionItems();
      document.body.classList.remove("page-transitioning", "page-exiting", "page-pre-enter", "page-entering");
      window.setTimeout(function () { document.body.classList.remove("route-enter-owned"); }, 0);
      decodeFirstPaint(20);
    }
  }

  function routeTo(url, origin, push) {
    var target = normalizeRouteUrl(url, true);
    return fetchRoute(url)
      .then(function (route) { swapAndEnter(route, target, push, origin); })
      .catch(function (err) {
        if (push !== false) window.location.href = target.href;
        else console.warn(err);
      });
  }

  function beginRoute(link, url) {
    if (state.transitionActive || reduceMotion) return;
    var target = normalizeRouteUrl(url, true);
    state.transitionActive = true;

    var origin = centerOf(link);
    storeOrigin(origin);
    var ready = fetchRoute(url);
    var maxDelay = prepareExit(origin, link);

    document.body.classList.add("page-transitioning");
    void document.body.offsetHeight;
    document.body.classList.add("page-exiting");

    var done = new Promise(function (resolve) {
      window.setTimeout(resolve, maxDelay + 340);
    });

    Promise.all([ready, done])
      .then(function (arr) {
        swapAndEnter(arr[0], target, true, origin);
        state.transitionActive = false;
      })
      .catch(function () {
        state.transitionActive = false;
        window.location.href = target.href;
      });
  }

  function routeLink(link, ev) {
    var url = pageUrlOf(link);
    if (!url) return;
    ev.preventDefault();
    if (isCurrentRoute(url)) return;
    if (state.transitionActive) return;
    if (reduceMotion) { routeTo(url, null, true); return; }
    beginRoute(link, url);
  }

  /* ============================================================
     文章目录
     ============================================================ */

  function ensureToc() {
    var article = document.querySelector(".article");
    if (!article || article.querySelector(".toc")) return;
    var heads = Array.prototype.slice.call(article.querySelectorAll("h2[id],h3[id]"));
    if (!heads.length) return;

    var toc = document.createElement("div");
    toc.className = "toc toc-generated";
    var title = document.createElement("div");
    title.className = "toc-title";
    title.textContent = "\u76EE\u5F55";
    var list = document.createElement("ul");
    list.className = "toc-list";

    heads.forEach(function (h) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      list.appendChild(li);
    });

    toc.appendChild(title);
    toc.appendChild(list);
    var intro = article.querySelector(".intro");
    if (intro && intro.nextSibling) article.insertBefore(toc, intro.nextSibling);
    else article.insertBefore(toc, article.firstChild);
  }

  function initToc() {
    if (state.tocObserver) {
      try { state.tocObserver.disconnect(); } catch (_) {}
      state.tocObserver = null;
    }
    ensureToc();

    var links = Array.prototype.slice.call(document.querySelectorAll(".toc-list a[href^='#']"));
    if (!links.length) return;

    var map = {};
    links.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      if (id) map[id] = a;
    });
    var heads = Object.keys(map).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!heads.length) return;

    function setActive(id) {
      links.forEach(function (a) { a.classList.toggle("active", a === map[id]); });
    }
    setActive(heads[0].id);

    if (!("IntersectionObserver" in window)) return;
    state.tocObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-16% 0px -70% 0px", threshold: 0 });
    heads.forEach(function (h) { state.tocObserver.observe(h); });
  }

  /* ============================================================
     导航高亮
     ============================================================ */

  function updateNavActive() {
    var here = normalizeRouteUrl(new URL(window.location.href), false);
    Array.prototype.forEach.call(document.querySelectorAll(".nav-links a[href]"), function (a) {
      var u = pageUrlOf(a);
      if (!u) return;
      var active = isHomePath(u.pathname) && isHomePath(here.pathname);
      a.classList.toggle("active", active);
    });
  }

  /* ============================================================
     首屏遮罩
     ============================================================ */

  function decodeFirstPaint(delay) {
    if (!root.hasAttribute("data-first-paint-cover")) return;
    window.setTimeout(function () {
      root.setAttribute("data-first-paint-cover", "fade");
      window.setTimeout(function () { root.removeAttribute("data-first-paint-cover"); }, 420);
    }, delay || 0);
  }

  /* ============================================================
     事件绑定
     ============================================================ */

  function bindControls() {
    if (state.controlsBound) return;
    state.controlsBound = true;

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () {
      state.starfieldReady = false;
      var dust = document.getElementById("dust");
      if (dust) dust.innerHTML = "";
      initDust();
      updateScrollState();
    }, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeNav();
    });

    document.addEventListener("click", function (ev) {
      var t = ev.target;

      if (t.closest && t.closest(".theme-toggle")) {
        ev.preventDefault();
        setTheme(current === "dark" ? "light" : "dark");
        return;
      }
      if (t.closest && t.closest("#navToggle")) {
        ev.preventDefault();
        toggleNav();
        return;
      }
      if (t.closest && t.closest("#navOverlay")) {
        ev.preventDefault();
        closeNav();
        return;
      }
      if (t.closest && t.closest("#backToTop")) {
        ev.preventDefault();
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        return;
      }
      var cat = t.closest && t.closest(".category-btn[data-category]");
      if (cat) {
        ev.preventDefault();
        filterCards(cat);
        return;
      }
      var link = t.closest && t.closest("a[href]");
      if (link) {
        var openMenu = document.getElementById("navLinks");
        if (openMenu && openMenu.classList.contains("open")) closeNav();
        if (canRoute(link, ev)) routeLink(link, ev);
      }
    });

    window.addEventListener("popstate", function () {
      routeTo(new URL(window.location.href), reduceMotion ? null : { x: window.innerWidth / 2, y: window.innerHeight * .22 }, false);
    });
  }

  /* ============================================================
     初始化
     ============================================================ */

  function initDynamic() {
    initAtmos();
    initDust();
    closeNav();
    bindControls();
    initReveal();
    bindCardMotion();
    initToc();
    updateNavActive();
    updateScrollState();
  }

  function init() {
    root.setAttribute("data-theme", current);

    initThemeButton();

    var origin = null;
    if (!reduceMotion) origin = takeOrigin();

    initDynamic();

    if (origin) {
      document.body.classList.add("route-enter-owned");
      applyEnter(origin);
    } else {
      decodeFirstPaint(30);
    }

    initCursorGlow();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  /* 主题切换后尘埃层要重新评估显隐（CSS 已处理），无需额外逻辑 */
})();
