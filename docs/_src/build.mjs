#!/usr/bin/env node
// Builds the SIGIL landing page in every language.
//
//   node docs/_src/build.mjs
//
// Inputs (all in docs/_src): page.html (the template), hero.html and mark.html
// (inline art), languages.json and i18n/<code>.json (one flat file of strings
// per language, the same keys as en.json). Strings are written into the page
// with [[key]] (HTML allowed) or [[a:key]] (escaped for attributes); [[@name]]
// values are computed here.
//
// Outputs: docs/index.html (English, the x-default) and docs/<dir>/index.html
// for the other languages, docs/sitemap.xml, docs/assets/sigil-icons.js (the
// glyphfox icon source built from design/icons) and copies of the design art
// the page uses (design/illustrations, design/logo). Never edit those outputs
// by hand. The scroll scenes in docs/assets/scenes and the PNG images (Open
// Graph cards, touch icon) are prepared once from the design files.
//
// The build fails on a missing or extra key, a dropped placeholder or HTML tag,
// an en dash or em dash, an emoji, an exclamation mark, an unknown icon name or
// a placeholder left in a page.

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const DOCS = join(SRC, '..');
const ROOT = join(DOCS, '..');
const DESIGN = join(ROOT, 'design');
const SITE = 'https://kwy404.github.io/sigil/';

// Pinned with `npm view <pkg> version`. The hashes are the Subresource
// Integrity values of the exact files the page loads from jsDelivr.
const VERSIONS = { monsoon: '0.2.0', glyphfox: '1.3.0', voodoo: '1.1.0' };
const SRI = {
  monsoon: 'sha384-B438i0UadMDKq3r72vvwMESbCq43lGUxMFnUCwMIl2Lf/9nghl+Q96jnmTUhwf79',
  glyphfox: 'sha384-0PEVIK2sxTipsNBZuo0fsZ0WaCdpuVVF8AoDzMuT9pJlwKXzNGQTqIxybkgkZ4EB',
  voodoo: 'sha384-r4vWOg+2FrOsL3+wm1DZW3yrMKTtydvB+Z1V2Ty6zgeTk6dbq3xAbqP5M7UZbu/U',
};

const FONT_BASE = 'family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600&family=Sora:wght@300;400;600';
const FONT_EXTRA = { ja: '&family=Noto+Sans+JP:wght@300;400;500;600', 'zh-Hans': '&family=Noto+Sans+SC:wght@300;400;500;600' };

const GESTURES = [
  ['g-open-palm', 'openPalm', 'gesture-open-palm'],
  ['g-point', 'point', 'gesture-point'],
  ['g-pinch', 'pinch', 'gesture-pinch'],
  ['g-double-pinch', 'doublePinch', 'gesture-double-pinch'],
  ['g-pinch-hold', 'pinchHold', 'gesture-pinch-hold'],
  ['g-fist', 'fist', 'gesture-fist'],
  ['g-swipe-up', 'swipeUp', 'gesture-swipe-up'],
  ['g-swipe-down', 'swipeDown', 'gesture-swipe-down'],
  ['g-swipe-left', 'swipeLeft', 'gesture-swipe-left'],
  ['g-swipe-right', 'swipeRight', 'gesture-swipe-right'],
  ['g-three', 'threeFingers', 'gesture-three-fingers'],
  ['g-circle-cw', 'circleCw', 'gesture-circle-cw'],
  ['g-circle-ccw', 'circleCcw', 'gesture-circle-ccw'],
  ['g-flick', 'flick', 'gesture-flick'],
];
const FIRST_GESTURE = 'g-pinch';

