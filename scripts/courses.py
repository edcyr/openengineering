# Builds the course pages of openengineering.ca from the synced modules:
#   <course>/index.html          one page per course (modules, lessons, progress, downloads)
#   index.html                   the "Courses" section and download list of the home page (between markers)
#   404.html                     redirects for old module URLs and upper-case course codes
#   sitemap.xml                  every page of the site
# Run after scripts/sync-modules.sh:  python3 scripts/courses.py
# Course and module descriptions live in COURSES below; lesson titles, minutes, tool names and storage
# namespaces are read from each module's own assets/js/cyl-core.js, so they never drift.
import html, json, math, os, re

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = 'https://openengineering.ca/'

COURSES = [
  dict(slug='ecor1034', code='ECOR 1034', title='Particle Dynamics', level='First-year engineering', notation='Hibbeler, <em>Engineering Mechanics: Dynamics</em>',
       lede='Interactive modules for the particle dynamics of ECOR 1034: motion along curved paths in rectangular, path and cylindrical coordinates, the equations of motion, and work and energy methods. Animated figures draw velocity, acceleration, forces and energy as the motion happens, and every lesson has worked examples and questions with instant feedback.',
       hero='ecor1034', kicker='Module', blurb='Motion of a particle along curved paths, in rectangular, path and cylindrical coordinates, the equations of motion, and work and energy.', mark_italic=True,
       modules=[
         dict(slug='curvilinear-motion', mark='nt', desc='Plane curvilinear motion of a particle in rectangular (x–y) and path (n–t) coordinates: motion vectors, projectile motion, tangential and normal acceleration, and the radius of curvature.'),
         dict(slug='cylindrical-coordinates', mark='rθz', desc='Kinematics and kinetics of a particle in polar and cylindrical coordinates (r, θ, z): unit vectors that turn, velocity and acceleration components, paths given as r = f(θ), and the equations of motion.'),
         dict(slug='work-and-energy', mark='T+V', desc='Work and energy methods for a particle: the work of a force, of the weight, springs and friction; the principle of work and energy; power and efficiency; potential energy and conservation of energy; and normal forces on curved paths, with live energy bars and work ledgers.')]),
  dict(slug='maae2101', code='MAAE 2101', title='Rigid-Body Dynamics', level='Second-year mechanical and aerospace', notation='Hibbeler, <em>Engineering Mechanics: Dynamics</em>',
       lede='Interactive modules for the rigid-body dynamics of MAAE 2101: mass moments of inertia and the inertia tensor, then angular momentum, impact, Euler\'s equations and gyroscopic motion, with 3D figures you can turn and live simulations.',
       hero='maae2101', kicker='Module', blurb='Mass moments of inertia and the inertia tensor, then angular momentum, impact, Euler\'s equations and gyroscopic motion.', mark_italic=True,
       modules=[
         dict(slug='mass-moments-of-inertia', mark='[I]', desc='Moments of inertia by integration, the parallel-axis theorem and composite bodies, then products of inertia, the inertia tensor, the moment of inertia about any axis, and principal axes, with 3D figures you can turn.'),
         dict(slug='angular-momentum', mark='H', desc='From the angular momentum of a particle to systems of particles and rigid bodies: angular impulse, impact, angular momentum in three dimensions, Euler\'s equations and gyroscopic motion, with live simulations.')]),
  dict(slug='aero3002', code='AERO 3002', title='Conceptual Aircraft Design', level='Third-year aerospace · twelve weeks', notation='Raymer, <em>Aircraft Design: A Conceptual Approach</em>',
       lede='One interactive module for each week of AERO 3002. They teach how a new aircraft is sized and laid out, from the first weight estimate to wing loading, thrust, aerodynamics, weights, stability and performance, using real aircraft data, interactive figures, worked examples and questions with instant feedback.',
       hero='aero3002', kicker='Week', blurb='One module per week on how a new aircraft is sized and laid out, following Raymer, starting with the history of aircraft design.', mark_italic=False,
       modules=[
         dict(slug='01-history-of-aircraft-design', week=1, mark='1903', desc='From Cayley and the Wright brothers to the wide-body jet, through the numbers designers use: weights, wing and power loading, drag, L/D, sweep and Breguet range, ending with the first weight estimate of a new aircraft.'),
         dict(slug='02-requirements-and-mission-profiles', week=2, mark='RFP', title='Design Requirements and Mission Profiles', desc='Where the numbers of a new design come from: the conceptual design process, requirements from markets, maps and airports, the payload\u2013range diagram, certification rules for field length and engine-out climb, mission profiles, fuel reserves and winds, and trade studies.'),
         dict(slug='03-first-weight-estimate', week=3, mark='W\u2080', title='The First Estimate of Takeoff Weight', desc='Sizing from a conceptual sketch, step by step: the sizing equation and its iteration, empty-weight trends, L/D from the wetted aspect ratio, jet and propeller fuel consumption, mission fuel fractions, payload drops and sensitivities, with a sizing calculator.')],
       planned={2: 'The design process, requirements and mission profiles', 3: 'The first estimate of takeoff weight', 4: 'Airfoil and wing geometry selection',
                5: 'Thrust-to-weight ratio and wing loading', 6: 'Configuration layout and fuselage sizing', 7: 'Propulsion selection and integration',
                8: 'Landing gear and subsystems', 9: 'Aerodynamics: lift and the drag build-up', 10: 'Component weights and center of gravity',
                11: 'Stability, control and tail sizing', 12: 'Performance, cost and trade studies'}),
]

