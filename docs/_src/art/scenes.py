# Run with: python docs/_src/art/scenes.py
# Turns three design illustrations into scroll scenes for the landing page.
# Each scene keeps the original drawing, element for element, and only adds
# classes (track names), data-k keys for labels the page localizes, and a few
# groups so parts can move together. Output: docs/assets/scenes/<name>.svg
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))  # the repository

DESIGN = os.path.join(ROOT, 'design', 'illustrations') + os.sep
OUT = os.path.join(ROOT, 'docs', 'assets', 'scenes') + os.sep
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)


def q(t):
    return '{%s}%s' % (NS, t)


def load(name):
    return list(ET.parse(DESIGN + name).getroot())


def expect(kids, i, tag, **attrs):
    el = kids[i]
    if el.tag != q(tag):
        sys.exit('%d: expected %s, got %s' % (i, tag, el.tag))
    for k, v in attrs.items():
        if el.get(k.replace('_', '-')) != v:
            sys.exit('%d: expected %s=%s, got %s' % (i, k, v, el.get(k.replace('_', '-'))))
    return el


def add_class(el, cls):
    old = el.get('class')
    el.set('class', (old + ' ' + cls) if old else cls)


FONT = {'sora': 'sf-sora', 'inter': 'sf-inter', 'mono': 'sf-mono'}


def fonts(el):
    for t in el.iter():
        c = t.get('class')
        if c:
            t.set('class', ' '.join(FONT.get(x, x) for x in c.split()))


def segs(group, track):
    """Marks the stacked dash segments of a light trail."""
    add_class(group, track)
    n = 0
    for p in group.iter(q('path')):
        if p.get('pathLength') == '100' and (p.get('stroke-dasharray') or '').endswith(' 200'):
            add_class(p, 'seg')
            n += 1
    return n


def g(cls, children, **attrs):
    el = ET.Element(q('g'), dict({'class': cls}, **attrs))
    for c in children:
        el.append(c)
    return el


def key(el, k):
    el.set('data-k', k)


def write(name, title, children):
    svg = ET.Element(q('svg'), {
        'class': 'scene-svg', 'viewBox': '0 0 1600 1000', 'preserveAspectRatio': 'xMidYMid slice',
        'aria-hidden': 'true', 'focusable': 'false',
    })
    for c in children:
        fonts(c)
        svg.append(c)
    s = ET.tostring(svg, encoding='unicode', short_empty_elements=True)
    s = re.sub(r'>\s+<', '><', s)
    s = s.replace('\u00b7', '&#183;')
    os.makedirs(OUT, exist_ok=True)
    with open(OUT + name, 'w', encoding='utf-8', newline='\n') as f:
        f.write('<!-- %s. Generated from design/illustrations by the landing page tools; edit the design file, not this one. -->\n' % title)
        f.write(s + '\n')
    print(name, len(s), 'bytes')


# ---------------------------------------------------------------- trail
k = load('cursor-trail.svg')
expect(k, 3, 'defs')
screen = expect(k, 129, 'g')
sc = list(screen)
for i in range(24, 34):
    screen.remove(sc[i])
lens = g('tr-lens', sc[24:31])           # glow, glass ring and the lit edge of Play
play = sc[31]                              # the play triangle stays above the lens
core = g('tr-core', sc[32:34])             # the cursor core once it has snapped
over = g('tr-play', [lens, play, core], **{'clip-path': screen.get('clip-path')})
key(sc[5], 'scene.trail.nowPlaying')
key(sc[6], 'scene.trail.fromSet')
key(sc[38], 'scene.trail.upNext')
screen.remove(sc[3])
screen.remove(sc[4])
cam = g('tr-cam', [sc[3], sc[4]])          # the front camera of the phone
screen.insert(3, cam)
n = 0
for i in (130, 131, 132):
    n += segs(k[i], 'tr-trail')
sparks = k[133:172]
for s in sparks:
    add_class(s, 'spark')
hud = g('tr-hud', k[172:179])
key(k[176], 'scene.trail.cursorTag')
key(k[177], 'scene.trail.snapped')
lead = k[179]
add_class(lead, 'tr-lead')
lead.set('pathLength', '100')
write('trail.svg', 'SIGIL scene: the cursor trail sweeping across a phone',
      [k[3]] + k[4:129] + [screen, over] + [g('tr-trails', k[130:133]), g('tr-sparks', sparks), lead, hud, k[180]])
print('  trail segments', n)

