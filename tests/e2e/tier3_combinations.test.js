'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ASSETS_DIR,
  INDEX_HTML_PATH,
  loadSimModules,
  makeInput,
  assertFiniteState,
  stepTicks,
  normalizeCameraTarget,
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
  return Controls.input;
}

function setSteerMode(env, mode) {
  const Controls = env.window.H6.Controls;
  if (typeof Controls.setSteerMode === 'function') {
    Controls.setSteerMode(mode);
    return;
  }
  const rxMap = { wheel: /руль/i, buttons: /кнопк/i, gyro: /гиро/i };
  const btn = env.document
    .querySelectorAll('button, div, span, label')
    .find((el) => rxMap[mode].test((el.textContent || '').trim()));
  assert.ok(btn, `Steer mode button for ${mode} not found`);
  btn.click();
}

describe('Tier 3 — Pairwise Cross-Feature Combinations', () => {
  it('3.1 Nitro + Drift + MT Shift + Off-Road: jimny_raid outperforms lfa_hyper off-road during boosted MT drift', () => {
    const { WorldData, Physics } = loadSimModules();

    // Find open grass field
    let spot = { x: 520, z: 520 };
    for (let x = 200; x <= 750; x += 50) {
      let found = false;
      for (let z = 200; z <= 750; z += 50) {
        if (WorldData.getSurfaceInfo(x, z).surface === 'grass') {
          spot = { x, z };
          found = true;
          break;
        }
      }
      if (found) break;
    }

    const runCombo = (carId) => {
      const sim = Physics.createSimulation(carId);
      sim.player.x = spot.x;
      sim.player.z = spot.z;
      sim.player.y = WorldData.getTerrainHeight(spot.x, spot.z);
      sim.transmissionMode = 'MT';

      // Launch in MT 1, shift to MT 2 with nitro + steering drift
      stepTicks(Physics, sim, makeInput({ throttle: 1, nitro: true, transmissionMode: 'MT' }), 60);
      stepTicks(
        Physics,
        sim,
        makeInput({ throttle: 1, nitro: true, transmissionMode: 'MT', shiftUpRequested: true }),
        1
      );
      assert.equal(sim.player.gear, 2);

      stepTicks(
        Physics,
        sim,
        makeInput({ throttle: 1, nitro: true, steer: 0.6, handbrake: true, transmissionMode: 'MT' }),
        60
      );
      assertFiniteState(sim, `${carId} off-road MT nitro drift`);
      return sim.player.speedKmh;
    };

    const jimnySpeed = runCombo('jimny_raid');
    const lfaSpeed = runCombo('lfa_hyper');
    assert.ok(
      jimnySpeed / 195 > lfaSpeed / 340,
      `Jimny off-road speed retention (${jimnySpeed} km/h) should exceed LFA (${lfaSpeed} km/h) proportionally`
    );
  });

  it('3.2 Speed Trap while Nitro-Boosting achieves higher trap record and CR than unboosted pass', () => {
    const { WorldData, Physics } = loadSimModules();
    const trap = WorldData.SPEED_TRAPS[0];
    const fwdX = -Math.sin(trap.heading);
    const fwdZ = -Math.cos(trap.heading);

    const runPass = (withNitro) => {
      const sim = Physics.createSimulation('lfa_hyper');
      sim.player.x = trap.x - fwdX * 120;
      sim.player.z = trap.z - fwdZ * 120;
      sim.player.y = WorldData.getTerrainHeight(sim.player.x, sim.player.z);
      sim.player.heading = trap.heading;
      const events = stepTicks(Physics, sim, makeInput({ throttle: 1, nitro: withNitro }), 240);
      assert.ok(events.some((e) => e.type === 'speed_trap'), 'Must trigger speed_trap event');
      return { best: sim.scoring.speedTrapBestKmh, cr: sim.scoring.cr };
    };

    const base = runPass(false);
    const boosted = runPass(true);
    assert.ok(
      boosted.best > base.best + 10,
      `Nitro speed trap (${boosted.best} km/h) must exceed unboosted (${base.best} km/h)`
    );
    assert.ok(boosted.cr >= base.cr);
  });

  it('3.3 Drift skill chain broken by high-speed AI traffic collision', () => {
    const { WorldData, Physics } = loadSimModules();
    const state = Physics.createSimulation('rx7_drift');
    // Build an active drift chain
    stepTicks(Physics, state, makeInput({ throttle: 1 }), 140);
    stepTicks(Physics, state, makeInput({ throttle: 0.9, steer: 0.9, handbrake: true }), 45);
    state.scoring.driftPoints = Math.max(state.scoring.driftPoints, 450);
    state.player.isDrifting = true;

    // Position AI vehicle directly ahead along player heading for direct impact
    const ai = state.aiTraffic[0];
    const fwdX = -Math.sin(state.player.heading);
    const fwdZ = -Math.cos(state.player.heading);
    state.player.vx = fwdX * 36;
    state.player.vz = fwdZ * 36;
    state.player.speedMs = 36;
    ai.x = state.player.x + fwdX * 5.0;
    ai.z = state.player.z + fwdZ * 5.0;
    ai.y = WorldData.getTerrainHeight(ai.x, ai.z);
    ai.speedMs = 4;

    const events = stepTicks(Physics, state, makeInput({ throttle: 1 }), 20);
    assert.ok(events.some((e) => e.type === 'collision'), 'Must detect AI collision');
    assert.ok(events.some((e) => e.type === 'drift_fail'), 'AI impact during drift must break chain');
    assert.equal(state.scoring.driftPoints, 0);
    assertFiniteState(state, 'after AI collision breaking drift');
  });

  it('3.4 Bonus board smash while in Hood camera updates smashedCount, CR, and keeps hood cam forward', () => {
    const { WorldData, Physics } = loadSimModules();
    const env = bootEnv();
    const Renderer3D = env.window.H6.Renderer3D;
    assert.ok(Renderer3D, 'H6.Renderer3D must exist');

    const state = Physics.createSimulation('evo_touge');
    Renderer3D.setCameraMode('hood');

    const target = state.targets[1];
    state.player.x = target.x;
    state.player.z = target.z + 12;
    state.player.y = WorldData.getTerrainHeight(state.player.x, state.player.z);
    state.player.heading = 0;
    state.player.vx = 0;
    state.player.vz = -20;

    const events = stepTicks(Physics, state, makeInput({ throttle: 0.8, cameraMode: 'hood' }), 60);
    assert.ok(events.some((e) => e.type === 'target_smash'));
    assert.equal(state.scoring.smashedCount, 1);
    assert.ok(state.scoring.cr >= target.valueCr);

    const hoodCam = normalizeCameraTarget(Physics.computeCameraTarget(state, 'hood'));
    // Looking forward (-Z from heading=0) means look.z < pos.z
    assert.ok(hoodCam.look.z < hoodCam.pos.z, 'Hood camera must look forward along car heading');
    Renderer3D.render(state, 1 / 60);
    assert.equal(env.errors.length, 0);
  });

  it('3.5 Steering mode switching mid-turn (wheel -> buttons -> gyro -> wheel) clears stuck steering cleanly', () => {
    const env = bootEnv({ includeAndroidBridge: true });
    const wheelEl = env.document.querySelector('[id*="wheel"], [class*="wheel"]');
    assert.ok(wheelEl, 'Wheel element must exist');
    const rect = wheelEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // Hold left turn in wheel mode
    wheelEl.dispatchEvent(new env.window.PointerEvent('pointerdown', { pointerId: 21, clientX: cx, clientY: cy - 50, bubbles: true }));
    wheelEl.dispatchEvent(new env.window.PointerEvent('pointermove', { pointerId: 21, clientX: cx - 50, clientY: cy, bubbles: true }));
    env.tickRaf(3);
    assert.ok(readLiveInput(env).steer > 0.2);

    // Switch mid-turn to buttons -> gyro -> wheel
    setSteerMode(env, 'buttons');
    env.tickRaf(15);
    assert.equal(readLiveInput(env).steerMode, 'buttons');

    env.androidBridgeState.tilt = -0.6;
    setSteerMode(env, 'gyro');
    env.tickRaf(5);
    assert.equal(readLiveInput(env).steerMode, 'gyro');

    env.androidBridgeState.tilt = 0;
    setSteerMode(env, 'wheel');
    wheelEl.dispatchEvent(new env.window.PointerEvent('pointerup', { pointerId: 21, clientX: cx - 50, clientY: cy, bubbles: true }));
    env.tickRaf(45);
    assert.equal(readLiveInput(env).steerMode, 'wheel');
    assert.ok(Math.abs(readLiveInput(env).steer) < 0.2, 'Steer must return near 0 after mode cycling');
  });

  it('3.6 Car switch + Camera switch + Audio Mute toggle combo executes cleanly with zero NaN', () => {
    const { Physics } = loadSimModules();
    const env = bootEnv();
    const { Renderer3D, Audio } = env.window.H6;
    const state = Physics.createSimulation('skyline_gtr');

    stepTicks(Physics, state, makeInput({ throttle: 1 }), 60);
    Physics.switchCar(state, 'rx7_drift');
    Renderer3D.setActiveCar('rx7_drift');
    Renderer3D.setCameraMode('hood');
    Audio.init();
    Audio.unlock();
    assert.equal(Audio.toggleMute(), true);

    stepTicks(Physics, state, makeInput({ throttle: 0.9, steer: 0.5, cameraMode: 'hood' }), 60);
    Renderer3D.render(state, 1 / 60);
    Audio.updateContinuous(state.player);

    Physics.switchCar(state, 'lfa_hyper');
    Renderer3D.setActiveCar('lfa_hyper');
    Renderer3D.setCameraMode('chase');
    assert.equal(Audio.toggleMute(), false);
    Renderer3D.render(state, 1 / 60);
    assertFiniteState(state, 'car+camera+mute combo');
    assert.equal(env.errors.length, 0);
  });

  it('3.7 MT downshift entry drift recharges nitro faster, then nitro upshift exit banks drift CR', () => {
    const { Physics } = loadSimModules();
    const state = Physics.createSimulation('rx7_drift');
    state.transmissionMode = 'MT';
    state.player.nitro = 40;

    // Accelerate through MT gears 1 -> 2 -> 3 -> 4
    stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'MT' }), 90);
    for (let g = 0; g < 3; g++) {
      stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'MT', shiftUpRequested: true }), 1);
      stepTicks(Physics, state, makeInput({ throttle: 1, transmissionMode: 'MT' }), 60);
    }
    assert.ok(state.player.gear >= 3);

    // Downshift + handbrake + steer to enter drift and recharge nitro
    const nitroBeforeDrift = state.player.nitro;
    stepTicks(Physics, state, makeInput({ throttle: 0.8, transmissionMode: 'MT', shiftDownRequested: true, handbrake: true, steer: 0.9 }), 1);
    stepTicks(Physics, state, makeInput({ throttle: 0.9, transmissionMode: 'MT', steer: 0.85 }), 90);
    assert.ok(state.player.nitro > nitroBeforeDrift, 'Drifting should recharge nitro reserve');

    // Straighten + nitro + upshift exit -> wait 3.5s to bank drift CR
    stepTicks(Physics, state, makeInput({ throttle: 1, nitro: true, transmissionMode: 'MT', shiftUpRequested: true }), 1);
    const events = stepTicks(Physics, state, makeInput({ throttle: 0.7, nitro: true, transmissionMode: 'MT' }), 230);
    assert.ok(
      state.scoring.totalDriftsBanked >= 1 || events.some((e) => e.type === 'drift_bank'),
      'Drift exit must bank CR after timeout'
    );
  });

  it('3.8 HorizonBridge lifecycle pause/resume & back key interact cleanly with Audio and simulation', () => {
    const env = bootEnv();
    const { Audio } = env.window.H6;
    const Bridge = env.window.HorizonBridge;
    assert.ok(Bridge, 'window.HorizonBridge must be exposed');
    assert.equal(typeof Bridge.onAppPause, 'function');
    assert.equal(typeof Bridge.onAppResume, 'function');
    assert.equal(typeof Bridge.onBackPressed, 'function');

    Audio.init();
    Audio.unlock();
    Bridge.onAppPause();
    env.tickRaf(5);
    Bridge.onAppResume();
    env.tickRaf(10);
    Bridge.onBackPressed();
    env.tickRaf(5);
    assert.equal(env.errors.length, 0);
  });
});