# ------------------------------------------------------------------ module facts from cyl-core.js
PG = re.compile(r"""pg\('([a-z0-9]+)',\s*(null|\d+),\s*(['"])(.*?)\3,\s*'([^']*)',\s*(null|\d+)""")
def module_info(course, m):
    root = os.path.join(SITE, course['slug'], m['slug'])
    core = open(os.path.join(root, 'assets/js/cyl-core.js'), encoding='utf-8').read()
    ns = re.search(r"var NS = '([^']+)'", core).group(1)
    brand = re.search(r"class: 'cyl-brand-text', text: '([^']+)'", core).group(1)
    pages = []
    for pid, num, _q, title, href, mins in PG.findall(core):
        title = re.sub(r'\\u([0-9a-fA-F]{4})', lambda q: chr(int(q.group(1), 16)), title)
        title = title.replace("\\'", "'")
        pages.append(dict(id=pid, num=None if num == 'null' else int(num), title=title, href=href, min=None if mins == 'null' else int(mins)))
    lessons = [p for p in pages if p['id'].startswith('l') and p['num']]
    tool_page = next(p for p in pages if p['href'].startswith('tools/'))
    tool, tool_href = tool_page['title'], tool_page['href']
    z = os.path.join(SITE, course['slug'], 'downloads', m['slug'] + '.zip')
    size = '%.1f MB' % (os.path.getsize(z) / 1e6)
    hours = sum(p['min'] for p in lessons) / 60
    title = m.get('title') or (brand if brand != 'History of Aircraft Design' else 'The History of Aircraft Design')
    return dict(m, ns=ns, title=title, lessons=lessons, tool=tool, tool_href=tool_href, zip=size, hours=hours)

def hours_text(h):
    r = round(h * 2) / 2
    return 'About %s hours' % (('%d' % r) if r == int(r) else ('%.1f' % r))

for c in COURSES:
    c['mods'] = [module_info(c, m) for m in c['modules']]

