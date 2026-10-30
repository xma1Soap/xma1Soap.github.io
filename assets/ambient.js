/* ==========================================================================
   xma1Soap · 氛围层
   参考 B2「萤火光尘」：暖色光点缓慢上浮，有远近。
   性能约定：
   - 光点预渲染成 sprite，每帧只做 clearRect + drawImage，不建渐变
   - devicePixelRatio 上限 1.5，粒子数按面积算
   - 不可见时（tab 切走、滚出视口）停掉 rAF
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('glowField');
  if (!canvas) return;

  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  var TAU = Math.PI * 2;
  var dpr = 1;
  var W = 0;
  var H = 0;
  var parts = [];
  var sprite = null;
  var time = 0;
  var last = 0;
  var raf = 0;
  var running = false;
  var inView = true;
  var dprCap = window.innerWidth > 1500 ? 1 : 1.5;

  function makeSprite() {
    var S = 64;
    var cv = document.createElement('canvas');
    cv.width = cv.height = S;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255, 198, 132, 1)');
    g.addColorStop(0.3, 'rgba(232, 150, 68, 0.45)');
    g.addColorStop(0.68, 'rgba(214, 122, 44, 0.12)');
    g.addColorStop(1, 'rgba(200, 110, 40, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    return cv;
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed(W * H < 520000 ? 26 : 46);
    drawStatic();
  }

  function seed(n) {
    parts = [];
    var rand = mulberry(7);
    for (var i = 0; i < n; i++) {
      parts.push({
        x: rand() * W,
        y: rand() * H,
        z: rand(),
        ph: rand() * TAU,
        f: 0.5 + rand() * 1.5,
        vx: (rand() - 0.5) * 6
      });
    }
  }

  /* 确定性随机，保证每次刷新分布一致 */
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function paint(t, scroll) {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.clearRect(0, 0, W, H);
    /* 浅色纸面上用正常混合当暖色尘点，暗底上才用叠加做发光 */
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    var gain = dark ? 1.5 : 0.42;
    var m = Math.min(W, H) / 560;

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var z = p.z;
      var size = (1 + z * z * 10) * m;
      var vy = 4 + z * 13;
      var span = H + 80;
      var y = ((p.y - t * vy - scroll * (0.06 + z * 0.1)) % span + span) % span - 40;
      var x = p.x + Math.sin(t * 0.4 * p.f + p.ph) * 16 * m + Math.sin(t * 0.13 + p.ph) * p.vx;
      var flick = 0.55 + 0.45 * Math.sin(t * p.f * 2.1 + p.ph);
      var alpha = (z > 0.78 ? 0.16 : 0.6) * flick * gain;

      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStatic() {
    paint(0, 0);
  }

  function loop(now) {
    if (!running) return;
    if (!last) last = now;
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    time += dt;
    var scroll = window.pageYOffset || 0;
    paint(time, scroll);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || !inView || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  sprite = makeSprite();
  resize();
  /* 减少动效：只保留一帧静态光尘，不跑 rAF */
  if (!mqReduce.matches) start();

  var rt = 0;
  window.addEventListener('resize', function () {
    if (rt) clearTimeout(rt);
    rt = setTimeout(resize, 180);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) start(); else stop();
    }, { rootMargin: '80px' });
    io.observe(canvas);
  }

  if (mqReduce.addEventListener) {
    mqReduce.addEventListener('change', function (e) {
      if (e.matches) { stop(); drawStatic(); }
      else { resize(); start(); }
    });
  }
})();
