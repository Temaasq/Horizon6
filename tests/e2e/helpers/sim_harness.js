'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'app', 'src', 'main', 'assets');
const JS_DIR = path.join(ASSETS_DIR, 'js');
const INDEX_HTML_PATH = path.join(ASSETS_DIR, 'index.html');
const CSS_PATH = path.join(ASSETS_DIR, 'css', 'style.css');
const THREE_PATH = path.join(ASSETS_DIR, 'vendor', 'three.min.js');

const EXPECTED_CAR_IDS = [
  'skyline_gtr',
  'rx7_drift',
  'evo_touge',
  'lfa_hyper',
  'jimny_raid',
];

const EXPECTED_REGION_IDS = ['festival', 'tokyo', 'sakura', 'touge'];

function loadSimModules({ fresh = false } = {}) {
  const files = ['cars.js', 'world_data.js', 'physics.js'].map((f) =>
    path.join(JS_DIR, f)
  );
  for (const file of files) {
    assert.ok(fs.existsSync(file), `Missing required simulation module: ${file}`);
    if (fresh) {
      delete require.cache[require.resolve(file)];
    }
  }
  if (fresh && globalThis.H6) {
    delete globalThis.H6;
  }

  const carsRaw = require(files[0]);
  const worldRaw = require(files[1]);
  const physicsRaw = require(files[2]);

  const H6 = globalThis.H6 || {};
  const CARS = Array.isArray(carsRaw)
    ? carsRaw
    : carsRaw.CARS || H6.CARS;
  const getCarById =
    carsRaw.getCarById ||
    H6.getCarById ||
    ((id) => CARS.find((c) => c.id === id) || null);

  const WorldData =
    worldRaw && worldRaw.getTerrainHeight ? worldRaw : H6.WorldData || worldRaw;
  const Physics =
    physicsRaw && physicsRaw.createSimulation
      ? physicsRaw
      : H6.Physics || physicsRaw;

  assert.ok(Array.isArray(CARS), 'H6.CARS must be an Array');
  assert.equal(typeof getCarById, 'function', 'getCarById must be a function');
  assert.ok(WorldData && typeof WorldData.getTerrainHeight === 'function', 'WorldData.getTerrainHeight missing');
  assert.ok(WorldData && typeof WorldData.getSurfaceInfo === 'function', 'WorldData.getSurfaceInfo missing');
  assert.ok(WorldData && typeof WorldData.findNearestRoadPoint === 'function', 'WorldData.findNearestRoadPoint missing');
  assert.ok(Physics && typeof Physics.createSimulation === 'function', 'Physics.createSimulation missing');
  assert.ok(Physics && typeof Physics.stepSimulation === 'function', 'Physics.stepSimulation missing');
  assert.ok(Physics && typeof Physics.switchCar === 'function', 'Physics.switchCar missing');
  assert.ok(Physics && typeof Physics.resetPlayer === 'function', 'Physics.resetPlayer missing');
  assert.ok(Physics && typeof Physics.computeCameraTarget === 'function', 'Physics.computeCameraTarget missing');

  return { CARS, getCarById, WorldData, Physics };
}

function makeInput(overrides = {}) {
  return {
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    nitro: false,
    shiftUpRequested: false,
    shiftDownRequested: false,
    resetRequested: false,
    steerMode: 'wheel',
    transmissionMode: 'AT',
    cameraMode: 'chase',
    ...overrides,
  };
}

function assertFiniteNumber(val, label) {
  assert.equal(typeof val, 'number', `${label} must be a number (got ${typeof val})`);
  assert.ok(Number.isFinite(val), `${label} must be finite (got ${val})`);
}

