'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  ASSETS_DIR,
  INDEX_HTML_PATH,
  CSS_PATH,
  EXPECTED_CAR_IDS,
  EXPECTED_REGION_IDS,
  loadSimModules,
  makeInput,
  assertFiniteNumber,
  assertFiniteState,
  stepTicks,
  normalizeCameraTarget,
} = require('./helpers/sim_harness');
const { createBrowserEnv, parseIndexHtml } = require('./helpers/dom_mock');

function findControlEl(doc, idPatterns, textPattern) {
  for (const pat of idPatterns) {
    const byId = doc.getElementById(pat);
    if (byId) return byId;
  }
  const all = doc.querySelectorAll('button, div, span, svg, canvas, input, label');
  for (const el of all) {
    const id = (el.id || '').toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const txt = (el.textContent || '').trim();
    if (idPatterns.some((p) => id.includes(p) || cls.includes(p) || aria.includes(p))) {
      return el;
    }
    if (textPattern && textPattern.test(txt)) {
      return el;
    }
  }
  return null;
}

function bootAppEnv(opts = {}) {
  const env = createBrowserEnv({
    htmlPath: INDEX_HTML_PATH,
    assetsDir: ASSETS_DIR,
    ...opts,
  });
  env.loadAllIndexScripts({ dispatchDomReady: true });
  assert.equal(env.errors.length, 0, `Unexpected boot errors: ${JSON.stringify(env.errors)}`);
  return env;
}

function readLiveInput(env) {
  const Controls = env.window.H6 && env.window.H6.Controls;
  assert.ok(Controls, 'H6.Controls must exist');
  if (typeof Controls.getInput === 'function') return Controls.getInput();
  if (typeof Controls.getState === 'function') return Controls.getState();
  if (Controls.input) return Controls.input;
  assert.fail('H6.Controls must expose getInput()');
}

function setSteerMode(env, mode) {
  const Controls = env.window.H6 && env.window.H6.Controls;
  assert.ok(Controls, 'H6.Controls must exist');
  if (typeof Controls.setSteerMode === 'function') {
    Controls.setSteerMode(mode);
    return;
  }
  const map = {
    wheel: [['steer-mode-wheel', 'mode-wheel', 'btn-steer-wheel'], /руль/i],
    buttons: [['steer-mode-buttons', 'mode-buttons', 'btn-steer-buttons'], /кнопк/i],
    gyro: [['steer-mode-gyro', 'mode-gyro', 'btn-steer-gyro'], /гиро/i],
  };
  const [ids, rx] = map[mode];
  const btn = findControlEl(env.document, ids, rx);
  assert.ok(btn, `Control for steerMode=${mode} not found`);
  btn.click();
}

