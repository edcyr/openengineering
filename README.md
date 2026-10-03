# Open Engineering

Source for **https://openengineering.ca**: a home page that lists the interactive engineering dynamics modules, plus the modules themselves, and the course site **https://openengineering.ca/aero3002/** (AERO 3002, Conceptual Aircraft Design).

| Path | Purpose |
| --- | --- |
| `index.html` | Home page: module catalog, lesson lists, offline downloads. Self-contained (styles and script inline). Reads each module's saved progress from the browser to show "3 of 9 lessons complete". |
| `curvilinear-motion/`, `cylindrical-coordinates/`, `mass-moments-of-inertia/`, `angular-momentum/` | The **student** build of each module, served as is. |
| `downloads/*.zip` | The student zips, for offline use. |
| `aero3002/` | AERO 3002 course site: `index.html` (course home, generated), one folder per weekly module (student build), `downloads/` with their zips. Self-contained, so it could move to its own subdomain later. |
| `scripts/sync-modules.sh` | Re-copies the modules and zips from the folder above this one. |
| `LICENSE.md` | CC BY-NC-SA 4.0 notice for the site and modules; third-party exceptions (KaTeX, three.js: MIT). |
| `404.html` | Shown by GitHub Pages for unknown URLs. |
| `CNAME` | The custom domain (`openengineering.ca`). |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are, without a Jekyll build. |
| `sitemap.xml`, `robots.txt` | For search engines. |

Instructor copies (answer keys, instructor guides) are deliberately **not** published here.

## License

© 2026 Open Engineering. Content licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/); see `LICENSE.md`. The sync script adds a `LICENSE.txt` to each module folder and download zip, and a license line to every module page footer (text in `scripts/LICENSE-module.txt`).

## Publishing with GitHub Pages

1. Create a repository on GitHub (for example `openengineering`) and push this folder to its `main` branch.
2. In the repository: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**, folder **/ (root)**
3. In the same page, under **Custom domain**, enter `openengineering.ca` and save. Tick **Enforce HTTPS** once the certificate is issued (can take up to an hour).

### DNS (at your domain registrar)

For the apex domain `openengineering.ca`, add four **A** records with host `@`:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Optionally the IPv6 **AAAA** records (host `@`): `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.

For `www.openengineering.ca`, add a **CNAME** record with host `www` pointing to `<your-github-username>.github.io`. GitHub then redirects `www` to the apex.

Remove any registrar "parking" or forwarding records for `@` and `www` first. DNS changes can take a few hours to spread.

Recommended: verify the domain under your GitHub account (**Settings → Pages → Verified domains**) so no other repository can claim it.

## Updating a module

Edit the module in its own folder (instructor copy first, then the student copy and zips, as usual), then:

```sh
sh scripts/sync-modules.sh
git add -A
git commit -m "Update modules"
git push
```

The sync script copies each `<module> student/` folder and `<module>-student.zip` from the folder above this one, and patches the copy's `cyl-core.js` and `module.css` with an "All modules · Open Engineering" link (sidebar and footer) back to the home page and a CC BY-NC-SA 4.0 line in the footer. It also adds `LICENSE.txt` to each module and its zip. The source modules and zips are not changed.

Pages redeploys on its own after each push, usually within a few minutes.

## Adding a module

1. Add its slug to `MODULES` in `scripts/sync-modules.sh` and run the script.
2. Copy one of the `<article class="card">` blocks in `index.html` and update the title, mark, description, lesson list, links and `data-ns` (the module's storage namespace, the `NS` value in its `cyl-core.js`).
3. Update the counts in the hero (`modules`, `lessons`, hours) and add the URLs to `sitemap.xml`.

## The AERO 3002 course (openengineering.ca/aero3002/)

The course modules are built in `../conceptual-aircraft-design/` (instructor and student copies, zips). To publish a new or updated module:

1. Add its slug to `COURSE_MODULES` in `scripts/sync-modules.sh` and run `sh scripts/sync-modules.sh`. It copies the student build to `aero3002/<slug>/` and the zip to `aero3002/downloads/`, and patches the module with an "AERO 3002 · All modules" link back to the course page.
2. Describe the module in `MODULES` in `../conceptual-aircraft-design/_build/course-home.py` (and remove its week from `PLANNED`), then run `python3 ../conceptual-aircraft-design/_build/course-home.py` to regenerate `aero3002/index.html`. The page reuses this site's home-page styles.
3. Add the module's URLs to `sitemap.xml`, then commit and push.

URLs on GitHub Pages are case-sensitive; `404.html` redirects `/AERO3002/…` to `/aero3002/…`.

To move the course to its own subdomain later (for example `aero3002.openengineering.ca`): put the contents of `aero3002/` in a new repository with a `CNAME` file, enable Pages on it, and add a DNS `CNAME` record `aero3002` → `<github-user>.github.io`. Change the course page's `../` links (back to openengineering.ca) to absolute URLs.
