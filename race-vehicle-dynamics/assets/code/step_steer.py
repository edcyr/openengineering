"""
Step-steer simulation of the linear bicycle model (Race Vehicle Dynamics, Lesson 6.2).

Explicit Euler integration with a fixed time step. SAE signs: positive = right turn.
Runs with plain Python 3; it also plots the response if matplotlib is installed.
"""
import math

# --- Car: the club racer used throughout the course -------------------------
m = 750.0                        # mass, kg
L = 2.45                         # wheelbase, m
wf = 0.52                        # static front weight fraction, b/L
a = L * (1 - wf)                 # CG to front axle, m
b = L * wf                       # CG to rear axle, m
Iz = 0.85 * m * a * b            # yaw inertia from a dynamic index of 0.85, kg m^2
Cf = 2000 * 180 / math.pi        # front axle cornering stiffness, N/rad (2000 N/deg)
Cr = 3000 * 180 / math.pi        # rear axle cornering stiffness, N/rad (3000 N/deg)

# --- Test ----------------------------------------------------------------------
V = 90 / 3.6                     # speed, m/s
delta0 = math.radians(1.0)       # steer step at the road wheels, rad
h = 0.005                        # time step, s
T = 1.5                          # simulated time, s


def derivatives(beta, r, delta):
    """Return (beta_dot, r_dot) from the lateral and yaw equations of motion."""
    alpha_f = beta + a * r / V - delta      # slip angles (Lesson 0.2)
    alpha_r = beta - b * r / V
    Fyf = -Cf * alpha_f                     # linear tires (Lesson 2.1)
    Fyr = -Cr * alpha_r
    beta_dot = (Fyf + Fyr) / (m * V) - r    # m V (beta' + r) = Fyf + Fyr
    r_dot = (a * Fyf - b * Fyr) / Iz        # Iz r' = a Fyf - b Fyr
    return beta_dot, r_dot


t, beta, r = 0.0, 0.0, 0.0
times, yaw_rates, lat_accs = [], [], []
while t <= T + 1e-12:
    beta_dot, r_dot = derivatives(beta, r, delta0)
    times.append(t)
    yaw_rates.append(math.degrees(r))
    lat_accs.append(V * (beta_dot + r) / 9.81)   # a_y = V (beta' + r), in g
    beta += h * beta_dot                         # explicit Euler step
    r += h * r_dot
    t += h

# Steady state from Lesson 5.3: r/delta = (V/L) / (1 + K V^2/L)
K = (m / L) * (b / Cf - a / Cr)
r_ss = math.degrees(delta0) * (V / L) / (1 + K * V**2 / L)

t90 = next(tt for tt, rr in zip(times, yaw_rates) if rr >= 0.9 * r_ss)
peak = max(yaw_rates)
print(f"steady yaw rate  {r_ss:6.2f} deg/s")
print(f"time to 90%      {t90 * 1000:6.0f} ms   (first step at or above 90%)")
print(f"overshoot        {max(0.0, peak - r_ss) / r_ss * 100:6.1f} %")

try:
    import matplotlib.pyplot as plt
except ImportError:
    print("Install matplotlib to plot the response.")
else:
    fig, (ax1, ax2) = plt.subplots(2, 1, sharex=True, figsize=(7, 6))
    ax1.plot(times, yaw_rates, label="Euler")
    ax1.axhline(r_ss, linestyle="--", label="steady state")
    ax1.set_ylabel("yaw rate r (deg/s)")
    ax1.legend()
    ax2.plot(times, lat_accs)
    ax2.set_xlabel("time after the step (s)")
    ax2.set_ylabel("lateral acceleration (g)")
    fig.suptitle(f"Step steer: {math.degrees(delta0):.1f} deg at {V * 3.6:.0f} km/h, h = {h * 1000:.0f} ms")
    plt.show()