const PROFILES = [
  {
    id: 'p-whatsapp', name: 'WhatsApp', packages: 'com.whatsapp, com.whatsapp.w4b', note: 'profiles.wa.note',
    rows: [
      ['gesture-flick', 'profiles.row.flickRight', 'profiles.wa.r1'],
      ['gesture-swipe-left', 'g.swipeLeft.name', 'profiles.wa.r2'],
      ['gesture-swipe-right', 'g.swipeRight.name', 'profiles.wa.r3'],
    ],
  },
  {
    id: 'p-instagram', name: 'Instagram', packages: 'com.instagram.android', note: 'profiles.ig.note',
    rows: [
      ['gesture-flick', 'profiles.row.flickUp', 'profiles.ig.r1'],
      ['gesture-flick', 'profiles.row.flickDown', 'profiles.ig.r2'],
      ['gesture-swipe-left', 'g.swipeLeft.name', 'profiles.ig.r3'],
      ['gesture-swipe-right', 'g.swipeRight.name', 'profiles.ig.r4'],
    ],
  },
  {
    id: 'p-youtube', name: 'YouTube', packages: 'com.google.android.youtube', note: 'profiles.yt.note',
    rows: [
      ['gesture-flick', 'profiles.row.flickUp', 'profiles.yt.r1'],
      ['gesture-flick', 'profiles.row.flickDown', 'profiles.yt.r2'],
      ['gesture-swipe-left', 'g.swipeLeft.name', 'profiles.yt.r3'],
      ['gesture-swipe-right', 'g.swipeRight.name', 'profiles.yt.r4'],
      ['gesture-pinch-hold', 'g.pinchHold.name', 'profiles.yt.r5'],
    ],
  },
  {
    id: 'p-general', name: null, packages: '', note: 'profiles.gen.note',
    rows: [
      ['gesture-pinch', 'g.pinch.name', 'profiles.gen.pinch'],
      ['gesture-double-pinch', 'g.doublePinch.name', 'profiles.gen.doublePinch'],
      ['gesture-pinch-hold', 'g.pinchHold.name', 'profiles.gen.pinchHold'],
      ['gesture-open-palm', 'g.openPalm.name', 'profiles.gen.openPalm'],
      ['gesture-fist', 'g.fist.name', 'profiles.gen.fist'],
      ['gesture-swipe-up', 'profiles.row.swipeUpDown', 'profiles.gen.swipeUpDown'],
      ['gesture-swipe-left', 'profiles.row.swipeLeftRight', 'profiles.gen.swipeLeftRight'],
      ['gesture-three-fingers', 'g.threeFingers.name', 'profiles.gen.three'],
      ['gesture-circle-cw', 'profiles.row.circle', 'profiles.gen.circle'],
      ['gesture-flick', 'g.flick.name', 'profiles.gen.flick'],
    ],
  },
];

// Illustrations and logo files the page loads, copied from design/.
const COPIES = [
  ['illustrations/cursor-trail.svg', 'assets/illustrations/cursor-trail.svg'],
  ['illustrations/control-sphere.svg', 'assets/illustrations/control-sphere.svg'],
  ['illustrations/gesture-profiles.svg', 'assets/illustrations/gesture-profiles.svg'],
  ['illustrations/on-device-brain.svg', 'assets/illustrations/on-device-brain.svg'],
  ['illustrations/voice-action-chain.svg', 'assets/illustrations/voice-action-chain.svg'],
  ['logo/sigil-lockup-dark.svg', 'assets/logo/sigil-lockup-dark.svg'],
  ['logo/favicon.svg', 'assets/favicon.svg'],
];

// Labels drawn inside those illustrations and the string each one becomes on
// the other languages' copies, written to assets/illustrations/<code>/.
// Names, times and figures stay as drawn.
const ART_LABELS = {
  'cursor-trail.svg': [
    ['Now playing', 'scene.trail.nowPlaying'], ['From your evening set', 'scene.trail.fromSet'],
    ['Up next', 'scene.trail.upNext'], ['CURSOR', 'scene.trail.cursorTag'], ['Snapped to Play', 'scene.trail.snapped'],
  ],
  'control-sphere.svg': [
    ['ON DEVICE · 18 MS · MIC ON', 'scene.sphere.status'], ['Reply', 'scene.sphere.reply'],
    ['Read aloud', 'scene.sphere.readAloud'], ['Done', 'scene.sphere.done'], ['Routine', 'scene.sphere.routine'],
    ['Silence', 'scene.sphere.silence'], ['Settings', 'scene.sphere.settings'], ['RECENT', 'scene.sphere.recent'],
  ],
  'gesture-profiles.svg': [
    ['Reader', 'art.profiles.reader'], ['PROFILE 2 · 3 GESTURES', 'art.profiles.readerMeta'],
    ['Scroll the page', 'profiles.gen.swipeUpDown'], ['Highlight a line', 'art.profiles.highlight'],
    ['Define the word', 'art.profiles.define'], ['Camera', 'art.profiles.camera'],
    ['PROFILE 3 · 3 GESTURES', 'art.profiles.cameraMeta'], ['Shutter in 3 s', 'art.profiles.shutter'],
    ['Switch lens', 'art.profiles.lens'], ['Stop recording', 'art.profiles.stopRec'], ['Music', 'art.profiles.music'],
    ['PROFILE 1 · ACTIVE', 'art.profiles.musicMeta'], ['Play or pause', 'profiles.yt.r5'],
    ['Volume up', 'art.profiles.volUp'], ['Next track', 'art.profiles.next'], ['Lower volume', 'art.profiles.volDown'],
    ['Switches with the app in front', 'art.profiles.switches'],
  ],
  'on-device-brain.svg': [
    ['On device', 'privacy.overline'], ['0 BYTES SENT', 'art.privacy.bytes'], ['NOT NEEDED', 'art.privacy.notNeeded'],
    ['CAMERA FRAMES', 'art.privacy.camera'], ['VOICE', 'art.privacy.voice'],
  ],
  'voice-action-chain.svg': [
    ['Tell Ana I am running ten minutes late', 'scene.chain.request'], ['Open Messages', 'scene.chain.open'],
    ['Find Ana', 'scene.chain.find'], ['Write the note', 'scene.chain.write'], ['Send', 'scene.chain.send'],
    ['DONE IN 1.2 S', 'scene.chain.doneIn'],
  ],
};

