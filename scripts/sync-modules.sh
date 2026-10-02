#!/bin/sh
# Copies the student build of each learning module into this site and patches it with a link back
# to the openengineering.ca home page. Run from anywhere after changing a module:
#   sh scripts/sync-modules.sh
# The module folders ("<slug> student") and their zips live in the folder above this site.
set -eu
SITE="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$(dirname "$SITE")"
MODULES="curvilinear-motion cylindrical-coordinates mass-moments-of-inertia angular-momentum"

mkdir -p "$SITE/downloads"
for m in $MODULES; do
  if [ ! -d "$SRC/$m student" ]; then echo "missing: $SRC/$m student" >&2; exit 1; fi
  rsync -a --delete --exclude '.DS_Store' "$SRC/$m student/" "$SITE/$m/"
  cp "$SITE/scripts/LICENSE-module.txt" "$SITE/$m/LICENSE.txt"
  cp "$SRC/$m-student.zip" "$SITE/downloads/$m.zip"
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/$m student"
  cp "$SITE/scripts/LICENSE-module.txt" "$TMP/$m student/LICENSE.txt"
  (cd "$TMP" && zip -q -X "$SITE/downloads/$m.zip" "$m student/LICENSE.txt")
  rm -rf "$TMP"

  python3 - "$SITE/$m" <<'PY'
import sys, pathlib
root = pathlib.Path(sys.argv[1])
core = root / 'assets/js/cyl-core.js'
s = core.read_text()
head = "nav.appendChild(el('div', { class: 'cyl-sidebar-head' }, [el('p', { class: 'cyl-sidebar-title', text: 'Contents' }), closeBtn]));"
link = ("\n    // openengineering.ca: link back to the site's module catalog\n"
        "    nav.appendChild(el('a', { class: 'cyl-site-link', href: CYL.url('../index.html') }, [\n"
        "      el('span', { class: 'cyl-site-link-arrow', 'aria-hidden': 'true', text: '\\u2190' }), 'All modules \\u00b7 Open Engineering'\n"
        "    ]));")
foot = "el('a', { href: CYL.url(sheet.href), text: 'Formula Sheet' }),"
foot_new = "el('a', { href: CYL.url('../index.html'), text: 'openengineering.ca' }),\n        ' \\u00b7 ',\n        " + foot
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
done
find "$SITE" -type d -exec chmod 755 {} +
find "$SITE" -type f ! -path '*/.git/*' -exec chmod 644 {} +
echo "synced: $MODULES"
