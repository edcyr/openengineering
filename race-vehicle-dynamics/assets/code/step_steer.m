% Step-steer simulation of the linear bicycle model (Race Vehicle Dynamics, Lesson 6.2).
% Explicit Euler integration with a fixed time step. SAE signs: positive = right turn.

% --- Car: the club racer used throughout the course ---
m  = 750;                     % mass, kg
L  = 2.45;                    % wheelbase, m
wf = 0.52;                    % static front weight fraction, b/L
a  = L*(1 - wf);              % CG to front axle, m
b  = L*wf;                    % CG to rear axle, m
Iz = 0.85*m*a*b;              % yaw inertia from a dynamic index of 0.85, kg m^2
Cf = 2000*180/pi;             % front axle cornering stiffness, N/rad (2000 N/deg)
Cr = 3000*180/pi;             % rear axle cornering stiffness, N/rad (3000 N/deg)

% --- Test ---
V      = 90/3.6;              % speed, m/s
delta0 = 1*pi/180;            % steer step at the road wheels, rad
h      = 0.005;               % time step, s
T      = 1.5;                 % simulated time, s

n = round(T/h) + 1;
t = (0:n-1)*h;
beta = zeros(1, n);  r = zeros(1, n);  ay = zeros(1, n);
for k = 1:n
    alpha_f = beta(k) + a*r(k)/V - delta0;     % slip angles (Lesson 0.2)
    alpha_r = beta(k) - b*r(k)/V;
    Fyf = -Cf*alpha_f;                         % linear tires (Lesson 2.1)
    Fyr = -Cr*alpha_r;
    beta_dot = (Fyf + Fyr)/(m*V) - r(k);       % m V (beta' + r) = Fyf + Fyr
    r_dot    = (a*Fyf - b*Fyr)/Iz;             % Iz r' = a Fyf - b Fyr
    ay(k) = V*(beta_dot + r(k))/9.81;          % lateral acceleration, g
    if k < n                                   % explicit Euler step
        beta(k+1) = beta(k) + h*beta_dot;
        r(k+1)    = r(k)    + h*r_dot;
    end
end

% Steady state from Lesson 5.3: r/delta = (V/L) / (1 + K V^2/L)
K    = (m/L)*(b/Cf - a/Cr);
r_ss = delta0*180/pi*(V/L)/(1 + K*V^2/L);
rdeg = r*180/pi;
t90  = t(find(rdeg >= 0.9*r_ss, 1));
fprintf('steady yaw rate  %6.2f deg/s\n', r_ss);
fprintf('time to 90%%      %6.0f ms   (first step at or above 90%%)\n', t90*1000);
fprintf('overshoot        %6.1f %%\n', max(0, max(rdeg) - r_ss)/r_ss*100);

subplot(2,1,1); plot(t, rdeg, t, r_ss*ones(size(t)), '--');
ylabel('yaw rate r (deg/s)'); legend('Euler', 'steady state');
subplot(2,1,2); plot(t, ay);
xlabel('time after the step (s)'); ylabel('lateral acceleration (g)');