describe('Tier 1 — Feature Area 1: 5 Selectable Cars, Specs & Safe Switching (F2.1, F2.2, F2.4)', () => {
  it('1.1 exports exact 5 frozen car IDs and getCarById resolves each cleanly', () => {
    const { CARS, getCarById } = loadSimModules();
    assert.equal(CARS.length, 5);
    assert.deepEqual(
      CARS.map((c) => c.id),
      EXPECTED_CAR_IDS
    );
    for (const id of EXPECTED_CAR_IDS) {
      const found = getCarById(id);
      assert.ok(found && found.id === id, `getCarById(${id}) failed`);
    }
    const missing = getCarById('nonexistent_id_xyz');
    assert.ok(missing === null || missing === undefined, 'Unknown ID should return null/undefined');
  });

  it('1.2 every car has Russian metadata, distinct bodyStyle, colors, statsDisplay & camera config', () => {
    const { CARS } = loadSimModules();
    const styles = new Set();
    const primaries = new Set();
    for (const car of CARS) {
      assert.match(car.nameRu, /[А-Яа-яЁё]/, `${car.id}.nameRu must contain Cyrillic`);
      assert.match(car.subtitleRu, /[А-Яа-яЁё]/, `${car.id}.subtitleRu must contain Cyrillic`);
      assert.match(car.categoryRu, /[А-Яа-яЁё]/, `${car.id}.categoryRu must contain Cyrillic`);
      assert.ok(['coupe', 'fastback', 'sedan', 'hyper', 'suv'].includes(car.bodyStyle));
      styles.add(car.bodyStyle);
      assert.ok(car.colors && car.colors.primary && car.colors.secondary && car.colors.accent && car.colors.caliper);
      primaries.add(car.colors.primary.toLowerCase());
      for (const k of ['speed', 'accel', 'grip', 'drift', 'offroad']) {
        assertFiniteNumber(car.statsDisplay[k], `${car.id}.statsDisplay.${k}`);
        assert.ok(car.statsDisplay[k] >= 0 && car.statsDisplay[k] <= 100);
      }
      for (const k of ['hoodY', 'hoodZ', 'chaseDist', 'chaseHeight']) {
        assertFiniteNumber(car.camera[k], `${car.id}.camera.${k}`);
      }
    }
    assert.equal(styles.size, 5, 'All 5 cars must have distinct body styles');
    assert.equal(primaries.size, 5, 'All 5 cars must have distinct primary colors');
  });

  it('1.3 all 5 cars have differentiated physics profiles matching vehicle archetypes', () => {
    const { CARS, getCarById } = loadSimModules();
    const skyline = getCarById('skyline_gtr');
    const rx7 = getCarById('rx7_drift');
    const evo = getCarById('evo_touge');
    const lfa = getCarById('lfa_hyper');
    const jimny = getCarById('jimny_raid');

    const topSpeeds = new Set(CARS.map((c) => c.physics.maxSpeedKmh));
    const masses = new Set(CARS.map((c) => c.physics.mass));
    assert.equal(topSpeeds.size, 5, 'All 5 cars must have distinct top speeds');
    assert.equal(masses.size, 5, 'All 5 cars must have distinct masses');

    assert.ok(lfa.physics.maxSpeedKmh > skyline.physics.maxSpeedKmh, 'LFA Hyper must out-top Skyline');
    assert.ok(skyline.physics.maxSpeedKmh > jimny.physics.maxSpeedKmh, 'Skyline must out-top Jimny');
    assert.ok(jimny.physics.offRoadGrip > evo.physics.offRoadGrip, 'Jimny must have highest offRoadGrip');
    assert.ok(evo.physics.offRoadGrip > lfa.physics.offRoadGrip, 'Evo must outperform LFA off-road');
    assert.ok(rx7.physics.driftSlip < jimny.physics.driftSlip, 'RX-7 drift coupe must have looser driftSlip');
    assert.equal(rx7.physics.drivetrain, 'RWD');
    assert.equal(lfa.physics.drivetrain, 'RWD');
    assert.equal(skyline.physics.drivetrain, 'AWD');
    assert.equal(evo.physics.drivetrain, 'AWD');
    assert.equal(jimny.physics.drivetrain, '4WD');
  });

  it('1.4 straight-line acceleration simulation produces faster peak speed for lfa_hyper than jimny_raid', () => {
    const { Physics } = loadSimModules();
    const lfaSim = Physics.createSimulation('lfa_hyper');
    const jimnySim = Physics.createSimulation('jimny_raid');

    // Run both from Spawn Point (0, 0, 50) straight North along Central Boulevard
    stepTicks(Physics, lfaSim, makeInput({ throttle: 1, nitro: true }), 420);
    stepTicks(Physics, jimnySim, makeInput({ throttle: 1, nitro: true }), 420);

    assert.ok(lfaSim.player.speedKmh > 190, `LFA should exceed 190 km/h (got ${lfaSim.player.speedKmh})`);
    assert.ok(
      lfaSim.player.speedKmh > jimnySim.player.speedKmh + 60,
      `LFA (${lfaSim.player.speedKmh}) should be much faster than Jimny (${jimnySim.player.speedKmh})`
    );
  });

  it('1.5 off-road grass driving penalizes lfa_hyper significantly more than jimny_raid', () => {
    const { WorldData, Physics } = loadSimModules();
    const lfaSim = Physics.createSimulation('lfa_hyper');
    const jimnySim = Physics.createSimulation('jimny_raid');

    // Find a flat open grass spot away from roads
    const grassSpots = [
      { x: 520, z: 520 },
      { x: 350, z: -550 },
      { x: -120, z: 450 },
    ];
    let spot = grassSpots.find((pt) => WorldData.getSurfaceInfo(pt.x, pt.z).surface === 'grass');
    if (!spot) {
      for (let x = 200; x <= 700; x += 40) {
        for (let z = 200; z <= 700; z += 40) {
          if (WorldData.getSurfaceInfo(x, z).surface === 'grass') {
            spot = { x, z };
            break;
          }
        }
        if (spot) break;
      }
    }
    assert.ok(spot, 'Must locate a grass surface coordinate in world');

    for (const sim of [lfaSim, jimnySim]) {
      sim.player.x = spot.x;
      sim.player.z = spot.z;
      sim.player.y = WorldData.getTerrainHeight(spot.x, spot.z);
      sim.player.heading = 0;
    }

    stepTicks(Physics, lfaSim, makeInput({ throttle: 1 }), 300);
    stepTicks(Physics, jimnySim, makeInput({ throttle: 1 }), 300);

    const lfaRatio = lfaSim.player.speedKmh / 340;
    const jimnyRatio = jimnySim.player.speedKmh / 195;
    assert.ok(
      jimnyRatio > lfaRatio + 0.15,
      `Jimny grass retention (${jimnyRatio.toFixed(2)}) should clearly exceed LFA (${lfaRatio.toFixed(2)})`
    );
  });

  it('1.6 switchCar mid-drive updates activeCarId, clears transient velocity/drift, and yields zero NaNs', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');

    stepTicks(Physics, state, makeInput({ throttle: 1, steer: 0.4, handbrake: true }), 120);
    const savedX = state.player.x;
    const savedZ = state.player.z;

    for (const nextId of ['rx7_drift', 'evo_touge', 'lfa_hyper', 'jimny_raid', 'skyline_gtr']) {
      Physics.switchCar(state, nextId);
      assert.equal(state.activeCarId, nextId);
      assert.ok(Math.abs(state.player.x - savedX) < 15, 'Position should be preserved near switch point');
      assert.ok(Math.abs(state.player.z - savedZ) < 15, 'Position should be preserved near switch point');
      assert.ok(Math.abs(state.player.speedMs) < 1e-6, 'Transient speedMs should reset on car switch');
      assert.equal(state.player.isDrifting, false, 'Active drift should clear on car switch');
      assert.equal(state.scoring.driftPoints, 0, 'Unbanked driftPoints should clear on car switch');
      assertFiniteState(state, `after switchCar(${nextId})`);
      stepTicks(Physics, state, makeInput({ throttle: 0.8 }), 30);
    }
  });
});

