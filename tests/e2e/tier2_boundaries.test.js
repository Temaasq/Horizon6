'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ASSETS_DIR,
  INDEX_HTML_PATH,
  EXPECTED_CAR_IDS,
  loadSimModules,
  makeInput,
  assertFiniteNumber,
  assertFiniteState,
  stepTicks,
} = require('./helpers/sim_harness');
const { createBrowserEnv } = require('./helpers/dom_mock');

function bootEnv(opts = {}) {
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

function findBtn(doc, idList, textRx) {
  for (const id of idList) {
    const el = doc.getElementById(id);
    if (el) return el;
  }
  for (const el of doc.querySelectorAll('button, div, span, label')) {
    const id = (el.id || '').toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const txt = (el.textContent || '').trim();
    if (idList.some((p) => id.includes(p) || cls.includes(p))) return el;
    if (textRx && textRx.test(txt)) return el;
  }
  return null;
}

describe('Tier 2 — Area A: dt Spikes, World Perimeter Bounds & Extreme Mt. Fuji Terrain', () => {
  it('A.1 dt spike clamping (dt=5.0 and dt=100.0) prevents teleportation and NaN explosion', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('lfa_hyper');
    stepTicks(Physics, state, makeInput({ throttle: 1 }), 60);
    const beforeZ = state.player.z;

    // Massive background-resume dt spike
    Physics.stepSimulation(state, makeInput({ throttle: 1, steer: 0.5, nitro: true }), 5.0);
    assertFiniteState(state, 'after dt=5.0 spike');
    const dz1 = Math.abs(state.player.z - beforeZ);
    assert.ok(dz1 < 12, `dt=5.0 must be clamped (moved ${dz1}m in single call)`);

    Physics.stepSimulation(state, makeInput({ throttle: 1 }), 100.0);
    assertFiniteState(state, 'after dt=100.0 spike');
  });

  it('A.2 zero and negative dt (0, -0.5, NaN) safely leave state finite without backward time travel', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    stepTicks(Physics, state, makeInput({ throttle: 1 }), 30);
    const tBefore = state.timeSec;

    Physics.stepSimulation(state, makeInput({ throttle: 1 }), 0);
    assertFiniteState(state, 'after dt=0');
    assert.ok(state.timeSec >= tBefore);

    Physics.stepSimulation(state, makeInput({ throttle: 1 }), -0.5);
    assertFiniteState(state, 'after dt=-0.5');
    assert.ok(state.timeSec >= tBefore);

    Physics.stepSimulation(state, makeInput({ throttle: 1 }), Number.NaN);
    assertFiniteState(state, 'after dt=NaN');
  });

  it('A.3 world perimeter barriers (±960m PLAYABLE_BOUND) contain max-speed nitro LFA on all 4 edges', () => {
    const { WorldData, Physics } = loadSimModules();
    const bound = WorldData.PLAYABLE_BOUND;
    const cases = [
      { label: 'North (-Z)', x: 0, z: -935, heading: 0 },
      { label: 'South (+Z)', x: 0, z: 935, heading: Math.PI },
      { label: 'East (+X)', x: 935, z: 0, heading: -Math.PI / 2 },
      { label: 'West (-X)', x: -935, z: 0, heading: Math.PI / 2 },
    ];

    for (const c of cases) {
      const state = Physics.createSimulation('lfa_hyper');
      state.player.x = c.x;
      state.player.z = c.z;
      state.player.y = WorldData.getTerrainHeight(c.x, c.z);
      state.player.heading = c.heading;
      state.player.vx = -Math.sin(c.heading) * 70;
      state.player.vz = -Math.cos(c.heading) * 70;

      stepTicks(Physics, state, makeInput({ throttle: 1, nitro: true }), 120);
      assertFiniteState(state, `boundary ${c.label}`);
      assert.ok(
        Math.abs(state.player.x) <= bound + 5 && Math.abs(state.player.z) <= bound + 5,
        `${c.label}: player escaped PLAYABLE_BOUND ±${bound} (pos=${state.player.x.toFixed(1)}, ${state.player.z.toFixed(1)})`
      );
    }
  });

  it('A.4 extreme Mt. Fuji elevation (320m) & steep slopes yield continuous unit normals and stable physics', () => {
    const { WorldData, Physics } = loadSimModules();
    // Sample radial transect up Mt. Fuji slope from (-420, -420) to peak (-760, -760)
    let prevH = -Infinity;
    for (let step = 0; step <= 10; step++) {
      const t = step / 10;
      const x = -420 + (-760 - -420) * t;
      const z = -420 + (-760 - -420) * t;
      const info = WorldData.getSurfaceInfo(x, z);
      assertFiniteNumber(info.height, `fuji height step ${step}`);
      const nLen = Math.hypot(info.normal.x, info.normal.y, info.normal.z);
      assert.ok(Math.abs(nLen - 1) < 0.05, `Slope normal must stay unit length (got ${nLen})`);
      assert.ok(info.height >= prevH - 2, 'Height transect up Mt. Fuji should be monotonic');
      prevH = info.height;
    }

    // Drive jimny_raid directly on steep Mt. Fuji flank
    const state = Physics.createSimulation('jimny_raid');
    state.player.x = -610;
    state.player.z = -610;
    state.player.y = WorldData.getTerrainHeight(-610, -610);
    state.player.heading = Math.PI / 4;
    stepTicks(Physics, state, makeInput({ throttle: 1, steer: 0.25 }), 180);
    assertFiniteState(state, 'steep Mt. Fuji slope driving');
    const terrainY = WorldData.getTerrainHeight(state.player.x, state.player.z);
    assert.ok(
      Math.abs(state.player.y - terrainY) < 4.0,
      `Car should stay grounded on steep slope (carY=${state.player.y}, terrainY=${terrainY})`
    );
  });

  it('A.5 out-of-bounds terrain/road queries (±5000m) remain finite and valid', () => {
    const { WorldData } = loadSimModules();
    for (const [x, z] of [
      [5000, 5000],
      [-5000, -5000],
      [0, 0],
    ]) {
      const h = WorldData.getTerrainHeight(x, z);
      const info = WorldData.getSurfaceInfo(x, z);
      const rp = WorldData.findNearestRoadPoint(x, z);
      assertFiniteNumber(h, `height(${x},${z})`);
      assertFiniteNumber(info.height, `info.height(${x},${z})`);
      assertFiniteNumber(rp.x, `nearestRoad.x(${x},${z})`);
      assertFiniteNumber(rp.z, `nearestRoad.z(${x},${z})`);
    }
  });

  it('A.6 resetPlayer when far off-road & spinning resets speed/slip and snaps onto valid road', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('rx7_drift');
    state.player.x = -940;
    state.player.z = 940;
    state.player.vx = 45;
    state.player.vz = -35;
    state.player.isDrifting = true;
    state.scoring.driftPoints = 900;

    Physics.resetPlayer(state);
    assertFiniteState(state, 'after extreme resetPlayer');
    assert.ok(Math.abs(state.player.speedMs) < 1e-6);
    assert.equal(WorldData.getSurfaceInfo(state.player.x, state.player.z).onRoad, true);
  });
});

