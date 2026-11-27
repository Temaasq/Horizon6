'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var ROOT = path.resolve(__dirname, '../..');
var JS_DIR = path.join(ROOT, 'app/src/main/assets/js');

var Cars = require(path.join(JS_DIR, 'cars.js'));
var WorldData = require(path.join(JS_DIR, 'world_data.js'));
var Physics = require(path.join(JS_DIR, 'physics.js'));

function assertAllFinite(obj, label) {
  if (typeof obj === 'number') {
    assert.ok(Number.isFinite(obj), label + ' is not finite: ' + obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      assertAllFinite(obj[i], label + '[' + i + ']');
    }
    return;
  }
  if (obj && typeof obj === 'object') {
    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      assertAllFinite(obj[key], label + '.' + key);
    }
  }
}

function makeInput(overrides) {
  return Object.assign({
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
    cameraMode: 'chase'
  }, overrides || {});
}

test('UMD browser global pattern works cleanly in VM with zero DOM/Three.js', function () {
  var sandbox = { globalThis: null, Math: Math, Number: Number, Object: Object, Array: Array };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(JS_DIR, 'cars.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, 'world_data.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, 'physics.js'), 'utf8'), sandbox);

  assert.ok(sandbox.H6, 'globalThis.H6 should exist');
  assert.ok(Array.isArray(sandbox.H6.CARS) && sandbox.H6.CARS.length === 5);
  assert.ok(sandbox.H6.Cars && typeof sandbox.H6.Cars.getCarById === 'function');
  assert.ok(sandbox.H6.WorldData && typeof sandbox.H6.WorldData.getSurfaceInfo === 'function');
  assert.ok(sandbox.H6.Physics && typeof sandbox.H6.Physics.createSimulation === 'function');

  var sim = sandbox.H6.Physics.createSimulation('rx7_drift');
  sandbox.H6.Physics.stepSimulation(sim, makeInput({ throttle: 1 }), 1 / 60);
  assertAllFinite(sim.player, 'vm.player');
});

test('All 5 cars have complete metadata, distinct profiles, and distinct asphalt performance', function () {
  assert.equal(Cars.CARS.length, 5);
  var expectedIds = ['skyline_gtr', 'rx7_drift', 'evo_touge', 'lfa_hyper', 'jimny_raid'];
  var bodyStyles = new Set();
  var colors = new Set();

  for (var i = 0; i < expectedIds.length; i++) {
    var car = Cars.getCarById(expectedIds[i]);
    assert.ok(car, 'Missing car: ' + expectedIds[i]);
    assert.ok(car.nameRu && car.subtitleRu && car.categoryRu);
    assert.ok(car.bodyStyle);
    bodyStyles.add(car.bodyStyle);
    colors.add(car.colors.primary);

    assert.ok(car.statsDisplay && typeof car.statsDisplay.speed === 'number');
    assert.ok(car.camera && typeof car.camera.hoodY === 'number' && typeof car.camera.chaseDist === 'number');

    var p = car.physics;
    assert.ok(p.topSpeed > 0 && p.maxSpeedKmh === p.topSpeed);
    assert.ok(p.engineForce > 0 && p.brakeForce > 0);
    assert.ok(p.lateralGrip > 0 && p.driftSlip > 0 && p.offRoadGrip > 0);
    assert.ok(p.mass > 0 && Array.isArray(p.gearRatios) && p.gearRatios.length >= 5);
    assert.ok(p.finalDrive > 0 && p.nitroBoost > 1 && p.enginePitchMult > 0);
  }

  assert.equal(bodyStyles.size, 5, 'All 5 cars must have distinct silhouettes');
  assert.equal(colors.size, 5, 'All 5 cars must have distinct primary colors');

  // Verify real asphalt acceleration & top speed differentiation
  var speedsAt4s = {};
  for (var c = 0; c < expectedIds.length; c++) {
    var sim = Physics.createSimulation(expectedIds[c]);
    for (var tick = 0; tick < 240; tick++) {
      Physics.stepSimulation(sim, makeInput({ throttle: 1 }), Physics.FIXED_DT);
    }
    speedsAt4s[expectedIds[c]] = sim.player.speedKmh;
  }
  assert.ok(speedsAt4s.lfa_hyper > speedsAt4s.jimny_raid + 40,
    'LFA hypercar should significantly out-accelerate Jimny on asphalt');
});

