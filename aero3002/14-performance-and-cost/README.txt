PERFORMANCE, COST AND TRADE STUDIES
Module 14 of Conceptual Aircraft Design: an interactive module for
third-year aerospace engineering
=========================================================================

WHAT IT IS
  Eight short, interactive lessons that close the business jet's design
  loop and measure the result, following Raymer, Aircraft Design: A
  Conceptual Approach (performance, cost and sizing): closing the design
  loop; level flight and the flight envelope; range and endurance;
  climb, ceiling and descent; takeoff and landing; development and
  production cost; operating cost; and the trade study that chooses
  the course's final design.

  The lessons have interactive figures, worked examples and questions
  with instant feedback. There is also a Practice Lab, a Self-Check Quiz,
  a printable worksheet, the Design Closure tool, a formula sheet, a
  glossary and a references page.

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

  The math shows raw code such as \( C_L \), or there is no menu
    JavaScript is turned off. Turn it on in your browser settings, then
    reload the page.

  The CSV download in the Design Closure tool does nothing
    Some browsers block downloads from local files. Allow downloads for
    the page when the browser asks, or try another browser.

  Printing
    Use your browser's Print command (Ctrl+P, or Cmd+P on a Mac) and
    choose "Save as PDF" to keep a copy. The Formula Sheet, the
    Printable Worksheet and the quiz results are designed for printing.

FOLDER OVERVIEW
  index.html     Start here: the module home page
  README.txt     This file
  lessons/       Lessons 1-8
  practice/      Practice Lab, Self-Check Quiz, Printable Worksheet
  tools/         Design Closure
  reference/     Formula Sheet, Glossary and References
  assets/        Styles, scripts, the aircraft data (assets/js/aero.js),
                 the design-closure library (assets/js/design.js),
                 and the libraries of Modules 6, 7, 10, 12 and 13 it uses
                 (layout.js, propulsion.js, drag.js, weights.js,
                 stability.js)
                 and the bundled math library (never edit
                 assets/vendor)

DATA
  The design loop uses the libraries of Modules 6 to 13 unchanged. The
  field lengths follow Torenbeek's method (Synthesis of Subsonic
  Airplane Design, 1976) as implemented in the open-source AeroSandbox
  library; the development and production cost is the DAPCA IV model in
  Raymer's metric form (Chapter 18), as implemented in AeroSandbox; the
  operating cost follows the structure of AeroSandbox's operating-cost
  model, with fuel and a loan repaid over the aircraft's life. Many
  inputs are assumed values, stated in the lessons (the
  thrust lapse, the takeoff and landing settings, the production run,
  the engine and avionics prices, the utilization, the fuel price and
  the crew cost), to replace with your own. DAPCA IV was fitted to
  military aircraft and overpredicts civil ones. The business jet comes
  from Modules 3 to 13; the final design is this module's. The
  References page (reference/references.html) lists the numbered
  sources the lessons cite.

CREDITS AND LICENSES
  This module bundles one open-source library under the MIT License.
  Its full license text is in assets/vendor.

  KaTeX 0.18.9 (math typesetting)
    Copyright (c) 2013-2020 Khan Academy and other contributors
    License: MIT, see assets/vendor/katex/LICENSE.txt

  The page framework (assets/js/cyl-*.js) is shared with the dynamics
  modules (Cylindrical Coordinates, Curvilinear Motion, Mass Moments of
  Inertia, Angular Momentum).
