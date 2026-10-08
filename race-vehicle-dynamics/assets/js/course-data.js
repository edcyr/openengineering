/*
 * Course manifest — the single source of truth for the course structure.
 *
 * Everything that lists modules or lessons (home page, sidebar, instructor
 * guide, "planned lesson" stubs, prev/next links) is generated from this file.
 *
 * Lesson status:
 *   "ready"   – lesson page exists and is complete
 *   "draft"   – lesson page exists but is still being written
 *   "planned" – no page yet; the shell renders an outline stub from this entry
 *
 * To build out a planned lesson: create its HTML file from
 * templates/lesson-template.html, set `file` to its path (relative to the
 * course root), and change `status` to "draft" or "ready".
 *
 * `rcvd` lists chapters of Milliken & Milliken, Race Car Vehicle Dynamics
 * (SAE R-146, 1995) that support the module.
 */
window.RVD_COURSE = {
  title: "Race Vehicle Dynamics",
  subtitle: "An interactive introduction for second-year mechanical engineering students",
  reference: {
    short: "RCVD",
    title: "Race Car Vehicle Dynamics",
    authors: "William F. Milliken & Douglas L. Milliken",
    publisher: "SAE International (R-146)",
    year: 1995
  },

  // Chapter titles of RCVD, used to label references consistently.
  rcvdChapters: {
    1: "The Problem Imposed by Racing",
    2: "Tire Behavior",
    3: "Aerodynamic Fundamentals",
    4: "Vehicle Axis Systems",
    5: "Simplified Steady-State Stability and Control",
    6: "Simplified Transient Stability and Control",
    7: "Steady-State Pair Analysis",
    8: "Force-Moment Analysis",
    9: "“g-g” Diagram",
    10: "Race Car Design",
    11: "Testing and Development",
    12: "Chassis Set-up",
    13: "Historical Note on Vehicle Dynamics Development",
    14: "Tire Data Treatment",
    15: "Applied Aerodynamics",
    16: "Ride and Roll Rates",
    17: "Suspension Geometry",
    18: "Wheel Loads",
    19: "Steering Systems",
    20: "Driving and Braking",
    21: "Suspension Springs",
    22: "Dampers",
    23: "Compliances"
  },

  courseOutcomes: [
    "Explain why lap time is fundamentally limited by tire grip, and represent a car's performance envelope on a g-g diagram.",
    "Describe how a tire generates lateral and longitudinal force, and interpret tire curves including load sensitivity and combined slip.",
    "Calculate static and dynamic wheel loads, and explain how load transfer distribution changes vehicle balance.",
    "Quantify aerodynamic drag and downforce and their effect on cornering speed, braking and top speed.",
    "Use the bicycle model to predict steady-state cornering behavior and classify a vehicle as understeer, neutral or oversteer.",
    "Relate springs, anti-roll bars, dampers and suspension geometry to ride, roll and tire loading.",
    "Combine these models into a simple lap-time estimate and justify set-up changes with engineering reasoning."
  ],

  prerequisites: [
    "Statics: free-body diagrams, force and moment equilibrium",
    "Dynamics: Newton's second law, circular motion (a = v²/R), rigid-body planar kinetics",
    "Calculus: derivatives, simple integrals; comfort with small-angle approximations",
    "Basic spreadsheet, Python or MATLAB skills for the optional computing exercises"
  ],

  modules: [
    {
      id: "m00",
      number: 0,
      title: "Orientation & Engineering Toolkit",
      summary: "Course roadmap, the physics you already know that you will lean on, and the SAE vehicle axis system used throughout.",
      rcvd: [4, 13],
      lessons: [
        {
          id: "m00-l1",
          title: "Refresher: Newton, free-body diagrams and circular motion",
          file: "modules/m00-orientation/l1-newton-fbd-circular-motion.html",
          status: "ready",
          minutes: 35,
          rcvd: [13],
          objectives: [
            "Convert fluently between m/s, km/h, m/s\u00b2 and g, and between mass and weight.",
            "Draw a correct free-body diagram of a car in a steady turn, without a \u201ccentrifugal force\u201d.",
            "Apply a = V\u00b2/R and \u03a3F = ma to find the tire forces a turn requires.",
            "Relate speed, radius, yaw rate and lateral acceleration in a steady turn."
          ]
        },
        {
          id: "m00-l2",
          title: "The SAE vehicle axis system and sign conventions",
          file: "modules/m00-orientation/l2-axis-systems.html",
          status: "ready",
          minutes: 40,
          rcvd: [4],
          objectives: [
            "Identify the SAE and ISO vehicle axes and the positive sense of roll, pitch and yaw.",
            "Distinguish earth-fixed from vehicle-fixed axes, and heading from course angle.",
            "Define steer angle, sideslip angle and slip angle, and calculate front and rear slip angles with correct signs."
          ]
        }
      ]
    },

    {
      id: "m01",
      number: 1,
      title: "The Racing Problem",
      summary: "Lap time is an acceleration problem. Meet the tire as the ultimate limit and the g-g diagram as the map of what a car can do.",
      rcvd: [1, 9],
      lessons: [
        {
          id: "m01-l1",
          title: "Grip, acceleration and the g-g diagram",
          file: "modules/m01-racing-problem/l1-grip-and-gg.html",
          status: "ready",
          minutes: 40,
          objectives: [
            "Explain why lap time depends on the accelerations a car can sustain.",
            "Compute the maximum speed through a corner from radius and friction coefficient.",
            "Read a g-g diagram and calculate the grip used by a combined braking-and-turning maneuver.",
            "Contrast how novice and expert drivers use the performance envelope."
          ]
        },
        {
          id: "m01-l2",
          title: "The driver–vehicle system: stability and control",
          file: "modules/m01-racing-problem/l2-driver-vehicle-system.html",
          status: "ready",
          minutes: 45,
          rcvd: [1, 5, 6],
          objectives: [
            "Distinguish open-loop from closed-loop behavior of the driver–vehicle system.",
            "Distinguish between a car's stability and its controllability.",
            "Explain why an oversteering car becomes unstable above a critical speed, and calculate that speed from the understeer gradient.",
            "Describe the driver as a feedback controller, and predict how preview, gain and reaction delay affect path following."
          ]
        }
      ]
    },

    {
      id: "m02",
      number: 2,
      title: "Tire Behavior",
      summary: "How a rubber tire generates force: slip angle, slip ratio, load sensitivity, combined slip, camber and simple tire models.",
      rcvd: [2, 14, 20],
      lessons: [
        {
          id: "m02-l1",
          title: "Slip angle and lateral force",
          file: "modules/m02-tires/l1-slip-angle.html",
          status: "ready",
          minutes: 45,
          objectives: [
            "Define slip angle and explain why a cornering tire must operate at one.",
            "Identify the linear, transitional and frictional regions of a lateral force curve.",
            "Calculate lateral force from cornering stiffness in the linear region.",
            "Explain tire load sensitivity and predict its effect on the total grip of a pair of tires."
          ]
        },
        {
          id: "m02-l2",
          title: "Slip ratio: traction and braking",
          file: "modules/m02-tires/l2-slip-ratio.html",
          status: "ready",
          minutes: 40,
          rcvd: [2, 20],
          objectives: [
            "Define longitudinal slip ratio for driving and braking, and calculate it from wheel and vehicle speed.",
            "Read a longitudinal force vs slip ratio curve and locate peak traction and braking.",
            "Explain why a wheel locks or spins up suddenly once the peak is passed.",
            "Explain what ABS and traction control do, and estimate the stopping-distance cost of locked wheels."
          ]
        },
        {
          id: "m02-l3",
          title: "Combined slip and the friction ellipse",
          file: "modules/m02-tires/l3-combined-slip.html",
          status: "ready",
          minutes: 40,
          rcvd: [2, 9],
          objectives: [
            "Explain why braking or driving force reduces the lateral force a tire can produce.",
            "Use a friction ellipse to estimate available lateral or longitudinal force.",
            "Explain locked-wheel understeer, rear lock-up spins and power oversteer in terms of combined slip."
          ]
        },
        {
          id: "m02-l4",
          title: "Camber, pressure, temperature and tire models",
          file: "modules/m02-tires/l4-camber-pressure-temperature.html",
          status: "ready",
          minutes: 45,
          rcvd: [2, 14],
          objectives: [
            "Describe camber thrust and explain why race cars run negative static camber.",
            "Estimate contact-patch area and hot inflation pressure with simple physical models.",
            "Explain the tire's temperature window and the trade-off between compounds.",
            "Fit a Magic Formula curve to tire data and use normalization to reveal load sensitivity."
          ]
        }
      ]
    },

    {
      id: "m03",
      number: 3,
      title: "Load Transfer",
      summary: "Where the weight goes when a car accelerates, brakes and corners — and why that changes how much grip the car has.",
      rcvd: [18],
      lessons: [
        {
          id: "m03-l1",
          title: "Load transfer and grip",
          file: "modules/m03-load-transfer/l1-load-transfer.html",
          status: "ready",
          minutes: 50,
          objectives: [
            "Calculate static wheel loads from mass and weight distribution.",
            "Calculate longitudinal and lateral load transfer from first principles.",
            "Explain why springs and anti-roll bars change the distribution, not the total, of lateral load transfer.",
            "Use load sensitivity to predict whether a set-up change adds understeer or oversteer."
          ]
        },
        {
          id: "m03-l2",
          title: "Inside the roll moment: roll centers and unsprung mass",
          file: "modules/m03-load-transfer/l2-roll-centers.html",
          status: "ready",
          minutes: 45,
          rcvd: [18, 16, 17],
          objectives: [
            "Split lateral load transfer into unsprung, geometric and elastic components and calculate each.",
            "Locate the roll axis and calculate the roll moment, body roll angle and roll gradient.",
            "Explain how roll-center height changes the front/rear split of load transfer and the body roll, and why very high roll centers cause jacking."
          ]
        },
        {
          id: "m03-l3",
          title: "Brake balance and longitudinal load transfer",
          file: "modules/m03-load-transfer/l3-brake-balance.html",
          status: "ready",
          minutes: 40,
          rcvd: [18, 20],
          objectives: [
            "Calculate axle loads during braking.",
            "Determine the ideal front/rear brake distribution for a given deceleration and grip level.",
            "Predict which axle locks first for an installed brake bias, and the resulting maximum deceleration.",
            "Explain why bias is set forward of ideal and adjusted as conditions change."
          ]
        }
      ]
    },

    {
      id: "m04",
      number: 4,
      title: "Aerodynamics",
      summary: "Dynamic pressure, drag and downforce, aero balance, and how a car with wings becomes a different car at every speed.",
      rcvd: [3, 15],
      lessons: [
        {
          id: "m04-l1",
          title: "Drag, downforce and dynamic pressure",
          status: "planned",
          minutes: 35,
          objectives: [
            "Calculate drag and downforce from coefficients, area and speed.",
            "Explain why downforce raises cornering speed more in fast corners."
          ],
          outline: [
            "Dynamic pressure ½ρv²",
            "C_D, C_L and the 'CLA' shorthand",
            "Corner speed with downforce: solving v²/R = μ(g + downforce/m)"
          ],
          interactives: ["Corner-speed vs radius plot with and without wings"]
        },
        {
          id: "m04-l2",
          title: "Aero balance and the speed-dependent car",
          status: "planned",
          minutes: 30,
          rcvd: [3, 15],
          objectives: [
            "Locate the center of pressure and compute front/rear downforce split.",
            "Predict how aero balance changes handling between slow and fast corners."
          ],
          outline: [
            "Center of pressure vs center of gravity",
            "Pitch sensitivity and ride height",
            "The g-g-V diagram"
          ],
          interactives: ["g-g-V envelope that grows with speed"]
        },
        {
          id: "m04-l3",
          title: "Power, drag and top speed",
          status: "planned",
          minutes: 25,
          objectives: [
            "Compute power-limited top speed from drag and available power.",
            "Explain the downforce-vs-drag trade-off for a given circuit."
          ],
          outline: [
            "Power = force × velocity",
            "Traction-limited vs power-limited acceleration",
            "Low-drag vs high-downforce set-ups"
          ],
          interactives: ["Acceleration-vs-speed chart with traction and power limits"]
        }
      ]
    },

    {
      id: "m05",
      number: 5,
      title: "Steady-State Cornering",
      summary: "The bicycle model: Ackermann steering, understeer gradient, neutral steer point and the classic understeer/oversteer definitions.",
      rcvd: [5, 7],
      lessons: [
        {
          id: "m05-l1",
          title: "Low-speed turning and Ackermann geometry",
          status: "planned",
          minutes: 25,
          objectives: [
            "Derive the Ackermann steer angle δ = L/R.",
            "Explain why inner and outer wheels need different steer angles at low speed."
          ],
          outline: ["Kinematic turning", "Ackermann, parallel and anti-Ackermann steering"],
          interactives: ["Top-down turning-circle sketcher"]
        },
        {
          id: "m05-l2",
          title: "The bicycle model",
          status: "planned",
          minutes: 45,
          objectives: [
            "Set up the force and moment equations of a two-wheel vehicle model.",
            "Solve for the slip angles front and rear in a steady turn."
          ],
          outline: [
            "Lumping each axle into one tire",
            "Force balance and yaw-moment balance",
            "Front and rear slip angles from cornering stiffness"
          ],
          interactives: ["Bicycle-model solver with live velocity and force vectors"]
        },
        {
          id: "m05-l3",
          title: "Understeer, oversteer and the understeer gradient",
          status: "planned",
          minutes: 45,
          rcvd: [5, 7],
          objectives: [
            "Calculate the understeer gradient K from vehicle parameters.",
            "Find the characteristic or critical speed of a vehicle.",
            "Relate the neutral steer point and static margin to stability."
          ],
          outline: [
            "δ = L/R + K·ay",
            "Characteristic speed (understeer) and critical speed (oversteer)",
            "Neutral steer point and static margin",
            "Pair analysis: front vs rear axle characteristics (RCVD Ch. 7)"
          ],
          interactives: ["Steer-angle vs lateral-acceleration plot with tunable cornering stiffness"]
        }
      ]
    },

    {
      id: "m06",
      number: 6,
      title: "Transient Response (Stretch)",
      summary: "Optional module for students who have met ODEs: yaw and sideslip equations of motion and a step-steer simulation.",
      rcvd: [6],
      optional: true,
      lessons: [
        {
          id: "m06-l1",
          title: "From steady state to motion: the yaw equations",
          status: "planned",
          minutes: 40,
          objectives: [
            "Write the two-degree-of-freedom equations for sideslip and yaw rate.",
            "Interpret yaw damping and the effect of speed on transient response."
          ],
          outline: ["Yaw moment of inertia", "Lateral and yaw equations of motion", "Stability derivatives in plain language"],
          interactives: ["Phase-portrait of yaw rate vs sideslip"]
        },
        {
          id: "m06-l2",
          title: "Simulating a step-steer with Euler integration",
          status: "planned",
          minutes: 45,
          objectives: [
            "Integrate the bicycle-model equations numerically with a fixed time step.",
            "Measure rise time and overshoot from a simulated step-steer."
          ],
          outline: ["Explicit Euler method", "Choosing a time step", "Response metrics"],
          interactives: ["In-browser step-steer simulator with downloadable code (Python/MATLAB)"]
        }
      ]
    },

    {
      id: "m07",
      number: 7,
      title: "Ride, Roll, Springs & Dampers",
      summary: "Wheel rates and motion ratios, ride frequency, roll stiffness and anti-roll bars, and an introduction to damping.",
      rcvd: [16, 21, 22],
      lessons: [
        {
          id: "m07-l1",
          title: "Springs, motion ratios and wheel rates",
          status: "planned",
          minutes: 35,
          rcvd: [16, 21],
          objectives: [
            "Convert a spring rate to a wheel rate using the motion ratio.",
            "Combine tire and suspension stiffness in series to find ride rate."
          ],
          outline: ["Motion ratio and why it appears squared", "Springs in series: tire + suspension"],
          interactives: ["Rocker/pushrod linkage with live motion ratio"]
        },
        {
          id: "m07-l2",
          title: "Ride frequency and damping",
          status: "planned",
          minutes: 35,
          rcvd: [16, 22],
          objectives: [
            "Calculate natural frequency of a corner of the car.",
            "Choose a damping ratio and explain its effect on platform control and grip."
          ],
          outline: ["Quarter-car model", "Natural frequency and damping ratio", "Typical values for road, race and aero cars"],
          interactives: ["Quarter-car bump response with adjustable spring and damper"]
        },
        {
          id: "m07-l3",
          title: "Roll rate, anti-roll bars and roll gradient",
          status: "planned",
          minutes: 40,
          rcvd: [16],
          objectives: [
            "Calculate axle roll stiffness from wheel rates and track width.",
            "Size an anti-roll bar to achieve a target roll stiffness distribution."
          ],
          outline: ["Roll stiffness from springs", "Anti-roll bars", "Roll gradient (deg/g)"],
          interactives: ["Roll-stiffness distribution tuner linked to the load-transfer model"]
        }
      ]
    },

    {
      id: "m08",
      number: 8,
      title: "Suspension Geometry & Steering",
      summary: "Instant centers, roll centers, camber change, anti-dive/anti-squat, and steering geometry.",
      rcvd: [17, 19, 23],
      lessons: [
        {
          id: "m08-l1",
          title: "Instant centers and roll centers",
          status: "planned",
          minutes: 40,
          rcvd: [17],
          objectives: [
            "Construct the instant center and roll center of a double-wishbone suspension.",
            "Explain how roll-center height affects load transfer and jacking."
          ],
          outline: ["Graphical construction", "Roll axis", "Jacking forces"],
          interactives: ["Draggable double-wishbone linkage with live roll center"]
        },
        {
          id: "m08-l2",
          title: "Camber change and anti-features",
          status: "planned",
          minutes: 35,
          rcvd: [17],
          objectives: [
            "Predict camber change in bump and roll from linkage geometry.",
            "Calculate percentage anti-dive and anti-squat."
          ],
          outline: ["Camber gain", "Side-view swing arm", "Anti-dive and anti-squat"],
          interactives: ["Camber-vs-roll curve generator"]
        },
        {
          id: "m08-l3",
          title: "Steering geometry and compliance",
          status: "planned",
          minutes: 35,
          rcvd: [19, 23],
          objectives: [
            "Define caster, kingpin inclination, scrub radius and mechanical trail.",
            "Explain how compliance changes the effective steer and camber of a wheel."
          ],
          outline: ["Steering axis geometry", "Self-aligning torque and steering feel", "Compliance steer"],
          interactives: ["Steering-axis 3-D viewer"]
        }
      ]
    },

    {
      id: "m09",
      number: 9,
      title: "Capstone: Balance, Set-up & Lap Time",
      summary: "Bring every model together: the moment-method view of balance, a point-mass lap-time simulator, and a set-up project.",
      rcvd: [8, 10, 11, 12],
      lessons: [
        {
          id: "m09-l1",
          title: "Thinking in moments: an introduction to MMM diagrams",
          status: "planned",
          minutes: 40,
          rcvd: [8],
          objectives: [
            "Explain the yaw moment as the measure of balance at the limit.",
            "Read a simplified Milliken Moment Method (CN–Ay) diagram."
          ],
          outline: ["Yaw moment vs lateral acceleration", "Stability and control on one diagram", "What set-up changes do to the diagram"],
          interactives: ["Simplified MMM diagram from the bicycle model"]
        },
        {
          id: "m09-l2",
          title: "A point-mass lap-time simulator",
          status: "planned",
          minutes: 50,
          objectives: [
            "Build a quasi-steady-state lap-time simulation from a g-g-V envelope.",
            "Run sensitivity studies: mass, grip, power, downforce."
          ],
          outline: ["Track as a sequence of curvature segments", "Forward and backward integration passes", "Sensitivity studies"],
          interactives: ["Lap-time simulator on a sample circuit with a speed trace"]
        },
        {
          id: "m09-l3",
          title: "Capstone project: set up a car for a circuit",
          status: "planned",
          minutes: 120,
          rcvd: [10, 11, 12],
          objectives: [
            "Choose a set-up for a target circuit and justify each change quantitatively.",
            "Communicate an engineering recommendation in a short technical memo."
          ],
          outline: ["Project brief and baseline car", "Set-up decision log", "Memo and peer review"],
          interactives: ["Set-up sandbox combining all course models"]
        }
      ]
    }
  ],

  // Reference material. Listed in the sidebar and on the home page after the modules, but
  // these pages are not lessons: they are not counted in progress or in the previous/next links.
  references: [
    {
      id: "ref",
      label: "R",
      title: "Reference",
      summary: "Quick-reference pages to keep open while you work: every key formula from the course with its symbols and units, and a glossary of terms.",
      pages: [
        {
          id: "ref-formulas",
          title: "Formula sheet",
          file: "reference/formulas.html",
          summary: "A cheat sheet of the key formulas from each module, grouped by lesson."
        },
        {
          id: "ref-glossary",
          title: "Glossary",
          file: "reference/glossary.html",
          summary: "Plain-language definitions of the terms used in the course, each linked to the lesson that introduces it."
        }
      ]
    }
  ]
};