const problems = [];
const fail = (msg) => problems.push(msg);

const read = (p) => readFileSync(p, 'utf8');
const allLanguages = JSON.parse(read(join(SRC, 'languages.json')));
// SIGIL_LANGS=en,ja builds only those pages, for quick checks while editing.
const only = (process.env.SIGIL_LANGS || '').split(',').filter(Boolean);
const languages = only.length ? allLanguages.filter((l) => only.includes(l.code)) : allLanguages;
const template = read(join(SRC, 'page.html'));
const hero = read(join(SRC, 'hero.html'));
const mark = read(join(SRC, 'mark.html'));

// ---------------------------------------------------------------- strings

const strings = {};
for (const lang of languages) strings[lang.code] = JSON.parse(read(join(SRC, 'i18n', `${lang.code}.json`)));
const en = strings.en;
const keys = Object.keys(en);

const FORBIDDEN = [
  [/\u2013/, 'an en dash'],
  [/\u2014/, 'an em dash'],
  [/[!¡！]/, 'an exclamation mark'],
  [/\p{Extended_Pictographic}/u, 'an emoji'],
];
const tagsOf = (s) => (s.match(/<\/?[a-z][a-z0-9]*/gi) || []).map((t) => t.toLowerCase()).sort().join(' ');
const holesOf = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join(' ');

for (const lang of languages) {
  const table = strings[lang.code];
  for (const k of keys) {
    if (!(k in table)) fail(`${lang.code}: missing key ${k}`);
    else if (typeof table[k] !== 'string' || !table[k].trim()) fail(`${lang.code}: empty value for ${k}`);
    else {
      if (tagsOf(table[k]) !== tagsOf(en[k])) fail(`${lang.code}: ${k} does not keep the HTML tags of English`);
      if (holesOf(table[k]) !== holesOf(en[k])) fail(`${lang.code}: ${k} does not keep the placeholders of English`);
    }
  }
  for (const k of Object.keys(table)) if (!(k in en)) fail(`${lang.code}: extra key ${k}`);
  for (const [k, v] of Object.entries(table)) {
    for (const [re, what] of FORBIDDEN) if (re.test(v)) fail(`${lang.code}: ${k} contains ${what}: ${v}`);
  }
}

// ---------------------------------------------------------------- icons

const iconDir = join(DESIGN, 'icons');
const sigilIcons = {};
for (const file of readdirSync(iconDir).filter((f) => f.endsWith('.svg')).sort()) {
  const name = file.slice(0, -4);
  const svg = read(join(iconDir, file));
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/>\s+</g, '><').trim();
  const meta = existsSync(join(iconDir, `${name}.json`)) ? JSON.parse(read(join(iconDir, `${name}.json`))) : {};
  sigilIcons[name] = { name, body, tags: meta.tags || [], categories: meta.categories || [] };
}

// Names of the glyphfox set, read from a sibling clone when there is one.
let glyphfoxNames = null;
for (const candidate of [join(ROOT, '..', 'glyphfox', 'packages', 'glyphfox', 'dist', 'icons.json'), join(ROOT, 'node_modules', 'glyphfox', 'dist', 'icons.json')]) {
  if (existsSync(candidate)) {
    const data = JSON.parse(read(candidate));
    glyphfoxNames = new Set(Array.isArray(data) ? data.map((i) => i.name) : Object.keys(data.icons || data));
    break;
  }
}

