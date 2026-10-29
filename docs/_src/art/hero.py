# Run with: python docs/_src/art/hero.py   (then node docs/_src/build.mjs)
# Splits design/illustrations/hero.svg into three inline layers for the landing page:
#   scene  : everything static (background, phone, hand)
#   marks  : hand landmarks and the HUD label (fade in)
#   light  : the sigil arcs and the point of light (drawn in light)
# Writes docs/_src/hero.html with [[keys]] for the localized labels.
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))  # the repository

SRC = os.path.join(ROOT, 'design', 'illustrations', 'hero.svg')
OUT = os.path.join(ROOT, 'docs', '_src', 'hero.html')
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
q = lambda t: '{%s}%s' % (NS, t)

root = ET.parse(SRC).getroot()
kids = list(root)


def ser(el):
    s = ET.tostring(el, encoding='unicode', short_empty_elements=True)
    s = s.replace(' xmlns="%s"' % NS, '')
    s = re.sub(r'\s+/>', '/>', s)
    return s


def check(i, tag):
    if kids[i].tag != q(tag):
        sys.exit('unexpected element at %d: %s (wanted %s)' % (i, kids[i].tag, tag))


check(3, 'defs')
check(173, 'g'); check(174, 'g'); check(175, 'g')
check(190, 'text'); check(194, 'g'); check(215, 'path'); check(216, 'text')
check(217, 'circle'); check(218, 'circle'); check(219, 'rect')

# ---- scene layer -------------------------------------------------------
scene = [kids[3]] + kids[4:173] + kids[176:194] + [kids[219]]
tracking = kids[190]
tracking.set('class', 'hero-mono')
tracking.text = '[[hero.svg.tracking]]'
# the tracking dot (cx 675, cy 796, r 5) breathes in CSS
for el in kids[176:194]:
    if el.tag == q('circle') and el.get('cx') == '675' and el.get('r') == '5':
        el.set('class', 'hl-track')

# ---- marks layer -------------------------------------------------------
marks = []
lines = kids[194]
lines.set('class', 'hl-lines')
marks.append(lines)
n = 0
for el in kids[195:215]:
    if el.tag != q('circle'):
        sys.exit('landmark list changed')
    el.set('class', 'hl-dot')
    el.set('style', '--i:%d' % n)
    n += 1
    marks.append(el)
lead = kids[215]
lead.set('class', 'hl-lead')
lead.set('pathLength', '100')
marks.append(lead)
label = kids[216]
label.set('class', 'hero-mono hl-label')
label.text = '[[hero.svg.hand]]'
marks.append(label)

# ---- light layer -------------------------------------------------------
TOP = 'M15.99 4.81'
BOT = 'M8.01 19.19'
segs = 0
for g in kids[173:176]:
    for el in g.iter():
        if el.tag == q('path'):
            d = el.get('d', '')
            arc = 't' if d.startswith(TOP) else 'b' if d.startswith(BOT) else None
            if not arc:
                sys.exit('unknown arc path ' + d)
            x = el.get('stroke-dasharray', '').split()[0]
            el.set('class', 'seg ' + arc)
            el.set('style', '--x:%s' % x)
            segs += 1
        elif el.tag == q('circle'):
            cx = el.get('cx')
            el.set('class', 'hl-end ' + ('t' if cx == '7.85' else 'b'))
light = kids[173:176]

point = ET.Element(q('g'), {'class': 'hl-point'})
point.append(kids[217])
point.append(kids[218])
burst = ET.Element(q('circle'), {
    'class': 'hl-burst', 'cx': '722', 'cy': '410', 'r': '30', 'fill': 'none',
    'stroke': '#98FBEA', 'stroke-width': '3', 'opacity': '0',
})

open_svg = '<svg class="hero-layer%s" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
parts = []
parts.append('<div class="hero-art" role="img" aria-label="[[a:hero.art.alt]]" v-ignore>')
parts.append(open_svg % ' hero-scene' + ''.join(ser(e) for e in scene) + '</svg>')
parts.append(open_svg % ' hero-marks' + ''.join(ser(e) for e in marks) + '</svg>')
parts.append(open_svg % ' hero-light' + ''.join(ser(e) for e in light) + ser(burst) + ser(point) + '</svg>')
parts.append('<div class="hero-glow"></div>')
parts.append('<div class="hero-motes">' + ''.join('<i style="--m:%d"></i>' % i for i in range(8)) + '</div>')
parts.append('</div>')
html = '\n'.join(parts) + '\n'

# drop the decorative newlines inside defs to keep it compact
html = re.sub(r'>\s+<', '><', html)
open(OUT, 'w', encoding='utf-8', newline='\n').write(html.replace('</svg><', '</svg>\n<').replace('</div><', '</div>\n<'))
print('segments', segs, 'landmarks', n, 'bytes', len(html))