test('WorldData defines 4 Japan regions, Mt. Fuji, terrain-embedded roads, clear buildings, traps, boards, and AI routes', function () {
  assert.equal(WorldData.WORLD_HALF_SIZE, 1000);
  assert.equal(WorldData.PLAYABLE_BOUND, 960);
  assert.equal(WorldData.REGIONS.length, 4);
  assert.equal(WorldData.SPEED_TRAPS.length, 4);
  assert.equal(WorldData.BONUS_TARGETS.length, 24);
  assert.equal(WorldData.AI_SPAWNS.length, 12);

  var civCount = WorldData.AI_SPAWNS.filter(function (a) { return !a.isRival; }).length;
  var rivalCount = WorldData.AI_SPAWNS.filter(function (a) { return a.isRival; }).length;
  assert.equal(civCount, 9);
  assert.equal(rivalCount, 3);

  // Spawn check
  var spawnSurf = WorldData.getSurfaceInfo(0, 50);
  assert.equal(spawnSurf.surface, 'asphalt');
  assert.equal(spawnSurf.onRoad, true);
  assert.equal(spawnSurf.regionId, 'festival');
  assert.equal(spawnSurf.regionNameRu, 'ФЕСТИВАЛЬ ХОРАЙЗОН');

  // Region queries
  assert.equal(WorldData.getSurfaceInfo(-120, -460).regionId, 'tokyo');
  assert.equal(WorldData.getSurfaceInfo(490, 110).regionId, 'sakura');
  assert.equal(WorldData.getSurfaceInfo(-540, 560).regionId, 'touge');

  // Mt. Fuji peak & Touge Summit elevation
  var fujiPeakY = WorldData.getTerrainHeight(-760, -760);
  assert.ok(Math.abs(fujiPeakY - 320) < 1.0, 'Fuji peak should be 320m, got ' + fujiPeakY);

  var summitSurf = WorldData.getSurfaceInfo(-540, 560);
  assert.equal(summitSurf.surface, 'asphalt');
  assert.equal(summitSurf.onRoad, true);
  assert.ok(summitSurf.height > 60 && summitSurf.height < 70, 'Touge summit ~66m, got ' + summitSurf.height);
  assert.ok(Math.abs(Math.hypot(summitSurf.normal.x, summitSurf.normal.y, summitSurf.normal.z) - 1) < 1e-4);

  // Dirt shortcut & off-road grass check
  var dirtSurf = WorldData.getSurfaceInfo(-620, 260);
  assert.equal(dirtSurf.surface, 'dirt');
  var grassSurf = WorldData.getSurfaceInfo(850, 850);
  assert.equal(grassSurf.surface, 'grass');
  assert.equal(grassSurf.onRoad, false);

  // Verify no building overlaps any road centerline
  for (var bIdx = 0; bIdx < WorldData.BUILDINGS.length; bIdx++) {
    var b = WorldData.BUILDINGS[bIdx];
    var bSurf = WorldData.getSurfaceInfo(b.x, b.z);
    assert.equal(bSurf.onRoad, false, 'Building ' + bIdx + ' at (' + b.x + ',' + b.z + ') overlaps a road!');
  }

  // Verify all 4 speed traps sit on asphalt roads
  for (var tIdx = 0; tIdx < WorldData.SPEED_TRAPS.length; tIdx++) {
    var trap = WorldData.SPEED_TRAPS[tIdx];
    var tSurf = WorldData.getSurfaceInfo(trap.x, trap.z);
    assert.equal(tSurf.surface, 'asphalt', 'Speed trap ' + trap.id + ' must be on asphalt');
    assert.ok(trap.nameRu && trap.nameRu.length > 0);
  }

  // Verify nearest road lookup from off-road
  var nearest = WorldData.findNearestRoadPoint(850, 850);
  assertAllFinite(nearest, 'nearestRoadPoint');
  assert.equal(WorldData.getSurfaceInfo(nearest.x, nearest.z).onRoad, true);
});

test('Steering sign convention: +steer turns LEFT (heading increases, vx < 0), -steer turns RIGHT', function () {
  var simL = Physics.createSimulation('skyline_gtr');
  for (var i = 0; i < 60; i++) {
    Physics.stepSimulation(simL, makeInput({ throttle: 0.8, steer: 1.0 }), Physics.FIXED_DT);
  }
  assert.ok(simL.player.heading > 0.1, 'Positive steer must increase heading (turn left)');
  assert.ok(simL.player.vx < -1.0, 'Turning left from North (-Z) must move toward -X');

  var simR = Physics.createSimulation('skyline_gtr');
  for (var j = 0; j < 60; j++) {
    Physics.stepSimulation(simR, makeInput({ throttle: 0.8, steer: -1.0 }), Physics.FIXED_DT);
  }
  assert.ok(simR.player.heading < -0.1, 'Negative steer must decrease heading (turn right)');
  assert.ok(simR.player.vx > 1.0, 'Turning right from North (-Z) must move toward +X');
});

