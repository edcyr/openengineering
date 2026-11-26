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
COURSES="ecor1034|.|ECOR 1034|rectilinear-motion curvilinear-motion cylindrical-coordinates force-mass-acceleration work-and-energy impulse-and-momentum systems-of-particles
maae2101|.|MAAE 2101|mass-moments-of-inertia angular-momentum
aero3002|conceptual-aircraft-design|AERO 3002|01-history-of-aircraft-design 02-requirements-and-mission-profiles 03-first-weight-estimate 04-airfoil-and-wing-geometry 05-thrust-to-weight-and-wing-loading 06-configuration-layout 07-propulsion 08-landing-gear-and-subsystems 09-electric-and-vertical-flight 10-aerodynamics 11-loads-and-structures 12-weights-and-cg 13-stability-and-tails 14-performance-and-cost 15-space-vehicles"

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
       "        '\\u00a9 2026 Open Engineering \\u00b7 \\u00a9 ProfCyr \\u00b7 ',\n"
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
# modules), copied without its authoring files and instructor guide, then patched: KaTeX bundled in place of the
# CDN (the same build as the modules, fonts inlined, so it also works offline), a link back to this site, the
# license, and a download zip for each module at <site folder>/downloads/<site folder>-<module folder>.zip,
# offered on the module's card on the course home (deterministic, so a zip only changes in git when it must).
# Each STANDALONE line is "<site folder>|<source folder, relative to the folder above this site>".
STANDALONE="race-vehicle-dynamics|Ravens Racing/race-vehicle-dynamics-course"
KATEX="$SITE/ecor1034/curvilinear-motion/assets/vendor/katex"

