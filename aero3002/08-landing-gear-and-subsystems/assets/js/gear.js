/*!
 * gear.js — GEAR: landing gear layout, loads, tires, shock absorbers and cabin systems, for Module 8 of Conceptual
 * Aircraft Design (Landing Gear and Subsystems). Plain ES5; the drawings and GEAR.evaluate use Module 6's LAYOUT.
 *
 * Units: metres, newtons and kilograms, except the tire data, which keep the catalog's inches, pounds (lbf), psi and mph.
 *
 *   GEAR.IN, GEAR.LBF, GEAR.PSI, GEAR.KT   0.0254 m per inch, 4.448 N per lbf, 6895 Pa per psi, 0.5144 m/s per knot
 *   GEAR.TIRES                         251 aircraft tires: {size, ply, kind, speed (mph), load (lb), psi, brake (lb), OD, W, SLR (in)}
 *   GEAR.tire(size, ply)               one catalog tire; GEAR.label(t) its name, e.g. "H22x8.25-10, 14 ply"
 *   GEAR.STAT, GEAR.tireStat(Ww, cls)  statistical tire diameter and width (in) from the load per wheel Ww (lb), by class
 *   GEAR.loads(o)                      static and braking gear loads: o = {W (N), xn, xm, xf, xa, h, legs, decel (g)}
 *   GEAR.tipBack(xm, xa, h)            angle (deg) from the vertical through the main wheels to the aft CG
 *   GEAR.tipOver(xn, xm, ym, xcg, h)   lateral tip-over angle (deg) {psi, delta, d}
 *   GEAR.minHalfTrack(xn, xm, xcg, h, psiMax)  the half track that gives psiMax
 *   GEAR.selectTire(need)              catalog tires that carry need = {load, perAxle, nose, brake, speed, pmax}, smallest first
 *   GEAR.inflation(t, load), GEAR.contactArea(t), GEAR.deflection(t)   psi for a load, footprint (in²), deflection (m)
 *   GEAR.stroke(o)                     shock-absorber stroke from the energy of the vertical speed: o = {V, eta, N, etaT, ST, margin}
 *   GEAR.oleo(L, P)                    oleo piston and outer diameters (m) for a strut load L (N) at gas pressure P (Pa)
 *   GEAR.isaP(h), GEAR.isaT(h)         ISA pressure (Pa) and temperature (K) to 20 km
 *   GEAR.cabin(hFlight, hCabin)        {p, pc, dp}: outside and cabin pressures and the differential (Pa)
 *   GEAR.freshAir(n)                   fresh air for n occupants, kg/s (0.55 lb/min each, CS/FAR 25.831)
 *   GEAR.compression(m, p1, p2, T1, eff)   power (W) to compress m kg/s of air from p1 to p2
 *   GEAR.actuator(F, p)                {A, bore}: piston area (m²) and bore (m) for a force F (N) at pressure p (Pa)
 *   GEAR.PRESETS, GEAR.preset(id)      the business jet and three illustrative aircraft for the Landing Gear Designer
 *   GEAR.evaluate(spec)                the whole layout check of a preset: angles, loads, tires, stroke, checks
 *   GEAR.drawSide/drawFront/drawTop(g, R, o), GEAR.threeView(plane, g, R, o)   drawings on CYL2D groups
 *
 * Sources: tire data from the Goodyear Aviation Data Book 2022 (Section 4 tire specifications; rated load at rated
 * inflation, maximum braking load, inflated dimensions and static loaded radius); tire statistics after Raymer
 * (Table 11.1, coefficients as published in the AeroSandbox library); static and braking load equations, tip-back,
 * tip-over and nose-load guidelines after Raymer (Ch. 11); tire, braking and descent-velocity rules from 14 CFR 25.473,
 * 25.723, 25.733, 25.925; cabin rules from 25.831 and 25.841. Stroke constants (oleo and tire efficiencies, gear load
 * factor, the 1 in margin, the 1800 psi oleo pressure and 1.3 diameter ratio) are typical values to be checked.
 */