# ---------------------------------------------------------------- sphere
k = load('control-sphere.svg')
expect(k, 3, 'defs')
expect(k, 149, 'circle', fill='url(#sphere-core)')
expect(k, 262, 'rect')
rays = g('sp-rays', k[9:18])
orbit = g('sp-orbit', k[146:148])
n = 0
for i in (151, 152, 153):
    for p in k[i].iter(q('path')):
        d = p.get('d', '')
        if p.get('pathLength') == '100':
            add_class(p, 'seg ' + ('t' if d.startswith('M15.99') else 'b'))
            n += 1
    for c in k[i].iter(q('circle')):
        add_class(c, 'sp-end')
point = g('sp-point', k[154:156])
core = g('sp-core', k[148:151] + [g('sp-mark', k[151:154]), point] + k[156:159])
ring = k[159:164]
for i, el in enumerate(ring):
    add_class(el, 'sp-ring')
    el.set('pathLength', '100')
    el.set('style', '--i:%d' % i)
status = k[164]
add_class(status, 'sp-status')
key(status, 'scene.sphere.status')
context = g('sp-context', k[165:171])
ctx_text = k[170]
key(ctx_text, 'scene.sphere.app')
tspans = list(ctx_text)
if tspans:
    key(tspans[0], 'scene.sphere.appState')
CENTER = (800.0, 486.0)
acts = []
spans = [(171, 178, 'scene.sphere.reply'), (178, 185, 'scene.sphere.readAloud'), (185, 194, 'scene.sphere.done'),
         (194, 201, 'scene.sphere.routine'), (201, 208, 'scene.sphere.silence'), (208, 215, 'scene.sphere.settings')]
for idx, (a, b, label) in enumerate(spans):
    els = k[a:b]
    orb = els[1] if a != 185 else els[1]
    cx, cy = float(orb.get('cx')), float(orb.get('cy'))
    key(els[-1], label)
    if a == 185:
        add_class(els[0], 'sp-lit')        # the larger halo of Done
        add_class(els[5], 'sp-lit')        # its two lit rings
        add_class(els[6], 'sp-lit')
    acts.append(g('sp-act', els, style='--dx:%.1f;--dy:%.1f;--i:%d' % (CENTER[0] - cx, CENTER[1] - cy, idx)))
trail_n = 0
for i in (215, 216, 217):
    trail_n += segs(k[i], 'sp-trail')
sparks = k[218:244]
for s in sparks:
    add_class(s, 'spark')
cursor = g('sp-cursor', k[244:246])
people = [g('sp-person', k[a:a + 5], style='--i:%d' % i) for i, a in enumerate((246, 251, 256))]
recent = k[261]
add_class(recent, 'sp-recent')
key(recent, 'scene.sphere.recent')
write('sphere.svg', 'SIGIL scene: the Control Sphere assembling',
      [k[3]] + k[4:9] + [rays] + k[18:146] + [orbit, core] + ring + [status, context] + acts +
      [g('sp-trails', k[215:218]), g('sp-sparks', sparks), cursor] + people + [recent, k[262]])
print('  mark segments', n, 'trail segments', trail_n)

# ---------------------------------------------------------------- chain
k = load('voice-action-chain.svg')
expect(k, 3, 'defs')
expect(k, 200, 'rect')
listen = g('ch-listen', k[136:148])
waves = []
n = 0
for i in (148, 149, 150):
    n += segs(k[i], 'ch-wave')
    waves.append(k[i])
line_n = 0
for i in (151, 152, 153):
    line_n += segs(k[i], 'ch-line')
request = g('ch-request', k[154:161])
key(k[160], 'scene.chain.request')
nodes = []
labels = ['scene.chain.open', 'scene.chain.find', 'scene.chain.write', 'scene.chain.send']
for i, (a, b) in enumerate(((161, 169), (169, 177), (177, 185), (185, 195))):
    els = k[a:b]
    key(els[-1], labels[i])
    if a == 185:
        add_class(els[0], 'ch-lit')
        add_class(els[5], 'ch-lit')
        add_class(els[6], 'ch-lit')
    nodes.append(g('ch-node', els, style='--i:%d' % i))
done = g('ch-done', k[195:200])
key(k[199], 'scene.chain.doneIn')
write('chain.svg', 'SIGIL scene: a voice wave turning into the action chain',
      [k[3]] + k[4:136] + [listen, g('ch-waves', waves), g('ch-lines', k[151:154]), request] + nodes + [done, k[200]])
print('  wave segments', n, 'line segments', line_n)