describe('Tier 1 — Feature Area 2: 4 Japan Regions, Terrain & Surface Lookup (F1.1–F1.5)', () => {
  it('2.1 defines WORLD_HALF_SIZE=1000, PLAYABLE_BOUND=960, SPAWN_POINT=(0,0,50), FUJI_PEAK=(-760,-760,320)', () => {
    const { WorldData } = loadSimModules();
    assert.equal(WorldData.WORLD_HALF_SIZE, 1000);
    assert.equal(WorldData.PLAYABLE_BOUND, 960);
    assert.equal(WorldData.SPAWN_POINT.x, 0);
    assert.equal(WorldData.SPAWN_POINT.z, 50);
    assert.equal(WorldData.SPAWN_POINT.heading, 0);
    assert.equal(WorldData.FUJI_PEAK.x, -760);
    assert.equal(WorldData.FUJI_PEAK.z, -760);
    assert.equal(WorldData.FUJI_PEAK.height, 320);
  });

  it('2.2 defines all 4 Japan regions with Russian names and resolves each via getSurfaceInfo', () => {
    const { WorldData } = loadSimModules();
    assert.equal(WorldData.REGIONS.length, 4);
    assert.deepEqual(
      WorldData.REGIONS.map((r) => r.id),
      EXPECTED_REGION_IDS
    );

    const probes = [
      { id: 'festival', x: 0, z: 40, nameRx: /ФЕСТИВАЛЬ/i },
      { id: 'tokyo', x: -120, z: -460, nameRx: /ТОКИО/i },
      { id: 'sakura', x: 450, z: 80, nameRx: /САКУР/i },
      { id: 'touge', x: -500, z: 500, nameRx: /ФУДЗИ|ТОУГЭ/i },
    ];
    for (const p of probes) {
      const info = WorldData.getSurfaceInfo(p.x, p.z);
      assert.equal(info.regionId, p.id);
      assert.match(info.regionNameRu, p.nameRx);
    }
  });

  it('2.3 terrain heights accurately reflect flat Hub, 320m Mt. Fuji cone, and elevated Touge switchbacks', () => {
    const { WorldData } = loadSimModules();
    const hubH = WorldData.getTerrainHeight(0, 50);
    assert.ok(Math.abs(hubH) < 1.0, `Festival Hub should be flat near y=0 (got ${hubH})`);

    const fujiH = WorldData.getTerrainHeight(-760, -760);
    assert.ok(fujiH >= 280 && fujiH <= 330, `Mt. Fuji peak should reach ~320m (got ${fujiH})`);

    // Sample Touge roads/region to confirm real vertical elevation (> 20m)
    let maxTougeRoadH = 0;
    for (const road of WorldData.ROADS) {
      for (const pt of road.points) {
        if (pt.x < -180 && pt.z > 120) {
          const h = WorldData.getTerrainHeight(pt.x, pt.z);
          if (h > maxTougeRoadH) maxTougeRoadH = h;
        }
      }
    }
    assert.ok(maxTougeRoadH >= 35, `Touge switchback roads must climb above 35m (got ${maxTougeRoadH})`);
  });

  it('2.4 getSurfaceInfo classifies asphalt/dirt/grass, unit normals, and non-empty Tokyo/Hub BUILDINGS', () => {
    const { WorldData } = loadSimModules();
    assert.ok(Array.isArray(WorldData.ROADS) && WorldData.ROADS.length >= 3);
    assert.ok(Array.isArray(WorldData.BUILDINGS) && WorldData.BUILDINGS.length >= 10);

    // Sample a road midpoint
    const asphaltRoad = WorldData.ROADS.find((r) => r.surface === 'asphalt');
    assert.ok(asphaltRoad && asphaltRoad.points.length >= 2);
    const roadInfo = WorldData.getSurfaceInfo(asphaltRoad.points[0].x, asphaltRoad.points[0].z);
    assert.equal(roadInfo.surface, 'asphalt');
    assert.equal(roadInfo.onRoad, true);
    const normLen = Math.hypot(roadInfo.normal.x, roadInfo.normal.y, roadInfo.normal.z);
    assert.ok(Math.abs(normLen - 1) < 0.05, `Surface normal must be unit length (got ${normLen})`);

    // Confirm a dirt road or trail exists and resolves as 'dirt' along its span
    const dirtRoad = WorldData.ROADS.find((r) => r.surface === 'dirt');
    assert.ok(dirtRoad && dirtRoad.points.length >= 2, 'WorldData.ROADS should include dirt trail');
    const hasDirtSurface = dirtRoad.points.some(
      (pt) => WorldData.getSurfaceInfo(pt.x, pt.z).surface === 'dirt'
    );
    assert.equal(hasDirtSurface, true, 'Dirt road points must resolve to dirt surface');
  });

  it('2.5 findNearestRoadPoint & resetPlayer place car cleanly back onto road with finite state', () => {
    const { WorldData, Physics } = loadSimModules();
    const roadPt = WorldData.findNearestRoadPoint(412, -315);
    assertFiniteNumber(roadPt.x, 'roadPt.x');
    assertFiniteNumber(roadPt.y, 'roadPt.y');
    assertFiniteNumber(roadPt.z, 'roadPt.z');
    assertFiniteNumber(roadPt.heading, 'roadPt.heading');
    assert.equal(WorldData.getSurfaceInfo(roadPt.x, roadPt.z).onRoad, true);

    const state = Physics.createSimulation('skyline_gtr');
    state.player.x = 650;
    state.player.z = 650;
    state.player.vx = 25;
    state.player.vz = -18;
    Physics.resetPlayer(state);
    assertFiniteState(state, 'after resetPlayer');
    assert.ok(Math.abs(state.player.speedMs) < 1e-6);
    assert.equal(WorldData.getSurfaceInfo(state.player.x, state.player.z).onRoad, true);
  });
});