# ------------------------------------------------------------------ hero figures
def hero_ecor():
    # one frame of the home page's particle on a curved path: v tangent, a inward, osculating circle
    cx, cy, A, B = 280, 196, 190, 120
    P = lambda t: (cx + A * math.cos(t) + 18 * math.cos(2 * t), cy - B * math.sin(t) - 11 * math.sin(2 * t))
    d = 'M' + ' L'.join('%.1f %.1f' % P(2 * math.pi * i / 240) for i in range(241)) + 'Z'
    t, h = 0.95, 1e-3
    p = P(t); a, b = P(t + h), P(t - h)
    d1 = ((a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)); d2 = ((a[0] - 2 * p[0] + b[0]) / h ** 2, (a[1] - 2 * p[1] + b[1]) / h ** 2)
    sp = math.hypot(*d1); cr = d1[0] * d2[1] - d1[1] * d2[0]; rho = sp ** 3 / abs(cr)
    nx, ny = -d1[1] / sp, d1[0] / sp
    if cr < 0: nx, ny = -nx, ny * -1
    ccx, ccy = p[0] + nx * rho, p[1] + ny * rho
    v = (p[0] + d1[0] * 0.45, p[1] + d1[1] * 0.45); acc = (p[0] + nx * 70 + d1[0] * 0.08, p[1] + ny * 70 + d1[1] * 0.08)
    return ('<svg viewBox="0 0 560 380" role="img" aria-labelledby="heroTitle"><title id="heroTitle">A particle on a curved path. Its velocity arrow is tangent to the path, its acceleration arrow points toward the inside of the curve, and a dashed circle shows the local radius of curvature.</title>'
            '<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--line)" stroke-width="1"/></pattern>'
            '<marker id="ahV" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--c-v)"/></marker>'
            '<marker id="ahA" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--c-a)"/></marker></defs>'
            '<rect width="560" height="380" fill="url(#grid)" opacity=".6"/>'
            '<path d="%s" fill="none" stroke="var(--c-path)" stroke-width="2" opacity=".55"/>' % d +
            '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="var(--ink-faint)" stroke-width="1.4" stroke-dasharray="5 5"/>' % (ccx, ccy, rho) +
            '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="var(--ink-faint)" stroke-width="1.2" stroke-dasharray="3 4"/>' % (p[0], p[1], ccx, ccy) +
            '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="var(--c-a)" stroke-width="3" stroke-linecap="round" marker-end="url(#ahA)"/>' % (p[0], p[1], acc[0], acc[1]) +
            '<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="var(--c-v)" stroke-width="3" stroke-linecap="round" marker-end="url(#ahV)"/>' % (p[0], p[1], v[0], v[1]) +
            '<circle cx="%.1f" cy="%.1f" r="7" fill="var(--ink)" stroke="var(--bg-elev)" stroke-width="2.5"/>' % p +
            '<text x="%.1f" y="%.1f" fill="var(--c-v)" font-family="Times New Roman, serif" font-style="italic" font-weight="700" font-size="20">v</text>' % (v[0] - 4, v[1] - 10) +
            '<text x="%.1f" y="%.1f" fill="var(--c-a)" font-family="Times New Roman, serif" font-style="italic" font-weight="700" font-size="20">a</text>' % (acc[0] + 8, acc[1] + 6) +
            '<text x="%.1f" y="%.1f" fill="var(--ink-faint)" font-family="Times New Roman, serif" font-style="italic" font-size="17">ρ</text>' % ((p[0] + ccx) / 2 + 6, (p[1] + ccy) / 2) +
            '</svg>'), '<span class="key"><i style="background:var(--c-v)"></i>velocity, tangent to the path</span><span class="key"><i style="background:var(--c-a)"></i>acceleration</span><span class="key"><i class="dash"></i>radius of curvature</span>'

