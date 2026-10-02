/*
 * angmom.js — AM: small helpers shared by the Angular Momentum module's pages. Requires CYL (cyl-core.js).
 *
 *   AM.ICON.play / pause / reset       inline SVG icons for buttons
 *   AM.loop(step(dt), {autoplay:false, label:'Play', onToggle(on)}) → {btn, play(), pause(), toggle(), playing()}
 *       A requestAnimationFrame loop with a Play / Pause button. dt is in seconds (capped at 0.05 s so a
 *       background tab does not jump). The loop stops while the tab is hidden, and autoplay is ignored when the
 *       operating system asks for reduced motion.
 *   AM.resetButton(label, fn)            a secondary button with the reset icon
 *   AM.cross(a, b), AM.dot(a, b), AM.norm(a), AM.sub(a, b), AM.add(a, b), AM.scale(a, k)   3-vector helpers
 *   AM.vecTex(v, sig)                    '(a,\ b,\ c)' with CYL.fmtTex numbers (small values shown as 0)
 */
(function (window) {
  'use strict';
  if (window.AM) return;
  var CYL = window.CYL;
  var AM = { version: '1.0.0' };

  AM.ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.2v13.6L18.6 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.8 5h3.6v14H6.8zM13.6 5h3.6v14h-3.6z"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.2h4.2"/></svg>'
  };

  AM.loop = function (step, opts) {
    opts = opts || {};
    var label = opts.label || 'Play', raf = 0, last = 0, on = false;
    var btn = CYL.button('', function () { api.toggle(); }, { primary: opts.primary !== false });
    function sync() {
      btn.innerHTML = (on ? AM.ICON.pause : AM.ICON.play) + '<span>' + (on ? 'Pause' : label) + '</span>';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    function frame(ts) {
      if (!on) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      var keep = step(dt);
      if (keep === false) { api.pause(); return; }
      raf = requestAnimationFrame(frame);
    }
    var api = {
      btn: btn,
      play: function () { if (on) return; on = true; last = 0; sync(); raf = requestAnimationFrame(frame); if (opts.onToggle) opts.onToggle(true); },
      pause: function () { if (!on) return; on = false; if (raf) cancelAnimationFrame(raf); raf = 0; sync(); if (opts.onToggle) opts.onToggle(false); },
      toggle: function () { if (on) api.pause(); else api.play(); },
      playing: function () { return on; }
    };
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && on) { cancelAnimationFrame(raf); raf = 0; }
      else if (!document.hidden && on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    });
    sync();
    if (opts.autoplay && !CYL.prefersReducedMotion()) api.play();
    return api;
  };

  AM.resetButton = function (label, fn) {
    return CYL.button(AM.ICON.reset + '<span>' + (label || 'Reset') + '</span>', fn);
  };

  AM.cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  AM.dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  AM.norm = function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); };
  AM.sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
  AM.add = function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; };
  AM.scale = function (a, k) { return [a[0] * k, a[1] * k, a[2] * k]; };
  AM.vecTex = function (v, sig) {
    return '(' + v.map(function (x) { return CYL.fmtTex(Math.abs(x) < 5e-10 ? 0 : x, sig || 4); }).join(',\\ ') + ')';
  };

  window.AM = AM;
})(window);