describe('Tier 1 — Feature Area 3: AT / MT / Reverse Transmission (F3.3)', () => {
  it('3.1 AT accelerates from gear 1 and automatically upshifts through >= 3 gears', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('lfa_hyper');
    state.player.x = 180;
    state.player.z = -460;
    state.player.heading = Math.PI / 2;

    let maxGearSeen = 1;
    stepTicks(
      Physics,
      state,
      (_i, s) => {
        if (s.player.gear > maxGearSeen) maxGearSeen = s.player.gear;
        return makeInput({ throttle: 1, transmissionMode: 'AT' });
      },
      360
    );
    assert.ok(maxGearSeen >= 3, `AT must auto-upshift to >= gear 3 (max seen: ${maxGearSeen})`);
    assert.ok(state.player.rpm >= 900 && state.player.rpm <= 9500);
  });

  it('3.2 AT automatically downshifts when braking/decelerating from high speed', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    state.player.x = 180;
    state.player.z = -460;
    state.player.heading = Math.PI / 2;

    stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'AT' }), 300);
    const highGear = state.player.gear;
    assert.ok(highGear >= 3, `Expected gear >= 3 before braking (got ${highGear})`);

    stepTicks(Physics, state, makeInput({ brake: 0.85, transmissionMode: 'AT' }), 150);
    assert.ok(state.player.gear < highGear, `AT must downshift from ${highGear} (now ${state.player.gear})`);
  });

  it('3.3 AT engages Reverse (-1) when stopped + brake held, moving backward, then returns to 1 on throttle', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');

    stepTicks(Physics, state, makeInput({ brake: 1, transmissionMode: 'AT' }), 60);
    assert.equal(state.player.gear, -1, 'Holding brake from rest in AT must engage Reverse (-1)');
    assert.ok(state.player.z > 50.5, `Car facing -Z should move toward +Z in reverse (z=${state.player.z})`);

    stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'AT' }), 90);
    assert.ok(state.player.gear >= 1, `Throttle from reverse must shift back to forward gear (got ${state.player.gear})`);
  });

  it('3.4 MT holds selected gear without auto-upshifting and obeys shiftUpRequested / shiftDownRequested', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    state.transmissionMode = 'MT';

    // Drive in gear 1 for 3s without requesting upshift -> must stay in gear 1
    stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'MT' }), 180);
    assert.equal(state.player.gear, 1, 'MT must NOT auto-upshift');

    // Edge-trigger shift up 1 -> 2 -> 3
    stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'MT', shiftUpRequested: true }), 1);
    assert.equal(state.player.gear, 2);
    stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'MT', shiftUpRequested: true }), 1);
    assert.equal(state.player.gear, 3);

    // Edge-trigger shift down 3 -> 2
    stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'MT', shiftDownRequested: true }), 1);
    assert.equal(state.player.gear, 2);
  });

  it('3.5 MT Neutral (0) revs engine freely on throttle without propelling the vehicle forward', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('rx7_drift');
    // Shift 1 -> 0 (Neutral)
    stepTicks(Physics, state, makeInput({ transmissionMode: 'MT', shiftDownRequested: true }), 1);
    assert.equal(state.player.gear, 0, 'Shifting down from gear 1 in MT must reach Neutral (0)');

    const startZ = state.player.z;
    stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'MT' }), 60);
    assert.ok(state.player.rpm > 3500, `Neutral throttle should rev engine (rpm=${state.player.rpm})`);
    assert.ok(state.player.speedKmh < 1.0, `Neutral must not accelerate car (speed=${state.player.speedKmh})`);
    assert.ok(Math.abs(state.player.z - startZ) < 0.2);
  });
});

