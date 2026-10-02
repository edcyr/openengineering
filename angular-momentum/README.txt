ANGULAR MOMENTUM
An interactive module for second-year rigid-body dynamics
=========================================================================

WHAT IT IS
  Eight short, interactive lessons on angular momentum, from a single
  particle to the three-dimensional motion of rigid bodies (Euler's
  equations, gyroscopes and spinning tops), written for second-year
  mechanical and aerospace engineering students: 2D and 3D figures,
  simulations, worked examples, and questions with instant feedback. It
  also has a Practice Lab, a Self-Check Quiz, a printable worksheet, the
  Spin Lab simulator, a formula sheet and a glossary.

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
  Apple Safari. JavaScript must be on (it is by default), and the 3D
  figures need WebGL, which is on by default wherever the graphics
  hardware supports it. A laptop or desktop screen works best; the pages
  also fit tablets and phones.

TROUBLESHOOTING
  Pages have no styling or figures are missing
    A box at the top of the page says so too. Either you are viewing the
    files inside the zip (unzip first, see HOW TO OPEN, and open index.html
    from the unzipped folder), or your browser is not allowed to read the
    module's files. Browsers from the Mac App Store, such as DuckDuckGo,
    may only be allowed to open the one file you double-clicked, not the
    assets folder next to it. Right-click index.html, choose Open With, and
    pick Google Chrome, Microsoft Edge, Firefox or Safari.

  The 3D figures are blank, or say "3D view unavailable"
    Your browser cannot use WebGL, usually because hardware acceleration
    is turned off.
      Chrome:  Settings > System > turn on "Use graphics acceleration
               when available", then relaunch.
      Edge:    Settings > System and performance > turn on "Use graphics
               acceleration when available", then restart.
      Firefox: Settings > General > Performance > untick "Use recommended
               performance settings", tick "Use hardware acceleration
               when available", then restart.
      Safari:  WebGL is on by default; if the figures stay blank, update
               macOS to get the latest Safari.
    If that does not help, update your graphics driver or try another
    browser. Everything except the 3D views still works.

  Progress (lesson ticks, completed questions) is not saved
    Progress is stored by your browser, on this computer only. It is not
    kept in a private or incognito window, and it is lost if you clear
    browsing data or if your browser blocks cookies and site data for
    local files. Use a normal window, allow site data, and always open
    the module from the same folder in the same browser.

  The math shows raw code such as \( H_O = mvd \), or there is no menu
    JavaScript is turned off. Turn it on in your browser settings, then
    reload the page.

  The simulations run slowly
    The Spin Lab and the simulated figures in Lessons 7 and 8 solve the
    equations of motion many times a second. Close other tabs, pause the
    figures you are not using, or lower the Spin Lab's simulation speed.

  Printing
    Use your browser's Print command (Ctrl+P, or Cmd+P on a Mac) and
    choose "Save as PDF" to keep a copy. The Formula Sheet, the
    Printable Worksheet and the quiz results are designed for printing.

FOLDER OVERVIEW
  index.html     Start here: the module home page
  README.txt     This file
  lessons/       Lessons 1-8
  practice/      Practice Lab, Self-Check Quiz, Printable Worksheet
  tools/         Spin Lab (rigid-body simulator)
  reference/     Formula Sheet and Glossary
  assets/        Styles, scripts and bundled libraries (never edit
                 assets/vendor)

CREDITS AND LICENSES
  This module bundles two open-source libraries under the MIT License.
  Their full license texts are in assets/vendor.

  three.js r186 (3D graphics)
    Copyright (c) 2010-2026 three.js authors
    License: MIT, see assets/vendor/three/LICENSE.txt

  KaTeX 0.18.9 (math typesetting)
    Copyright (c) 2013-2020 Khan Academy and other contributors
    License: MIT, see assets/vendor/katex/LICENSE.txt

  The page framework (assets/js/cyl-*.js) is shared with the Cylindrical
  Coordinates, Curvilinear Motion and Mass Moments of Inertia modules.