(function (global) {
  'use strict';
  var X = {}, IN = 0.0254, LBF = 4.4482216, PSI = 6894.757, D2R = Math.PI / 180, g = 9.81;
  X.IN = IN; X.LBF = LBF; X.PSI = PSI; X.KT = 0.514444; X.g = g;

  /* ---------- Tires (Goodyear Aviation Data Book 2022) ---------- */
  // [size, ply, kind, rated speed mph, rated load lb, rated inflation psi, max braking load lb, OD in, section width in, static loaded radius in]
  var RAW = [
    ["5.00-5", 4, "bias", 160, 800, 31, 1160, 14.2, 4.95, 5.7],
    ["16x4.4", 4, "bias", 210, 1100, 55, 1650, 16, 4.45, 6.9],
    ["8.00-4", 4, "bias", 120, 1100, 24, 1600, 18, 8.3, 6.65],
    ["6.00-6", 4, "bias", 160, 1150, 29, 1670, 17.5, 6.3, 6.9],
    ["5.00-4", 6, "bias", 120, 1200, 55, 1740, 13.25, 5.05, 5.2],
    ["5.00-5", 6, "bias", 160, 1285, 50, 1860, 14.2, 4.95, 5.7],
    ["380x150/15x6.0-6", 6, "metric", 120, 1600, 45, 2320, 15.2, 5.91, 5.9],
    ["5.00-4.5", 6, "bias", 120, 1650, 78, 2390, 13.45, 5.3, 5.3],
    ["16x4.4", 6, "bias", 210, 1700, 85, 2550, 16, 4.45, 6.9],
    ["6.00-6.5/420x150", 4, "bias", 120, 1750, 45, 2540, 17.3, 5.9, 6.95],
    ["6.00-6", 6, "bias", 160, 1750, 42, 2540, 17.5, 6.3, 6.9],
    ["7.00-6", 6, "bias", 160, 1900, 38, 2760, 18.75, 7, 7.3],
    ["15X6.0-6", 6, "bias", 160, 1950, 68, 2830, 15.2, 6.3, 6.1],
    ["15x6.0-6", 6, "bias", 160, 1950, 68, 2830, 15.2, 6.3, 6.1],
    ["8.00-6", 6, "bias", 120, 2050, 35, 2970, 19.5, 7.95, 7.55],
    ["18x4.4", 6, "bias", 190, 2100, 100, 3150, 17.9, 4.45, 7.9],
    ["5.00-5", 10, "bias", 190, 2150, 88, 3120, 14.2, 4.95, 5.7],
    ["8.50-6", 6, "bias", 120, 2275, 30, 3300, 22.1, 8.85, 8.39],
    ["18x4.25-10", 6, "bias", 210, 2300, 100, 3450, 18.25, 4.7, 7.9],
    ["6.50-8", 6, "bias", 160, 2300, 51, 3340, 19.85, 6.9, 8],
    ["17.5x6.25-6", 8, "bias", 190, 2350, 65, 3410, 17.5, 6.25, 6.9],
    ["6.00-6", 8, "bias", 160, 2350, 55, 3410, 17.5, 6.3, 6.9],
    ["22x8.0-8", 6, "bias", 120, 2500, 40, 3620, 22, 8, 8.75],
    ["5.00-4", 14, "bias", 120, 2550, 115, 3700, 13.25, 5.05, 5.2],
    ["7.00-6", 8, "bias", 160, 2550, 54, 3700, 18.75, 7, 7.3],
    ["26x10.5-6", 6, "bias", 120, 2765, 25, 4010, 26, 10.5, 9.64],
    ["6.50-10", 6, "bias", 160, 2770, 60, 4020, 22.1, 6.65, 9.1],
    ["8.00-6", 8, "bias", 120, 2800, 48, 4060, 19.5, 7.95, 7.55],
    ["22x6.50-10", 6, "bias", 190, 2800, 68, 4200, 22.1, 6.65, 9.2],
    ["14.5x5.5-6", 8, "bias", 214, 2890, 123, 4335, 14.2, 5.5, 6.1],
    ["16x4.4", 10, "bias", 210, 2900, 155, 4400, 16, 4.45, 6.9],
    ["16x4.4R8", 10, "radial", 225, 2900, 155, 4350, 16.4, 4.68, 6.8],
    ["17.5x6.25-6/6.00-6", 8, "bias", 190, 2900, 70, 4200, 17.5, 6.25, 6.9],
    ["24x7.7", 6, "bias", 190, 2950, 55, 4420, 24.15, 7.65, 10],
    ["18x5.5", 8, "bias", 210, 3050, 105, 4570, 17.9, 5.75, 7.5],
    ["18x5.75-8", 8, "bias", 190, 3050, 105, 4570, 18, 5.75, 7.6],
    ["6.50-8", 8, "bias", 160, 3150, 75, 4570, 19.85, 6.9, 8],
    ["15x6.0-6", 10, "bias", 160, 3200, 112, 4800, 15.2, 6.55, 6.1],
    ["19.5x6.75-8", 8, "bias", 210, 3300, 86, 4950, 19.5, 6.75, 8.05],
    ["13.5x6.0-4", 14, "bias", 230, 3450, 135, 5000, 13.75, 6.1, 5.35],
    ["16x4.4", 12, "bias", 190, 3475, 185, 5213, 16, 4.45, 6.9],
    ["14.5x5.5-6", 14, "bias", 120, 3550, 155, 5330, 14.5, 5.5, 6.1],
    ["18x4.4", 10, "bias", 210, 3550, 185, 5320, 17.9, 4.45, 7.9],
    ["18X4.4", 10, "bias", 210, 3550, 185, 5320, 17.9, 4.45, 7.9],
    ["17.5x6.25-11", 8, "bias", 139, 3600, 167, 5400, 17.7, 6.1, 7.95],
    ["450x190-5", 10, "metric", 190, 3600, 75, 5400, 18.31, 7.68, 7.09],
    ["7.00-6", 10, "bias", 160, 3600, 73, 5225, 18.75, 7, 7.3],
    ["17.5x6.25-6", 10, "bias", 160, 3750, 90, 5650, 17.5, 6.25, 6.9],
    ["6.50-10", 8, "bias", 160, 3750, 80, 5440, 22.1, 6.65, 9.1],
    ["450x190-5", 10, "metric", 230, 3822, 90, 5730, 18.11, 7.72, 7.05],
    ["17.5x5.75-8", 10, "bias", 210, 3950, 148, 5925, 17.5, 5.75, 7.4],
    ["22x6.50-10", 8, "bias", 210, 3975, 95, 5975, 22.1, 6.65, 9.2],
    ["18X5.5", 10, "bias", 210, 4000, 140, 6000, 17.9, 5.75, 7.5],
    ["18x5.5", 10, "bias", 210, 4000, 140, 6000, 17.9, 5.75, 7.5],
    ["H19.5x6.75-10", 8, "bias", 160, 4000, 120, 5800, 19.5, 6.75, 8.25],
    ["24x7.7", 8, "bias", 160, 4150, 75, 6220, 24.15, 7.65, 10],
    ["19.5x6.75-8", 10, "bias", 225, 4270, 110, 6400, 19.2, 6.35, 8.05],
    ["8.90-12.50", 6, "bias", 160, 4300, 50, 6090, 27.7, 9, 11.35],
    ["18x4.4", 12, "bias", 210, 4350, 225, 6520, 17.9, 4.45, 7.9],
    ["8.50-10", 8, "bias", 160, 4400, 55, 6380, 25.65, 8.7, 10.19],
    ["7.00-8", 10, "bias", 120, 4500, 84, 6750, 20.85, 7.3, 8.35],
    ["9.00-6", 10, "bias", 120, 4500, 58, 6530, 22.4, 9.25, 8.5],
    ["6.50-10", 10, "bias", 160, 4750, 100, 6890, 22.1, 6.65, 9.1],
    ["17.5x5.75-8", 12, "bias", 210, 5000, 180, 7500, 17.5, 5.75, 7.4],
    ["18x6.5-8", 12, "bias", 223, 5000, 150, 7500, 18, 6.5, 7.7],
    ["24x7.7", 10, "bias", 225, 5400, 90, 8100, 24.15, 7.65, 10],
    ["8.50-10", 10, "bias", 160, 5500, 70, 7980, 25.65, 8.7, 10.19],
    ["9.25-12", 8, "bias", 160, 5600, 60, 8120, 28.2, 9.5, 11.44],
    ["22x5.75-12", 10, "bias", 190, 5700, 180, 8550, 22, 5.75, 9.6],
    ["24.5x8.5", 10, "metric", 210, 5700, 85, 8550, 24.5, 8.5, 10.05],
    ["6.50-10", 12, "bias", 160, 5750, 120, 8340, 22.1, 6.65, 9.1],
    ["17.5x5.75-8", 14, "bias", 210, 6050, 220, 9080, 17.5, 5.75, 7.4],
    ["18x5.5", 14, "bias", 239, 6200, 215, 9300, 17.9, 5.75, 7.5],
    ["20.5x6.75-10", 12, "bias", 225, 6225, 182, 9350, 20.5, 6.75, 8.8],
    ["21x6.5-10", 12, "bias", 160, 6225, 173, 9350, 21, 6.5, 8.9],
    ["21x7.25-10", 12, "bias", 225, 6400, 166, 9600, 21.25, 7.2, 9],
    ["21x7.25R10", 12, "radial", 225, 6400, 166, 9600, 21.25, 7.2, 9.05],
    ["20x4.4", 14, "bias", 255, 6500, 265, 9750, 20, 4.45, 8.9],
    ["20x4.4R12", 14, "radial", 255, 6500, 265, 9750, 20.4, 4.65, 8.85],
    ["22x8.0-10", 10, "bias", 190, 6500, 110, 9750, 22, 8, 9],
    ["605x155-13", 10, "metric", 233, 6610, 164, 9580, 24.13, 6.46, 10.3],
    ["7.00-8", 16, "bias", 130, 6650, 125, 9640, 20.85, 7.3, 8.35],
    ["21.5x7.0-10", 12, "bias", 139, 6700, 135, 9720, 21.76, 7.05, 9],
    ["24x7.7", 12, "bias", 225, 6800, 110, 10200, 24.15, 7.65, 10],
    ["670x210-12", 10, "metric", 160, 6800, 95, 9860, 26.77, 8.46, 10.89],
    ["H22x8.25-10", 12, "bias", 190, 6900, 132, 10350, 22, 8.25, 9.14],
    ["24.5x8.5", 12, "metric", 160, 6900, 90, 10000, 24.5, 8.5, 9.85],
    ["26x6.6", 10, "bias", 225, 6900, 155, 10350, 25.75, 6.65, 11.2],
    ["29x11.0-10", 10, "bias", 120, 7070, 60, 10250, 29, 11, 11.4],
    ["29x11.0-10", 10, "bias", 210, 7070, 69, 10605, 29, 11, 11.39],
    ["22x5.75-12", 12, "bias", 210, 7100, 220, 10650, 22, 5.75, 9.6],
    ["22x5.5", 12, "bias", 174, 7100, 235, 10650, 22.15, 5.7, 9.65],
    ["21x7.25-10", 14, "bias", 225, 7600, 198, 11400, 21.25, 7.2, 9],
    ["21x7.25R10", 14, "radial", 225, 7600, 198, 11400, 21.25, 7.2, 9.05],
    ["6.50-10", 14, "bias", 174, 7738, 159, 11600, 22.1, 6.65, 9.1],
    ["23x7.00-12", 12, "bias", 210, 7800, 160, 11700, 23.2, 7.2, 9.89],
    ["22x8.0-10", 12, "bias", 190, 7900, 135, 11450, 22, 8, 9],
    ["615x225-10", 12, "metric", 244, 8000, 123, 12000, 24.61, 9.06, 10.24],
    ["8.50-10", 12, "bias", 139, 8000, 100, 11600, 25.65, 8.7, 10.19],
    ["24x5.5", 12, "bias", 139, 8070, 250, 12110, 24.15, 5.7, 10.65],
    ["26x7.75R13", 10, "radial", 230, 8100, 125, 12150, 27.36, 8.32, 10.6],
    ["24x7.25-12", 12, "bias", 190, 8150, 164, 12200, 24.5, 7.5, 10.39],
    ["24x7.7", 14, "bias", 217, 8200, 135, 12300, 24.15, 7.65, 10],
    ["11.00-12", 10, "bias", 160, 8200, 60, 11890, 32.2, 11.2, 12.69],
    ["H22x8.25-10", 14, "bias", 190, 8300, 156, 12500, 22, 8.25, 9.14],
    ["25.5x8.75-10", 14, "bias", 190, 8500, 101, 12750, 25.6, 8.65, 10.25],
    ["18x5.7-8", 18, "bias", 250, 8600, 300, 12900, 17.9, 5.7, 7.55],
    ["26x6.6", 12, "bias", 225, 8600, 185, 12900, 25.75, 6.65, 11.2],
    ["8.50-10", 14, "bias", 120, 8700, 110, 12600, 25.65, 8.7, 10.19],
    ["7.50-14", 12, "bias", 160, 8700, 130, 12620, 27.75, 7.65, 11.64],
    ["9.25-12/28x9.00-12", 12, "bias", 160, 8850, 100, 12800, 28.3, 9.4, 11.39],
    ["450x190-5", 22, "metric", 233, 8880, 225, 13320, 18.11, 7.72, 7.15],
    ["18x5.7-8", 20, "bias", 250, 9000, 315, 13500, 17.9, 5.7, 7.55],
    ["22x6.6-10", 18, "bias", 244, 9200, 260, 13800, 22.2, 6.8, 9.7],
    ["H31x9.75-13", 12, "bias", 190, 9350, 90, 14020, 31, 9.75, 12.39],
    ["23.5x8.0R12", 14, "radial", 190, 9475, 212, 14150, 24.25, 8.35, 10.1],
    ["27x7.75-15", 12, "bias", 225, 9650, 200, 14475, 27, 7.75, 11.8],
    ["27x7.75R15", 12, "radial", 235, 9650, 200, 14475, 27.7, 8.1, 11.75],
    ["26x10.0-11", 12, "bias", 139, 9700, 140, 14550, 26, 10, 10.85],
    ["24x7.7", 16, "bias", 225, 9725, 165, 14590, 24.15, 7.65, 10],
    ["8.50-10", 16, "bias", 104, 9900, 129, 14900, 25.65, 8.7, 10.19],
    ["22x8.5-11", 16, "bias", 217, 10000, 210, 15000, 22, 8.5, 9.39],
    ["26x6.6", 14, "bias", 210, 10000, 225, 15000, 25.75, 6.65, 11.2],
    ["26x6.6R14", 14, "radial", 210, 10000, 210, 15000, 26.32, 6.92, 11.15],
    ["26x6.6R14", 14, "radial", 225, 10000, 225, 15000, 26.32, 6.92, 11.15],
    ["32x10.75-14", 12, "bias", 160, 10200, 85, 14790, 32.55, 10.95, 13.25],
    ["25.75x6.75-14", 14, "bias", 210, 10300, 199, 14930, 25.1, 6.35, 8],
    ["12.50-16", 10, "bias", 160, 10600, 60, 15370, 38.45, 12.75, 15.6],
    ["22x6.6-10", 18, "bias", 200, 10700, 260, 16050, 22.2, 6.8, 9.45],
    ["34x10.75-16/10.50-16", 10, "bias", 190, 10870, 80, 15760, 34.5, 10.45, 14.25],
    ["H26.5X8.0-14", 14, "bias", 210, 10975, 189, 16475, 26.5, 8, 11.3],
    ["H26.5x8.0R14", 14, "radial", 210, 10975, 189, 16475, 27.25, 8.35, 11.07],
    ["28x7.7", 14, "bias", 174, 11000, 195, 16500, 27.4, 7.85, 11.75],
    ["32x8.8R16", 12, "radial", 190, 11000, 140, 16500, 31.8, 9.25, 12.4],
    ["31x9.75-14", 12, "bias", 190, 11100, 115, 16650, 30.9, 9.85, 12.8],
    ["32x11.5-15", 12, "bias", 225, 11200, 120, 16800, 32, 11.5, 13.55],
    ["H25x8.0-12", 16, "bias", 210, 11300, 187, 16950, 25, 8, 10.5],
    ["24x5.5", 16, "bias", 174, 11500, 355, 17250, 24.15, 5.7, 10.65],
    ["26x6.75-14", 16, "bias", 190, 11900, 270, 17850, 26, 6.75, 11.3],
    ["21x7.25-10", 20, "bias", 195, 12000, 325, 18000, 21.25, 7.2, 9],
    ["22x6.6-10", 20, "bias", 190, 12000, 270, 18000, 22.2, 6.8, 9.35],
    ["33.5x10.75-15", 12, "bias", 160, 12200, 100, 17690, 33.5, 10.75, 13.69],
    ["15.00-16", 10, "bias", 160, 12200, 53, 17690, 42.4, 15.3, 16.8],
    ["24x8.0-13", 18, "bias", 230, 12500, 285, 18750, 24, 8, 10.44],
    ["15.00-12", 14, "bias", 160, 12700, 65, 18410, 36.3, 14.7, 14.1],
    ["12.50-16", 12, "bias", 160, 12800, 75, 18560, 38.45, 12.75, 15.6],
    ["32x8.8", 14, "metric", 210, 13000, 170, 19500, 31, 8.9, 13.3],
    ["34x10.75-16/10.50-16", 12, "bias", 190, 13000, 95, 18850, 34.45, 10.45, 14.3],
    ["34x10.75-16", 12, "bias", 190, 13000, 95, 18850, 34.5, 10.45, 14.25],
    ["37x11.75-16", 12, "bias", 190, 13000, 80, 18850, 37, 11.75, 15.05],
    ["750x230-15", 14, "metric", 262, 13151, 152, 19730, 29.96, 9.33, 12.75],
    ["H34x10.0R16", 14, "radial", 190, 13400, 130, 20100, 34.85, 10.4, 14],
    ["670x210-12", 18, "metric", 200, 13700, 205, 20550, 26.77, 8.46, 11.1],
    ["25.5x8.0-14", 16, "bias", 222, 13939, 285, 20230, 25.5, 8, 12.6],
    ["22x6.6-10", 22, "bias", 225, 14150, 304, 21225, 22.2, 6.8, 9.35],
    ["30x8.8", 16, "metric", 225, 14200, 199, 21300, 30.3, 8.9, 12.94],
    ["30x8.8R15", 16, "radial", 225, 14200, 199, 21300, 31.1, 9.3, 12.9],
    ["H29x9.0-15", 16, "bias", 210, 14500, 196, 21750, 29, 9, 12.3],
    ["39x13", 14, "metric", 210, 15000, 100, 22500, 38.25, 13, 15.8],
    ["H30x9.5-16", 16, "bias", 225, 15350, 202, 23025, 30, 9.5, 12.85],
    ["750x230-15", 22, "metric", 257, 15620, 232, 23430, 29.96, 9.33, 12.75],
    ["17.00-16", 12, "bias", 160, 16000, 60, 23200, 45.05, 17.4, 17.7],
    ["25.5x8.0-14", 20, "bias", 217, 16200, 310, 23500, 25.5, 8, 10.94],
    ["25.5x8.0R14", 20, "radial", 250, 16200, 310, 23500, 26.2, 8.32, 10.94],
    ["H31x13.0-12", 20, "bias", 235, 17200, 155, 25800, 31, 13, 12.4],
    ["39x13", 16, "metric", 225, 17200, 115, 25800, 38.25, 13, 15.8],
    ["34x14.0-12", 24, "bias", 174, 17300, 155, 25590, 34, 14, 13.69],
    ["40x14", 16, "metric", 210, 17300, 105, 25950, 39.8, 14, 16.45],
    ["34x9.25-16", 18, "bias", 210, 17800, 190, 26700, 34, 9.25, 14.35],
    ["28x9.0-14", 22, "bias", 185, 18100, 280, 27150, 27.85, 9.1, 12],
    ["H34x9.25-18", 18, "bias", 225, 19400, 213, 29100, 34, 9.25, 14.5],
    ["39x13", 18, "metric", 210, 19400, 130, 29100, 38.25, 13, 15.8],
    ["H34x9.5R18", 18, "radial", 225, 19550, 221, 35100, 34.8, 9.65, 15.05],
    ["15.00-16", 16, "bias", 160, 19700, 80, 28560, 42.4, 15.3, 16.89],
    ["34x11", 22, "metric", 225, 20500, 185, 30750, 33.4, 11.3, 13.94],
    ["27.75x8.75-14.5", 24, "bias", 225, 21500, 320, 31175, 27.75, 8.75, 11.85],
    ["H36x12.0-18", 18, "bias", 225, 21525, 177, 32300, 36, 12, 15.2],
    ["27.75x8.75R14.5", 24, "radial", 250, 22200, 330, 31175, 28.68, 9.19, 11.85],
    ["35x11.5-16", 22, "bias", 222, 23000, 210, 34500, 35, 11.5, 14.75],
    ["36x11", 22, "metric", 225, 23300, 200, 34950, 35.1, 11.5, 14.75],
    ["H35x11.0-18", 20, "bias", 225, 23400, 216, 35100, 35, 11, 14.8],
    ["H35x11.0R18", 20, "radial", 225, 23400, 216, 35100, 35.97, 11.44, 14.8],
    ["H37x14.0-15", 22, "bias", 235, 24100, 165, 36150, 37, 14, 15.25],
    ["H36x11.5-19", 20, "bias", 225, 24925, 221, 37400, 36, 11.5, 15.3],
    ["30x11.50-14.5", 24, "bias", 215, 25000, 243, 36250, 29.75, 11.5, 12.5],
    ["30x11.50-14.5", 26, "bias", 215, 25000, 245, 36250, 29.75, 11.5, 12.5],
    ["30x11.50R14.5", 24, "radial", 205, 25000, 243, 36250, 30.75, 11.96, 12],
    ["37x14.0-14", 24, "bias", 225, 25000, 160, 37500, 37, 14, 15.14],
    ["H38x13.0-18", 20, "bias", 225, 25075, 172, 37625, 38, 13, 15.8],
    ["H38x12.0-19", 20, "bias", 225, 25275, 192, 38000, 38, 12, 16],
    ["36x11", 24, "metric", 201, 26500, 235, 39750, 35.1, 11.5, 14.75],
    ["30x11.50-14.5", 26, "bias", 220, 26600, 265, 38570, 29.75, 11.5, 12.5],
    ["H40x14.0-19", 20, "bias", 225, 27100, 166, 39295, 40, 14, 16.6],
    ["39x13", 24, "metric", 210, 27400, 188, 41100, 38.25, 13, 15.85],
    ["30x11.50R14.5", 24, "radial", 205, 27600, 335, 41400, 30.75, 11.96, 12],
    ["40x14", 24, "metric", 225, 27700, 170, 41500, 39.8, 14, 16.45],
    ["32x11.5-15", 26, "bias", 210, 27800, 290, 41700, 32, 11.5, 12.8],
    ["35x11.5-17", 26, "bias", 240, 28300, 255, 42450, 35, 11.5, 14.8],
    ["H39x12.0R19", 22, "radial", 225, 29250, 218, 43875, 40.05, 12.5, 16.35],
    ["34.5x9.75-18", 26, "bias", 225, 30100, 340, 45150, 34.5, 9.75, 14.85],
    ["41x15.0-18", 24, "bias", 225, 31400, 190, 47100, 41, 15, 17.2],
    ["40x16.0R16", 26, "radial", 235, 31475, 180, 47225, 41.45, 16.65, 16.5],
    ["34.5x9.75-18", 26, "bias", 203, 32000, 360, 48000, 34.5, 9.75, 14.85],
    ["H40x14.5-19", 24, "bias", 225, 33200, 200, 48140, 40, 14.5, 16.64],
    ["40X14", 28, "metric", 174, 33500, 200, 50250, 39.8, 14, 16.45],
    ["H41x15.0-19", 24, "bias", 225, 33650, 187, 48800, 41, 15, 17],
    ["36x11.0-18", 30, "bias", 227, 35800, 305, 53700, 35.8, 10.4, 15.25],
    ["36x11.0R18", 30, "radial", 227, 35800, 305, 53700, 36.75, 10.92, 15.25],
    ["42x17.0R18", 26, "radial", 235, 36100, 194, 54150, 43.5, 17.7, 17.42],
    ["H40x14.5-19", 26, "bias", 235, 36800, 220, 53360, 39.1, 13.75, 12.89],
    ["H42x16.0-19", 26, "bias", 225, 37800, 190, 56700, 42, 16, 17.29],
    ["44x16", 28, "metric", 174, 38400, 200, 57600, 43.25, 16, 17.95],
    ["56x20.0-20", 24, "bias", 210, 38500, 110, 57750, 56, 20, 22.7],
    ["43x16.0-20", 28, "bias", 174, 38600, 215, 56900, 43, 16, 17.95],
    ["40x15.5-16", 28, "bias", 235, 39500, 195, 57270, 40, 15.5, 16.1],
    ["49x17", 26, "metric", 195, 39600, 170, 59400, 48.75, 17.25, 20.14],
    ["H43.5x16.0-21", 26, "bias", 225, 40600, 210, 60900, 43.5, 16, 18.25],
    ["H49x19.0-22", 24, "bias", 225, 41000, 155, 61500, 49, 19, 20.2],
    ["44x16", 30, "metric", 225, 41700, 210, 62550, 43.25, 16, 17.95],
    ["46x16", 28, "metric", 225, 41800, 210, 62700, 45.25, 16, 19],
    ["44.5x16.5-18", 30, "bias", 225, 42500, 195, 63750, 44.5, 16.5, 18.35],
    ["H44.5x16.5-20", 28, "bias", 225, 42800, 195, 64200, 44.5, 16.5, 18.35],
    ["H46x18.0-20", 28, "bias", 225, 44200, 180, 64100, 46, 18, 18.85],
    ["43x17.5R17", 32, "radial", 235, 44500, 212, 66750, 44.55, 18.2, 17.65],
    ["H44.5x16.5-21", 28, "bias", 235, 44700, 214, 64800, 44.5, 16.5, 18.5],
    ["46x16", 30, "metric", 225, 44800, 225, 67200, 44.3, 15.05, 14],
    ["46x17.0R20", 30, "radial", 225, 46000, 222, 69000, 47.5, 17.7, 19.2],
    ["20.00-20", 26, "bias", 174, 46500, 125, 67420, 56, 20.1, 22.1],
    ["49x17", 30, "metric", 225, 46700, 195, 70050, 47.7, 16.4, 14.4],
    ["46x16", 32, "metric", 225, 48000, 245, 72000, 45.25, 16, 19],
    ["H44.5x16.5-21", 30, "bias", 235, 48400, 230, 70180, 44.5, 16.5, 18.5],
    ["H44.5x16.5R21", 30, "radial", 235, 48400, 230, 70180, 45.95, 17.15, 18.14],
    ["50x21.0-20", 30, "bias", 225, 49000, 160, 73500, 50, 21, 20.2],
    ["49x17", 32, "metric", 235, 50400, 210, 75600, 48.75, 17.25, 20.2],
    ["H46x18.0-20", 32, "bias", 235, 51100, 205, 74100, 46, 18, 18.85],
    ["H44.5x16.5R21", 32, "radial", 235, 51675, 246, 77525, 45.95, 17.15, 18.14],
    ["49x19.0-20", 32, "bias", 235, 51900, 195, 77800, 49, 19, 20.29],
    ["49x19.0-20", 34, "bias", 245, 55700, 215, 83550, 49, 19, 20.29],
    ["H49x19.0-22", 32, "bias", 235, 56600, 205, 84900, 49, 19, 20.2],
    ["50x20.0-20", 34, "bias", 225, 57000, 205, 85500, 50, 20, 20.64],
    ["50x20.0R22", 32, "radial", 235, 57100, 220, 85650, 51.75, 20.8, 20.83],
    ["1270x455R22", 34, "radial", 235, 59800, 254, 87900, 51.55, 18.75, 20.5],
    ["50x20.0R22", 34, "radial", 235, 61525, 235, 97550, 51.75, 20.8, 20.83],
    ["52x20.5-20", 36, "bias", 225, 62500, 200, 93750, 52, 20.5, 21.29],
    ["52x20.5-23", 30, "bias", 235, 63700, 195, 95500, 52, 20.5, 21.29],
    ["52x21.0R22", 36, "radial", 245, 66500, 227, 99750, 53.85, 21.85, 21.6],
    ["52x21.0R22", 38, "radial", 245, 68000, 236, 102000, 53.85, 21.85, 21.6],
    ["54x21.0-23", 36, "bias", 235, 68500, 223, 102750, 54, 21, 22.5],
    ["54x21.0R23", 30, "radial", 235, 71200, 236, 106800, 55.85, 21.85, 22.55],
    ["H54x21.0-24", 36, "bias", 235, 72200, 212, 104700, 54, 21, 22.2],
    ["56x16", 38, "metric", 217, 76000, 315, 114000, 55.9, 16.2, 24]
  ];
  X.TIRES = RAW.map(function (r, i) { return { id: i, size: r[0], ply: r[1], kind: r[2], speed: r[3], load: r[4], psi: r[5], brake: r[6], OD: r[7], W: r[8], SLR: r[9] }; });
  X.label = function (t) { return t ? t.size + ', ' + t.ply + ' ply' : '—'; };
  X.tire = function (size, ply) {
    var best = null;
    X.TIRES.forEach(function (t) { if (t.size === size && t.ply === ply && (!best || t.speed > best.speed)) best = t; });
    return best;
  };
  X.byKey = function (key) { if (!key) return null; var p = String(key).split('|'); return X.tire(p[0], +p[1]); };
  X.key = function (t) { return t ? t.size + '|' + t.ply : ''; };

  // statistical size: diameter or width (in) = A Ww^B, Ww the load on each wheel (lb)
  X.STAT = {
    ga: { label: 'General aviation', D: [1.51, 0.349], W: [0.7150, 0.312] },
    twin: { label: 'Business twin', D: [2.69, 0.251], W: [1.170, 0.216] },
    transport: { label: 'Transport or bomber', D: [1.63, 0.315], W: [0.1043, 0.480] },
    fighter: { label: 'Jet fighter or trainer', D: [1.59, 0.302], W: [0.0980, 0.467] }
  };
  X.tireStat = function (Ww, cls) { var s = X.STAT[cls || 'twin']; return { D: s.D[0] * Math.pow(Ww, s.D[1]), W: s.W[0] * Math.pow(Ww, s.W[1]) }; };

  /* ---------- Gear geometry and loads ---------- */
  // stations x aft of the nose (m): nose gear xn, main gear xm, forward and aft CG xf, xa; h = CG height above the ground
  X.loads = function (o) {
    var B = o.xm - o.xn, a = o.decel == null ? 0.31 : o.decel, n = o.legs || 2, W = o.W;
    var mainTot = W * (o.xa - o.xn) / B;
    return { B: B, mainTot: mainTot, mainLeg: mainTot / n, noseMax: W * (o.xm - o.xf) / B, noseMin: W * (o.xm - o.xa) / B,
      noseBrake: W * ((o.xm - o.xf) + a * o.h) / B, shareFwd: (o.xm - o.xf) / B, shareAft: (o.xm - o.xa) / B };
  };
  X.tipBack = function (xm, xa, h) { return Math.atan2(xm - xa, h) / D2R; };
  X.tipOver = function (xn, xm, ym, xcg, h) {
    var dl = Math.atan2(ym, xm - xn), d = (xcg - xn) * Math.sin(dl);
    return { psi: Math.atan2(h, d) / D2R, delta: dl / D2R, d: d };
  };
  X.minHalfTrack = function (xn, xm, xcg, h, psiMax) {
    var d = h / Math.tan((psiMax || 63) * D2R), s = d / (xcg - xn);
    return s >= 1 ? Infinity : (xm - xn) * Math.tan(Math.asin(s));
  };

  /* ---------- Tire selection ---------- */
  // need = {load: lb on each main tire, perAxle: wheels on one axle} or {nose: true, load: static lb, brake: braking lb};
  // speed: the rated speed needed (mph). Main tires on multiple-wheel axles may carry 1.07 times the rating, and a nose
  // tire 1.5 times its rating in the braking condition (CS/FAR 25.733); pmax caps the inflation at the actual load (psi).
  X.carries = function (t, need) {
    if (need.speed && t.speed < need.speed) return false;
    if (need.pmax && X.inflation(t, need.load) > need.pmax + 1e-9) return false;
    if (need.nose) return t.load >= need.load && 1.5 * t.load >= (need.brake || 0);
    return t.load * ((need.perAxle || 1) > 1 ? 1.07 : 1) >= need.load;
  };
  X.selectTire = function (need) {
    return X.TIRES.filter(function (t) { return X.carries(t, need); })
      .sort(function (a, b) { return a.OD - b.OD || a.load - b.load || a.W - b.W; });
  };
  X.inflation = function (t, load) { return t.psi * load / t.load; };          // inflation reduced in proportion to the load
  X.contactArea = function (t) { return t.load / t.psi; };                      // in², at any inflation proportional to the load
  X.deflection = function (t) { return (t.OD / 2 - t.SLR) * IN; };              // m, at the rated load and inflation

  /* ---------- Shock absorbers ---------- */
  // kinetic energy of the vertical speed V absorbed by strut and tire at a gear load N W (lift = weight):
  //   (1/2)(W/g) V² = N W (eta S + etaT ST)  =>  S = V²/(2 g eta N) − (etaT/eta) ST, plus a margin
  X.stroke = function (o) {
    var V = o.V == null ? 10 * 0.3048 : o.V, eta = o.eta || 0.8, N = o.N || 3, eT = o.etaT == null ? 0.47 : o.etaT, ST = o.ST || 0;
    var S0 = V * V / (2 * g * eta * N) - eT / eta * ST, m = o.margin == null ? IN : o.margin;
    return { h: V * V / (2 * g), S0: S0, S: S0 + m, margin: m };
  };
  X.oleo = function (L, P) {
    var p = P || 1800 * PSI, dp = Math.sqrt(4 * L / (Math.PI * p));
    return { dp: dp, D: 1.3 * dp };
  };

  /* ---------- Standard atmosphere and the cabin ---------- */
  X.isaT = function (h) { return h <= 11000 ? 288.15 - 0.0065 * h : 216.65; };
  X.isaP = function (h) { return h <= 11000 ? 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588) : 22632.06 * Math.exp(-(h - 11000) / 6341.62); };
  X.cabin = function (hFlight, hCabin) {
    var p = X.isaP(hFlight), pc = X.isaP(hCabin == null ? 8000 * 0.3048 : hCabin);
    return { p: p, pc: pc, dp: Math.max(0, pc - p) };
  };
  X.freshAir = function (n) { return n * 0.55 * 0.45359237 / 60; };
  X.compression = function (m, p1, p2, T1, eff) { return m * 1005 * T1 * (Math.pow(p2 / p1, 0.4 / 1.4) - 1) / (eff || 1); };
  X.actuator = function (F, p) { var A = F / p; return { A: A, bore: Math.sqrt(4 * A / Math.PI) }; };

  /* ---------- Presets for the Landing Gear Designer ---------- */
  // layout: a LAYOUT preset; cg: forward and aft CG, % of the MAC; zcg: CG height above the fuselage axis (m);
  // xn, xm: nose and main gear stations; ym: half track; hb: static height of the fuselage bottom above the ground;
  // legs, mainWheels (per leg), noseWheels; thTD: required tail-down angle; speed: tire speed needed (mph); pmax: highest inflation (psi);
  // V: limit descent velocity (m/s); N: gear load factor; eta: shock-absorber efficiency; cls: tire statistics class
  X.PRESETS = [
    { id: 'bizjet', label: 'Business jet (this module)', layout: 'bizjet', W0: 6943, cg: [15, 35], zcg: -0.10, xn: 1.80, xm: 7.65, ym: 1.60, hb: 0.50,
      legs: 2, mainWheels: 1, noseWheels: 1, thTD: 12, speed: 160, pmax: 200, V: 10 * 0.3048, N: 3, eta: 0.80, cls: 'twin', mainTire: 'H22x8.25-10|14', noseTire: '18x4.4|10' },
    { id: 'narrow', label: 'Narrow-body airliner, 150 seats (illustrative)', layout: 'narrow', W0: 73500, cg: [15, 35], zcg: -0.45, xn: 4.6, xm: 17.3, ym: 3.8, hb: 2.30,
      legs: 2, mainWheels: 2, noseWheels: 2, thTD: 11, speed: 210, pmax: 200, V: 10 * 0.3048, N: 2, eta: 0.85, cls: 'transport', mainTire: null, noseTire: null },
    { id: 'tprop', label: 'Regional turboprop, 72 seats (illustrative)', layout: 'tprop', W0: 23000, cg: [15, 35], zcg: 0.25, xn: 2.6, xm: 12.0, ym: 2.05, hb: 0.75,
      legs: 2, mainWheels: 2, noseWheels: 2, thTD: 9, speed: 160, pmax: 120, V: 10 * 0.3048, N: 2.5, eta: 0.80, cls: 'transport', mainTire: null, noseTire: null },
    { id: 'commuter', label: 'Commuter turboprop, 18 seats (illustrative)', layout: 'commuter', W0: 7700, cg: [15, 35], zcg: -0.05, xn: 1.5, xm: 8.0, ym: 2.40, hb: 1.40,
      legs: 2, mainWheels: 2, noseWheels: 1, thTD: 11, speed: 160, pmax: 90, V: 10 * 0.3048, N: 3, eta: 0.80, cls: 'twin', mainTire: null, noseTire: null }
  ];
  X.preset = function (id) { for (var i = 0; i < X.PRESETS.length; i++) if (X.PRESETS[i].id === id) return JSON.parse(JSON.stringify(X.PRESETS[i])); return null; };

  /* ---------- The layout check ---------- */
  X.evaluate = function (sp) {
    var LA = global.LAYOUT, lay = LA.evaluate(LA.preset(sp.layout)), G = lay.G, w = G.wing, pf = w.pf, e = G.eng;
    var R = { sp: sp, lay: lay, G: G };
    R.macLE = w.xAc - 0.25 * pf.mac; R.mac = pf.mac;
    R.xf = R.macLE + sp.cg[0] / 100 * pf.mac; R.xa = R.macLE + sp.cg[1] / 100 * pf.mac;
    R.zg = -(G.r + sp.hb); R.h = sp.zcg - R.zg; R.zcg = sp.zcg;
    R.W = sp.W0 * g;
    var ld = R.loads = X.loads({ W: R.W, xn: sp.xn, xm: sp.xm, xf: R.xf, xa: R.xa, h: R.h, legs: sp.legs });
    R.B = ld.B;
    // tail-down angle: the lowest line from the main wheels' contact to the fuselage and nacelles behind them
    var td = { a: 90, pt: null }, i, x;
    function tryPt(px, pz) { var dx = px - sp.xm; if (dx < 0.05) return; var a = Math.atan2(pz - R.zg, dx) / D2R; if (a < td.a) td = { a: a, pt: [px, pz] }; }
    for (i = 0; i <= 240; i++) { x = sp.xm + (G.lF - sp.xm) * i / 240; tryPt(x, G.zBot(x)); }
    if (e.kind === 'rear') { tryPt(e.x - e.l / 2, e.z - e.D / 2); tryPt(e.x + e.l / 2, e.z - 0.3 * e.D); }
    if (e.kind === 'wing' && !e.prop) tryPt(e.x + e.l / 2, e.z - 0.3 * e.D);
    R.tailDown = td.a; R.tailPt = td.pt;
    R.tipBack = X.tipBack(sp.xm, R.xa, R.h);
    R.tipOverF = X.tipOver(sp.xn, sp.xm, sp.ym, R.xf, R.h); R.tipOverA = X.tipOver(sp.xn, sp.xm, sp.ym, R.xa, R.h);
    R.tipOver = Math.max(R.tipOverF.psi, R.tipOverA.psi);
    R.minTrack = 2 * X.minHalfTrack(sp.xn, sp.xm, R.xf, R.h, 63);
    // bank to touch the ground, about the main wheels: wing tip, nacelle, propeller tip
    var pts = [{ id: 'tip', y: pf.b / 2, z: w.z + pf.b / 2 * Math.tan(w.dih) - 0.5 * w.tc * pf.ct }];
    if (e.kind === 'wing') { pts.push({ id: 'nacelle', y: e.y, z: e.z - e.D / 2 }); if (e.prop) pts.push({ id: 'prop', y: e.y, z: e.z - e.prop / 2 }); }
    R.bank = { a: 90, id: null };
    pts.forEach(function (q) { if (q.y > sp.ym + 0.05) { var a = Math.atan2(q.z - R.zg, q.y - sp.ym) / D2R; if (a < R.bank.a) R.bank = { a: a, id: q.id, y: q.y, z: q.z }; } });
    R.engClear = e.kind === 'wing' ? e.z - e.D / 2 - R.zg : null;
    R.propClear = e.prop ? (e.kind === 'nose' ? G.tipZ : e.z) - e.prop / 2 - R.zg : null;
    // tires
    R.perMain = ld.mainLeg / sp.mainWheels / LBF; R.perNose = ld.noseMax / sp.noseWheels / LBF; R.perBrake = ld.noseBrake / sp.noseWheels / LBF;
    R.needMain = { load: R.perMain, perAxle: sp.mainWheels, speed: sp.speed, pmax: sp.pmax };
    R.needNose = { nose: true, load: R.perNose, brake: R.perBrake, speed: sp.speed, pmax: sp.pmax };
    R.candMain = X.selectTire(R.needMain); R.candNose = X.selectTire(R.needNose);
    R.tMain = sp.mainTire ? X.byKey(sp.mainTire) : R.candMain[0] || null;
    R.tNose = sp.noseTire ? X.byKey(sp.noseTire) : R.candNose[0] || null;
    R.okMain = !!R.tMain && X.carries(R.tMain, R.needMain); R.okNose = !!R.tNose && X.carries(R.tNose, R.needNose);
    R.statMain = X.tireStat(R.perMain, sp.cls); R.statNose = X.tireStat(R.perNose, sp.cls);
    R.psiMain = R.tMain ? X.inflation(R.tMain, R.perMain) : NaN; R.psiNose = R.tNose ? X.inflation(R.tNose, R.perNose) : NaN;
    R.ST = R.tMain ? X.deflection(R.tMain) : 0;
    R.stroke = X.stroke({ V: sp.V, eta: sp.eta, N: sp.N, ST: R.ST });
    R.oleoMain = X.oleo(ld.mainLeg); R.oleoNose = X.oleo(ld.noseBrake);
    R.oleoLength = 2.5 * R.stroke.S;
    R.rMain = R.tMain ? R.tMain.OD / 2 * IN : 0.25; R.rNose = R.tNose ? R.tNose.OD / 2 * IN : 0.2;
    R.checks = [
      { id: 'td', label: 'Tail-down angle', value: R.tailDown, limit: sp.thTD, ok: R.tailDown >= sp.thTD - 1e-9, rule: '≥ ' + sp.thTD + '°' },
      { id: 'tb', label: 'Tip-back angle, aft CG', value: R.tipBack, limit: Math.max(15, R.tailDown), ok: R.tipBack >= 15 - 1e-9 && R.tipBack >= R.tailDown - 1e-9, rule: '≥ 15° and ≥ tail-down' },
      { id: 'nf', label: 'Nose share, forward CG', value: 100 * ld.shareFwd, limit: 20, ok: ld.shareFwd <= 0.20, rule: '8–15%, at most 20%' },
      { id: 'na', label: 'Nose share, aft CG', value: 100 * ld.shareAft, limit: 5, ok: ld.shareAft >= 0.05, rule: '8–15%, at least 5%' },
      { id: 'to', label: 'Lateral tip-over angle', value: R.tipOver, limit: 63, ok: R.tipOver <= 63, rule: '≤ 63°' },
      { id: 'bk', label: 'Bank to touch the ground', value: R.bank.a, limit: 5, ok: R.bank.a >= 5, rule: '> 5°' },
      { id: 'tm', label: 'Main tire load', value: R.perMain, limit: R.tMain ? R.tMain.load * (sp.mainWheels > 1 ? 1.07 : 1) : 0, ok: R.okMain, rule: 'rated load' + (sp.mainWheels > 1 ? ' × 1.07' : '') + ', speed, ≤ ' + sp.pmax + ' psi' },
      { id: 'tn', label: 'Nose tire, static and braking', value: R.perNose, limit: R.tNose ? R.tNose.load : 0, ok: R.okNose, rule: 'rated load; braking ≤ 1.5 × rated; ≤ ' + sp.pmax + ' psi' }
    ];
    if (R.engClear != null && !e.prop) R.checks.push({ id: 'ec', label: 'Nacelle ground clearance', value: R.engClear, limit: 0.25 * e.D, ok: R.engClear >= 0.25 * e.D, rule: '≈ 0.25 × fan diameter' });
    if (R.propClear != null) R.checks.push({ id: 'pc', label: 'Propeller ground clearance', value: R.propClear, limit: 7 * IN, ok: R.propClear >= 7 * IN, rule: '≥ 7 in (0.18 m)' });
    R.ok = R.checks.every(function (c) { return c.ok; });
    return R;
  };

  /* ---------- Drawings (CYL2D groups; x station, z up from the fuselage axis, y to the right) ---------- */
  var COL = { tire: 'ink', strut: 'muted', cg: 'bad', ground: 'muted' };
  X.COLORS = COL;
  function wheelSide(g, x, zg, rr, o) {
    g.circle({ center: [x, zg + rr], r: rr, color: COL.tire, width: 1.6, fill: 'ink', fillOpacity: 0.55 });
    g.circle({ center: [x, zg + rr], r: 0.45 * rr, color: 'surface', width: 1, fill: 'surface', fillOpacity: 0.5 });
  }
  function cgMark(g, x, z, rr, o) {
    g.circle({ center: [x, z], r: rr, color: o && o.color || COL.cg, width: 1.4, fill: 'surface', fillOpacity: 0.9 });
    g.polyline([[x, z], [x + rr, z], [x + rr * Math.cos(0.5), z + rr * Math.sin(0.5)]].concat(arcPts(x, z, rr, 0, Math.PI / 2)).concat([[x, z]]), { color: o && o.color || COL.cg, width: 0, closed: true, fill: o && o.color || COL.cg, fillOpacity: 0.9 });
    g.polyline([[x, z]].concat(arcPts(x, z, rr, Math.PI, 1.5 * Math.PI)).concat([[x, z]]), { color: o && o.color || COL.cg, width: 0, closed: true, fill: o && o.color || COL.cg, fillOpacity: 0.9 });
  }
  function arcPts(cx, cz, rr, a0, a1) { var P = []; for (var i = 0; i <= 8; i++) { var a = a0 + (a1 - a0) * i / 8; P.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]); } return P; }
  X.cgMark = cgMark;
  // side view: the airframe, the ground, the wheels and struts, the CG range; o = {at, cabin, cg (true), ground (true), retracted}
  X.drawSide = function (g, R, o) {
    o = o || {}; var at = o.at || [0, 0], sp = R.sp, G = R.G;
    function T(p) { return [p[0] + at[0], p[1] + at[1]]; }
    var gg = g.group(), gl = g.group();
    global.LAYOUT.drawSide(gl, G, { at: at, cabin: o.cabin === true });
    var zg = R.zg + at[1];
    if (o.ground !== false) gg.line(T([-0.04 * G.lF, R.zg]), T([1.04 * G.lF, R.zg]), { color: COL.ground, width: 1.6 });
    if (!o.retracted) {
      var zTopM = G.wing && G.sp && sp.layout !== 'tprop' ? Math.max(G.wing.z, -G.r) : -G.r + 0.25 * G.r;
      gg.line(T([sp.xm, R.zg + R.rMain]), T([sp.xm - 0.15 * R.rMain, zTopM]), { color: COL.strut, width: 3 });
      gg.line(T([sp.xn, R.zg + R.rNose]), T([sp.xn, G.zBot(sp.xn) + 0.05 * G.r]), { color: COL.strut, width: 2.6 });
      wheelSide(gg, sp.xm + at[0], zg, R.rMain); wheelSide(gg, sp.xn + at[0], zg, R.rNose);
    }
    if (o.cg !== false) { var rc = Math.max(0.09, 0.012 * G.lF); cgMark(gg, R.xf + at[0], R.zcg + at[1], rc); cgMark(gg, R.xa + at[0], R.zcg + at[1], rc); }
    return gg;
  };
  // front view, seen from ahead: o = {at}
  X.drawFront = function (g, R, o) {
    o = o || {}; var at = o.at || [0, 0], sp = R.sp, G = R.G;
    function T(p) { return [p[0] + at[0], p[1] + at[1]]; }
    var gg = g.group();
    global.LAYOUT.drawFront(g, G, { at: at });
    var yb = Math.max(G.wing ? G.wing.pf.b / 2 : G.r, G.r) * 1.04;
    gg.line(T([-yb, R.zg]), T([yb, R.zg]), { color: COL.ground, width: 1.6 });
    var wm = (R.tMain ? R.tMain.W : 8) * IN, wn = (R.tNose ? R.tNose.W : 5) * IN, nW = sp.mainWheels, gap = 0.25 * wm;
    [1, -1].forEach(function (s) {
      var zTop = G.wing && sp.layout !== 'tprop' ? G.wing.z + sp.ym * Math.tan(G.wing.dih) - 0.4 * G.wing.tc * G.wing.pf.cr : -G.r + 0.2 * G.r;
      gg.line(T([s * sp.ym, R.zg + R.rMain]), T([s * sp.ym, zTop]), { color: COL.strut, width: 3 });
      for (var k = 0; k < nW; k++) {
        var yc = s * sp.ym + (k - (nW - 1) / 2) * (wm + gap);
        gg.polyline([[yc - wm / 2, R.zg], [yc + wm / 2, R.zg], [yc + wm / 2, R.zg + 2 * R.rMain], [yc - wm / 2, R.zg + 2 * R.rMain]].map(T), { color: COL.tire, width: 1.4, closed: true, fill: 'ink', fillOpacity: 0.55 });
      }
    });
    for (var k = 0; k < sp.noseWheels; k++) {
      var yc = (k - (sp.noseWheels - 1) / 2) * (wn + 0.25 * wn);
      gg.polyline([[yc - wn / 2, R.zg], [yc + wn / 2, R.zg], [yc + wn / 2, R.zg + 2 * R.rNose], [yc - wn / 2, R.zg + 2 * R.rNose]].map(T), { color: COL.tire, width: 1.2, closed: true, fill: 'ink', fillOpacity: 0.4 });
    }
    return gg;
  };
  // top view (half or full): the wheel footprints and the tip-over lines; o = {at, half, flip, lines (true)}
  X.drawTop = function (g, R, o) {
    o = o || {}; var at = o.at || [0, 0], sp = R.sp, G = R.G, fl = o.flip ? -1 : 1;
    function T(p) { return [p[0] + at[0], fl * p[1] + at[1]]; }
    global.LAYOUT.drawTop(g, G, { at: at, half: !!o.half, flip: !!o.flip });
    var gg = g.group(), sides = o.half ? [1] : [1, -1];
    var dm = 2 * R.rMain, wm = (R.tMain ? R.tMain.W : 8) * IN, dn = 2 * R.rNose, wn = (R.tNose ? R.tNose.W : 5) * IN;
    function box(x, y, l, w) { return [[x - l / 2, y - w / 2], [x + l / 2, y - w / 2], [x + l / 2, y + w / 2], [x - l / 2, y + w / 2]].map(T); }
    sides.forEach(function (s) {
      for (var k = 0; k < sp.mainWheels; k++) gg.polyline(box(sp.xm, s * sp.ym + (k - (sp.mainWheels - 1) / 2) * 1.25 * wm, dm, wm), { color: COL.tire, width: 1.2, closed: true, fill: 'ink', fillOpacity: 0.55 });
      if (o.lines !== false) gg.line(T([sp.xn, 0]), T([sp.xm, s * sp.ym]), { color: 'bad', width: 1.4, dashed: true });
    });
    for (var k = 0; k < sp.noseWheels; k++) gg.polyline(box(sp.xn, (k - (sp.noseWheels - 1) / 2) * 1.25 * wn, dn, wn), { color: COL.tire, width: 1.2, closed: true, fill: 'ink', fillOpacity: 0.55 });
    return gg;
  };
  // a three-view with the gear: side view on top, half top view under the ground line, front view to the right
  X.threeView = function (plane, g, R, o) {
    o = o || {}; var G = R.G, E = global.LAYOUT.extents(G), gap = o.gap || 0.06 * (E.x[1] - E.x[0]);
    var yb = Math.max(E.y, R.sp.ym + 0.3);
    var side = [0, 0], top = [0, R.zg - gap], front = [E.x[1] + gap + yb, 0];
    X.drawSide(g, R, { at: side, cg: o.cg });
    X.drawTop(g, R, { at: top, half: true, flip: true });
    X.drawFront(g, R, { at: front });
    var xr = [E.x[0] - 0.02 * G.lF, front[0] + yb], yr = [top[1] - E.y - 0.02 * G.lF, E.z[1] + 0.02 * G.lF];
    return { side: side, top: top, front: front, E: E, xRange: xr, yRange: yr,
      S: function (x, z) { return [x + side[0], z + side[1]]; }, T: function (x, y) { return [x + top[0], -y + top[1]]; }, F: function (y, z) { return [y + front[0], z + front[1]]; } };
  };

  global.GEAR = X;
})(typeof window !== 'undefined' ? window : this);