describe('Tier 1 — Feature Area 4: Steering Modes, Pedals & Nitro (F3.1, F3.2)', () => {
  it('4.1 physics sign convention: steer > 0 turns LEFT (heading+, vx<0), steer < 0 turns RIGHT (heading-, vx>0)', () => {
    const { Physics } = loadSimModules();

    const leftSim = Physics.createSimulation('skyline_gtr');
    stepTicks(Physics, leftSim, makeInput({ throttle: 0.8 }), 60);
    stepTicks(Physics, leftSim, makeInput({ throttle: 0.8, steer: 1.0 }), 30);
    assert.ok(leftSim.player.heading > 0.1, `steer=+1 must increase heading (got ${leftSim.player.heading})`);
    assert.ok(leftSim.player.vx < -0.5, `Turning left from -Z must produce vx < 0 (got ${leftSim.player.vx})`);

    const rightSim = Physics.createSimulation('skyline_gtr');
    stepTicks(Physics, rightSim, makeInput({ throttle: 0.8 }), 60);
    stepTicks(Physics, rightSim, makeInput({ throttle: 0.8, steer: -1.0 }), 30);
    assert.ok(rightSim.player.heading < -0.1, `steer=-1 must decrease heading (got ${rightSim.player.heading})`);
    assert.ok(rightSim.player.vx > 0.5, `Turning right from -Z must produce vx > 0 (got ${rightSim.player.vx})`);
  });

  it('4.2 nitro activates boost, consumes reserve, raises speed over baseline, and recharges when released', () => {
    const { Physics } = loadSimModules();
    const baseSim = Physics.createSimulation('skyline_gtr');
    const nitroSim = Physics.createSimulation('skyline_gtr');
    for (const s of [baseSim, nitroSim]) {
      s.player.x = 180;
      s.player.z = -460;
      s.player.heading = Math.PI / 2;
    }

    stepTicks(Physics, baseSim, makeInput({ throttle: 1, nitro: false }), 150);
    stepTicks(Physics, nitroSim, makeInput({ throttle: 1, nitro: true }), 150);

    assert.equal(nitroSim.player.isNitroActive, true);
    assert.ok(nitroSim.player.nitro < 95, `Nitro should be consumed (got ${nitroSim.player.nitro})`);
    assert.ok(
      nitroSim.player.speedKmh > baseSim.player.speedKmh + 8,
      `Nitro speed (${nitroSim.player.speedKmh}) should exceed non-nitro (${baseSim.player.speedKmh})`
    );

    const depleted = nitroSim.player.nitro;
    stepTicks(Physics, nitroSim, makeInput({ throttle: 0.5, nitro: false }), 120);
    assert.ok(nitroSim.player.nitro > depleted, 'Nitro should recharge when released');
  });

  it('4.3 brake sets isBraking and decelerates faster than coasting; handbrake triggers slip', () => {
    const { Physics } = loadSimModules();
    const coastSim = Physics.createSimulation('evo_touge');
    const brakeSim = Physics.createSimulation('evo_touge');
    for (const s of [coastSim, brakeSim]) {
      stepTicks(Physics, s, makeInput({ throttle: 1 }), 180);
    }
    stepTicks(Physics, coastSim, makeInput({}), 45);
    stepTicks(Physics, brakeSim, makeInput({ brake: 1 }), 45);
    assert.equal(brakeSim.player.isBraking, true);
    assert.ok(brakeSim.player.speedKmh < coastSim.player.speedKmh - 20);

    const driftSim = Physics.createSimulation('rx7_drift');
    stepTicks(Physics, driftSim, makeInput({ throttle: 1 }), 180);
    stepTicks(Physics, driftSim, makeInput({ throttle: 0.7, steer: 1.0, handbrake: true }), 30);
    assert.ok(Math.abs(driftSim.player.slipAngleDeg) > 10, `Handbrake turn should create slip (got ${driftSim.player.slipAngleDeg})`);
  });

  it('4.4 controls.js supports switching across all 3 steering modes (wheel default -> buttons -> gyro)', () => {
    const env = bootAppEnv();
    const initial = readLiveInput(env);
    assert.equal(initial.steerMode, 'wheel', 'Default steering mode must be wheel');

    setSteerMode(env, 'buttons');
    assert.equal(readLiveInput(env).steerMode, 'buttons');

    setSteerMode(env, 'gyro');
    assert.equal(readLiveInput(env).steerMode, 'gyro');

    setSteerMode(env, 'wheel');
    assert.equal(readLiveInput(env).steerMode, 'wheel');
  });

  it('4.5 controls.js wheel drag & buttons map counter-clockwise/left to steer > 0 and clockwise/right to steer < 0', () => {
    const env = bootAppEnv();
    const wheelEl = findControlEl(env.document, ['steer-wheel', 'steering-wheel', 'wheel-pad', 'wheel'], null);
    assert.ok(wheelEl, 'Steering wheel element must exist in DOM');
    const rect = wheelEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Counter-clockwise drag (left turn -> steer > 0)
    wheelEl.dispatchEvent(new env.window.PointerEvent('pointerdown', { pointerId: 1, clientX: cx, clientY: cy - 55, bubbles: true }));
    wheelEl.dispatchEvent(new env.window.PointerEvent('pointermove', { pointerId: 1, clientX: cx - 55, clientY: cy, bubbles: true }));
    env.tickRaf(3);
    assert.ok(readLiveInput(env).steer > 0.2, `Wheel CCW drag must yield steer > 0 (got ${readLiveInput(env).steer})`);

    // Release and allow spring return
    wheelEl.dispatchEvent(new env.window.PointerEvent('pointerup', { pointerId: 1, clientX: cx - 55, clientY: cy, bubbles: true }));
    env.tickRaf(45);
    assert.ok(Math.abs(readLiveInput(env).steer) < 0.2, 'Wheel must spring back toward 0 on release');

    // Buttons mode
    setSteerMode(env, 'buttons');
    const leftBtn = findControlEl(env.document, ['btn-steer-left', 'steer-left', 'btn-left'], /^[◀◄<]$/);
    const rightBtn = findControlEl(env.document, ['btn-steer-right', 'steer-right', 'btn-right'], /^[▶►>]$/);
    assert.ok(leftBtn && rightBtn, 'Left and Right steering buttons must exist');

    leftBtn.dispatchEvent(new env.window.PointerEvent('pointerdown', { pointerId: 2, bubbles: true }));
    env.tickRaf(20);
    assert.ok(readLiveInput(env).steer > 0.3, `Left button must yield steer > 0 (got ${readLiveInput(env).steer})`);
    leftBtn.dispatchEvent(new env.window.PointerEvent('pointerup', { pointerId: 2, bubbles: true }));

    rightBtn.dispatchEvent(new env.window.PointerEvent('pointerdown', { pointerId: 3, bubbles: true }));
    env.tickRaf(25);
    assert.ok(readLiveInput(env).steer < -0.3, `Right button must yield steer < 0 (got ${readLiveInput(env).steer})`);
    rightBtn.dispatchEvent(new env.window.PointerEvent('pointerup', { pointerId: 3, bubbles: true }));
  });

  it('4.6 controls.js gyro mode reads AndroidBridge.getTilt() and maps to steer', () => {
    const env = bootAppEnv({ includeAndroidBridge: true });
    setSteerMode(env, 'gyro');
    env.androidBridgeState.tilt = 0.7;
    env.tickRaf(5);
    const steerLeft = readLiveInput(env).steer;
    assert.ok(Math.abs(steerLeft) > 0.25, `Gyro tilt=0.7 should produce non-zero steer (got ${steerLeft})`);

    env.androidBridgeState.tilt = -0.7;
    env.tickRaf(5);
    const steerRight = readLiveInput(env).steer;
    assert.ok(steerLeft * steerRight < 0, 'Opposite gyro tilt must invert steer sign');
  });
});

