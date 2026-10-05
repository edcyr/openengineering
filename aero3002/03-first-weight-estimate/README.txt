THE FIRST ESTIMATE OF TAKEOFF WEIGHT
Module 3 of Conceptual Aircraft Design: an interactive module for
third-year aerospace engineering
=========================================================================

WHAT IT IS
  Seven short, interactive lessons on the first estimate of an
  aircraft's takeoff gross weight, following Raymer, Aircraft Design: A
  Conceptual Approach, Chapter 3: the sizing equation and its iteration;
  statistical empty-weight trends; the lift-to-drag ratio estimated from
  a sketch; fuel consumption of jets and propellers; mission segment
  weight fractions; closing the sizing, including missions that drop
  payload; and sensitivities and trade studies. One business jet is
  sized step by step through the whole module.

  The lessons have interactive figures, worked examples and questions
  with instant feedback. There is also a Practice Lab, a Self-Check Quiz,
  a printable worksheet, the Sizing Calculator, a formula sheet and a glossary.

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

  The CSV download in the Sizing Calculator does nothing
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
  tools/         Sizing Calculator
  reference/     Formula Sheet and Glossary
  assets/        Styles, scripts, the aircraft data (assets/js/aero.js),
                 the sizing statistics (assets/js/sizing.js)
                 and the bundled math library (never edit
                 assets/vendor)

DATA
  The empty-weight trends, equivalent skin-friction coefficients,
  typical fuel consumptions and historical segment fractions are after
  Raymer (Tables 3.1 to 3.4 and 12.3); check them against the edition
  you use. The comparison aircraft are from L. K. Loftin, Quest for
  Performance, NASA SP-468 (1985), as in Module 1. The business jet and
  the other example aircraft are illustrative designs, not real types.

CREDITS AND LICENSES
  This module bundles one open-source library under the MIT License.
  Its full license text is in assets/vendor.

  KaTeX 0.18.9 (math typesetting)
    Copyright (c) 2013-2020 Khan Academy and other contributors
    License: MIT, see assets/vendor/katex/LICENSE.txt

  The page framework (assets/js/cyl-*.js) is shared with the dynamics
  modules (Cylindrical Coordinates, Curvilinear Motion, Mass Moments of
  Inertia, Angular Momentum).
