DESIGN REQUIREMENTS AND MISSION PROFILES
Module 2 of Conceptual Aircraft Design: an interactive module for
third-year aerospace engineering
=========================================================================

WHAT IT IS
  Seven short, interactive lessons on what an aircraft must do before it
  is drawn: the conceptual design process; where requirements come
  from (customers, markets, airports); the payload-range diagram; the
  certification rules that become performance requirements (field
  lengths, approach speed, engine-out climb); mission profiles and their
  timelines; fuel reserves, winds and the design range; and trade studies
  that put a price on each requirement. Notation follows Raymer, Aircraft
  Design: A Conceptual Approach.

  The lessons have interactive figures, worked examples and questions
  with instant feedback. There is also a Practice Lab, a Self-Check Quiz,
  a printable worksheet, the Mission Profile Builder, a formula sheet and a glossary.

  Everything runs in your web browser from this folder. No internet
  connection, installation or account is needed.

HOW TO OPEN
  1. Unzip (extract) the download first.
       Windows: right-click the .zip file > Extract All... > Extract.
       macOS:   double-click the .zip file. An unzipped folder appears
                next to it.
  2. Open the unzipped folder and double-click index.html. The module
     opens in your default web browser.
  3. Start with Lesson 1, or use "Continue where you left off" on the
     home page when you come back.

  Do not open the files from inside the zip preview (for example by
  double-clicking into the zip in File Explorer without extracting it).
  From there the pages cannot load their figures and styles, and your
  progress is not saved. Keep the folder structure as it is.

BROWSER SUPPORT
  Current versions of Google Chrome, Microsoft Edge, Mozilla Firefox and
  Apple Safari. JavaScript must be on (it is by default). A laptop or
  desktop screen works best; the pages also fit tablets and phones.

TROUBLESHOOTING
  Pages have no styling or figures are missing
    A box at the top of the page says so too. Either you are viewing the
    files inside the zip (unzip first, see HOW TO OPEN, and open index.html
    from the unzipped folder), or your browser is not allowed to read the
    module's files. Browsers from the Mac App Store, such as DuckDuckGo,
    may only be allowed to open the one file you double-clicked, not the
    assets folder next to it. Right-click index.html, choose Open With, and
    pick Google Chrome, Microsoft Edge, Firefox or Safari.

  Progress (lesson ticks, completed questions) is not saved
    Progress is stored by your browser, on this computer only. It is not
    kept in a private or incognito window, and it is lost if you clear
    browsing data or if your browser blocks cookies and site data for
    local files. Use a normal window, allow site data, and always open
    the module from the same folder in the same browser.

  The math shows raw code such as \( W_0 \), or there is no menu
    JavaScript is turned off. Turn it on in your browser settings, then
    reload the page.

  The CSV download in the Mission Profile Builder does nothing
    Some browsers block downloads from local files. Allow downloads for
    the page when the browser asks, or try another browser.

  Printing
    Use your browser's Print command (Ctrl+P, or Cmd+P on a Mac) and
    choose "Save as PDF" to keep a copy. The Formula Sheet, the
    Printable Worksheet and the quiz results are designed for printing.

FOLDER OVERVIEW
  index.html     Start here: the module home page
  README.txt     This file
  lessons/       Lessons 1-7
  practice/      Practice Lab, Self-Check Quiz, Printable Worksheet
  tools/         Mission Profile Builder
  reference/     Formula Sheet and Glossary
  assets/        Styles, scripts, the aircraft data (assets/js/aero.js),
                 airports and mission profiles (assets/js/mission.js),
                 the land outlines for the route maps (world-land.js)
                 and the bundled math library (never edit
                 assets/vendor)

DATA AND RULES
  Airport coordinates are rounded to 0.01 degree. The aircraft in the
  examples are illustrative, not data for particular types, except where
  a lesson names an aircraft and its published figures. Regulations
  (14 CFR Parts 23, 25, 91 and 121, EASA CS-25, ICAO) are summarized in
  the simplified form used for conceptual design; certification and
  flight operations work from the current text of the regulations.
  Raymer's historical mission-segment weight fractions are from his
  Table 3.2.

CREDITS AND LICENSES
  This module bundles one open-source library under the MIT License.
  Its full license text is in assets/vendor.

  KaTeX 0.18.9 (math typesetting)
    Copyright (c) 2013-2020 Khan Academy and other contributors
    License: MIT, see assets/vendor/katex/LICENSE.txt

  The page framework (assets/js/cyl-*.js) is shared with the dynamics
  modules (Cylindrical Coordinates, Curvilinear Motion, Mass Moments of
  Inertia, Angular Momentum).