patch_standalone() {
  python3 - "$1" <<'PY'
import sys, pathlib, re, zipfile, json
root = pathlib.Path(sys.argv[1])

# KaTeX: CDN links become the bundled copy, relative to each page's data-root
CDN = re.compile(r'https://cdnjs\.cloudflare\.com/ajax/libs/KaTeX/[0-9.]+/(?:contrib/)?([\w.-]+)')
LOCAL = {'katex.min.css': 'katex.inline-fonts.min.css', 'katex.min.js': 'katex.min.js', 'auto-render.min.js': 'auto-render.min.js'}
for page in root.rglob('*.html'):
    s = page.read_text()
    r = re.search(r'<body[^>]*\bdata-root="([^"]*)"', s).group(1).rstrip('/')
    pre = '' if r in ('', '.') else r + '/'
    s = CDN.sub(lambda m: pre + 'assets/vendor/katex/' + LOCAL[m.group(1)], s)
    assert 'cdnjs' not in s, page
    # the instructor guide is not published: drop the course home's button to it
    s = s.replace('\n      <a class="btn" href="instructor-guide.html">Instructor guide</a>', '')
    assert 'instructor-guide' not in s, page
    page.write_text(s)

core = root / 'assets/js/course.js'
s = core.read_text()
guide = ('    const guide = h("a", "nav-home", nav, "Instructor guide");\n'
         '    guide.href = `${root}/instructor-guide.html`;\n'
         '    guide.style.fontWeight = "400";\n')
home = 'const home = h("a", "nav-home", nav, "Course home");'
link = ('// openengineering.ca: link back to the site\'s course list (the site itself when opened from a download)\n'
        '    const site = h("a", "nav-site", nav);\n'
        '    site.href = location.protocol === "file:" ? "https://openengineering.ca/#courses" : `${root}/../index.html#courses`;\n'
        '    h("span", "nav-site__arrow", site, "\\u2190").setAttribute("aria-hidden", "true");\n'
        '    site.appendChild(document.createTextNode("All courses \\u00b7 Open Engineering"));\n    ')
fill = 'content.forEach((n) => wrap.appendChild(n));'
# lesson links: a module download sends its other modules' lessons to the site, as absolute URLs in its manifest
href = 'const href = (l) => (l.file ? `${root}/${l.file}` : `${root}/planned.html?id=${encodeURIComponent(l.id)}`);'
href_new = ('const href = (l) => (l.file ? (/^https?:/.test(l.file) ? l.file : `${root}/${l.file}`) : `${root}/planned.html?id=${encodeURIComponent(l.id)}`);\n'
            '  // openengineering.ca: each module\'s download, {module id: [zip, size]}, offered on the course home (empty in a download)\n'
            '  const DOWNLOADS = {};')
card = '        if (mod.optional) h("span", "chip chip--optional", foot, "Optional");\n'
card_dl = ('        // openengineering.ca: download this module for offline use\n'
           '        const dl = DOWNLOADS[mod.id];\n'
           '        if (dl) {\n'
           '          const a = h("a", "btn-sm module-card__dl", card, `Download for offline use (${dl[1]})`);\n'
           '          a.href = `${root}/downloads/${dl[0]}`;\n'
           '          a.setAttribute("download", "");\n'
           '        }\n')
lic = ('\n    // openengineering.ca: license line under the content of every page\n'
       '    const lic = h("p", wrap.className + " site-license", main, "\\u00a9 2026 Open Engineering \\u00b7 \\u00a9 ProfCyr \\u00b7 ");\n'
       '    const cc = h("a", null, lic, "CC BY-NC-SA 4.0");\n'
       '    cc.href = "https://creativecommons.org/licenses/by-nc-sa/4.0/";\n'
       '    cc.rel = "license";')
assert s.count(guide) == 1 and s.count(home) == 1 and s.count(fill) == 1 and s.count(href) == 1 and s.count(card) == 1, core
s = s.replace(guide, '').replace(home, link + home).replace(fill, fill + lic).replace(href, href_new).replace(card, card + card_dl)
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
.module-card__dl { align-self: flex-start; margin-top: 4px; text-decoration: none; }
@media print { .nav-site, .module-card__dl { display: none !important; } }
""")

# downloads: one zip per module, as for the other courses' modules. Each holds the course shell (home page,
# reference pages, scripts, styles, KaTeX, license) and that module's lessons; its manifest sends links to the other
# modules' lessons to the site. Fixed dates and sorted entries, so a zip only changes in git when its content does.
url = 'https://openengineering.ca/' + root.name + '/'
dl = root / 'downloads'
dl.mkdir(exist_ok=True)
for old in dl.glob('*.zip'):
    old.unlink()
data = (root / 'assets/js/course-data.js').read_text()
shell = [p for p in root.rglob('*') if p.is_file() and p.relative_to(root).parts[0] not in ('downloads', 'modules') and p.name != '.DS_Store']
sizes = {}
for folder in sorted(p.name for p in (root / 'modules').iterdir() if p.is_dir()):
    files = shell + [p for p in (root / 'modules' / folder).rglob('*') if p.is_file() and p.name != '.DS_Store']
    own = {'assets/js/course-data.js': re.sub(r'(\bfile:\s*")(modules/([^/"]+)/)', lambda m: m.group(1) + (m.group(2) if m.group(3) == folder else url + m.group(2)), data),
           'assets/js/course.js': s}
    top = root.name + '-' + folder
    z = dl / (top + '.zip')
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as out:
        for p in sorted(files):
            rel = p.relative_to(root).as_posix()
            info = zipfile.ZipInfo(top + '/' + rel, date_time=(2026, 1, 1, 0, 0, 0))
            info.external_attr = 0o644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, own[rel].encode() if rel in own else p.read_bytes())
    sizes[folder.split('-')[0]] = [z.name, '%.1f MB' % (z.stat().st_size / 1e6)]
# the site's copy offers each module's zip on its card on the course home
core.write_text(s.replace('const DOWNLOADS = {};', 'const DOWNLOADS = ' + json.dumps(sizes) + ';'))
PY
}
echo "$STANDALONE" | while IFS='|' read -r course from; do
  dir="$SRC/$from"
  if [ ! -d "$dir" ]; then echo "missing: $dir" >&2; exit 1; fi
  # '.*' keeps the course's own .git, .gitignore and .nojekyll (and .DS_Store) out of this site
  rsync -a --delete --exclude '.*' --exclude 'README.md' --exclude 'templates/' --exclude 'instructor-guide.html' --exclude 'downloads/' "$dir/" "$SITE/$course/"
  rm -rf "$SITE/$course/README.md" "$SITE/$course/templates" "$SITE/$course/instructor-guide.html"   # rsync keeps excluded files
  rsync -a --delete "$KATEX/" "$SITE/$course/assets/vendor/katex/"
  cp "$SITE/scripts/LICENSE-module.txt" "$SITE/$course/LICENSE.txt"
  patch_standalone "$SITE/$course"
  echo "synced $course (standalone course)"
done
find "$SITE" -type d ! -path '*/.git*' -exec chmod 755 {} +
find "$SITE" -type f ! -path '*/.git/*' -exec chmod 644 {} +