describe('Tier 2 — Area B: Bad Inputs, NaN Resilience & Rapid Car Switching Edge Cases', () => {
  it('B.1 malformed/NaN/out-of-range ControlInput values never produce NaN in SimState', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');

    const badInputs = [
      {},
      { steer: Number.NaN, throttle: Number.NaN, brake: Number.NaN },
      { steer: 9999, throttle: -50, brake: 500, handbrake: 'yes', nitro: 1 },
      { steer: -Infinity, throttle: Infinity, brake: -Infinity },
    ];

    for (const bad of badInputs) {
      Physics.stepSimulation(state, bad, 1 / 60);
      assertFiniteState(state, `after bad input ${JSON.stringify(bad)}`);
      assert.ok(Math.abs(state.player.speedKmh) < 500, 'Speed must remain bounded');
    }
  });

  it('B.2 rapid mid-drift car switching every 5 ticks across all 5 cars preserves CR & zero NaN', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('rx7_drift');
    state.scoring.cr = 12500;
    stepTicks(Physics, state, makeInput({ throttle: 1 }), 120);

    for (let i = 0; i < 15; i++) {
      stepTicks(Physics, state, makeInput({ throttle: 0.9, steer: 0.8, handbrake: i % 2 === 0 }), 5);
      const nextId = EXPECTED_CAR_IDS[i % EXPECTED_CAR_IDS.length];
      Physics.switchCar(state, nextId);
      assert.equal(state.activeCarId, nextId);
      assert.equal(state.scoring.cr, 12500, 'Banked CR must be preserved across car switches');
      assertFiniteState(state, `rapid switch #${i} (${nextId})`);
    }
  });

  it('B.3 switchCar with unknown carId handles safely without corrupting activeCarId or NaN', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('evo_touge');
    Physics.switchCar(state, 'unknown_car_xyz');
    assert.ok(
      EXPECTED_CAR_IDS.includes(state.activeCarId),
      `activeCarId must remain a valid car ID (got ${state.activeCarId})`
    );
    assertFiniteState(state, 'after unknown switchCar');
  });

  it('B.4 createSimulation() with missing or unknown carId defaults safely to valid car', () => {
    const { Physics } = loadSimModules();
    for (const arg of [undefined, null, '', 'invalid_car']) {
      const state = Physics.createSimulation(arg);
      assert.ok(EXPECTED_CAR_IDS.includes(state.activeCarId), `Expected valid fallback carId (got ${state.activeCarId})`);
      assertFiniteState(state, `createSimulation(${String(arg)})`);
    }
  });

  it('B.5 simultaneous conflicting pedals (gas=1 + brake=1 + handbrake=true + nitro=true) stay bounded', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('lfa_hyper');
    stepTicks(
      Physics,
      state,
      makeInput({ throttle: 1, brake: 1, handbrake: true, nitro: true, steer: 1 }),
      180
    );
    assertFiniteState(state, 'after simultaneous conflicting pedals');
    assert.ok(state.player.speedKmh <= 420);
  });
});