test('AT and MT transmission gear shifting, neutral revving, reverse, and rev limiter', function () {
  // AT upshift & downshift & auto-reverse
  var simAT = Physics.createSimulation('skyline_gtr');
  for (var i = 0; i < 360; i++) {
    Physics.stepSimulation(simAT, makeInput({ throttle: 1, transmissionMode: 'AT' }), Physics.FIXED_DT);
  }
  assert.ok(simAT.player.gear >= 3, 'AT should upshift under full acceleration, got gear ' + simAT.player.gear);

  // Brake to stop and enter AT reverse
  for (var j = 0; j < 360; j++) {
    Physics.stepSimulation(simAT, makeInput({ brake: 1, transmissionMode: 'AT' }), Physics.FIXED_DT);
  }
  assert.equal(simAT.player.gear, -1, 'AT should enter reverse (-1) when stopped and brake held');
  // Continue holding brake in AT reverse -> drives backwards (+Z when heading ~0)
  var zBeforeRev = simAT.player.z;
  for (var k = 0; k < 60; k++) {
    Physics.stepSimulation(simAT, makeInput({ brake: 1, transmissionMode: 'AT' }), Physics.FIXED_DT);
  }
  assert.ok(simAT.player.z > zBeforeRev + 1.0, 'AT reverse with brake held should move backwards');

  // MT mode: edge-triggered shifts, Neutral free-rev, Gear 1 rev-limiter
  var simMT = Physics.createSimulation('evo_touge');
  Physics.stepSimulation(simMT, makeInput({ transmissionMode: 'MT', shiftDownRequested: true }), Physics.FIXED_DT);
  assert.equal(simMT.player.gear, 0, 'MT shift down from 1 goes to N (0)');

  // Free rev in Neutral should increase RPM without moving forward
  for (var n = 0; n < 30; n++) {
    Physics.stepSimulation(simMT, makeInput({ transmissionMode: 'MT', throttle: 1 }), Physics.FIXED_DT);
  }
  assert.ok(simMT.player.rpm > 3500, 'Engine should rev in Neutral');
  assert.ok(simMT.player.speedKmh < 1.0, 'Car should not accelerate in Neutral');

  // Shift up to 1, stay in gear 1 -> should NOT auto-upshift and should top out near gear 1 limit
  Physics.stepSimulation(simMT, makeInput({ transmissionMode: 'MT', shiftUpRequested: true }), Physics.FIXED_DT);
  assert.equal(simMT.player.gear, 1);
  for (var m = 0; m < 240; m++) {
    Physics.stepSimulation(simMT, makeInput({ transmissionMode: 'MT', throttle: 1 }), Physics.FIXED_DT);
  }
  assert.equal(simMT.player.gear, 1, 'MT must not auto-upshift');
  assert.ok(simMT.player.speedKmh < 85, 'Gear 1 rev limiter must cap speed');

  // Shift up twice -> 2 -> 3
  Physics.stepSimulation(simMT, makeInput({ transmissionMode: 'MT', shiftUpRequested: true }), Physics.FIXED_DT);
  Physics.stepSimulation(simMT, makeInput({ transmissionMode: 'MT', shiftUpRequested: true }), Physics.FIXED_DT);
  assert.equal(simMT.player.gear, 3);
});

