# Open Engineering

Source for **https://openengineering.ca**: interactive learning modules grouped by course.

| Course | Address | Modules (source folder) |
| --- | --- | --- |
| ECOR 1034 · Particle Dynamics | `/ecor1034/` | curvilinear-motion, cylindrical-coordinates (`../<slug> student`) |
| MAAE 2101 · Rigid-Body Dynamics | `/maae2101/` | mass-moments-of-inertia, angular-momentum (`../<slug> student`) |
| AERO 3002 · Conceptual Aircraft Design | `/aero3002/` | 01-history-of-aircraft-design (`../conceptual-aircraft-design/<slug> student`) |
| Race Vehicle Dynamics (standalone course) | `/race-vehicle-dynamics/` | the whole course folder, `../Ravens Racing/race-vehicle-dynamics-course/` |

| Path | Purpose |
| --- | --- |
| `index.html` | Home page. Its course cards and download list are generated between `<!--COURSES-->` and `<!--DOWNLOADS-->` markers; everything else is hand-written. |
| `<course>/index.html` | Course page (generated): modules, lesson lists, progress read from each module's saved progress, downloads. |
| `<course>/<module>/` | The **student** build of each module, patched with a link back to its course page. |
| `<course>/downloads/*.zip` | The student zips, for offline use. |
| `race-vehicle-dynamics/` | A **standalone** course: its own home page, navigation and progress (`rvd-progress-v1`), copied whole without `README.md` and `templates/`, and patched with a link back to the home page and a license line. It has no generated course page and no zip (its equations load KaTeX from a CDN). |
| `scripts/sync-modules.sh` | Copies modules and zips into their course folders (the `COURSES` list), and standalone courses whole (the `STANDALONE` list). |
| `scripts/courses.py` | Builds the course pages, the home page's course list, `404.html` redirects and `sitemap.xml`. Course titles and module descriptions are in its `COURSES` list; lesson titles and times come from each module's `cyl-core.js`, or for a standalone course (`kind='standalone'`) from its `assets/js/course-data.js`, which also decides which of its modules count as available. |
| `scripts/hero-aero3002.svg` | AERO 3002 hero chart, written by `../conceptual-aircraft-design/_build/course-home.py`. |
| `404.html` | Redirects upper-case course codes (`/ECOR1034` → `/ecor1034`) and the old module addresses from before the courses (`/curvilinear-motion/…` → `/ecor1034/curvilinear-motion/…`, `/downloads/<slug>.zip` → `/<course>/downloads/<slug>.zip`). |
| `LICENSE.md`, `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml`, `favicon.svg` | As usual for GitHub Pages. |

Instructor copies of the modules (answer keys, instructor guides) are deliberately **not** published here. Race Vehicle Dynamics publishes its instructor guide, which has no answers: design notes, pacing, an assessment plan and the textbook mapping.

## Updating

After changing a module (instructor copy, student copy and zips, as usual):

```sh
sh scripts/sync-modules.sh
python3 scripts/courses.py
git add -A && git commit -m "Update modules" && git push
```

To add a module: add its slug to its course's line in `COURSES` in `scripts/sync-modules.sh`, add an entry (mark, description; `week` for AERO 3002) to the course in `COURSES` in `scripts/courses.py`, then run both scripts. To add a course: add a line to each `COURSES` list and a hero figure function in `courses.py`.

Progress is saved per module in the browser (localStorage, keyed by each module's namespace), so moving a module to another folder on the same site keeps students' progress.

## License

© 2026 Open Engineering. Content licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); see `LICENSE.md`. The sync script adds a `LICENSE.txt` to each module folder and download zip, and a license line to every module page footer (text in `scripts/LICENSE-module.txt`).

## Publishing with GitHub Pages

The repository `edcyr/openengineering` deploys from `main`, folder `/`, with the custom domain `openengineering.ca` (DNS: four A records for `@` to 185.199.108–111.153; `www` CNAME to `edcyr.github.io`). Pages redeploys a few minutes after each push.

A course could later move to its own subdomain (for example `aero3002.openengineering.ca`): put its folder's contents in a new repository with a `CNAME` file, enable Pages, add a DNS `CNAME` record for the subdomain to `edcyr.github.io`, and make the course page's `../` links absolute.