function checkIcon(spec, where) {
  if (spec.startsWith('sigil:')) {
    if (!sigilIcons[spec.slice(6)]) fail(`${where}: unknown SIGIL icon ${spec}`);
  } else if (glyphfoxNames && !glyphfoxNames.has(spec)) {
    fail(`${where}: unknown glyphfox icon ${spec}`);
  }
}

const iconsModule = `/* SIGIL icons for glyphfox: the ${Object.keys(sigilIcons).length} icons of design/icons, built by docs/_src/build.mjs. Do not edit. */
(function () {
  'use strict';
  var icons = ${JSON.stringify(sigilIcons)};
  var gf = window.glyphfox;
  if (!gf || typeof gf.registerIconSource !== 'function') return;
  // Names like "sigil:gesture-pinch" resolve here.
  gf.registerIconSource('sigil', { get: function (name) { return icons[name] || null; } });
  // glyphfox 1.3.0 keeps retrying a name it cannot resolve, so names are only
  // set once the source above exists and the icon is known.
  function known(spec) {
    try {
      return gf.parseSpec(spec).names.every(function (n) { return !!gf.getIcon(n); });
    } catch (e) {
      return false;
    }
  }
  var nodes = document.querySelectorAll('glyph-fox[data-icon]');
  for (var i = 0; i < nodes.length; i++) {
    var spec = nodes[i].getAttribute('data-icon');
    if (spec && known(spec)) nodes[i].setAttribute('name', spec);
  }
  window.sigilIconKnown = known;
})();
`;

// ---------------------------------------------------------------- helpers

const escAttr = (s) => s.replace(/<[^>]+>/g, '').replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/"/g, '&quot;');
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pageUrl = (lang) => SITE + (lang.dir ? `${lang.dir}/` : '');
const rootOf = (lang) => (lang.dir ? '../' : '');
const relTo = (from, to) => rootOf(from) + (to.dir ? `${to.dir}/` : '') || './';

function gesturePanels() {
  return GESTURES.map(([id, key, icon], i) => {
    const hidden = id === FIRST_GESTURE ? '' : ' hidden';
    return `        <section class="g-panel" v-tab-panel="${id}"${hidden}>
          <div class="g-panel-art"><glyph-fox class="i96" data-icon="sigil:${icon}" size="96" weight="1.25" variant="duotone" animate="draw" trigger="inView"></glyph-fox></div>
          <div class="g-panel-body">
            <p class="g-panel-k">[[gestures.kicker]] ${String(i + 1).padStart(2, '0')} / ${GESTURES.length}</p>
            <h3 class="g-panel-title">[[g.${key}.name]]</h3>
            <dl class="g-panel-dl">
              <div><dt>[[gestures.when]]</dt><dd>[[g.${key}.when]]</dd></div>
              <div><dt>[[gestures.does]]</dt><dd>[[g.${key}.does]]</dd></div>
            </dl>
            <p class="hud-chip hud-chip-sm">[[g.${key}.hud]]</p>
          </div>
        </section>`;
  }).join('\n');
}

function profilePanels() {
  return PROFILES.map((p, i) => {
    const name = p.name || '[[profiles.general]]';
    const rows = p.rows.map(([icon, label, action]) =>
      `            <tr><th scope="row"><glyph-fox class="i20" data-icon="sigil:${icon}" size="20" variant="duotone"></glyph-fox><span>[[${label}]]</span></th><td>[[${action}]]</td></tr>`).join('\n');
    const meta = p.packages ? `<p class="p-meta"><span class="p-meta-k">[[profiles.packages]]</span><span translate="no">${p.packages}</span></p>` : `<p class="p-meta"><span class="p-meta-k">[[profiles.inherit]]</span></p>`;
    return `        <div class="p-panel" v-tab-panel="${p.id}"${i ? ' hidden' : ''}>
          ${meta}
          <table class="bindings">
            <caption class="sr-only">${name}: [[profiles.tableCaption]]</caption>
            <thead class="sr-only"><tr><th scope="col">[[profiles.col.gesture]]</th><th scope="col">[[profiles.col.action]]</th></tr></thead>
            <tbody>
${rows}
            </tbody>
          </table>
          <p class="p-note">[[${p.note}]]</p>
        </div>`;
  }).join('\n');
}

function hreflang() {
  const links = allLanguages.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l)}">`);
  links.push(`<link rel="alternate" hreflang="x-default" href="${SITE}">`);
  return links.join('\n');
}