test('Off-road physics differentiation: Jimny and Evo outperform LFA hypercar on grass', function () {
  function runOnGrass(carId) {
    var sim = Physics.createSimulation(carId);
    // Place on flat open grass area away from roads/buildings
    sim.player.x = 800;
    sim.player.z = 800;
    sim.player.heading = 0;
    for (var i = 0; i < 300; i++) {
      Physics.stepSimulation(sim, makeInput({ throttle: 1 }), Physics.FIXED_DT);
    }
    var car = Cars.getCarById(carId);
    return {
      speedKmh: sim.player.speedKmh,
      retention: sim.player.speedKmh / car.physics.maxSpeedKmh,
      surface: sim.player.surface
    };
  }

  var jimny = runOnGrass('jimny_raid');
  var evo = runOnGrass('evo_touge');
  var lfa = runOnGrass('lfa_hyper');

  assert.equal(jimny.surface, 'grass');
  assert.ok(jimny.retention > lfa.retention + 0.25,
    'Jimny retention (' + jimny.retention.toFixed(2) + ') must greatly exceed LFA (' + lfa.retention.toFixed(2) + ')');
  assert.ok(evo.retention > lfa.retention + 0.20,
    'Evo retention (' + evo.retention.toFixed(2) + ') must greatly exceed LFA (' + lfa.retention.toFixed(2) + ')');
  assert.ok(jimny.speedKmh > lfa.speedKmh,
    'Jimny actual off-road speed (' + jimny.speedKmh.toFixed(1) + ') should beat LFA (' + lfa.speedKmh.toFixed(1) + ')');
});

test('Car switching resets transient velocity/RPM/drift cleanly with zero NaNs while preserving CR', function () {
  var sim = Physics.createSimulation('lfa_hyper');
  for (var i = 0; i < 120; i++) {
    Physics.stepSimulation(sim, makeInput({ throttle: 1, nitro: true }), Physics.FIXED_DT);
  }
  sim.scoring.cr = 4200;
  sim.scoring.driftPoints = 950;
  sim.scoring.driftMultiplier = 2;
  var savedX = sim.player.x;
  var savedZ = sim.player.z;

  var allIds = ['rx7_drift', 'evo_touge', 'jimny_raid', 'skyline_gtr', 'lfa_hyper'];
  for (var k = 0; k < allIds.length; k++) {
    Physics.switchCar(sim, allIds[k]);
    assert.equal(sim.activeCarId, allIds[k]);
    assert.equal(sim.player.speedMs, 0);
    assert.equal(sim.player.driftPoints || sim.scoring.driftPoints, 0);
    assert.equal(sim.scoring.cr, 4200);
    assert.ok(Math.abs(sim.player.x - savedX) < 1e-6);
    assert.ok(Math.abs(sim.player.z - savedZ) < 1e-6);
    assertAllFinite(sim.player, 'switch.' + allIds[k]);
    assertAllFinite(sim.scoring, 'switch.scoring.' + allIds[k]);
  }
});

test('Drift skill chain accumulates multiplier, banks CR after timeout, and breaks on hard crash', function () {
  var sim = Physics.createSimulation('rx7_drift');
  // Accelerate up to drift speed
  for (var i = 0; i < 140; i++) {
    Physics.stepSimulation(sim, makeInput({ throttle: 1 }), Physics.FIXED_DT);
  }
  // Initiate sustained slide using steering + handbrake + throttle pulses
  var sawDrift = false;
  var maxMult = 1;
  for (var d = 0; d < 160; d++) {
    Physics.stepSimulation(sim, makeInput({
      throttle: 1,
      steer: 1,
      handbrake: d % 25 < 12
    }), Physics.FIXED_DT);
    if (sim.player.isDrifting) sawDrift = true;
    if (sim.scoring.driftMultiplier > maxMult) maxMult = sim.scoring.driftMultiplier;
  }

  assert.ok(sawDrift, 'RX-7 should enter active drift state');
  assert.ok(sim.scoring.driftPoints > 100, 'Drift should accumulate points, got ' + sim.scoring.driftPoints);
  assert.ok(maxMult >= 2 || sim.scoring.driftPoints >= 500, 'Drift chain should reach >=2x multiplier');

  // Coast straight for > 3.1s to bank the drift chain
  var bankedEvent = null;
  for (var w = 0; w < 210; w++) {
    Physics.stepSimulation(sim, makeInput({}), Physics.FIXED_DT);
    while (sim.events.length > 0) {
      var ev = sim.events.shift();
      if (ev.type === 'drift_bank') bankedEvent = ev;
    }
  }
  assert.ok(bankedEvent, 'Drift chain must emit drift_bank after 3.0s timeout');
  assert.ok(sim.scoring.cr > 0 && sim.scoring.totalDriftsBanked === 1);

  // Now simulate high-speed collision breaking an active unbanked drift chain
  sim.scoring.driftPoints = 1200;
  sim.scoring.driftMultiplier = 2;
  sim.scoring.driftTimer = 2.5;
  sim.player.x = 959.6;
  sim.player.z = 0;
  sim.player.heading = -Math.PI / 2;
  sim.player.vx = 40; // heading straight into +960m boundary
  sim.player.vz = 0;
  Physics.stepSimulation(sim, makeInput({}), Physics.FIXED_DT);

  var failedEvent = sim.events.find(function (e) { return e.type === 'drift_fail'; });
  assert.ok(failedEvent, 'High-impact collision should break drift chain and emit drift_fail');
  assert.equal(sim.scoring.driftPoints, 0);
});

