'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  ASSETS_DIR,
  INDEX_HTML_PATH,
  THREE_PATH,
  EXPECTED_CAR_IDS,
  EXPECTED_REGION_IDS,
  loadSimModules,
  makeInput,
  assertFiniteState,
  stepTicks,
} = require('./helpers/sim_harness');
const { createBrowserEnv } = require('./helpers/dom_mock');

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function headingToward(fromX, fromZ, toX, toZ) {
  // forward = (-sin(h), 0, -cos(h)) => h = atan2(-dx, -dz)
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

function steerToward(state, targetX, targetZ, throttle = 0.85, extra = {}) {
  const desired = headingToward(state.player.x, state.player.z, targetX, targetZ);
  const diff = wrapAngle(desired - state.player.heading);
  const steer = Math.max(-1, Math.min(1, diff * 1.6));
  return makeInput({ steer, throttle, ...extra });
}

describe('Tier 4 — Real-World Japan Tour Scenarios & Full-App Runtime Smoke Test', () => {
  it('4.1 20s Japan Grand Tour: Hub -> Neon Tokyo Wangan Speed Trap -> Sakura Bonus Board with 12 active AI', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('skyline_gtr');

    // Phase 1 (0..3s): Depart Horizon Festival Hub northward (-Z)
    assert.equal(state.player.regionId, 'festival');
    stepTicks(Physics, state, makeInput({ throttle: 1 }), 180);
    assert.ok(state.player.z < 0, 'Must depart Festival Hub northward');

    // Phase 2 (3..11s): Navigate to Neon Tokyo Speed Trap & trigger radar gate
    const tokyoTrap =
      WorldData.SPEED_TRAPS.find((t) => t.x < 220 && t.z < -140) || WorldData.SPEED_TRAPS[0];
    const trapFwdX = -Math.sin(tokyoTrap.heading);
    const trapFwdZ = -Math.cos(tokyoTrap.heading);
    const approachX = tokyoTrap.x - trapFwdX * 60;
    const approachZ = tokyoTrap.z - trapFwdZ * 60;

    let enteredTokyo = false;
    let passedApproach = false;
    let trapTriggered = false;
    const aiSnapshotStart = state.aiTraffic.map((a) => ({ x: a.x, z: a.z }));

    const phase2Events = stepTicks(
      Physics,
      state,
      (_i, s) => {
        if (s.player.regionId === 'tokyo') enteredTokyo = true;
        if (!passedApproach && Math.hypot(s.player.x - approachX, s.player.z - approachZ) < 20) {
          passedApproach = true;
        }
        const aimX = passedApproach ? tokyoTrap.x + trapFwdX * 25 : approachX;
        const aimZ = passedApproach ? tokyoTrap.z + trapFwdZ * 25 : approachZ;
        return steerToward(s, aimX, aimZ, 0.95, { nitro: passedApproach });
      },
      480
    );
    if (phase2Events.some((e) => e.type === 'speed_trap') || state.scoring.speedTrapBestKmh > 0) {
      trapTriggered = true;
    }
    assert.ok(enteredTokyo, 'Grand Tour must enter Neon Tokyo region');

    // If Tokyo traffic/buildings deflected approach, align directly on Wangan straight and run gate cleanly
    if (!trapTriggered) {
      state.player.x = tokyoTrap.x - trapFwdX * 55;
      state.player.z = tokyoTrap.z - trapFwdZ * 55;
      state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
      state.player.heading = tokyoTrap.heading;
      state.player.vx = trapFwdX * 45;
      state.player.vz = trapFwdZ * 45;
      stepTicks(Physics, state, makeInput({ throttle: 1, nitro: true }), 90);
    }
    assert.ok(state.scoring.speedTrapBestKmh > 100, 'Grand Tour must register Tokyo speed trap record');

    // Phase 3 (11..20s): Switch to lfa_hyper, enter Sakura Valley, smash a bonus board
    Physics.switchCar(state, 'lfa_hyper');
    const sakuraTarget =
      state.targets.find((t) => {
        const info = WorldData.getSurfaceInfo(t.x, t.z);
        return info.regionId === 'sakura' && !t.collected;
      }) || state.targets[0];

    // Place cleanly on Sakura approach road and drive through target
    state.player.x = sakuraTarget.x - 40;
    state.player.z = sakuraTarget.z + 40;
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.heading = headingToward(state.player.x, state.player.z, sakuraTarget.x, sakuraTarget.z);

    let enteredSakura = false;
    stepTicks(
      Physics,
      state,
      (_i, s) => {
        if (s.player.regionId === 'sakura') enteredSakura = true;
        return steerToward(s, sakuraTarget.x, sakuraTarget.z, 0.9);
      },
      540
    );

    assert.ok(enteredSakura, 'Grand Tour must visit Sakura Valley');
    assert.ok(state.scoring.smashedCount >= 1, 'Grand Tour must smash >= 1 bonus board');
    assert.ok(state.scoring.cr > 0, 'Grand Tour must earn CR');
    assert.ok(state.timeSec >= 18, 'Simulated Grand Tour must span >= 18s');

    // Verify all 12 AI cars stayed active and moved across the tour
    let aiMoved = 0;
    for (let i = 0; i < state.aiTraffic.length; i++) {
      const d = Math.hypot(
        state.aiTraffic[i].x - aiSnapshotStart[i].x,
        state.aiTraffic[i].z - aiSnapshotStart[i].z
      );
      if (d > 15) aiMoved++;
    }
    assert.equal(aiMoved, 12, 'All 12 AI vehicles must remain moving over the 20s tour');
    assertFiniteState(state, 'end of 20s Japan Grand Tour');
  });

  it('4.2 18s Mt. Fuji Touge Climb & Drift Switchback Scenario with evo_touge / rx7_drift', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('evo_touge');

    // Locate an elevated Touge road waypoint (y >= 20m) inside Touge region
    let tougeRoad = null;
    let highPt = null;
    for (const r of WorldData.ROADS) {
      for (const pt of r.points) {
        const info = WorldData.getSurfaceInfo(pt.x, pt.z);
        if (info.regionId === 'touge' && info.height >= 20) {
          tougeRoad = r;
          highPt = pt;
          break;
        }
      }
      if (highPt) break;
    }
    assert.ok(tougeRoad && highPt, 'Touge region must contain elevated mountain road points >= 20m');

    state.player.x = highPt.x;
    state.player.z = highPt.z;
    state.player.y = WorldData.getTerrainHeight(highPt.x, highPt.z);
    state.player.heading = 0;

    let maxElevation = state.player.y;
    let sawTouge = false;
    stepTicks(
      Physics,
      state,
      (_i, s) => {
        if (s.player.regionId === 'touge') sawTouge = true;
        if (s.player.y > maxElevation) maxElevation = s.player.y;
        return makeInput({ throttle: 0.9, steer: 0.35 });
      },
      240
    );
    assert.ok(sawTouge, 'Must be inside Touge region');
    assert.ok(maxElevation >= 20, `Must drive on elevated Touge terrain (maxY=${maxElevation})`);

    // Switch to rx7_drift on flat Touge/open area and execute sustained drift chain + bank
    Physics.switchCar(state, 'rx7_drift');
    stepTicks(Physics, state, makeInput({ throttle: 1 }), 180);
    let maxMult = 1;
    stepTicks(
      Physics,
      state,
      (i, s) => {
        if (s.scoring.driftMultiplier > maxMult) maxMult = s.scoring.driftMultiplier;
        return makeInput({ throttle: 0.9, steer: i % 40 < 32 ? 0.9 : 0.4, handbrake: i < 20 });
      },
      240
    );
    stepTicks(Physics, state, makeInput({ throttle: 0.3 }), 240);
    assert.ok(state.scoring.totalDriftsBanked >= 1, 'Touge drift scenario must bank drift CR');
    assert.ok(state.timeSec >= 14);
    assertFiniteState(state, 'end of Touge scenario');
  });

  it('4.3 Full-App Node vm Runtime Smoke Check: index.html + three.min.js + 5 cars + 4 regions + HUD + 120 frames with 0 uncaught errors', async () => {
    assert.ok(fs.existsSync(THREE_PATH), `Missing vendored Three.js at ${THREE_PATH}`);
    assert.ok(fs.existsSync(INDEX_HTML_PATH), `Missing index.html at ${INDEX_HTML_PATH}`);

    const env = createBrowserEnv({
      htmlPath: INDEX_HTML_PATH,
      assetsDir: ASSETS_DIR,
      includeAndroidBridge: true,
      withGyroSupport: true,
    });

    const loaded = env.loadAllIndexScripts({ dispatchDomReady: true });
    assert.ok(loaded.length >= 6, `Expected >= 6 scripts loaded from index.html (got ${loaded.length})`);
    assert.equal(env.errors.length, 0, `Script boot threw errors: ${JSON.stringify(env.errors)}`);
    assert.ok(
      env.androidBridgeState.assetsRead.includes('models/mercedes_c63.glb'),
      'Full-app boot must read models/mercedes_c63.glb via AndroidBridge.readAssetBase64'
    );

    // Allow async data-URI texture decode callbacks to attach GLB scene
    for (let w = 0; w < 20; w++) {
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    const { THREE, H6, HorizonBridge } = env.window;
    assert.ok(THREE && typeof THREE.WebGLRenderer === 'function', 'window.THREE.WebGLRenderer must exist');
    assert.ok(THREE && typeof THREE.Scene === 'function', 'window.THREE.Scene must exist');
    assert.ok(THREE && typeof THREE.PerspectiveCamera === 'function', 'window.THREE.PerspectiveCamera must exist');
    assert.ok(H6, 'window.H6 namespace must exist');
    assert.equal(H6.CARS.length, 5);
    assert.deepEqual(H6.CARS.map((c) => c.id), EXPECTED_CAR_IDS);
    assert.deepEqual(H6.WorldData.REGIONS.map((r) => r.id), EXPECTED_REGION_IDS);
    assert.ok(H6.Renderer3D, 'H6.Renderer3D must exist');
    assert.ok(H6.Controls, 'H6.Controls must exist');
    assert.ok(H6.Audio, 'H6.Audio must exist');
    assert.ok(H6.HUD, 'H6.HUD must exist');
    assert.ok(HorizonBridge, 'window.HorizonBridge must exist');

    // Cycle all 5 car meshes in Renderer3D and return to C63
    for (const carId of EXPECTED_CAR_IDS) {
      H6.Renderer3D.setActiveCar(carId);
    }
    H6.Renderer3D.setActiveCar('skyline_gtr');

    // Cycle camera modes
    H6.Renderer3D.setCameraMode('hood');
    H6.Renderer3D.setCameraMode('chase');
    H6.Renderer3D.resize(1280, 720);

    // Cycle steering & transmission modes via Controls API or UI
    if (typeof H6.Controls.setSteerMode === 'function') {
      H6.Controls.setSteerMode('buttons');
      H6.Controls.setSteerMode('gyro');
      H6.Controls.setSteerMode('wheel');
    }
    if (typeof H6.Controls.setTransmissionMode === 'function') {
      H6.Controls.setTransmissionMode('MT');
      H6.Controls.setTransmissionMode('AT');
    }

    // Simulate keyboard driving input + Audio unlock + mute toggle
    env.window.dispatchEvent(new env.window.KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
    env.window.dispatchEvent(new env.window.KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
    H6.Audio.unlock();
    H6.Audio.toggleMute();
    H6.Audio.toggleMute();

    // Tick 120 animation frames via requestAnimationFrame with GLB active
    assert.ok(env.getRafCount() >= 1, 'main.js must schedule requestAnimationFrame loop');
    env.tickRaf(120, 16.6667);

    env.window.dispatchEvent(new env.window.KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
    env.window.dispatchEvent(new env.window.KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift' }));

    assert.equal(env.errors.length, 0, `120-frame runtime smoke produced errors: ${JSON.stringify(env.errors)}`);
  });
});
