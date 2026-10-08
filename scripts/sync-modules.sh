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
COURSES="ecor1034|.|ECOR 1034|curvilinear-motion cylindrical-coordinates work-and-energy impulse-and-momentum
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

# Standalone courses: a whole course folder with its own home page, navigation and progress (not built from
# modules), copied as it is, less its authoring files, then patched with a link back to this site and the license.
# Each STANDALONE line is "<site folder>|<source folder, relative to the folder above this site>".
STANDALONE="race-vehicle-dynamics|Ravens Racing/race-vehicle-dynamics-course"

patch_standalone() {
  python3 - "$1" <<'PY'
import sys, pathlib
root = pathlib.Path(sys.argv[1])
core = root / 'assets/js/course.js'
s = core.read_text()
home = 'const home = h("a", "nav-home", nav, "Course home");'
link = ('// openengineering.ca: link back to the site\'s course list\n'
        '    const site = h("a", "nav-site", nav);\n'
        '    site.href = `${root}/../index.html#courses`;\n'
        '    h("span", "nav-site__arrow", site, "\\u2190").setAttribute("aria-hidden", "true");\n'
        '    site.appendChild(document.createTextNode("All courses \\u00b7 Open Engineering"));\n    ')
fill = 'content.forEach((n) => wrap.appendChild(n));'
lic = ('\n    // openengineering.ca: license line under the content of every page\n'
       '    const lic = h("p", wrap.className + " site-license", main, "\\u00a9 2026 Open Engineering \\u00b7 ");\n'
       '    const cc = h("a", null, lic, "CC BY-NC-SA 4.0");\n'
       '    cc.href = "https://creativecommons.org/licenses/by-nc-sa/4.0/";\n'
       '    cc.rel = "license";')
assert s.count(home) == 1 and s.count(fill) == 1, core
s = s.replace(home, link + home).replace(fill, fill + lic)
core.write_text(s)
css = root / 'assets/css/course.css'
css.write_text(css.read_text() + """
/* openengineering.ca: link back to the site (top of the sidebar) and license line */
.sidebar a.nav-site {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px 12px; margin-bottom: 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted); font-size: 13.5px; font-weight: 600;
}
.sidebar a.nav-site:hover { color: var(--text); }
.nav-site__arrow { color: var(--accent); }
.site-license { margin-top: 48px; margin-bottom: 0; padding-top: 14px; border-top: 1px solid var(--border); font-size: 13.5px; color: var(--text-muted); }
.site-license a { color: inherit; }
@media print { .nav-site { display: none !important; } }
""")
PY
}
echo "$STANDALONE" | while IFS='|' read -r course from; do
  dir="$SRC/$from"
  if [ ! -d "$dir" ]; then echo "missing: $dir" >&2; exit 1; fi
  rsync -a --delete --exclude '.DS_Store' --exclude 'README.md' --exclude 'templates/' "$dir/" "$SITE/$course/"
  cp "$SITE/scripts/LICENSE-module.txt" "$SITE/$course/LICENSE.txt"
  patch_standalone "$SITE/$course"
  echo "synced $course (standalone course)"
done
find "$SITE" -type d ! -path '*/.git*' -exec chmod 755 {} +
find "$SITE" -type f ! -path '*/.git/*' -exec chmod 644 {} +