test('Speed trap crossing, bonus target smash, nitro boost, and collisions', function () {
  var sim = Physics.createSimulation('lfa_hyper');
  sim.events.length = 0;

  // Drive straight North along Festival Boulevard from (0, 50) -> passes board_05 (0,-20) & trap_festival (0,-70)
  var sawSmash = false;
  var sawTrap = false;
  for (var i = 0; i < 240; i++) {
    Physics.stepSimulation(sim, makeInput({ throttle: 1, nitro: i < 90 }), Physics.FIXED_DT);
    while (sim.events.length > 0) {
      var ev = sim.events.shift();
      if (ev.type === 'target_smash') sawSmash = true;
      if (ev.type === 'speed_trap') sawTrap = true;
    }
  }
  assert.ok(sawSmash, 'Driving straight from spawn should smash board_05 at (0, -20)');
  assert.ok(sim.scoring.smashedCount >= 1);
  assert.ok(sawTrap, 'Driving straight from spawn should trigger trap_festival at (0, -70)');
  assert.ok(sim.scoring.speedTrapBestKmh > 100);
  assert.ok(sim.scoring.cr >= 1500);
  assert.ok(sim.player.nitro < 100, 'Nitro should have consumed while active');

  // Building collision check (place car right next to stage building at (0, 152), d=18 -> z=143 edge)
  sim.player.x = 0;
  sim.player.z = 141.5;
  sim.player.vx = 0;
  sim.player.vz = 25;
  sim.events.length = 0;
  Physics.stepSimulation(sim, makeInput({}), Physics.FIXED_DT);
  assert.ok(sim.player.vz < 0, 'Building impact should bounce velocity back');
  assert.ok(sim.events.some(function (e) { return e.type === 'collision' && e.kind === 'building'; }));
});

test('Camera target modes (chase & hood), resetPlayer, and 12s AI traffic progression', function () {
  var sim = Physics.createSimulation('skyline_gtr');

  // Run 12 seconds (720 ticks) of simulation + test huge dt clamp (dt = 10.0)
  for (var t = 0; t < 720; t++) {
    Physics.stepSimulation(sim, makeInput({ throttle: 0.7 }), Physics.FIXED_DT);
  }
  Physics.stepSimulation(sim, makeInput({ throttle: 0.5 }), 10.0);

  assertAllFinite(sim.player, 'after12s.player');
  assert.equal(sim.aiTraffic.length, 12);

  for (var a = 0; a < sim.aiTraffic.length; a++) {
    var ai = sim.aiTraffic[a];
    assertAllFinite(ai, 'ai[' + a + ']');
    assert.ok(ai.speedMs > 0.5, 'AI vehicle ' + ai.id + ' should be moving after 12s');
  }

  // Test player-vs-AI collision impulse
  var targetAi = sim.aiTraffic[0];
  sim.player.x = targetAi.x;
  sim.player.z = targetAi.z + 1.0;
  sim.player.vx = 0;
  sim.player.vz = -22;
  sim.events.length = 0;
  Physics.stepSimulation(sim, makeInput({}), Physics.FIXED_DT);
  assert.ok(sim.events.some(function (e) { return e.type === 'collision' && e.kind === 'ai'; }),
    'Player impact with AI should trigger ai collision event');

  // Camera target modes
  var chaseCam = Physics.computeCameraTarget(sim, 'chase');
  var hoodCam = Physics.computeCameraTarget(sim, 'hood');
  assert.equal(chaseCam.mode, 'chase');
  assert.equal(hoodCam.mode, 'hood');
  assertAllFinite(chaseCam, 'chaseCam');
  assertAllFinite(hoodCam, 'hoodCam');
  assert.ok(chaseCam.fov >= 62 && hoodCam.fov >= 72);

  // Unstuck resetPlayer
  sim.player.x = 880;
  sim.player.z = 880;
  Physics.resetPlayer(sim);
  assert.equal(WorldData.getSurfaceInfo(sim.player.x, sim.player.z).onRoad, true);
  assert.equal(sim.player.speedMs, 0);
  assertAllFinite(sim.player, 'resetPlayer');
});