def hero_maae():
    # a disk spinning on a tilted axle: H is not parallel to omega unless the axis is principal
    cx, cy = 280, 200
    def arrow(x2, y2, col, lab, lx, ly):
        return ('<line x1="%d" y1="%d" x2="%.1f" y2="%.1f" stroke="var(%s)" stroke-width="3.2" stroke-linecap="round" marker-end="url(#ah%s)"/>' % (cx, cy, x2, y2, col, lab) +
                '<text x="%.1f" y="%.1f" fill="var(%s)" font-family="Times New Roman, serif" font-style="italic" font-weight="700" font-size="22">%s</text>' % (lx, ly, col, {'W': 'ω', 'H': 'H'}[lab]))
    return ('<svg viewBox="0 0 560 380" role="img" aria-labelledby="heroTitle"><title id="heroTitle">A disk mounted skewed on an axle and spinning with it. The angular velocity arrow lies along the axle; the angular momentum arrow points in a different direction, because the axle is not a principal axis of the disk.</title>'
            '<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--line)" stroke-width="1"/></pattern>'
            '<marker id="ahW" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--c-good)"/></marker>'
            '<marker id="ahH" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--c-a)"/></marker></defs>'
            '<rect width="560" height="380" fill="url(#grid)" opacity=".6"/>'
            '<line x1="120" y1="290" x2="440" y2="110" stroke="var(--c-path)" stroke-width="4" stroke-linecap="round" opacity=".7"/>'
            '<text x="112" y="312" font-size="13" fill="var(--ink-faint)">axle</text>'
            '<g transform="rotate(48 %d %d)"><ellipse cx="%d" cy="%d" rx="118" ry="46" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" fill-opacity=".85"/>'
            '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 5" opacity=".7"/></g>' % (cx, cy, cx, cy, cx - 118, cy, cx + 118, cy) +
            arrow(cx + 150, cy - 84, '--c-good', 'W', cx + 160, cy - 92) +
            arrow(cx + 92, cy - 150, '--c-a', 'H', cx + 98, cy - 158) +
            '<circle cx="%d" cy="%d" r="5" fill="var(--ink)"/>' % (cx, cy) +
            '</svg>'), '<span class="key"><i style="background:var(--c-good)"></i>angular velocity ω, along the axle</span><span class="key"><i style="background:var(--c-a)"></i>angular momentum H = [I]ω</span>'

def hero_aero():
    svg = open(os.path.join(SITE, 'scripts', 'hero-aero3002.svg'), encoding='utf-8').read().strip()
    keys = ''.join('<span class="key"><i style="background:var(%s)"></i>%s</span>' % kv for kv in (('--e1', '1914–18'), ('--e2', '1919–38'), ('--e3', '1939–45'), ('--e4', 'postwar propeller'), ('--e5', 'jet fighters'), ('--e6', 'jet transports')))
    return svg, keys + '<span>Data: Loftin, NASA SP-468.</span>'

HEROES = {'ecor1034': hero_ecor, 'maae2101': hero_maae, 'aero3002': hero_aero}