describe('Tier 2 — Area C: Gearbox Boundaries — Rev Limiter, Reverse Lockout & 5 vs 6 Speeds', () => {
  it('C.1 rev limiter clamps RPM at or below maxRpm when pinning throttle in MT gear 1', () => {
    const { getCarById, Physics } = loadSimModules();
    const car = getCarById('rx7_drift');
    const state = Physics.createSimulation('rx7_drift');
    state.transmissionMode = 'MT';

    stepTicks(Physics, state, makeInput({ throttle: 1, nitro: true, transmissionMode: 'MT' }), 240);
    assert.equal(state.player.gear, 1);
    assert.ok(
      state.player.rpm <= car.physics.maxRpm + 50,
      `Rev limiter must cap RPM near ${car.physics.maxRpm} (got ${state.player.rpm})`
    );
  });

  it('C.2 AT reverse lockout: braking hard at 180+ km/h does NOT snap into Reverse until near standstill', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('lfa_hyper');

    stepTicks(Physics, state, makeInput({ throttle: 1, nitro: true, transmissionMode: 'AT' }), 300);
    assert.ok(state.player.speedKmh > 180, `Expected >180 km/h before braking (got ${state.player.speedKmh})`);

    // Apply full brake for 30 ticks (0.5s) — still moving fast -> must NOT be in Reverse
    stepTicks(Physics, state, makeInput({ brake: 1, transmissionMode: 'AT' }), 30);
    assert.ok(state.player.speedKmh > 30);
    assert.ok(state.player.gear >= 1, `Must not enter Reverse at ${state.player.speedKmh} km/h`);

    // Hold brake until stopped -> now Reverse engages
    stepTicks(Physics, state, makeInput({ brake: 1, transmissionMode: 'AT' }), 240);
    assert.equal(state.player.gear, -1);
  });

  it('C.3 MT shift boundaries clamp cleanly at R (-1) and top gear (5 or 6)', () => {
    const { getCarById, Physics } = loadSimModules();
    for (const id of ['rx7_drift', 'skyline_gtr']) {
      const gearCount = getCarById(id).physics.gearRatios.length;
      const state = Physics.createSimulation(id);

      // Spam shift down past R
      for (let i = 0; i < 6; i++) {
        stepTicks(Physics, state, makeInput({ transmissionMode: 'MT', shiftDownRequested: true }), 1);
      }
      assert.equal(state.player.gear, -1, `${id} lower gear bound must clamp at -1 (R)`);

      // Spam shift up past top gear
      for (let i = 0; i < 10; i++) {
        stepTicks(Physics, state, makeInput({ transmissionMode: 'MT', shiftUpRequested: true }), 1);
      }
      assert.equal(state.player.gear, gearCount, `${id} top gear bound must clamp at ${gearCount}`);
    }
  });

  it('C.4 5-speed cars (rx7_drift, jimny_raid) cap at gear 5 while 6-speed cars reach gear 6', () => {
    const { Physics } = loadSimModules();
    for (const id of ['rx7_drift', 'jimny_raid']) {
      const s = Physics.createSimulation(id);
      for (let i = 0; i < 8; i++) {
        stepTicks(Physics, s, makeInput({ transmissionMode: 'MT', shiftUpRequested: true }), 1);
      }
      assert.equal(s.player.gear, 5, `${id} must have 5 forward gears`);
    }
    for (const id of ['skyline_gtr', 'evo_touge', 'lfa_hyper']) {
      const s = Physics.createSimulation(id);
      for (let i = 0; i < 8; i++) {
        stepTicks(Physics, s, makeInput({ transmissionMode: 'MT', shiftUpRequested: true }), 1);
      }
      assert.equal(s.player.gear, 6, `${id} must have 6 forward gears`);
    }
  });

  it('C.5 conflicting shiftUpRequested + shiftDownRequested in same tick leaves gear valid and finite', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    stepTicks(
      Physics,
      state,
      makeInput({ throttle: 0.5, transmissionMode: 'MT', shiftUpRequested: true, shiftDownRequested: true }),
      10
    );
    assert.ok(state.player.gear >= -1 && state.player.gear <= 6);
    assertFiniteState(state, 'after conflicting shift requests');
  });
});