describe('Tier 1 — Feature Area 5: Cameras, Drift, Speed Traps, Bonus Boards & AI Traffic (F1.6–F1.9, F3.4)', () => {
  it('5.1 computeCameraTarget returns valid chase (behind car) and hood (near hood) targets', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    stepTicks(Physics, state, makeInput({ throttle: 1 }), 90);

    const chase = normalizeCameraTarget(Physics.computeCameraTarget(state, 'chase'));
    const hood = normalizeCameraTarget(Physics.computeCameraTarget(state, 'hood'));

    const chaseDist = Math.hypot(chase.pos.x - state.player.x, chase.pos.z - state.player.z);
    const hoodDist = Math.hypot(hood.pos.x - state.player.x, hood.pos.z - state.player.z);

    assert.ok(chaseDist > 4.0, `Chase camera should be behind car (dist=${chaseDist})`);
    assert.ok(chase.pos.y > state.player.y + 1.2, 'Chase camera should be elevated above ground');
    assert.ok(hoodDist < 2.5, `Hood camera should be mounted near car hood (dist=${hoodDist})`);
    assert.ok(chase.fov >= 50 && chase.fov <= 105);
    assert.ok(hood.fov >= 50 && hood.fov <= 105);
  });

  it('5.2 drift skill chain accumulates points, reaches >=2x multiplier, and banks CR after timeout', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('rx7_drift');
    // Build speed on flat road then sustain wide drift
    stepTicks(Physics, state, makeInput({ throttle: 1 }), 180);

    let sawDrift = false;
    let maxMult = 1;
    stepTicks(
      Physics,
      state,
      (i, s) => {
        if (s.player.isDrifting) sawDrift = true;
        if (s.scoring.driftMultiplier > maxMult) maxMult = s.scoring.driftMultiplier;
        // Oscillate steering slightly + throttle to hold sustained drift slide
        const steer = i % 50 < 40 ? 0.9 : 0.4;
        return makeInput({ throttle: 0.9, steer, handbrake: i < 20 });
      },
      240
    );

    assert.ok(sawDrift, 'Player must enter drifting state during high-speed slide');
    assert.ok(state.scoring.driftPoints > 200 || state.scoring.totalDriftsBanked > 0, 'Must accumulate drift points');

    // Coast straight for 3.5s so bank timer completes
    const bankEvents = stepTicks(Physics, state, makeInput({ throttle: 0.4, steer: 0 }), 220);
    assert.ok(state.scoring.totalDriftsBanked >= 1, 'Drift chain must bank after timeout');
    assert.ok(state.scoring.cr > 0, 'Banking drift must award CR');
    assert.ok(
      bankEvents.some((e) => e.type === 'drift_bank'),
      'Must emit drift_bank event'
    );
  });

  it('5.3 4 speed trap radar gates exist and driving through one captures speed, updates record & CR', () => {
    const { WorldData, Physics } = loadSimModules();
    assert.equal(WorldData.SPEED_TRAPS.length, 4);

    const state = Physics.createSimulation('lfa_hyper');
    const trap = WorldData.SPEED_TRAPS[0];
    const fwdX = -Math.sin(trap.heading);
    const fwdZ = -Math.cos(trap.heading);

    // Place car 45m behind gate facing straight through it at speed
    state.player.x = trap.x - fwdX * 45;
    state.player.z = trap.z - fwdZ * 45;
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.heading = trap.heading;
    state.player.vx = fwdX * 45;
    state.player.vz = fwdZ * 45;
    state.player.speedMs = 45;
    state.player.speedKmh = 45 * 3.6;

    const events = stepTicks(Physics, state, makeInput({ throttle: 1, nitro: true }), 120);
    assert.ok(
      events.some((e) => e.type === 'speed_trap'),
      'Crossing speed trap gate must emit speed_trap event'
    );
    assert.ok(state.scoring.speedTrapBestKmh > 100, 'Must record captured trap speed');
    assert.ok(state.scoring.lastSpeedTrapKmh > 100);
    assert.ok(state.scoring.cr > 0, 'Speed trap crossing must award CR');
  });

  it('5.4 24 smashable bonus boards exist across all 4 regions and smashing increments smashedCount & CR', () => {
    const { WorldData, Physics } = loadSimModules();
    assert.equal(WorldData.BONUS_TARGETS.length, 24);
    const regionsCovered = new Set(WorldData.BONUS_TARGETS.map((t) => t.regionId));
    assert.equal(regionsCovered.size, 4, '24 bonus boards must span all 4 Japan regions');

    const state = Physics.createSimulation('skyline_gtr');
    const target = state.targets[0];
    assert.equal(target.collected, false);

    // Drive directly through target
    state.player.x = target.x;
    state.player.z = target.z + 10;
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.heading = 0;
    state.player.vx = 0;
    state.player.vz = -18;

    const events = stepTicks(Physics, state, makeInput({ throttle: 0.6 }), 60);
    assert.equal(state.targets[0].collected, true, 'Target must be marked collected');
    assert.equal(state.scoring.smashedCount, 1);
    assert.ok(state.scoring.cr >= target.valueCr, 'CR must increase by target valueCr');
    assert.ok(events.some((e) => e.type === 'target_smash'), 'Must emit target_smash event');
  });

  it('5.5 12 AI traffic & rival vehicles progress along closed circuits over multi-second simulation', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    assert.equal(state.aiTraffic.length, 12, 'Must spawn 12 AI vehicles');
    assert.ok(state.aiTraffic.some((a) => a.isRival === true), 'Must include Horizon rivals');
    assert.ok(state.aiTraffic.some((a) => a.isRival === false), 'Must include civilian traffic');

    const initialPos = state.aiTraffic.map((a) => ({ x: a.x, z: a.z }));
    stepTicks(Physics, state, makeInput({}), 300); // 5 seconds

    let movedCount = 0;
    for (let i = 0; i < state.aiTraffic.length; i++) {
      const dist = Math.hypot(state.aiTraffic[i].x - initialPos[i].x, state.aiTraffic[i].z - initialPos[i].z);
      if (dist > 10) movedCount++;
    }
    assert.equal(movedCount, 12, `All 12 AI vehicles should move >10m in 5s (moved=${movedCount})`);
  });

  it('5.6 player collision with AI traffic transfers elastic impulse and emits collision event without NaN', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('jimny_raid');
    const ai = state.aiTraffic[0];

    // Place player 14m behind AI vehicle moving straight into it at high relative speed
    const fwdX = -Math.sin(ai.heading);
    const fwdZ = -Math.cos(ai.heading);
    state.player.x = ai.x - fwdX * 12;
    state.player.z = ai.z - fwdZ * 12;
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.heading = ai.heading;
    state.player.vx = fwdX * 40;
    state.player.vz = fwdZ * 40;
    state.player.speedMs = 40;

    const events = stepTicks(Physics, state, makeInput({ throttle: 1 }), 45);
    assert.ok(events.some((e) => e.type === 'collision'), 'Player-AI impact must emit collision event');
    assertFiniteState(state, 'after AI collision');
  });

  it('5.7 colliding with a world building deflects/stops player safely without NaN', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    const b = WorldData.BUILDINGS[0];
    assert.ok(b, 'WorldData.BUILDINGS must have entries');

    // Aim straight at building center from just outside its South (+Z) wall
    state.player.x = b.x;
    state.player.z = b.z + b.d / 2 + 12;
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.heading = 0; // -Z toward building
    state.player.vx = 0;
    state.player.vz = -32;

    const events = stepTicks(Physics, state, makeInput({ throttle: 1 }), 60);
    assert.ok(events.some((e) => e.type === 'collision'), 'Building impact must emit collision event');
    assert.ok(
      Math.abs(state.player.x - b.x) >= b.w / 2 - 1 || Math.abs(state.player.z - b.z) >= b.d / 2 - 1,
      'Player must not tunnel cleanly inside building footprint'
    );
    assertFiniteState(state, 'after building collision');
  });
});