# ------------------------------------------------------------------ page parts
MAIN_PATH = os.path.join(SITE, 'index.html')
MAIN = open(MAIN_PATH, encoding='utf-8').read()
CSS = MAIN[MAIN.index('<style>') + 7:MAIN.index('</style>')]
EXTRA_CSS = '''
  /* ---------- course pages ---------- */
  :root { --e0: #18212b; --e1: #c2410c; --e2: #6d44e0; --e3: #1769bd; --e4: #23793a; --e5: #b8327a; --e6: #9a5100; }
  @media (prefers-color-scheme: dark) { :root { --e0: #e5eaf0; --e1: #ff8a4c; --e2: #a98bff; --e3: #5eaaff; --e4: #5cc26f; --e5: #ff7ab8; --e6: #ffb454; } }
  .crumb { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 14px; color: var(--ink-muted); font-size: 0.86rem; font-weight: 600; }
  .mark-sm { font-family: var(--font-sans); font-style: normal; font-size: 0.95rem; letter-spacing: -0.02em; }
  .hero-fig svg text { font-family: var(--font-sans); }
  .weeks { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  @media (min-width: 860px) { .weeks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .weeks li { display: grid; grid-template-columns: 4.6rem minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 14px; border: 1px dashed var(--line-strong); border-radius: var(--radius); background: var(--bg-elev); }
  .wk { color: var(--ink-faint); font-size: 0.8rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .wk-title { color: var(--ink-muted); font-weight: 600; }
  .tag { padding: 2px 9px; border-radius: 99px; background: var(--bg-sunken); color: var(--ink-faint); font-size: 0.74rem; font-weight: 700; }
  .note { margin: 14px 0 0; color: var(--ink-faint); font-size: 0.86rem; }
'''
PROGRESS_JS = '''<script>
(function () {
  'use strict';
  /* Progress: each module stores {l01: true, …} under "<namespace>progress" (same origin as the modules) */
  function readProgress(ns) {
    try { var raw = window.localStorage.getItem(ns + 'progress'); var p = raw ? JSON.parse(raw) : null; return p && typeof p === 'object' ? p : {}; }
    catch (e) { return {}; }
  }
  function renderProgress() {
    document.querySelectorAll('.card[data-ns]').forEach(function (card) {
      var p = readProgress(card.getAttribute('data-ns'));
      var items = card.querySelectorAll('details.lessons li[data-id]');
      var done = 0, next = null;
      items.forEach(function (li) {
        var ok = !!p[li.getAttribute('data-id')];
        li.classList.toggle('done', ok);
        var a = li.querySelector('a');
        if (ok) { done++; a.setAttribute('aria-label', a.textContent.replace(/\\s+/g, ' ').trim() + ' (complete)'); }
        else { a.removeAttribute('aria-label'); if (!next) next = a; }
      });
      var box = card.querySelector('.progress'), go = card.querySelector('.js-go'), started = done > 0;
      box.classList.toggle('on', started);
      if (started) {
        box.querySelector('p').innerHTML = '<strong>' + done + ' of ' + items.length + '</strong> lessons complete';
        box.querySelector('.bar span').style.width = (100 * done / items.length) + '%';
      }
      if (started && next) { go.textContent = 'Continue: Lesson ' + next.querySelector('.num').textContent; go.href = next.getAttribute('href'); }
      else if (started) { go.textContent = 'Review the module'; go.href = card.getAttribute('data-href'); }
      else { go.textContent = 'Open the module'; go.href = card.getAttribute('data-href'); }
    });
  }
  renderProgress();
  window.addEventListener('storage', renderProgress);
  window.addEventListener('pageshow', function (e) { if (e.persisted) renderProgress(); });
})();
</script>'''
CC = '''<a class="cc" rel="license" href="https://creativecommons.org/licenses/by-nc-sa/4.0/" aria-label="Creative Commons BY-NC-SA 4.0 license">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="12" y="15.6" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="9.5" fill="currentColor">cc</text></svg>
        CC BY-NC-SA 4.0</a>'''
ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/></svg>'

def esc(s): return html.escape(s, quote=False)

def card(c, i, m, prefix=''):
    base = prefix + m['slug'] + '/'
    n = m.get('week', i + 1)
    kick = ('Week %d · Module %d' % (n, n)) if c['kicker'] == 'Week' else ('Module %d' % n)
    lessons = '\n'.join('                <li data-id="%s"><a href="%s%s"><span class="num">%d</span><span>%s</span><span class="min">%d min</span></a></li>' % (l['id'], base, l['href'], l['num'], esc(l['title']), l['min']) for l in m['lessons'])
    extras = ' · '.join('<a href="%s%s">%s</a>' % (base, h, t) for h, t in (('practice/practice-lab.html', 'Practice Lab'), ('practice/quiz.html', 'Self-Check Quiz'), ('practice/worksheet.html', 'Worksheet'), (m['tool_href'], esc(m['tool'])), ('reference/cheat-sheet.html', 'Formula Sheet'), ('reference/glossary.html', 'Glossary')))
    mark_cls = 'mark' if c['mark_italic'] and len(m['mark']) <= 3 else 'mark mark-sm'
    return '''          <article class="card" data-ns="%s" data-href="%s">
            <div class="card-top">
              <span class="%s" aria-hidden="true">%s</span>
              <div>
                <p class="card-kicker">%s</p>
                <h4><a href="%s">%s</a></h4>
              </div>
            </div>
            <p class="card-desc">%s</p>
            <ul class="meta"><li>%d lessons</li><li>%s</li><li>%s</li></ul>
            <div class="progress"><p></p><div class="bar"><span></span></div></div>
            <details class="lessons">
              <summary>Lessons</summary>
              <ol>
%s
              </ol>
            </details>
            <p class="extras">%s</p>
            <div class="card-actions">
              <a class="btn primary sm js-go" href="%s">Open the module</a>
              <a class="btn sm" href="%sdownloads/%s.zip" download>Download for offline use (%s)</a>
            </div>
          </article>''' % (m['ns'], base, mark_cls, esc(m['mark']), kick, base, esc(m['title']), esc(m['desc']), len(m['lessons']), hours_text(m['hours']), esc(m['tool']),
                           lessons, extras, base, prefix, m['slug'], m['zip'])