function langMenu(cur) {
  const items = allLanguages.map((l) => {
    const current = l.code === cur.code ? ' aria-current="page"' : '';
    return `<li><a href="${relTo(cur, l)}" hreflang="${l.hreflang}" lang="${l.hreflang}" data-lang="${l.code}"${current}><span>${l.name}</span>${current ? '<glyph-fox class="i16" data-icon="check" size="16"></glyph-fox>' : ''}</a></li>`;
  }).join('');
  return `<details class="lang-menu" v-click-outside="$el.open = false" v-escape="$el.open = false">
        <summary class="btn btn-ghost btn-sm lang-button" aria-label="[[a:lang.label]]: ${escAttr(cur.name)}">
          <glyph-fox class="i18" data-icon="globe" size="18"></glyph-fox><span class="lang-short">${cur.short}</span><glyph-fox class="i14 lang-caret" data-icon="chevron-down" size="14"></glyph-fox>
        </summary>
        <ul class="lang-list" role="list">${items}</ul>
      </details>`;
}

function langList(cur) {
  return '<ul class="foot-lang-list" role="list">' + allLanguages.map((l) => {
    const current = l.code === cur.code ? ' aria-current="page"' : '';
    return `<li><a href="${relTo(cur, l)}" hreflang="${l.hreflang}" lang="${l.hreflang}" data-lang="${l.code}"${current}>${l.name}</a></li>`;
  }).join('') + '</ul>';
}

function headScript(lang) {
  const base = "var d=document,h=d.documentElement;h.classList.remove('no-js');h.classList.add('js');" +
    "var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;h.classList.add(still?'still':'motion');";
  if (lang.code !== 'en') return `(function(){${base}})();`;
  const map = {};
  for (const l of allLanguages) if (l.dir) map[l.code] = `${l.dir}/`;
  // The English page is the x-default: send a visitor to the language they
  // picked before, or on the first visit to the first browser language the
  // site has. Pages in a language folder never redirect.
  const redirect = "try{var K='sigil-lang',s=localStorage.getItem(K),P=" + JSON.stringify(map) + ";" +
    "if(!s){var L=navigator.languages||[navigator.language||''];for(var i=0;i<L.length&&!s;i++){var t=String(L[i]).toLowerCase();" +
    "if(/^en(-|$)/.test(t))s='en';else if(/^pt(-|$)/.test(t))s='pt-BR';else if(/^es(-|$)/.test(t))s='es';else if(/^fr(-|$)/.test(t))s='fr';" +
    "else if(/^de(-|$)/.test(t))s='de';else if(/^it(-|$)/.test(t))s='it';else if(/^ja(-|$)/.test(t))s='ja';" +
    "else if(/^zh(-|$)/.test(t)&&!/-(hant|tw|hk|mo)(-|$)/.test(t))s='zh-Hans';}" +
    "s=s||'en';localStorage.setItem(K,s);}" +
    "if(P[s]&&location.protocol!=='file:')location.replace(P[s]+location.hash);}catch(e){}";
  return `(function(){${base}${redirect}})();`;
}

