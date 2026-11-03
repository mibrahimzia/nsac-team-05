# Lunar Survival

A browser-based lunar outpost survival simulator built with React, TypeScript, Three.js, and Vite. Players manage a two-person crew's modeled life support and electrical systems, explore a procedurally generated lunar training scene as an astronaut, drive a rover across a synthetic terrain map, collect science observations, and submit a mission report.

## Run locally

```bash
npm install
npm run dev
```

The development server listens on the local network. On another device connected to the same Wi-Fi or LAN, open `http://<computer-ip>:5173/` (for example, `http://10.24.94.78:5173/`). If the page cannot be reached, allow Node.js through the computer's private-network firewall and confirm both devices are on the same network.

Create a production build with `npm run build`. To preview that build on the local network, run `npm run preview` and open `http://<computer-ip>:4173/` from another device.

## Publish on GitHub Pages

1. Create a GitHub repository for this project and push the project files to its `main` branch.
2. In the repository, open **Settings → Pages** and set the build/deployment source to **GitHub Actions**.
3. The included workflow builds and publishes the app on every push to `main`. Once the workflow succeeds, GitHub shows the public site URL in the Pages settings and deployment.

The Vite build automatically uses the repository's Pages path, so project sites (for example `https://owner.github.io/repository/`) and user sites (`https://owner.github.io/`) both work. GitHub Pages serves a public website; do not put secrets or private information in the app.

## Play

- Choose a fictional 12 h training day, an accelerated 24 h light / 24 h dark low-latitude cycle, or a polar-ridge long-light scenario, then start a new mission.
- Complete the habitat and initial system checks from Mission Control.
- Use the time controls to pause, resume, change the acceleration rate, or advance one fixed simulation second.
- Open Surface Map and choose **Third-person EVA** to explore the terrain on foot. Use WASD/arrows to move, Ctrl to run, Shift to sprint, Space to jump, C to crouch, mouse look to rotate the camera, Q to switch camera shoulder, and E to use nearby equipment, the airlock, or science targets. Tab opens suit inventory; M opens local waypoints; Escape pauses.
- Prepare the suit inside the habitat, use the airlock to begin an EVA, and service suit oxygen, water, battery, and thermal condition at the habitat terminal. Walking, running, sprinting, and jumping affect modeled suit resource use.
- Switch to **Rover map & controls** to drive with WASD, arrow keys, the on-screen pad, or a map waypoint. Collect observations in either surface mode, return to the habitat, and submit the mission report.
- Collect at least two observations, route back to the habitat, and submit the mission report.
- Visit Life Support to prioritize systems, run failure drills, or review the power, atmosphere, and water balances.
- Save and load a mission locally in the current browser.

## Simulation model and limits

All telemetry, terrain, event scenarios, and experiment results are generated training data. They are not actual NASA measurements, operational procedures, medical guidance, or mission predictions. NASA does not endorse this project.

| Model | Implementation / assumption |
|---|---|
| Gravity | Lunar surface gravity is modeled as 1.62 m/s². |
| Astronaut controller | The Three.js scene uses a 60 Hz fixed-step character update, 1.5 / 2.5 / 3.5 m/s walk / run / sprint speeds, a 2.2 m/s jump impulse, terrain slope and rock collision checks, and procedural astronaut, habitat, rover, and science-site geometry. The camera and terrain are training-game representations, not surveyed assets. |
| EVA suit | Activity-dependent oxygen, CO₂, battery, heat, and hydration rates are educational estimates. Habitat service transfers modeled resources only while the crew is inside and the habitat has usable power and stores. |
| Simulation time | Deterministic one-second fixed steps; elapsed real time is accumulated and the per-frame update count is bounded. The single-step control advances exactly one model second. |
| Rover | A 760 kg rover uses lunar gravity, slope force (`m × g × sin(θ)`), a 0.09 empirical resistance coefficient, a terrain traction/slip factor, a 2.8 m/s speed limit, 0.68 drivetrain efficiency, and a 90 W auxiliary load. The drive-force ceiling is 650 N. It omits detailed wheel-soil mechanics and is not a real rover performance prediction. |
| Habitat atmosphere | An 82 m³ fixed-volume cabin uses ideal-gas inventories for cabin oxygen, inert gas, and CO₂. Initial total pressure is 70.3 kPa and the modeled initial oxygen fraction is 21%. Tank oxygen replenishes crew consumption until depleted. A scripted leak removes a simplified mixed-gas flow. |
| Crew resources | Two crew consume approximately 0.84 kg O₂ per person per day, 4.75 kg water per person per day, 1.04 kg CO₂ per person per day, and 1.04 kg food per person per day. The recycler returns 76% of simulated wastewater; the CO₂ scrubber capacity is 2.07 kg/day. These are game rates, not a life-support design basis. |
| Power | Solar output uses a 4.1 kW peak array multiplied by scheduled illumination and cleanliness. Loads are tracked in watts and the 84 kWh battery in watt-hours. Electrolysis is modeled at 1.2 kW. Charge/discharge behavior and system efficiencies are simplified. |
| Illumination | Training uses an explicitly fictional 24-hour light/dark cycle; the low-latitude scenario uses an accelerated 48-hour cycle; the polar scenario has a longer light window with a synthetic local-horizon attenuation factor. These are not a universal lunar day or a particular real landing site. Lunar illumination varies by location and terrain. |
| Thermal | A single 22 MJ/K habitat thermal node uses a first-order Euler energy balance, Stefan–Boltzmann radiation (emissivity 0.82, effective radiator area 1.8 m²), an illustrative environment temperature, internal loads, and heater control. External air convection is not modeled. |
| Radiation | The scenario uses a 0.0432 mSv/hour background estimate and multiplies the rate by five during modeled EVA. This is a fictional learning parameter, not a forecast or health assessment. |
| Science | Observations are synthetic and intentionally report uncertainty. A shadow observation does not establish a water-ice discovery. |

These are educational engineering approximations with stated limitations; the application is not a spacecraft control system. Three.js renders the interactive surface scene locally; no external character or terrain assets are used.