describe('Tier 1 — Feature Area 6: Russian HUD (index.html) & Procedural Audio API (F1.10, F1.11)', () => {
  it('6.1 index.html loads offline classic scripts (no type="module", three.min.js first) and CSS sets touch-action: none', () => {
    assert.ok(fs.existsSync(INDEX_HTML_PATH), 'index.html must exist');
    assert.ok(fs.existsSync(CSS_PATH), 'css/style.css must exist');

    const { scriptTags } = parseIndexHtml(INDEX_HTML_PATH);
    assert.ok(scriptTags.length >= 6, 'index.html must load modular game scripts');
    for (const tag of scriptTags) {
      assert.notEqual(tag.type, 'module', `ES modules are disallowed in offline WebView: ${tag.raw}`);
      assert.ok(tag.src && !/^https?:/i.test(tag.src), `Script src must be local offline path: ${tag.src}`);
    }
    const threeIdx = scriptTags.findIndex((t) => t.src.includes('three.min.js'));
    assert.equal(threeIdx, 0, 'vendor/three.min.js must be the first <script> loaded');

    const css = fs.readFileSync(CSS_PATH, 'utf8');
    assert.match(css, /touch-action\s*:\s*none/i, 'CSS must enforce touch-action: none for multi-touch');
  });

  it('6.2 index.html contains required Russian Horizon HUD labels, pedals, menus & minimap canvas', () => {
    const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
    const requiredLabels = [
      /км\/ч/i,
      /ОБ\/МИН|RPM/i,
      /CR/i,
      /РЕКОРД/i,
      /СТЕНДЫ/i,
      /ГАЗ/i,
      /ТОРМОЗ/i,
      /РУЧНИК/i,
      /НИТРО/i,
      /Гараж/i,
      /Камера/i,
      /Звук/i,
      /Меню/i,
      /АКПП|МКПП/i,
      /Руль/i,
      /Кнопки/i,
      /Гироскоп/i,
      /Сброс|Вернуться на дорогу/i,
    ];
    for (const rx of requiredLabels) {
      assert.match(html, rx, `index.html missing Russian HUD text matching ${rx}`);
    }
    assert.match(html, /<canvas\b/i, 'index.html must contain canvas elements for 3D / minimap');
  });

  it('6.3 H6.Audio exposes complete frozen API and initializes/unlocks with AudioContext', () => {
    const env = bootAppEnv();
    const Audio = env.window.H6 && env.window.H6.Audio;
    assert.ok(Audio, 'H6.Audio must be exported');
    for (const fn of [
      'init',
      'unlock',
      'updateContinuous',
      'triggerEvent',
      'setMuted',
      'toggleMute',
      'isMuted',
      'setAppPaused',
    ]) {
      assert.equal(typeof Audio[fn], 'function', `H6.Audio.${fn} must be a function`);
    }
    Audio.init();
    Audio.unlock();
    assert.equal(typeof Audio.isMuted(), 'boolean');
  });

  it('6.4 H6.Audio setMuted / toggleMute / isMuted state transitions work accurately', () => {
    const env = bootAppEnv();
    const Audio = env.window.H6.Audio;
    Audio.init();

    Audio.setMuted(true);
    assert.equal(Audio.isMuted(), true);

    const afterToggle = Audio.toggleMute();
    assert.equal(afterToggle, false);
    assert.equal(Audio.isMuted(), false);

    Audio.toggleMute();
    assert.equal(Audio.isMuted(), true);
  });

  it('6.5 H6.Audio updateContinuous, triggerEvent, and setAppPaused execute cleanly without errors', () => {
    const env = bootAppEnv();
    const Audio = env.window.H6.Audio;
    const { Physics } = loadSimModules();
    const sim = Physics.createSimulation('skyline_gtr');
    Audio.init();
    Audio.unlock();

    sim.player.rpm = 5400;
    sim.player.isDrifting = true;
    sim.player.isNitroActive = true;
    sim.player.speedKmh = 145;
    Audio.updateContinuous(sim.player);

    for (const type of ['speed_trap', 'target_smash', 'collision', 'gear_shift', 'drift_bank']) {
      Audio.triggerEvent({ type, speedKmh: 210, valueCr: 2500 });
    }
    Audio.setAppPaused(true);
    Audio.updateContinuous(sim.player);
    Audio.setAppPaused(false);
    assert.equal(env.errors.length, 0);
  });
});