describe('Tier 2 — Area D: Gyro Fallback, Multi-Touch Conflict & Corrupt/Throwing Storage', () => {
  it('D.1 gyro deadzone ignores small resting jitter and clamps extreme tilt to [-1, 1]', () => {
    const env = bootEnv({ includeAndroidBridge: true });
    const Controls = env.window.H6.Controls;
    if (typeof Controls.setSteerMode === 'function') Controls.setSteerMode('gyro');
    else findBtn(env.document, ['steer-mode-gyro', 'mode-gyro'], /гиро/i).click();

    // Small tilt inside deadzone (e.g. 0.02 normalized / ~1.5 deg) -> 0
    env.androidBridgeState.tilt = 0.02;
    env.tickRaf(4);
    assert.equal(readLiveInput(env).steer, 0, 'Tiny tilt inside gyro deadzone must yield steer=0');

    // Extreme tilt -> clamped to [-1, 1]
    env.androidBridgeState.tilt = 5.0;
    env.tickRaf(4);
    const maxS = readLiveInput(env).steer;
    assert.ok(maxS <= 1.0 && maxS >= 0.8, `Extreme positive tilt must clamp to <= 1 (got ${maxS})`);

    env.androidBridgeState.tilt = -5.0;
    env.tickRaf(4);
    const minS = readLiveInput(env).steer;
    assert.ok(minS >= -1.0 && minS <= -0.8, `Extreme negative tilt must clamp to >= -1 (got ${minS})`);
  });

  it('D.2 gyro calibration zeroes out tilted resting angle', () => {
    const env = bootEnv({ includeAndroidBridge: true });
    const Controls = env.window.H6.Controls;
    if (typeof Controls.setSteerMode === 'function') Controls.setSteerMode('gyro');
    else findBtn(env.document, ['steer-mode-gyro', 'mode-gyro'], /гиро/i).click();

    env.androidBridgeState.tilt = 0.4;
    env.tickRaf(3);
    if (typeof Controls.calibrateGyro === 'function') {
      Controls.calibrateGyro();
    } else {
      const calBtn = findBtn(env.document, ['btn-calibrate', 'calibrate-gyro', 'gyro-calibrate'], /калибр/i);
      assert.ok(calBtn, 'Expected gyro calibration control or Controls.calibrateGyro()');
      calBtn.click();
    }
    assert.ok(env.androidBridgeState.calibrations >= 1 || Math.abs(readLiveInput(env).steer) < 0.05);
  });

  it('D.3 gyro fallback without AndroidBridge and without DeviceOrientationEvent recovers cleanly', () => {
    const env = bootEnv({ includeAndroidBridge: false, withGyroSupport: false });
    const Controls = env.window.H6.Controls;
    if (typeof Controls.setSteerMode === 'function') {
      Controls.setSteerMode('gyro');
    } else {
      const gyroBtn = findBtn(env.document, ['steer-mode-gyro', 'mode-gyro'], /гиро/i);
      assert.ok(gyroBtn);
      gyroBtn.click();
    }
    env.tickRaf(5);
    assert.equal(env.errors.length, 0);
    const input = readLiveInput(env);
    assert.ok(input.steerMode === 'wheel' || input.steer === 0, 'Missing gyro hardware must fall back safely');
  });

  it('D.4 simultaneous multi-touch pointerIds isolate wheel/gas/nitro/handbrake and release independently', () => {
    const env = bootEnv();
    const gasBtn = findBtn(env.document, ['btn-gas', 'pedal-gas', 'gas'], /^ГАЗ$/i);
    const nitroBtn = findBtn(env.document, ['btn-nitro', 'nitro'], /^НИТРО$/i);
    const hbBtn = findBtn(env.document, ['btn-handbrake', 'handbrake'], /^РУЧНИК$/i);
    assert.ok(gasBtn && nitroBtn && hbBtn, 'Gas, Nitro, and Handbrake buttons must exist');

    gasBtn.dispatchEvent(new env.window.PointerEvent('pointerdown', { pointerId: 10, bubbles: true }));
    nitroBtn.dispatchEvent(new env.window.PointerEvent('pointerdown', { pointerId: 11, bubbles: true }));
    hbBtn.dispatchEvent(new env.window.PointerEvent('pointerdown', { pointerId: 12, bubbles: true }));
    env.tickRaf(3);

    const active = readLiveInput(env);
    assert.ok(active.throttle > 0.5, 'Gas must be active concurrently');
    assert.equal(active.nitro, true, 'Nitro must be active concurrently');
    assert.equal(active.handbrake, true, 'Handbrake must be active concurrently');

    // Cancel nitro only -> gas & handbrake stay active
    nitroBtn.dispatchEvent(new env.window.PointerEvent('pointercancel', { pointerId: 11, bubbles: true }));
    env.tickRaf(2);
    const partial = readLiveInput(env);
    assert.equal(partial.nitro, false);
    assert.ok(partial.throttle > 0.5, 'Releasing nitro must NOT drop gas pointer');
    assert.equal(partial.handbrake, true, 'Releasing nitro must NOT drop handbrake pointer');
  });

  it('D.5 corrupt localStorage JSON values do not crash boot, HUD, or Audio', () => {
    const env = bootEnv({
      storageOptions: {
        corruptKeys: ['h6_save', 'horizon6_save', 'h6_state', 'h6_records', 'h6_muted', 'horizon6_japan_save'],
      },
    });
    env.tickRaf(10);
    assert.equal(env.errors.length, 0);
  });

  it('D.6 throwing localStorage (SecurityError/QuotaExceededError) is gracefully handled by try/catch', () => {
    const env = bootEnv({
      storageOptions: { throwOnAccess: true },
    });
    env.window.H6.Audio.toggleMute();
    env.tickRaf(10);
    assert.equal(env.errors.length, 0);
  });
});