function assertFiniteState(state, contextLabel = 'state') {
  assert.ok(state && typeof state === 'object', `${contextLabel} must be an object`);
  assertFiniteNumber(state.timeSec, `${contextLabel}.timeSec`);

  const p = state.player;
  assert.ok(p && typeof p === 'object', `${contextLabel}.player missing`);
  for (const key of [
    'x',
    'y',
    'z',
    'vx',
    'vz',
    'heading',
    'speedMs',
    'speedKmh',
    'steerAngle',
    'gear',
    'rpm',
    'nitro',
    'slipAngleDeg',
    'wheelSpin',
    'pitch',
    'roll',
  ]) {
    assertFiniteNumber(p[key], `${contextLabel}.player.${key}`);
  }
  assert.ok(p.nitro >= 0 && p.nitro <= 100.001, `${contextLabel}.player.nitro out of range: ${p.nitro}`);

  const s = state.scoring;
  assert.ok(s && typeof s === 'object', `${contextLabel}.scoring missing`);
  for (const key of [
    'cr',
    'driftPoints',
    'driftMultiplier',
    'driftTimer',
    'totalDriftsBanked',
    'speedTrapBestKmh',
    'lastSpeedTrapKmh',
    'smashedCount',
    'totalTargets',
  ]) {
    assertFiniteNumber(s[key], `${contextLabel}.scoring.${key}`);
  }

  assert.ok(Array.isArray(state.aiTraffic), `${contextLabel}.aiTraffic must be an Array`);
  for (let i = 0; i < state.aiTraffic.length; i++) {
    const ai = state.aiTraffic[i];
    for (const key of ['x', 'y', 'z', 'heading', 'speedMs', 'wheelSpin']) {
      assertFiniteNumber(ai[key], `${contextLabel}.aiTraffic[${i}].${key}`);
    }
  }
}

function stepTicks(Physics, state, inputOrFn, ticks, dt = 1 / 60, { assertFinite = true } = {}) {
  const collectedEvents = [];
  for (let i = 0; i < ticks; i++) {
    const input = typeof inputOrFn === 'function' ? inputOrFn(i, state) : inputOrFn;
    Physics.stepSimulation(state, input, dt);
    if (Array.isArray(state.events) && state.events.length > 0) {
      collectedEvents.push(...state.events);
    }
    if (assertFinite) {
      assertFiniteState(state, `tick[${i}]`);
    }
  }
  return collectedEvents;
}

function extractCamVec(cam, keys) {
  for (const k of keys) {
    if (cam && cam[k] && typeof cam[k].x === 'number') {
      return cam[k];
    }
  }
  return null;
}

function normalizeCameraTarget(cam) {
  assert.ok(cam && typeof cam === 'object', 'computeCameraTarget must return an object');
  const pos = extractCamVec(cam, ['position', 'pos', 'eye', 'cameraPos']) ||
    (typeof cam.x === 'number' ? { x: cam.x, y: cam.y, z: cam.z } : null);
  const look = extractCamVec(cam, ['lookAt', 'target', 'look', 'center']);
  assert.ok(pos, 'Camera target must expose finite position vector');
  assert.ok(look, 'Camera target must expose finite lookAt/target vector');
  assertFiniteNumber(pos.x, 'cam.pos.x');
  assertFiniteNumber(pos.y, 'cam.pos.y');
  assertFiniteNumber(pos.z, 'cam.pos.z');
  assertFiniteNumber(look.x, 'cam.look.x');
  assertFiniteNumber(look.y, 'cam.look.y');
  assertFiniteNumber(look.z, 'cam.look.z');
  assertFiniteNumber(cam.fov, 'cam.fov');
  return { pos, look, fov: cam.fov };
}

module.exports = {
  PROJECT_ROOT,
  ASSETS_DIR,
  JS_DIR,
  INDEX_HTML_PATH,
  CSS_PATH,
  THREE_PATH,
  EXPECTED_CAR_IDS,
  EXPECTED_REGION_IDS,
  loadSimModules,
  makeInput,
  assertFiniteNumber,
  assertFiniteState,
  stepTicks,
  normalizeCameraTarget,
};