def course_page(c):
    svg, keys = HEROES[c['slug']]()
    nles = sum(len(m['lessons']) for m in c['mods'])
    cards = '\n\n'.join(card(c, i, m) for i, m in enumerate(c['mods']))
    planned = c.get('planned') or {}
    built = {m.get('week') for m in c['mods']}
    coming = ''
    if planned:
        items = '\n'.join('          <li><span class="wk">Week %d</span><span class="wk-title">%s</span><span class="tag">Planned</span></li>' % (w, esc(t)) for w, t in sorted(planned.items()) if w not in built)
        coming = '''
      <div class="track">
        <div class="track-head">
          <h3>Coming up</h3>
          <p>Planned topics; the schedule may change</p>
        </div>
        <ol class="weeks">
%s
        </ol>
      </div>''' % items
    total = ('%d of 12 modules available' % len(c['mods'])) if planned else ('%d modules' % len(c['mods']))
    facts = '<li><span><strong>%s</strong>%s</span></li><li><span><strong>%d</strong> lessons</span></li><li><span>About <strong>%d</strong> hours of study</span></li>' % (
        total.split(' ')[0], ' ' + ' '.join(total.split(' ')[1:]), nles, round(sum(m['hours'] for m in c['mods'])))
    dls = '\n'.join('            <li><a href="downloads/%s.zip" download>%s <span>zip · %s</span></a></li>' % (m['slug'], esc(m['title']), m['zip']) for m in c['mods'])
    first = c['mods'][0]
    return '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(code)s · %(title)s · Open Engineering</title>
<meta name="description" content="%(desc)s">
<link rel="canonical" href="%(host)s%(slug)s/">
<link rel="license" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0b6b86">
<meta property="og:type" content="website">
<meta property="og:title" content="%(code)s · %(title)s">
<meta property="og:description" content="Free, interactive learning modules for %(code)s, %(title)s.">
<meta property="og:url" content="%(host)s%(slug)s/">
<style>%(css)s%(extra)s</style>
</head>
<body>
<a class="skip" href="#modules">Skip to the modules</a>

<header class="topbar">
  <div class="wrap">
    <a class="brand" href="./" aria-label="%(code)s course home">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0b6b86"/><text x="16" y="20.5" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="11" fill="#fff">%(abbr)s</text></svg>
      <span>%(code)s<small>%(title)s</small></span>
    </a>
    <nav class="topnav" aria-label="Site">
      <a href="#modules">Modules</a>
      <a class="opt" href="#using">Offline use</a>
      <a class="opt2" href="../">Open Engineering</a>
    </nav>
  </div>
</header>

<main>
  <div class="hero">
    <div class="wrap">
      <div>
        <a class="crumb" href="../">&larr; openengineering.ca</a>
        <p class="eyebrow"><span>%(code)s</span><span>%(level)s</span></p>
        <h1>%(title)s</h1>
        <p class="lede">%(lede)s</p>
        <div class="cta">
          <a class="btn primary" href="%(first)s/">Start with %(firsttitle)s %(arrow)s</a>
          <a class="btn" href="#modules">See all the modules</a>
        </div>
        <ul class="facts">%(facts)s</ul>
      </div>
      <figure class="hero-fig">
        %(svg)s
        <figcaption>%(keys)s</figcaption>
      </figure>
    </div>
  </div>

  <section id="modules">
    <div class="wrap">
      <div class="sec-head">
        <h2>The modules</h2>
        <p>Each module is a complete unit: short lessons, then a Practice Lab, a self-check quiz, a printable worksheet, an interactive tool, a formula sheet and a glossary.%(order)s</p>
      </div>
      <div class="track">
        <div class="track-head">
          <h3>%(avail)s</h3>
          <p>Open in your browser, or download for offline use</p>
        </div>
        <div class="cards">