describe('Tier 2 — Area E: Scoring, Speed Trap, Bonus Target & Nitro Edge Cases', () => {
  it('E.1 hard collision during active drift cancels unbanked driftPoints and emits drift_fail', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('rx7_drift');
    state.player.isDrifting = true;
    state.scoring.driftPoints = 650;
    state.scoring.driftMultiplier = 2;
    state.scoring.driftTimer = 2.5;
    const initialCr = state.scoring.cr;

    const b = WorldData.BUILDINGS[0];
    state.player.x = b.x;
    state.player.z = b.z + b.d / 2 + 6;
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.heading = 0;
    state.player.vx = 0;
    state.player.vz = -35; // ~126 km/h hard wall hit

    const events = stepTicks(Physics, state, makeInput({ throttle: 1 }), 25);
    assert.equal(state.scoring.driftPoints, 0, 'Hard crash must zero unbanked driftPoints');
    assert.equal(state.scoring.cr, initialCr, 'Cancelled drift must not award CR');
    assert.ok(events.some((e) => e.type === 'drift_fail'), 'Must emit drift_fail on hard impact');
  });

  it('E.2 low-speed sliding (< 15 km/h) does not farm drift points or multiplier', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('rx7_drift');
    stepTicks(Physics, state, makeInput({ throttle: 0.12, steer: 1.0, handbrake: true }), 120);
    assert.ok(state.player.speedKmh < 20);
    assert.equal(state.scoring.driftPoints, 0, 'Slow creeping slide must not earn drift points');
  });

  it('E.3 re-crossing an already-smashed bonus board never double-awards CR or exceeds 24', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    const t = state.targets[0];

    state.player.x = t.x;
    state.player.z = t.z + 8;
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.vz = -16;
    stepTicks(Physics, state, makeInput({ throttle: 0.5 }), 45);
    const crAfterFirst = state.scoring.cr;
    assert.equal(state.scoring.smashedCount, 1);

    // Pass directly through same target location again
    state.player.x = t.x;
    state.player.z = t.z + 8;
    state.player.vz = -16;
    stepTicks(Physics, state, makeInput({ throttle: 0.5 }), 45);
    assert.equal(state.scoring.smashedCount, 1, 'Already collected board must not recount');
    assert.equal(state.scoring.cr, crAfterFirst, 'Already collected board must not re-award CR');
  });

  it('E.4 slower speed trap pass does not overwrite higher speedTrapBestKmh; outside halfWidth misses gate', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    const trap = WorldData.SPEED_TRAPS[0];
    const fwdX = -Math.sin(trap.heading);
    const fwdZ = -Math.cos(trap.heading);
    const rightX = Math.cos(trap.heading);
    const rightZ = -Math.sin(trap.heading);

    // Miss gate laterally by halfWidth + 15m -> must NOT trigger
    state.player.x = trap.x - fwdX * 25 + rightX * (trap.halfWidth + 15);
    state.player.z = trap.z - fwdZ * 25 + rightZ * (trap.halfWidth + 15);
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.heading = trap.heading;
    state.player.vx = fwdX * 30;
    state.player.vz = fwdZ * 30;
    const missEvents = stepTicks(Physics, state, makeInput({ throttle: 0.5 }), 60);
    assert.equal(missEvents.some((e) => e.type === 'speed_trap'), false, 'Passing outside gate width must not trigger');

    // Fast pass -> accelerates cleanly with nitro and sets high speed trap record
    const fastSim = Physics.createSimulation('lfa_hyper');
    fastSim.player.x = trap.x - fwdX * 120;
    fastSim.player.z = trap.z - fwdZ * 120;
    fastSim.player.y = WorldData.getTerrainHeight(fastSim.player.x, fastSim.player.z);
    fastSim.player.heading = trap.heading;
    stepTicks(Physics, fastSim, makeInput({ throttle: 1, nitro: true }), 200);
    const highRecord = fastSim.scoring.speedTrapBestKmh;
    assert.ok(highRecord > 170, `Expected high speed trap record > 170 (got ${highRecord})`);

    // Slow pass -> updates lastSpeedTrapKmh without lowering speedTrapBestKmh
    fastSim.player.x = trap.x - fwdX * 25;
    fastSim.player.z = trap.z - fwdZ * 25;
    fastSim.player.y = WorldData.getTerrainHeight(fastSim.player.x, fastSim.player.z);
    fastSim.player.vx = 0;
    fastSim.player.vz = 0;
    fastSim.player.speedMs = 0;
    fastSim.player.speedKmh = 0;
    fastSim.player.heading = trap.heading;
    stepTicks(Physics, fastSim, makeInput({ throttle: 0.25 }), 240);
    assert.equal(fastSim.scoring.speedTrapBestKmh, highRecord, 'Slower pass must preserve higher speedTrapBestKmh');
    assert.ok(fastSim.scoring.lastSpeedTrapKmh > 0 && fastSim.scoring.lastSpeedTrapKmh < highRecord);
  });

  it('E.5 empty nitro (0) prevents activation and never drops below 0', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');
    state.player.nitro = 0;

    stepTicks(Physics, state, makeInput({ throttle: 1, nitro: true }), 10);
    assert.ok(state.player.nitro >= 0, 'Nitro must never drop below 0');
    assert.equal(state.player.isNitroActive, false, 'Empty nitro cannot activate boost');
  });
});
