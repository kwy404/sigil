/* SIGIL landing page behavior.
   - Voodoo.js stores for the interactive parts (the voice chain demo, numbers).
   - The hero intro: the sigil is drawn in light once the page opens.
   - Scroll scenes: each scene is a sticky stage whose drawing is scrubbed by
     the scroll position through paused Web Animations. Scenes load their art
     lazily, and only scenes near the viewport do any work.
   Under prefers-reduced-motion everything stays still and complete. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var lang = root.lang || 'en';
  var S = {};
  try {
    S = JSON.parse(doc.getElementById('sigil-strings').textContent);
  } catch (e) {
    S = {};
  }
  var fill = function (text, values) {
    return String(text || '').replace(/\{(\w+)\}/g, function (m, k) { return k in values ? values[k] : m; });
  };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var canAnimate = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  var motion = function () { return !reduced.matches && canAnimate; };

  /* ---------------------------------------------------------- language */

  doc.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[data-lang]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try { localStorage.setItem('sigil-lang', link.getAttribute('data-lang')); } catch (e) { /* storage blocked */ }
    if (location.hash && link.getAttribute('aria-current') !== 'page') {
      event.preventDefault();
      location.href = link.href + location.hash;
    }
  });

  /* ---------------------------------------------------------- Voodoo stores */

  var number = function (n) {
    try {
      return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
    } catch (e) {
      return n.toFixed(1);
    }
  };

  if (window.V && typeof window.V.store === 'function') {
    var V = window.V;
    V.store('site', { num: number });

    var timer = 0;
    var stop = function () { clearTimeout(timer); clearInterval(timer); timer = 0; };
    var icons = ['brand-whatsapp', 'search', 'keyboard', 'sigil:confirm-action', 'send'];
    V.store('chain', {
      steps: icons.map(function (icon, i) {
        return { icon: icon, num: '0' + (i + 1), label: S['voice.demo.s' + (i + 1)] || '' };
      }),
      t: { run: S['voice.demo.run'] || 'Run', again: S['voice.demo.again'] || 'Again' },
      phase: 'idle',
      at: -1,
      left: 8,
      status: S['js.ready'] || '',
      cls: function (i) {
        if (this.phase === 'idle') return '';
        if (this.phase === 'sent') return 'is-done';
        if (i < this.at) return 'is-done';
        if (this.phase === 'canceled') return i >= this.at ? 'is-skip' : 'is-done';
        if (i === this.at) return this.phase === 'waiting' ? 'is-wait' : 'is-active';
        return '';
      },
      say: function (i) {
        this.status = fill(S['js.step'], { n: i + 1, label: this.steps[i].label });
      },
      run: function () {
        var self = this;
        stop();
        self.phase = 'running';
        self.at = -1;
        self.status = S['js.thinking'] || '';
        var next = function () {
          self.at += 1;
          self.say(self.at);
          if (self.at === 3) {
            self.phase = 'waiting';
            self.left = 8;
            self.status = fill(S['js.waiting'], { s: self.left });
            timer = setInterval(function () {
              self.left -= 1;
              if (self.left <= 0) {
                stop();
                self.phase = 'canceled';
                self.status = S['js.timeout'] || '';
              } else {
                self.status = fill(S['js.waiting'], { s: self.left });
              }
            }, 1000);
            return;
          }
          timer = setTimeout(next, 850);
        };
        timer = setTimeout(next, 700);
      },
      confirm: function () {
        var self = this;
        if (self.phase !== 'waiting') return;
        stop();
        self.phase = 'running';
        self.at = 4;
        self.say(4);
        timer = setTimeout(function () {
          self.phase = 'sent';
          self.status = S['js.sent'] || '';
        }, 700);
      },
      cancel: function () {
        stop();
        if (this.at < 0) this.at = 0;
        this.phase = 'canceled';
        this.status = S['js.canceled'] || '';
      },
    });
  }

  /* ---------------------------------------------------------- header */

  var header = doc.getElementById('site-header');
  var setHeader = function () {
    if (header) header.classList.toggle('is-top', window.scrollY < 8);
  };

  /* ---------------------------------------------------------- tracks */

  // A track is a paused Web Animation mapped onto a slice [from, to] of a
  // progress value (scroll progress for scenes).
  function track(list, from, to, el, keyframes, easing) {
    if (!el) return;
    var anim = el.animate(keyframes, { duration: 1000, fill: 'both', easing: easing || 'linear' });
    anim.pause();
    list.push({ anim: anim, from: from, to: to });
  }
  function seek(list, p) {
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var local = t.to > t.from ? clamp((p - t.from) / (t.to - t.from), 0, 1) : (p >= t.to ? 1 : 0);
      t.anim.currentTime = local * 1000;
    }
  }
  function drop(list) {
    for (var i = 0; i < list.length; i++) list[i].anim.cancel();
    list.length = 0;
  }
  // Light trails are stacks of dashes that all end at the head of the stroke;
  // revealing each one in turn draws the whole trail from its start.
  function draw(list, els, from, to) {
    for (var i = 0; i < els.length; i++) {
      var x = parseFloat(els[i].getAttribute('stroke-dasharray')) || 0;
      track(list, from + (to - from) * (1 - x / 100), to, els[i], [{ strokeDasharray: '0 200' }, { strokeDasharray: x + ' 200' }]);
    }
  }
  var fade = function (list, el, from, to, extra) {
    var a = { opacity: 0 };
    var b = { opacity: 1 };
    if (extra) { a.transform = extra; b.transform = 'none'; }
    track(list, from, to, el, [a, b], 'cubic-bezier(0.2, 0, 0, 1)');
  };
  var all = function (scope, selector) { return Array.prototype.slice.call(scope.querySelectorAll(selector)); };

  /* ---------------------------------------------------------- hero intro */

  var hero = doc.querySelector('.sg-hero');
  function heroIntro() {
    if (!hero || !motion()) {
      root.classList.add('hero-js');
      return;
    }
    var light = hero.querySelector('.hero-light');
    var marks = hero.querySelector('.hero-marks');
    if (!light || !marks) return;
    var play = function (el, keyframes, delay, duration, easing) {
      if (!el) return;
      el.animate(keyframes, { duration: duration, delay: delay, fill: 'backwards', easing: easing || 'cubic-bezier(0.2, 0, 0, 1)' });
    };
    var start = 250;
    play(marks.querySelector('.hl-lines'), [{ opacity: 0 }, { opacity: 1 }], start, 700);
    all(marks, '.hl-dot').forEach(function (dot, i) {
      play(dot, [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], start + 120 + i * 28, 320);
    });
    play(marks.querySelector('.hl-lead'), [{ strokeDasharray: '0 100' }, { strokeDasharray: '100 100' }], start + 650, 420);
    play(marks.querySelector('.hl-label'), [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], start + 850, 420);
    play(light.querySelector('.hl-point'), [{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], start + 380, 520);
    var arc = function (cls, from, to) {
      all(light, '.seg.' + cls).forEach(function (seg) {
        var x = parseFloat(seg.getAttribute('stroke-dasharray')) || 0;
        var a = from + (to - from) * (1 - x / 100);
        play(seg, [{ strokeDasharray: '0 200' }, { strokeDasharray: x + ' 200' }], start + a, to - a, 'linear');
      });
    };
    arc('t', 900, 2000);
    arc('b', 1450, 2550);
    all(light, '.hl-end.t').forEach(function (el) { play(el, [{ opacity: 0 }, { opacity: 1 }], start + 1950, 260); });
    all(light, '.hl-end.b').forEach(function (el) { play(el, [{ opacity: 0 }, { opacity: 1 }], start + 2500, 260); });
    var point = light.querySelector('.hl-point');
    if (point) point.animate([{ transform: 'none' }, { transform: 'scale(1.25)' }, { transform: 'none' }], { duration: 320, delay: start + 2560, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    var burst = light.querySelector('.hl-burst');
    if (burst) burst.animate([{ opacity: 0.85, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(3.4)' }], { duration: 620, delay: start + 2560, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)' });
    root.classList.add('hero-js');
  }

  /* ---------------------------------------------------------- scenes */

  // Each recipe receives the stage (the injected SVG, or the sign mark) and
  // returns its tracks; cuts split the progress between the steps.
  var RECIPES = {
    sign: {
      cuts: [0.25, 0.5, 0.72],
      build: function (list, svg) {
        draw(list, all(svg, '.seg.t'), 0.03, 0.22);
        draw(list, all(svg, '.seg.b'), 0.28, 0.47);
        all(svg, '.mk-end.t').forEach(function (el) { fade(list, el, 0.2, 0.24); });
        all(svg, '.mk-end.b').forEach(function (el) { fade(list, el, 0.45, 0.49); });
        track(list, 0.5, 0.64, svg.querySelector('.mk-dot'), [{ opacity: 0.25, transform: 'scale(0.5)' }, { opacity: 1, transform: 'scale(1.25)', offset: 0.6 }, { opacity: 1, transform: 'none' }]);
        track(list, 0.5, 0.64, svg.querySelector('.mk-core'), [{ opacity: 0.4, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1.3)', offset: 0.6 }, { opacity: 1, transform: 'none' }]);
        track(list, 0.76, 0.96, svg.querySelector('.mk-turn'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }], 'cubic-bezier(0.45, 0, 0.55, 1)');
      },
    },
    trail: {
      cuts: [0.33, 0.66],
      chips: [[0.04, 0.36]],
      build: function (list, svg) {
        track(list, 0.02, 0.14, svg.querySelector('.tr-cam'), [{ opacity: 0.35 }, { opacity: 1 }]);
        draw(list, all(svg, '.tr-trail .seg'), 0.34, 0.62);
        all(svg, '.spark').forEach(function (el) {
          var f = clamp((parseFloat(el.getAttribute('cx')) - 250) / 556, 0, 1);
          fade(list, el, 0.34 + 0.28 * f, 0.38 + 0.28 * f);
        });
        fade(list, svg.querySelector('.tr-core'), 0.6, 0.66, 'scale(0.4)');
        fade(list, svg.querySelector('.tr-lens'), 0.64, 0.74, 'scale(0.8)');
        track(list, 0.72, 0.8, svg.querySelector('.tr-lead'), [{ strokeDasharray: '0 100' }, { strokeDasharray: '100 100' }]);
        fade(list, svg.querySelector('.tr-hud'), 0.76, 0.86, 'translateX(18px)');
      },
    },
    sphere: {
      cuts: [0.33, 0.66],
      build: function (list, svg) {
        fade(list, svg.querySelector('.sp-core'), 0.02, 0.18, 'scale(0.2)');
        fade(list, svg.querySelector('.sp-rays'), 0.08, 0.3);
        draw(list, all(svg, '.sp-mark .seg.t'), 0.1, 0.22);
        draw(list, all(svg, '.sp-mark .seg.b'), 0.16, 0.28);
        all(svg, '.sp-end').forEach(function (el) { fade(list, el, 0.26, 0.3); });
        fade(list, svg.querySelector('.sp-point'), 0.24, 0.3, 'scale(0.4)');
        all(svg, '.sp-ring').forEach(function (el, i) {
          track(list, 0.24 + i * 0.02, 0.32 + i * 0.02, el, [{ strokeDasharray: '0 100' }, { strokeDasharray: '100 100' }]);
        });
        fade(list, svg.querySelector('.sp-status'), 0.3, 0.36);
        fade(list, svg.querySelector('.sp-orbit'), 0.34, 0.44, 'scale(0.9)');
        fade(list, svg.querySelector('.sp-context'), 0.36, 0.46, 'translateY(-22px)');
        all(svg, '.sp-act').forEach(function (el, i) {
          var dx = parseFloat(el.style.getPropertyValue('--dx')) || 0;
          var dy = parseFloat(el.style.getPropertyValue('--dy')) || 0;
          track(list, 0.38 + i * 0.03, 0.5 + i * 0.03, el, [
            { opacity: 0, transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(0.3)' },
            { opacity: 1, transform: 'none' },
          ], 'cubic-bezier(0.34, 1.32, 0.64, 1)');
        });
        all(svg, '.sp-lit').forEach(function (el) { fade(list, el, 0.86, 0.94); });
        all(svg, '.sp-person').forEach(function (el, i) { fade(list, el, 0.5 + i * 0.03, 0.58 + i * 0.03, 'translateY(26px)'); });
        fade(list, svg.querySelector('.sp-recent'), 0.58, 0.64);
        draw(list, all(svg, '.sp-trail .seg'), 0.68, 0.86);
        all(svg, '.sp-sparks .spark').forEach(function (el) {
          var f = clamp((860 - parseFloat(el.getAttribute('cy'))) / 472, 0, 1);
          fade(list, el, 0.68 + 0.18 * f, 0.72 + 0.18 * f);
        });
        fade(list, svg.querySelector('.sp-cursor'), 0.84, 0.9, 'scale(0.4)');
      },
    },
    chain: {
      cuts: [0.3, 0.68],
      chips: [[0.8, 0.93]],
      build: function (list, svg) {
        fade(list, svg.querySelector('.ch-request'), 0.02, 0.12, 'translateY(14px)');
        track(list, 0, 0.12, svg.querySelector('.ch-listen'), [{ opacity: 0.55 }, { opacity: 1 }]);
        all(svg, '.ch-wave').forEach(function (wave, i) {
          draw(list, all(wave, '.seg'), 0.08 + i * 0.02, 0.3 + i * 0.02);
        });
        draw(list, all(svg, '.ch-line .seg'), 0.32, 0.8);
        // The plan appears as dim nodes, then each node lights when the line
        // of light reaches it; Send waits for the confirmation.
        all(svg, '.ch-node').forEach(function (node, i) {
          var shown = 0.28 + i * 0.012;
          var dim = shown + 0.04;
          var lit = i === 3 ? 0.93 : Math.max(dim + 0.01, 0.32 + 0.48 * ((700 + i * 200 - 680) / 630));
          var to = lit + 0.03;
          var span = to - shown;
          track(list, shown, to, node, [
            { opacity: 0, offset: 0 },
            { opacity: 0.38, offset: (dim - shown) / span },
            { opacity: 0.38, offset: (lit - shown) / span },
            { opacity: 1, offset: 1 },
          ]);
        });
        all(svg, '.ch-lit').forEach(function (el) { fade(list, el, 0.93, 0.97); });
        fade(list, svg.querySelector('.ch-done'), 0.95, 1, 'translateY(10px)');
      },
    },
  };

  var scenes = [];
  var running = false;

  function localize(svg) {
    all(svg, '[data-k]').forEach(function (el) {
      var text = S[el.getAttribute('data-k')];
      if (!text) return;
      var node = el.firstChild;
      if (el.children.length && node && node.nodeType === 3) node.nodeValue = text;
      else if (!el.children.length) el.textContent = text;
    });
  }

  function placeChips(stage) {
    all(stage, '.stage-chip[data-at]').forEach(function (chip) {
      var at = chip.getAttribute('data-at').split(' ');
      chip.style.setProperty('--x', at[0]);
      chip.style.setProperty('--y', at[1]);
    });
  }

  function setup(scene) {
    var recipe = RECIPES[scene.el.getAttribute('data-scene')];
    if (!recipe || !scene.art) return;
    drop(scene.tracks);
    if (!motion()) return;
    try {
      recipe.build(scene.tracks, scene.art);
    } catch (error) {
      // A broken recipe must not leave a half built scene: show it complete.
      drop(scene.tracks);
      if (window.console) console.error('SIGIL scene ' + scene.el.getAttribute('data-scene') + ': ' + error.message);
    }
    seek(scene.tracks, scene.p);
  }

  function inject(scene) {
    var stage = scene.stage;
    var src = stage && stage.getAttribute('data-src');
    if (!src || scene.loading) return;
    scene.loading = true;
    fetch(src, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (text) {
        var tpl = doc.createElement('template');
        tpl.innerHTML = text;
        var svg = tpl.content.querySelector('svg');
        if (!svg) return;
        localize(svg);
        var img = stage.querySelector('img');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', img ? img.alt : '');
        svg.removeAttribute('aria-hidden');
        if (img) img.replaceWith(svg);
        else stage.prepend(svg);
        scene.art = svg;
        setup(scene);
      })
      .catch(function () { /* the still illustration stays */ });
  }

  function measure(scene) {
    var r = scene.track.getBoundingClientRect();
    var total = r.height - window.innerHeight;
    scene.p = total > 0 ? clamp(-r.top / total, 0, 1) : 0;
  }

  function update(scene) {
    measure(scene);
    seek(scene.tracks, scene.p);
    var recipe = RECIPES[scene.el.getAttribute('data-scene')];
    var idx = 0;
    while (idx < recipe.cuts.length && scene.p >= recipe.cuts[idx]) idx++;
    if (idx !== scene.step) {
      scene.step = idx;
      scene.steps.forEach(function (step, i) { step.classList.toggle('is-active', i === idx); });
    }
    if (scene.copy) scene.copy.style.setProperty('--p', scene.p.toFixed(3));
    if (recipe.chips) {
      scene.chips.forEach(function (chip, i) {
        var range = recipe.chips[i];
        chip.classList.toggle('is-on', !!range && scene.p >= range[0] && scene.p < range[1]);
      });
    }
  }

  function frame() {
    running = false;
    setHeader();
    for (var i = 0; i < scenes.length; i++) if (scenes[i].near && motion()) update(scenes[i]);
  }
  function request() {
    if (!running) {
      running = true;
      window.requestAnimationFrame(frame);
    }
  }

  function initScenes() {
    var list = all(doc, '[data-scene]');
    list.forEach(function (el) {
      var stage = el.querySelector('.scene-stage') || el.querySelector('.sign-stage');
      var scene = {
        el: el,
        track: el.querySelector('.scene-track'),
        stage: stage,
        copy: el.querySelector('.scene-copy'),
        steps: all(el, '.beat'),
        chips: all(el, '.stage-chip'),
        art: el.getAttribute('data-scene') === 'sign' ? el.querySelector('.mark-svg') : null,
        tracks: [],
        p: 0,
        step: -1,
        near: false,
      };
      if (stage) placeChips(stage);
      scenes.push(scene);
    });
    if (!scenes.length) return;

    if ('IntersectionObserver' in window) {
      // Load the art well before a scene arrives.
      var loader = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var scene = scenes.filter(function (s) { return s.el === entry.target; })[0];
          if (scene) inject(scene);
          loader.unobserve(entry.target);
        });
      }, { rootMargin: '150% 0px' });
      // Only scenes on or near the screen are updated while scrolling.
      var watcher = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var scene = scenes.filter(function (s) { return s.el === entry.target; })[0];
          if (!scene) return;
          scene.near = entry.isIntersecting;
          if (scene.near) request();
        });
      }, { rootMargin: '25% 0px' });
      scenes.forEach(function (scene) {
        loader.observe(scene.el);
        watcher.observe(scene.el);
      });
    } else {
      scenes.forEach(function (scene) { scene.near = true; inject(scene); });
    }
    scenes.forEach(setup);
  }

  function applyMotion() {
    var on = motion();
    root.classList.toggle('motion', on);
    root.classList.toggle('still', !on);
    root.classList.toggle('scenes-on', on);
    scenes.forEach(function (scene) {
      setup(scene);
      if (!on) {
        scene.step = -1;
        scene.steps.forEach(function (step) { step.classList.remove('is-active'); });
        scene.chips.forEach(function (chip) { chip.classList.remove('is-on'); });
      }
    });
    request();
  }

  /* ---------------------------------------------------------- start */

  if (motion()) root.classList.add('scenes-on');
  initScenes();
  heroIntro();
  setHeader();
  request();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  if (typeof reduced.addEventListener === 'function') reduced.addEventListener('change', applyMotion);

  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      hero.classList.toggle('is-off', !entries[0].isIntersecting);
    }).observe(hero);
  }
})();
