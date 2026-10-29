# Run with: python docs/_src/art/mark.py   (then node docs/_src/build.mjs)
# Makes the inline luminous mark for the "sign" chapter from design/logo/sigil-mark-dark.svg.
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))  # the repository
SRC = os.path.join(ROOT, 'design', 'logo', 'sigil-mark-dark.svg')
OUT = os.path.join(ROOT, 'docs', '_src', 'mark.html')
s = open(SRC, encoding='utf-8').read()
s = s[s.index('<defs>'):s.rindex('</svg>')]
s = s.replace('id="m-', 'id="mk-').replace('url(#m-', 'url(#mk-')
def seg(m):
    tag = m.group(0)
    arc = 't' if 'd="M15.99' in tag else 'b' if 'd="M8.01' in tag else None
    if arc is None or 'pathLength="100"' not in tag:
        return tag
    return tag.replace('<path ', '<path class="seg %s" ' % arc, 1)
s = re.sub(r'<path [^>]*>', seg, s)
s = s.replace('<circle cx="7.85"', '<circle class="mk-end t" cx="7.85"').replace('<circle cx="16.15"', '<circle class="mk-end b" cx="16.15"')
s = s.replace('<circle cx="12" cy="12" r="4.8"', '<circle class="mk-dot" cx="12" cy="12" r="4.8"').replace('<circle cx="12" cy="12" r="1.45"', '<circle class="mk-core" cx="12" cy="12" r="1.45"')
s = re.sub(r'>\s+<', '><', s).strip()
html = ('<svg class="mark-svg" viewBox="0 0 240 240" aria-hidden="true" focusable="false">'
        '<g class="mk-turn">' + s + '</g></svg>\n')
open(OUT, 'w', encoding='utf-8', newline='\n').write(html)
print('mark', len(html), 'segments', html.count('class="seg '))