%(cards)s

        </div>
      </div>%(coming)s
    </div>
  </section>

  <section id="using">
    <div class="wrap">
      <div class="sec-head">
        <h2>Using the modules</h2>
        <p>Nothing to install and no account to create.</p>
      </div>
      <div class="howto">
        <div class="panel">
          <h3>In your browser</h3>
          <ul>
            <li><strong>Open a module</strong> above and start with Lesson 1, or jump to any lesson from its list.</li>
            <li><strong>Your progress is saved</strong> in this browser as you mark lessons complete, and shows on this page. It stays on your device; nothing is sent anywhere.</li>
            <li><strong>Any current browser works:</strong> Chrome, Edge, Firefox or Safari, on a laptop, tablet or phone.</li>
          </ul>
        </div>
        <div class="panel">
          <h3>Offline</h3>
          <p>Each download is a small zip of the whole module.</p>
          <ol>
            <li>Download the zip and <strong>extract it</strong> (Windows: right-click › Extract All; macOS: double-click).</li>
            <li>Open the extracted folder and double-click <strong>index.html</strong>.</li>
          </ol>
          <ul class="dl-list">
%(dls)s
          </ul>
        </div>
      </div>
      <p class="note">More courses are on the <a href="../#courses">Open Engineering home page</a>.</p>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <p><strong>%(code)s · %(title)s</strong> · <a href="../">Open Engineering</a></p>
    <p>Notation follows %(notation)s. SI units.</p>
    <p class="license">
      %(cc)s
      © 2026 Open Engineering. The modules and site content are licensed under
      <a rel="license" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">Creative Commons Attribution-NonCommercial-ShareAlike 4.0</a>:
      share and adapt them for non-commercial use with credit, under the same license.
      Bundled libraries (KaTeX, three.js) keep their own MIT licenses.
    </p>
  </div>
</footer>

