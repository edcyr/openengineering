#!/bin/sh
# Copies the student build of each learning module into its course folder on this site, with its zip,
# and patches it with a link back to the course page. Then run scripts/courses.py to rebuild the course
# pages, the home page's course list, the redirects and the sitemap:
#   sh scripts/sync-modules.sh && python3 scripts/courses.py
# Each COURSES line is "<course folder>|<source folder, relative to the folder above this site>|<course code>|<module slugs>".
# A module's source is "<source>/<slug> student" with its zip "<source>/<slug>-student.zip".
set -eu
SITE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$(dirname "$SITE")"
COURSES="ecor1034|.|ECOR 1034|curvilinear-motion cylindrical-coordinates
maae2101|.|MAAE 2101|mass-moments-of-inertia angular-momentum
aero3002|conceptual-aircraft-design|AERO 3002|01-history-of-aircraft-design 02-requirements-and-mission-profiles 03-first-weight-estimate"

patch_module() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys, pathlib
root = pathlib.Path(sys.argv[1]); label = sys.argv[2]; site = sys.argv[3]
core = root / 'assets/js/cyl-core.js'
s = core.read_text()
head = "nav.appendChild(el('div', { class: 'cyl-sidebar-head' }, [el('p', { class: 'cyl-sidebar-title', text: 'Contents' }), closeBtn]));"
link = ("\n    // openengineering.ca: link back to the site's module catalog\n"
        "    nav.appendChild(el('a', { class: 'cyl-site-link', href: CYL.url('../index.html') }, [\n"
        "      el('span', { class: 'cyl-site-link-arrow', 'aria-hidden': 'true', text: '\\u2190' }), '" + label + "'\n"
        "    ]));")
foot = "el('a', { href: CYL.url(sheet.href), text: 'Formula Sheet' }),"
foot_new = "el('a', { href: CYL.url('../index.html'), text: '" + site + "' }),\n        ' \\u00b7 ',\n        " + foot
offline = "el('span', { class: 'cyl-offline', text: 'Works offline' })\n      ])"
lic = (offline + ",\n      el('p', { class: 'cyl-license' }, [\n"
       "        '\\u00a9 2026 Open Engineering \\u00b7 ',\n"
       "        el('a', { href: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', rel: 'license', text: 'CC BY-NC-SA 4.0' })\n"
       "      ])")
assert s.count(head) == 1 and s.count(foot) == 1 and s.count(offline) == 1, core
s = s.replace(head, head + link).replace(foot, foot_new).replace(offline, lic)
core.write_text(s)
css = root / 'assets/css/module.css'
css.write_text(css.read_text() + """
/* openengineering.ca: link back to the module catalog (top of the sidebar) */
.cyl-site-link {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 4px 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--ink-muted);
  font-size: 0.84rem;
  font-weight: 600;
  text-decoration: none;
}
.cyl-site-link:hover { background: var(--bg-sunken); color: var(--ink); text-decoration: none; }
.cyl-site-link-arrow { color: var(--accent); }
@media print { .cyl-site-link { display: none; } }
.cyl-footer .cyl-license { flex-basis: 100%; font-size: 0.8rem; }
""")
PY
}
echo "$COURSES" | while IFS='|' read -r course from code mods; do
  mkdir -p "$SITE/$course/downloads"
  for m in $mods; do
    dir="$SRC/$from/$m student"
    if [ ! -d "$dir" ]; then echo "missing: $dir" >&2; exit 1; fi
    rsync -a --delete --exclude '.DS_Store' "$dir/" "$SITE/$course/$m/"
    cp "$SITE/scripts/LICENSE-module.txt" "$SITE/$course/$m/LICENSE.txt"
    cp "$SRC/$from/$m-student.zip" "$SITE/$course/downloads/$m.zip"
    TMP="$(mktemp -d)"
    mkdir -p "$TMP/$m student"
    cp "$SITE/scripts/LICENSE-module.txt" "$TMP/$m student/LICENSE.txt"
    (cd "$TMP" && zip -q -X "$SITE/$course/downloads/$m.zip" "$m student/LICENSE.txt")
    rm -rf "$TMP"
    patch_module "$SITE/$course/$m" "$code \\u00b7 All modules" "$code on openengineering.ca"
  done
  echo "synced $code: $mods"
done
find "$SITE" -type d ! -path '*/.git*' -exec chmod 755 {} +
find "$SITE" -type f ! -path '*/.git/*' -exec chmod 644 {} +