function jsonld(lang, t) {
  const url = pageUrl(lang);
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE}#website`, name: 'SIGIL', url: SITE, inLanguage: allLanguages.map((l) => l.hreflang) },
      {
        '@type': 'WebPage', '@id': `${url}#page`, url, name: t['meta.title'], description: t['meta.description'], inLanguage: lang.hreflang,
        isPartOf: { '@id': `${SITE}#website` },
        primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE}assets/og/${lang.og.toLowerCase()}.png`, width: 1200, height: 630 },
        author: { '@type': 'Person', name: 'Alexandre Kohler', url: 'https://github.com/kwy404', sameAs: ['https://www.linkedin.com/in/alexandre-silva-173687256/'] },
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function stringsFor(t) {
  const out = {};
  for (const k of keys) if (k.startsWith('js.') || k.startsWith('scene.') || /^voice\.demo\.(s\d|run|again)$/.test(k)) out[k] = t[k];
  return JSON.stringify(out).replace(/</g, '\\u003c');
}

// ---------------------------------------------------------------- pages

const build = createHash('sha256')
  .update(read(join(DOCS, 'assets', 'site.css')))
  .update(read(join(DOCS, 'assets', 'site.js')))
  .update(iconsModule)
  .digest('hex')
  .slice(0, 10);

const written = [];
const artCopies = [];
for (const lang of languages) {
  const t = strings[lang.code];
  const sri = (name) => (SRI[name] ? ` integrity="${SRI[name]}"` : '');
  const computed = {
    lang: lang.hreflang,
    root: rootOf(lang),
    art: `${rootOf(lang)}assets/illustrations/${lang.dir ? `${lang.dir}/` : ''}`,
    url: pageUrl(lang),
    hreflang: hreflang(),
    ogImage: `${SITE}assets/og/${lang.og.toLowerCase()}.png`,
    ogLocale: lang.og,
    ogAlternates: allLanguages.filter((l) => l.code !== lang.code).map((l) => `<meta property="og:locale:alternate" content="${l.og}">`).join('\n'),
    fonts: `https://fonts.googleapis.com/css2?${FONT_BASE}${FONT_EXTRA[lang.code] || ''}&display=swap`,
    headScript: headScript(lang),
    jsonld: jsonld(lang, t),
    strings: stringsFor(t),
    langMenu: langMenu(lang),
    langList: langList(lang),
    hero,
    mark,
    gesturePanels: gesturePanels(),
    profilePanels: profilePanels(),
    build,
    'v.monsoon': VERSIONS.monsoon,
    'v.glyphfox': VERSIONS.glyphfox,
    'v.voodoo': VERSIONS.voodoo,
    'sri.monsoon': sri('monsoon'),
    'sri.glyphfox': sri('glyphfox'),
    'sri.voodoo': sri('voodoo'),
  };

  // Computed values first (they may contain [[keys]] themselves), then strings.
  let html = template.replace(/\[\[@([a-zA-Z.]+)\]\]/g, (m, name) => {
    if (!(name in computed)) {
      fail(`unknown computed value ${name}`);
      return m;
    }
    return computed[name];
  });
  html = html.replace(/\[\[(a:)?([a-zA-Z0-9.]+)\]\]/g, (m, attr, key) => {
    if (!(key in t)) {
      fail(`${lang.code}: the page uses ${key}, which is not in the strings`);
      return m;
    }
    return attr ? escAttr(t[key]) : t[key];
  });

  if (/\[\[[^\]]*\]\]/.test(html)) fail(`${lang.code}: a placeholder is left in the page: ${html.match(/\[\[[^\]]*\]\]/)[0]}`);
  for (const m of html.matchAll(/data-icon="([^"]+)"/g)) checkIcon(m[1], `${lang.code} page`);
  for (const [re, what] of FORBIDDEN.slice(0, 2)) if (re.test(html)) fail(`${lang.code}: the page contains ${what}`);

  const out = lang.dir ? join(DOCS, lang.dir, 'index.html') : join(DOCS, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  written.push(out);

  for (const [file, labels] of Object.entries(ART_LABELS)) {
    let svg = read(join(DESIGN, 'illustrations', file));
    for (const [drawn, key] of labels) {
      if (!svg.includes(`>${drawn}<`)) fail(`${file} no longer draws "${drawn}", update ART_LABELS`);
      else if (!(key in t)) fail(`${lang.code}: ${file} uses ${key}, which is not in the strings`);
      else svg = svg.split(`>${drawn}<`).join(`>${escAttr(t[key])}<`);
    }
    if (lang.dir) artCopies.push([join(DOCS, 'assets', 'illustrations', lang.dir, file), svg]);
  }
}

// ---------------------------------------------------------------- sitemap

const alternates = allLanguages.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${pageUrl(l)}"/>`).join('\n') +
  `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}"/>`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${allLanguages.map((l) => `  <url>\n    <loc>${pageUrl(l)}</loc>\n${alternates}\n  </url>`).join('\n')}
</urlset>
`;

// ---------------------------------------------------------------- copies

if (!problems.length) {
  if (!only.length) writeFileSync(join(DOCS, 'sitemap.xml'), sitemap);
  writeFileSync(join(DOCS, 'assets', 'sigil-icons.js'), iconsModule);
  for (const [from, to] of COPIES) {
    mkdirSync(dirname(join(DOCS, to)), { recursive: true });
    copyFileSync(join(DESIGN, from), join(DOCS, to));
  }
  for (const [to, svg] of artCopies) {
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, svg);
  }
}

if (problems.length) {
  console.error(`The build found ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Built ${written.length} pages (${languages.map((l) => l.code).join(', ')}), ${Object.keys(sigilIcons).length} icons, build ${build}.`);