%(js)s
</body>
</html>
''' % dict(code=c['code'], title=c['title'], desc=esc(c['lede']), host=HOST, slug=c['slug'], css=CSS, extra=EXTRA_CSS, abbr=c['code'].split()[1],
           level=c['level'], lede=c['lede'], first=first['slug'], firsttitle=esc(first['title']), arrow=ARROW, facts=facts, svg=svg, keys=keys,
           order='' if planned else ' Take them in the order shown; each builds on the ones before it.', avail='Available now' if planned else 'Modules',
           cards=cards, coming=coming, dls=dls, notation=c['notation'], cc=CC, js=PROGRESS_JS)

# ------------------------------------------------------------------ home page: Courses section and downloads
def home_courses():
    out = []
    for c in COURSES:
        mods = ''.join('<li><a href="%s/%s/">%s</a> <span class="min">%d lessons</span></li>' % (c['slug'], m['slug'], esc(m['title']), len(m['lessons'])) for m in c['mods'])
        left = len([w for w in c.get('planned', {}) if w not in {m.get('week') for m in c['mods']}])
        meta = '<li>%d module%s</li><li>%d lessons</li>' % (len(c['mods']), '' if len(c['mods']) == 1 else 's', sum(len(m['lessons']) for m in c['mods']))
        if left: meta += '<li>%d more planned</li>' % left
        out.append('''          <article class="card">
            <div class="card-top">
              <span class="mark mark-sm" aria-hidden="true">%s</span>
              <div>
                <p class="card-kicker">%s</p>
                <h4><a href="%s/">%s · %s</a></h4>
              </div>
            </div>
            <p class="card-desc">%s</p>
            <ul class="meta">%s</ul>
            <ol class="course-mods">%s</ol>
            <div class="card-actions">
              <a class="btn primary sm" href="%s/">Go to the course</a>
            </div>
          </article>''' % (c['code'].split()[1], esc(c['level']), c['slug'], c['code'], esc(c['title']), c['blurb'], meta, mods, c['slug']))
    return '\n\n'.join(out)

def home_downloads():
    return '\n'.join('            <li><a href="%s/downloads/%s.zip" download>%s <span>%s · zip · %s</span></a></li>' % (c['slug'], m['slug'], esc(m['title']), c['code'], m['zip']) for c in COURSES for m in c['mods'])

def splice(s, name, body):
    a, b = '<!--%s-->' % name, '<!--/%s-->' % name
    assert s.count(a) == 1 and s.count(b) == 1, name
    return s[:s.index(a) + len(a)] + '\n' + body + '\n' + s[s.index(b):]

# ------------------------------------------------------------------ write
for c in COURSES:
    open(os.path.join(SITE, c['slug'], 'index.html'), 'w', encoding='utf-8').write(course_page(c))
s = splice(splice(MAIN, 'COURSES', home_courses()), 'DOWNLOADS', home_downloads())
nmod = sum(len(c['mods']) for c in COURSES); nles = sum(len(m['lessons']) for c in COURSES for m in c['mods'])
s = re.sub(r'<li><span><strong>\d+</strong> courses</span></li>', '<li><span><strong>%d</strong> courses</span></li>' % len(COURSES), s)
s = re.sub(r'<li><span><strong>\d+</strong> modules</span></li>', '<li><span><strong>%d</strong> modules</span></li>' % nmod, s)
s = re.sub(r'<li><span><strong>\d+</strong> lessons</span></li>', '<li><span><strong>%d</strong> lessons</span></li>' % nles, s)
open(MAIN_PATH, 'w', encoding='utf-8').write(s)

# 404: old module addresses (before courses) and upper-case course codes
moves = {m['slug']: c['slug'] for c in COURSES for m in c['mods'] if c['slug'] in ('ecor1034', 'maae2101')}
p404 = os.path.join(SITE, '404.html'); s = open(p404, encoding='utf-8').read()
script = '''<script>
  /* Redirects: course codes in upper case (URLs are case-sensitive on GitHub Pages), and the dynamics
     modules' addresses from before they were grouped into courses (generated by scripts/courses.py). */
  (function () {
    var MOVED = %s;
    var p = location.pathname, rest = location.search + location.hash, l = p.toLowerCase(), m;
    if ((m = /^\\/([a-z0-9-]+)(\\/.*)?$/.exec(p)) && MOVED[m[1]]) { location.replace('/' + MOVED[m[1]] + '/' + m[1] + (m[2] || '/') + rest); return; }
    if ((m = /^\\/downloads\\/([a-z0-9-]+)\\.zip$/.exec(p)) && MOVED[m[1]]) { location.replace('/' + MOVED[m[1]] + '/downloads/' + m[1] + '.zip'); return; }
    if (l !== p && /^\\/(%s)(\\/|$)/.test(l)) location.replace(l + rest);
  })();
</script>''' % (json.dumps(moves), '|'.join(c['slug'] for c in COURSES))
s = re.sub(r'<script>.*?</script>\n', '', s, flags=re.S)
s = s.replace('<body>', '<body>\n' + script, 1)
open(p404, 'w', encoding='utf-8').write(s)

# sitemap: every html page, with directory URLs for index pages
urls = [HOST]
for c in COURSES:
    urls.append(HOST + c['slug'] + '/')
    for m in c['mods']:
        root = os.path.join(SITE, c['slug'], m['slug'])
        urls.append(HOST + c['slug'] + '/' + m['slug'] + '/')
        for dp, _, fs in sorted(os.walk(root)):
            for f in sorted(fs):
                rel = os.path.relpath(os.path.join(dp, f), SITE).replace(os.sep, '/')
                if f.endswith('.html') and f != 'index.html' and '/assets/' not in rel: urls.append(HOST + rel)
open(os.path.join(SITE, 'sitemap.xml'), 'w', encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join('  <url><loc>%s</loc></url>\n' % u for u in urls) + '</urlset>\n')
print('courses:', ', '.join('%s (%d modules)' % (c['code'], len(c['mods'])) for c in COURSES), '| sitemap:', len(urls), 'URLs')
