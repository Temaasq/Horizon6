(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var Cars = require('./cars.js');
    var WorldData = require('./world_data.js');
    module.exports = factory(Cars, WorldData);
  } else {
    root.H6 = root.H6 || {};
    var CarsGlobal = root.H6.Cars || { CARS: root.H6.CARS, getCarById: root.H6.getCarById };
    root.H6.Physics = factory(CarsGlobal, root.H6.WorldData);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Cars, WorldData) {
  'use strict';

  var FIXED_DT = 1 / 60;
  var MAX_FRAME_DT = 0.05;
  var PLAYER_RADIUS = 1.65;
  var AI_RADIUS = 1.60;
  var TARGET_RADIUS = 3.40;
  var DRIFT_BANK_TIMEOUT = 3.0;
  var CRASH_DELTA_SPEED_MS = 7.5;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function finiteOr(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
  }

  function normalizeAngle(a) {
    if (!Number.isFinite(a)) return 0;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function resolveCar(carId) {
    if (Cars && typeof Cars.resolveCar === 'function') {
      return Cars.resolveCar(carId);
    }
    if (Cars && typeof Cars.getCarById === 'function') {
      var found = Cars.getCarById(carId);
      if (found) return found;
    }
    var list = (Cars && Cars.CARS) || Cars || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === carId) return list[i];
    }
    return list[0];
  }

  function createInitialAITraffic() {
    var routes = WorldData.AI_ROUTES || [];
    var spawns = WorldData.AI_SPAWNS || [];
    var list = [];
    for (var i = 0; i < spawns.length; i++) {
      var sp = spawns[i];
      var route = routes[sp.routeIndex % routes.length];
      var wps = route.waypoints;
      var wpIdx = sp.wpIndex % wps.length;
      var nextIdx = (wpIdx + 1) % wps.length;
      var wp = wps[wpIdx];
      var nwp = wps[nextIdx];
      var dx = nwp.x - wp.x;
      var dz = nwp.z - wp.z;
      var len = Math.hypot(dx, dz) || 1;
      var heading = Math.atan2(-dx / len, -dz / len);
      var speedMs = (wp.targetSpeedKmh || 60) / 3.6;
      list.push({
        id: sp.id,
        carStyle: sp.carStyle,
        color: sp.color,
        x: wp.x,
        y: WorldData.getTerrainHeight(wp.x, wp.z),
        z: wp.z,
        heading: heading,
        speedMs: speedMs * 0.85,
        routeIndex: sp.routeIndex % routes.length,
        wpIndex: nextIdx,
        isRival: !!sp.isRival,
        wheelSpin: 0,
        pauseTimer: 0
      });
    }
    return list;
  }

  function createInitialTargets() {
    var src = WorldData.BONUS_TARGETS || [];
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var t = src[i];
      out.push({
        id: t.id,
        x: t.x,
        y: t.y,
        z: t.z,
        valueCr: t.valueCr,
        regionId: t.regionId,
        collected: false
      });
    }
    return out;
  }

  function createSimulation(carId) {
    var car = resolveCar(carId);
    var spawn = WorldData.SPAWN_POINT || { x: 0, y: 0, z: 50, heading: 0 };
    var surf = WorldData.getSurfaceInfo(spawn.x, spawn.z);
    var targets = createInitialTargets();

    return {
      timeSec: 0,
      _accum: 0,
      _shiftCooldown: 0,
      _trapCooldowns: {},
      activeCarId: car.id,
      transmissionMode: 'AT',
      player: {
        x: spawn.x,
        y: surf.height,
        z: spawn.z,
        vx: 0,
        vz: 0,
        heading: spawn.heading,
        speedMs: 0,
        speedKmh: 0,
        steerAngle: 0,
        gear: 1,
        rpm: car.physics.idleRpm,
        nitro: 100,
        isNitroActive: false,
        isDrifting: false,
        slipAngleDeg: 0,
        surface: surf.surface,
        regionId: surf.regionId,
        regionNameRu: surf.regionNameRu,
        wheelSpin: 0,
        pitch: 0,
        roll: 0,
        isBraking: false
      },
      scoring: {
        cr: 0,
        driftPoints: 0,
        driftMultiplier: 1,
        driftTimer: 0,
        totalDriftsBanked: 0,
        speedTrapBestKmh: 0,
        lastSpeedTrapKmh: 0,
        lastSpeedTrapNameRu: '',
        smashedCount: 0,
        totalTargets: targets.length,
        trapRecords: {}
      },
      aiTraffic: createInitialAITraffic(),
      targets: targets,
      events: []
    };
  }

  function sanitizePlayer(state, car) {
    var p = state.player;
    var bound = WorldData.PLAYABLE_BOUND || 960;
    p.x = clamp(finiteOr(p.x, 0), -bound, bound);
    p.z = clamp(finiteOr(p.z, 50), -bound, bound);
    p.vx = clamp(finiteOr(p.vx, 0), -140, 140);
    p.vz = clamp(finiteOr(p.vz, 0), -140, 140);
    p.heading = normalizeAngle(finiteOr(p.heading, 0));
    p.speedMs = Math.hypot(p.vx, p.vz);
    p.speedKmh = p.speedMs * 3.6;
    p.steerAngle = clamp(finiteOr(p.steerAngle, 0), -0.8, 0.8);
    p.rpm = clamp(finiteOr(p.rpm, car.physics.idleRpm), car.physics.idleRpm, car.physics.maxRpm);
    p.nitro = clamp(finiteOr(p.nitro, 100), 0, 100);
    p.slipAngleDeg = clamp(finiteOr(p.slipAngleDeg, 0), -180, 180);
    p.pitch = clamp(finiteOr(p.pitch, 0), -0.6, 0.6);
    p.roll = clamp(finiteOr(p.roll, 0), -0.6, 0.6);
    p.wheelSpin = finiteOr(p.wheelSpin, 0);
    var surf = WorldData.getSurfaceInfo(p.x, p.z);
    p.y = finiteOr(surf.height, 0);
    p.surface = surf.surface;
    p.regionId = surf.regionId;
    p.regionNameRu = surf.regionNameRu;
  }

  function switchCar(state, carId) {
    var found = Cars && typeof Cars.getCarById === 'function' ? Cars.getCarById(carId) : null;
    var car = found || resolveCar(state.activeCarId);
    var p = state.player;
    var bound = WorldData.PLAYABLE_BOUND || 960;
    p.x = clamp(finiteOr(p.x, 0), -bound, bound);
    p.z = clamp(finiteOr(p.z, 50), -bound, bound);
    var surf = WorldData.getSurfaceInfo(p.x, p.z);

    state.activeCarId = car.id;
    state._shiftCooldown = 0;
    p.y = finiteOr(surf.height, 0);
    p.vx = 0;
    p.vz = 0;
    p.speedMs = 0;
    p.speedKmh = 0;
    p.steerAngle = 0;
    p.gear = 1;
    p.rpm = car.physics.idleRpm;
    p.isNitroActive = false;
    p.isDrifting = false;
    p.slipAngleDeg = 0;
    p.pitch = 0;
    p.roll = 0;
    p.isBraking = false;
    p.surface = surf.surface;
    p.regionId = surf.regionId;
    p.regionNameRu = surf.regionNameRu;

    state.scoring.driftPoints = 0;
    state.scoring.driftMultiplier = 1;
    state.scoring.driftTimer = 0;
    return car;
  }

  function resetPlayer(state) {
    var car = resolveCar(state.activeCarId);
    var p = state.player;
    var roadPt = WorldData.findNearestRoadPoint(finiteOr(p.x, 0), finiteOr(p.z, 50));
    p.x = roadPt.x;
    p.y = roadPt.y;
    p.z = roadPt.z;
    p.heading = normalizeAngle(roadPt.heading);
    p.vx = 0;
    p.vz = 0;
    p.speedMs = 0;
    p.speedKmh = 0;
    p.steerAngle = 0;
    p.gear = 1;
    p.rpm = car.physics.idleRpm;
    p.isNitroActive = false;
    p.isDrifting = false;
    p.slipAngleDeg = 0;
    p.pitch = 0;
    p.roll = 0;
    p.isBraking = false;
    state.scoring.driftPoints = 0;
    state.scoring.driftMultiplier = 1;
    state.scoring.driftTimer = 0;
    sanitizePlayer(state, car);
  }

  function computeDriftMultiplier(points) {
    if (points >= 5000) return 5;
    if (points >= 3000) return 4;
    if (points >= 1500) return 3;
    if (points >= 500) return 2;
    return 1;
  }

  function breakDriftChain(state, impactDeltaMs) {
    if (state.scoring.driftPoints > 0 && impactDeltaMs > CRASH_DELTA_SPEED_MS) {
      state.events.push({
        type: 'drift_fail',
        lostPoints: Math.round(state.scoring.driftPoints)
      });
      state.scoring.driftPoints = 0;
      state.scoring.driftMultiplier = 1;
      state.scoring.driftTimer = 0;
    }
  }

  function stepAITraffic(state, dt) {
    var routes = WorldData.AI_ROUTES || [];
    var aiList = state.aiTraffic;
    var p = state.player;

    for (var i = 0; i < aiList.length; i++) {
      var ai = aiList[i];
      var route = routes[ai.routeIndex];
      if (!route || !route.waypoints || route.waypoints.length === 0) continue;

      if (ai.pauseTimer > 0) {
        ai.pauseTimer = Math.max(0, ai.pauseTimer - dt);
      }

      var wps = route.waypoints;
      var wp = wps[ai.wpIndex];
      var nextWp = wps[(ai.wpIndex + 1) % wps.length];

      var dx = wp.x - ai.x;
      var dz = wp.z - ai.z;
      var dist = Math.hypot(dx, dz);

      if (dist < 8.5) {
        ai.wpIndex = (ai.wpIndex + 1) % wps.length;
        wp = wps[ai.wpIndex];
        nextWp = wps[(ai.wpIndex + 1) % wps.length];
        dx = wp.x - ai.x;
        dz = wp.z - ai.z;
        dist = Math.hypot(dx, dz);
      }

      var dirX = dx / (dist || 1);
      var dirZ = dz / (dist || 1);
      var desiredHeading = Math.atan2(-dirX, -dirZ);
      var hDiff = normalizeAngle(desiredHeading - ai.heading);
      ai.heading = normalizeAngle(ai.heading + clamp(hDiff, -3.2 * dt, 3.2 * dt));

      // Corner speed scaling based on curvature into next segment
      var ndx = nextWp.x - wp.x;
      var ndz = nextWp.z - wp.z;
      var nLen = Math.hypot(ndx, ndz) || 1;
      var cosCorner = clamp((dirX * (ndx / nLen) + dirZ * (ndz / nLen)), -1, 1);
      var cornerScale = 0.55 + 0.45 * ((cosCorner + 1) * 0.5);
      var targetSpeedMs = ((wp.targetSpeedKmh || 60) / 3.6) * cornerScale;

      if (ai.pauseTimer > 0) {
        targetSpeedMs *= 0.35;
      }

      // Lookahead separation braking against other AI vehicles and player
      var aiFx = -Math.sin(ai.heading);
      var aiFz = -Math.cos(ai.heading);
      var aiRx = Math.cos(ai.heading);
      var aiRz = -Math.sin(ai.heading);
      var minGap = 999;

      for (var j = 0; j < aiList.length; j++) {
        if (i === j) continue;
        var other = aiList[j];
        var ox = other.x - ai.x;
        var oz = other.z - ai.z;
        var fwdDist = ox * aiFx + oz * aiFz;
        if (fwdDist > 0 && fwdDist < 20) {
          var latDist = Math.abs(ox * aiRx + oz * aiRz);
          if (latDist < 3.4 && fwdDist < minGap) {
            minGap = fwdDist;
          }
        }
      }

      var px = p.x - ai.x;
      var pz = p.z - ai.z;
      var pFwd = px * aiFx + pz * aiFz;
      if (pFwd > 0 && pFwd < 18) {
        var pLat = Math.abs(px * aiRx + pz * aiRz);
        if (pLat < 3.4 && pFwd < minGap) {
          minGap = pFwd;
        }
      }

      if (minGap < 20) {
        var gapFactor = clamp((minGap - 5.5) / 14.5, 0, 1);
        targetSpeedMs *= gapFactor;
      }

      var accel = targetSpeedMs > ai.speedMs ? 12.0 : 22.0;
      if (ai.speedMs < targetSpeedMs) {
        ai.speedMs = Math.min(targetSpeedMs, ai.speedMs + accel * dt);
      } else {
        ai.speedMs = Math.max(targetSpeedMs, ai.speedMs - accel * dt);
      }

      ai.x += -Math.sin(ai.heading) * ai.speedMs * dt;
      ai.z += -Math.cos(ai.heading) * ai.speedMs * dt;
      ai.y = finiteOr(WorldData.getTerrainHeight(ai.x, ai.z), 0);
      ai.wheelSpin = finiteOr(ai.wheelSpin + (ai.speedMs * dt) / 0.34, 0);
    }
  }

  function resolveCollisions(state, car) {
    var p = state.player;
    var bound = WorldData.PLAYABLE_BOUND || 960;

    // 1. World boundary +/-960m elastic deflection
    if (p.x > bound) {
      var impX1 = Math.abs(p.vx);
      p.x = bound;
      p.vx = -Math.abs(p.vx) * 0.45;
      if (impX1 > 2.5) {
        state.events.push({ type: 'collision', kind: 'boundary', impactMs: impX1 });
        breakDriftChain(state, impX1);
      }
    } else if (p.x < -bound) {
      var impX2 = Math.abs(p.vx);
      p.x = -bound;
      p.vx = Math.abs(p.vx) * 0.45;
      if (impX2 > 2.5) {
        state.events.push({ type: 'collision', kind: 'boundary', impactMs: impX2 });
        breakDriftChain(state, impX2);
      }
    }

    if (p.z > bound) {
      var impZ1 = Math.abs(p.vz);
      p.z = bound;
      p.vz = -Math.abs(p.vz) * 0.45;
      if (impZ1 > 2.5) {
        state.events.push({ type: 'collision', kind: 'boundary', impactMs: impZ1 });
        breakDriftChain(state, impZ1);
      }
    } else if (p.z < -bound) {
      var impZ2 = Math.abs(p.vz);
      p.z = -bound;
      p.vz = Math.abs(p.vz) * 0.45;
      if (impZ2 > 2.5) {
        state.events.push({ type: 'collision', kind: 'boundary', impactMs: impZ2 });
        breakDriftChain(state, impZ2);
      }
    }

    // 2. Buildings AABB vs player circle
    var buildings = WorldData.BUILDINGS || [];
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      var halfW = b.w * 0.5;
      var halfD = b.d * 0.5;
      var closestX = clamp(p.x, b.x - halfW, b.x + halfW);
      var closestZ = clamp(p.z, b.z - halfD, b.z + halfD);
      var dx = p.x - closestX;
      var dz = p.z - closestZ;
      var distSq = dx * dx + dz * dz;

      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        var dist = Math.sqrt(distSq);
        var nx, nz;
        if (dist > 1e-5) {
          nx = dx / dist;
          nz = dz / dist;
        } else {
          // Inside AABB fallback: push out along nearest face
          var penLeft = Math.abs(p.x - (b.x - halfW));
          var penRight = Math.abs((b.x + halfW) - p.x);
          var penTop = Math.abs(p.z - (b.z - halfD));
          var penBot = Math.abs((b.z + halfD) - p.z);
          var m = Math.min(penLeft, penRight, penTop, penBot);
          if (m === penLeft) { nx = -1; nz = 0; }
          else if (m === penRight) { nx = 1; nz = 0; }
          else if (m === penTop) { nx = 0; nz = -1; }
          else { nx = 0; nz = 1; }
        }
        var overlap = PLAYER_RADIUS - dist;
        p.x += nx * overlap;
        p.z += nz * overlap;

        var vn = p.vx * nx + p.vz * nz;
        if (vn < 0) {
          var restitution = 0.42;
          var impulse = -(1 + restitution) * vn;
          p.vx += impulse * nx;
          p.vz += impulse * nz;
          // Tangential scrape damping
          p.vx *= 0.88;
          p.vz *= 0.88;
          if (impulse > 2.0) {
            state.events.push({ type: 'collision', kind: 'building', impactMs: impulse });
            breakDriftChain(state, impulse);
          }
        }
      }
    }

    // 3. Player vs AI vehicles elastic impulse
    var aiList = state.aiTraffic;
    var minSep = PLAYER_RADIUS + AI_RADIUS;
    for (var k = 0; k < aiList.length; k++) {
      var ai = aiList[k];
      var adx = p.x - ai.x;
      var adz = p.z - ai.z;
      var aDistSq = adx * adx + adz * adz;
      if (aDistSq < minSep * minSep) {
        var aDist = Math.sqrt(aDistSq) || 0.001;
        var anx = adx / aDist;
        var anz = adz / aDist;
        var pen = minSep - aDist;
        p.x += anx * pen * 0.55;
        p.z += anz * pen * 0.55;
        ai.x -= anx * pen * 0.45;
        ai.z -= anz * pen * 0.45;

        var aiVx = -Math.sin(ai.heading) * ai.speedMs;
        var aiVz = -Math.cos(ai.heading) * ai.speedMs;
        var relVn = (p.vx - aiVx) * anx + (p.vz - aiVz) * anz;
        if (relVn < 0) {
          var aiMass = ai.isRival ? 1450 : 1200;
          var invPlayer = 1 / (car.physics.mass || 1500);
          var invAi = 1 / aiMass;
          var e = 0.45;
          var jImp = -(1 + e) * relVn / (invPlayer + invAi);
          var deltaVPlayer = jImp * invPlayer;

          p.vx += deltaVPlayer * anx;
          p.vz += deltaVPlayer * anz;

          var newAiVx = aiVx - (jImp * invAi) * anx;
          var newAiVz = aiVz - (jImp * invAi) * anz;
          ai.speedMs = clamp(Math.hypot(newAiVx, newAiVz), 0, 55);
          ai.pauseTimer = 0.65;

          if (deltaVPlayer > 1.8) {
            state.events.push({
              type: 'collision',
              kind: 'ai',
              aiId: ai.id,
              impactMs: deltaVPlayer
            });
            breakDriftChain(state, deltaVPlayer);
          }
        }
      }
    }
  }

  function checkSpeedTraps(state, prevX, prevZ, dt) {
    var traps = WorldData.SPEED_TRAPS || [];
    var p = state.player;
    var cds = state._trapCooldowns;

    for (var id in cds) {
      if (Object.prototype.hasOwnProperty.call(cds, id) && cds[id] > 0) {
        cds[id] = Math.max(0, cds[id] - dt);
      }
    }

    for (var i = 0; i < traps.length; i++) {
      var trap = traps[i];
      if ((cds[trap.id] || 0) > 0) continue;

      var fx = -Math.sin(trap.heading);
      var fz = -Math.cos(trap.heading);
      var rx = Math.cos(trap.heading);
      var rz = -Math.sin(trap.heading);

      var dPrev = (prevX - trap.x) * fx + (prevZ - trap.z) * fz;
      var dCurr = (p.x - trap.x) * fx + (p.z - trap.z) * fz;

      var crossed = (dPrev < 0 && dCurr >= 0) || (dPrev > 0 && dCurr <= 0);
      if (!crossed) continue;

      var denom = Math.abs(dPrev) + Math.abs(dCurr);
      var t = denom > 1e-9 ? Math.abs(dPrev) / denom : 0.5;
      var crossX = prevX + (p.x - prevX) * t;
      var crossZ = prevZ + (p.z - prevZ) * t;
      var latOffset = (crossX - trap.x) * rx + (crossZ - trap.z) * rz;

      if (Math.abs(latOffset) <= trap.halfWidth) {
        cds[trap.id] = 2.0;
        var speedKmh = Math.round(p.speedKmh);
        var prevBestTrap = state.scoring.trapRecords[trap.id] || 0;
        var isRecord = speedKmh > prevBestTrap;
        var isGlobalRecord = speedKmh > state.scoring.speedTrapBestKmh;

        if (isRecord) {
          state.scoring.trapRecords[trap.id] = speedKmh;
        }
        if (isGlobalRecord) {
          state.scoring.speedTrapBestKmh = speedKmh;
        }
        state.scoring.lastSpeedTrapKmh = speedKmh;
        state.scoring.lastSpeedTrapNameRu = trap.nameRu;

        var crReward = Math.round(speedKmh * 5) + (isRecord ? 1000 : 0);
        state.scoring.cr += crReward;

        state.events.push({
          type: 'speed_trap',
          trapId: trap.id,
          nameRu: trap.nameRu,
          speedKmh: speedKmh,
          isRecord: isRecord,
          isGlobalRecord: isGlobalRecord,
          cr: crReward
        });
      }
    }
  }

  function checkBonusTargets(state) {
    var p = state.player;
    var targets = state.targets;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t.collected) continue;
      var distXZ = Math.hypot(p.x - t.x, p.z - t.z);
      if (distXZ <= TARGET_RADIUS && Math.abs(p.y - t.y) <= 4.0) {
        t.collected = true;
        state.scoring.smashedCount += 1;
        state.scoring.cr += t.valueCr;
        state.events.push({
          type: 'target_smash',
          targetId: t.id,
          valueCr: t.valueCr,
          smashedCount: state.scoring.smashedCount,
          totalTargets: state.scoring.totalTargets
        });
      }
    }
  }

  function stepFixed(state, input, dt) {
    var car = resolveCar(state.activeCarId);
    var p = state.player;
    var phys = car.physics;

    var steer = clamp(finiteOr(input.steer, 0), -1, 1);
    var throttle = clamp(finiteOr(input.throttle, 0), 0, 1);
    var brake = clamp(finiteOr(input.brake, 0), 0, 1);
    var handbrake = !!input.handbrake;
    var nitroRequested = !!input.nitro;

    if (input.transmissionMode === 'MT' || input.transmissionMode === 'AT') {
      state.transmissionMode = input.transmissionMode;
    }

    if (input.resetRequested) {
      resetPlayer(state);
    }

    var prevX = p.x;
    var prevZ = p.z;

    var surfInfo = WorldData.getSurfaceInfo(p.x, p.z);
    p.surface = surfInfo.surface;
    p.regionId = surfInfo.regionId;
    p.regionNameRu = surfInfo.regionNameRu;

    var offGrip = phys.offRoadGrip;
    var grassPenalty = 1 - offGrip;
    var surfaceGrip = p.surface === 'asphalt'
      ? 1.0
      : p.surface === 'dirt'
        ? (0.58 + 0.42 * offGrip)
        : (0.38 + 0.58 * offGrip);
    var surfaceDrag = p.surface === 'asphalt'
      ? 1.0
      : p.surface === 'dirt'
        ? (1.08 + 1.15 * grassPenalty)
        : (1.12 + 2.40 * grassPenalty);
    var surfaceAccelMult = p.surface === 'asphalt'
      ? 1.0
      : p.surface === 'dirt'
        ? (1.0 - 0.50 * grassPenalty)
        : (1.0 - 0.72 * grassPenalty);

    // Local frame before yaw step
    var fx = -Math.sin(p.heading);
    var fz = -Math.cos(p.heading);
    var rx = Math.cos(p.heading);
    var rz = -Math.sin(p.heading);

    var vFwd = p.vx * fx + p.vz * fz;
    var vLat = p.vx * rx + p.vz * rz;

    // Gearbox handling (AT / MT)
    var ratios = phys.gearRatios;
    var gearCount = ratios.length;
    var topRatio = ratios[gearCount - 1];
    var maxSpeedMs = phys.maxSpeedKmh / 3.6;
    var reverseMaxMs = phys.reverseMaxKmh / 3.6;

    state._shiftCooldown = Math.max(0, state._shiftCooldown - dt);

    if (state.transmissionMode === 'MT') {
      if (input.shiftUpRequested && p.gear < gearCount) {
        p.gear += 1;
        state.events.push({ type: 'gear_shift', gear: p.gear, mode: 'MT' });
      } else if (input.shiftDownRequested && p.gear > -1) {
        p.gear -= 1;
        state.events.push({ type: 'gear_shift', gear: p.gear, mode: 'MT' });
      }
    } else {
      // Automatic transmission
      if (p.gear === 0) {
        p.gear = 1;
      }
      if (p.gear >= 1) {
        if (vFwd < 1.2 && brake > 0.25 && throttle < 0.1) {
          p.gear = -1;
          state._shiftCooldown = 0.20;
          state.events.push({ type: 'gear_shift', gear: p.gear, mode: 'AT' });
        } else if (state._shiftCooldown <= 0) {
          if (p.rpm >= phys.redlineRpm * 0.91 && p.gear < gearCount && throttle > 0.15 && vFwd > 4.0) {
            p.gear += 1;
            state._shiftCooldown = 0.25;
            state.events.push({ type: 'gear_shift', gear: p.gear, mode: 'AT' });
          } else if (p.gear > 1) {
            var prevGearRedlineMs = maxSpeedMs * (topRatio / ratios[p.gear - 2]);
            var downRpmThresh = phys.idleRpm + (phys.redlineRpm - phys.idleRpm) * 0.27;
            if (p.rpm <= downRpmThresh || vFwd < prevGearRedlineMs * 0.68) {
              p.gear -= 1;
              state._shiftCooldown = 0.25;
              state.events.push({ type: 'gear_shift', gear: p.gear, mode: 'AT' });
            }
          }
        }
      } else if (p.gear === -1) {
        if (throttle > 0.15 && vFwd > -1.5) {
          p.gear = 1;
          state._shiftCooldown = 0.20;
          state.events.push({ type: 'gear_shift', gear: p.gear, mode: 'AT' });
        }
      }
    }

    // Nitro update
    var nitroActive = nitroRequested && p.nitro > 0.5 && throttle > 0.1 && p.gear >= 1;
    p.isNitroActive = nitroActive;
    if (nitroActive) {
      p.nitro = Math.max(0, p.nitro - 26 * dt);
    } else {
      var rechargeRate = p.isDrifting ? 18.0 : 6.0;
      p.nitro = Math.min(100, p.nitro + rechargeRate * dt);
    }

    // Steering angle & heading update
    var maxSteerAngle = 0.56 * phys.steerRate / (1 + Math.abs(vFwd) * 0.016);
    var targetSteerAngle = steer * maxSteerAngle;
    var steerDeltaRate = 9.5 * dt;
    if (Math.abs(targetSteerAngle - p.steerAngle) <= steerDeltaRate) {
      p.steerAngle = targetSteerAngle;
    } else {
      p.steerAngle += Math.sign(targetSteerAngle - p.steerAngle) * steerDeltaRate;
    }

    var speedTurnFactor = clamp(Math.abs(vFwd) / 5.5, 0, 1);
    var dirSign = vFwd >= -0.25 ? 1 : -1;
    var yawBoost = handbrake ? 1.42 : 1.0;
    var yawRate = dirSign * (p.steerAngle * 3.15) * speedTurnFactor * yawBoost * (0.55 + 0.45 * surfaceGrip);
    p.heading = normalizeAngle(p.heading + yawRate * dt);

    // Re-project velocity onto updated car frame so turns induce genuine slip momentum
    fx = -Math.sin(p.heading);
    fz = -Math.cos(p.heading);
    rx = Math.cos(p.heading);
    rz = -Math.sin(p.heading);
    vFwd = p.vx * fx + p.vz * fz;
    vLat = p.vx * rx + p.vz * rz;

    // Engine RPM & drive acceleration
    var idle = phys.idleRpm;
    var redline = phys.redlineRpm;
    var maxRpm = phys.maxRpm;
    var driveAccel = 0;
    var targetRpm = idle;

    if (p.gear === 0) {
      // Neutral: free-revving with zero drive force
      targetRpm = idle + throttle * (maxRpm - idle);
      driveAccel = 0;
    } else if (p.gear === -1) {
      // Reverse
      var revInput = state.transmissionMode === 'AT' ? brake : throttle;
      var wheelRpmRev = idle + (Math.abs(Math.min(0, vFwd)) / Math.max(1, reverseMaxMs)) * (redline - idle);
      targetRpm = clamp(Math.max(wheelRpmRev, idle + revInput * 2100), idle, maxRpm);
      if (vFwd > -reverseMaxMs) {
        driveAccel = -phys.engineForce * 0.65 * revInput * surfaceAccelMult;
      }
    } else {
      // Forward gears 1..gearCount
      var gearIdx = clamp(p.gear - 1, 0, gearCount - 1);
      var gearRatio = ratios[gearIdx];
      var boostSpeedMult = nitroActive ? 1.18 : 1.0;
      var gearRedlineMs = maxSpeedMs * (topRatio / gearRatio) * boostSpeedMult;
      var gearRevLimitMs = gearRedlineMs * (maxRpm / redline);

      var wheelRpm = idle + (Math.max(0, vFwd) / Math.max(1, gearRedlineMs)) * (redline - idle);
      var launchRpm = idle + throttle * 2300;
      targetRpm = clamp(Math.max(wheelRpm, vFwd < 7.0 ? launchRpm : wheelRpm), idle, maxRpm);

      var normRpm = clamp((p.rpm - idle) / Math.max(1, redline - idle), 0, 1);
      var torqueCurve = 0.68 + 0.48 * Math.sin(normRpm * Math.PI * 0.85);
      var ratioFactor = Math.pow(gearRatio / ratios[0], 0.55) * 0.50 + 0.65;

      if (vFwd < gearRevLimitMs) {
        driveAccel = phys.engineForce * torqueCurve * ratioFactor * throttle * (nitroActive ? phys.nitroBoost : 1.0) * surfaceAccelMult;
      } else {
        driveAccel = 0;
      }
    }

    p.rpm += (targetRpm - p.rpm) * Math.min(1, 12.0 * dt);
    p.rpm = clamp(p.rpm, idle, maxRpm);

    // Braking & handbrake longitudinal deceleration
    var brakingActive = false;
    var brakeAccel = 0;
    if (p.gear >= 0 && brake > 0.05) {
      brakingActive = vFwd > 0.3;
      if (Math.abs(vFwd) > 0.05) {
        var desiredDecel = phys.brakeForce * brake * (0.65 + 0.35 * surfaceGrip);
        brakeAccel = -Math.sign(vFwd) * Math.min(desiredDecel, Math.abs(vFwd) / dt);
      }
    } else if (p.gear === -1 && state.transmissionMode === 'MT' && brake > 0.05) {
      brakingActive = vFwd < -0.3;
      if (Math.abs(vFwd) > 0.05) {
        var mtRevDecel = phys.brakeForce * brake * (0.65 + 0.35 * surfaceGrip);
        brakeAccel = -Math.sign(vFwd) * Math.min(mtRevDecel, Math.abs(vFwd) / dt);
      }
    } else if (p.gear === -1 && state.transmissionMode === 'AT' && throttle > 0.05 && vFwd < -0.2) {
      brakingActive = true;
      brakeAccel = Math.min(phys.brakeForce * throttle, Math.abs(vFwd) / dt);
    }

    if (handbrake && Math.abs(vFwd) > 0.2) {
      brakingActive = true;
      var hbDecel = Math.min(12.5 * (0.6 + 0.4 * surfaceGrip), Math.abs(vFwd) / dt);
      brakeAccel -= Math.sign(vFwd) * hbDecel;
    }
    p.isBraking = brakingActive;

    // Aerodynamic & rolling resistance tuned to car's asphalt top speed
    var topGearTorque = phys.engineForce * (0.68 + 0.48 * Math.sin(Math.PI * 0.85)) * (Math.pow(topRatio / ratios[0], 0.55) * 0.50 + 0.65);
    var aeroDrag = topGearTorque * (vFwd * Math.abs(vFwd)) / (maxSpeedMs * maxSpeedMs) * surfaceDrag;
    var rollingDrag = 0.42 * vFwd * surfaceDrag;
    if (throttle < 0.05 && brake < 0.05 && !handbrake) {
      rollingDrag += 0.95 * Math.sign(vFwd) * Math.min(1, Math.abs(vFwd));
    }

    // Terrain slope gravity along forward & lateral axes
    var n = surfInfo.normal;
    var gSlopeX = 9.81 * n.y * n.x * 0.55;
    var gSlopeZ = 9.81 * n.y * n.z * 0.55;
    var slopeFwd = gSlopeX * fx + gSlopeZ * fz;
    var slopeLat = gSlopeX * rx + gSlopeZ * rz;

    var longAccel = driveAccel + brakeAccel - aeroDrag - rollingDrag + slopeFwd;
    vFwd += longAccel * dt;

    // Lateral grip & drift slip dynamics
    var rwdOversteer = (phys.drivetrain === 'RWD' && throttle > 0.55 && Math.abs(steer) > 0.3) ? 0.78 : 1.0;
    var hbSlip = handbrake ? phys.driftSlip * 0.42 : 1.0;
    var latStiffness = phys.lateralGrip * surfaceGrip * hbSlip * rwdOversteer;
    vLat += slopeLat * dt * 0.4;
    vLat *= Math.exp(-latStiffness * 5.2 * dt);

    p.vx = vFwd * fx + vLat * rx;
    p.vz = vFwd * fz + vLat * rz;
    p.x += p.vx * dt;
    p.z += p.vz * dt;

    // AI traffic update & collisions
    stepAITraffic(state, dt);
    resolveCollisions(state, car);

    // Recompute speed & slip after collision impulses
    vFwd = p.vx * fx + p.vz * fz;
    vLat = p.vx * rx + p.vz * rz;
    p.speedMs = Math.hypot(p.vx, p.vz);
    p.speedKmh = p.speedMs * 3.6;

    // Wheel spin & suspension pitch/roll
    var wheelR = (car.dimensions && car.dimensions.wheelRadius) || 0.34;
    p.wheelSpin += (vFwd * dt) / wheelR;

    var slopePitch = Math.asin(clamp(-(fx * n.x + fz * n.z), -0.55, 0.55));
    var slopeRoll = Math.asin(clamp(rx * n.x + rz * n.z, -0.55, 0.55));
    var dynPitch = clamp((driveAccel + brakeAccel) * 0.0028, -0.09, 0.09);
    var dynRoll = clamp(-yawRate * p.speedMs * 0.0022, -0.11, 0.11);
    p.pitch += ((slopePitch + dynPitch) - p.pitch) * Math.min(1, 10 * dt);
    p.roll += ((slopeRoll + dynRoll) - p.roll) * Math.min(1, 10 * dt);

    // Drift detection & skill chain scoring
    p.slipAngleDeg = Math.atan2(vLat, Math.max(2.0, Math.abs(vFwd))) * (180 / Math.PI);
    var absSlip = Math.abs(p.slipAngleDeg);
    var driftingNow = (p.speedKmh >= 28 && absSlip >= 14) ||
      (handbrake && p.speedKmh >= 20 && absSlip >= 6);
    p.isDrifting = driftingNow;

    if (driftingNow) {
      var slipFactor = clamp(absSlip / 16, 0.6, 2.5);
      state.scoring.driftPoints += slipFactor * p.speedKmh * 1.8 * dt;
      state.scoring.driftMultiplier = computeDriftMultiplier(state.scoring.driftPoints);
      state.scoring.driftTimer = DRIFT_BANK_TIMEOUT;
    } else if (state.scoring.driftPoints > 0) {
      state.scoring.driftTimer -= dt;
      if (state.scoring.driftTimer <= 0) {
        var pts = Math.round(state.scoring.driftPoints);
        var mult = state.scoring.driftMultiplier;
        var crAward = Math.round(pts * mult * 0.25);
        state.scoring.cr += crAward;
        state.scoring.totalDriftsBanked += 1;
        state.events.push({
          type: 'drift_bank',
          points: pts,
          multiplier: mult,
          cr: crAward
        });
        state.scoring.driftPoints = 0;
        state.scoring.driftMultiplier = 1;
        state.scoring.driftTimer = 0;
      }
    }

    // World interactions: 4 Speed Traps + 24 Bonus Boards
    checkSpeedTraps(state, prevX, prevZ, dt);
    checkBonusTargets(state);

    state.timeSec += dt;
    sanitizePlayer(state, car);
  }

  function stepSimulation(state, input, dt) {
    var safeInput = input || {};
    var safeDt = (Number.isFinite(dt) && dt > 0) ? Math.min(dt, MAX_FRAME_DT) : 0;
    state._accum = (Number.isFinite(state._accum) ? state._accum : 0) + safeDt;

    var stepInput = {
      steer: safeInput.steer,
      throttle: safeInput.throttle,
      brake: safeInput.brake,
      handbrake: safeInput.handbrake,
      nitro: safeInput.nitro,
      shiftUpRequested: !!safeInput.shiftUpRequested,
      shiftDownRequested: !!safeInput.shiftDownRequested,
      resetRequested: !!safeInput.resetRequested,
      steerMode: safeInput.steerMode,
      transmissionMode: safeInput.transmissionMode,
      cameraMode: safeInput.cameraMode
    };

    if (safeDt === 0) {
      if (stepInput.transmissionMode === 'MT' || stepInput.transmissionMode === 'AT') {
        state.transmissionMode = stepInput.transmissionMode;
      }
      if (stepInput.resetRequested) {
        resetPlayer(state);
      }
      return state;
    }

    var ran = false;
    while (state._accum >= FIXED_DT - 1e-9) {
      stepFixed(state, stepInput, FIXED_DT);
      state._accum = Math.max(0, state._accum - FIXED_DT);
      // Consume edge-triggered requests after first substep
      stepInput.shiftUpRequested = false;
      stepInput.shiftDownRequested = false;
      stepInput.resetRequested = false;
      ran = true;
    }

    if (!ran && safeDt > 0) {
      // Allow sub-step mode sync without advancing physics until FIXED_DT accumulates
      if (stepInput.transmissionMode === 'MT' || stepInput.transmissionMode === 'AT') {
        state.transmissionMode = stepInput.transmissionMode;
      }
    }

    return state;
  }

  function computeCameraTarget(state, cameraMode) {
    var car = resolveCar(state.activeCarId);
    var p = state.player;
    var mode = cameraMode === 'hood' ? 'hood' : 'chase';
    var fx = -Math.sin(p.heading);
    var fz = -Math.cos(p.heading);
    var speedRatio = clamp(p.speedKmh / Math.max(1, car.physics.maxSpeedKmh), 0, 1);

    if (mode === 'hood') {
      var hoodX = p.x + car.camera.hoodZ * Math.sin(p.heading);
      var hoodZ = p.z + car.camera.hoodZ * Math.cos(p.heading);
      var hoodY = p.y + car.camera.hoodY;
      return {
        mode: 'hood',
        position: {
          x: finiteOr(hoodX, p.x),
          y: finiteOr(hoodY, p.y + 1.2),
          z: finiteOr(hoodZ, p.z)
        },
        lookAt: {
          x: finiteOr(hoodX + fx * 28, p.x),
          y: finiteOr(hoodY + Math.sin(p.pitch) * 10 - 0.15, p.y + 1.0),
          z: finiteOr(hoodZ + fz * 28, p.z - 28)
        },
        fov: 72 + speedRatio * 12
      };
    }

    var dist = car.camera.chaseDist + speedRatio * 1.4;
    var camX = p.x - fx * dist;
    var camZ = p.z - fz * dist;
    var groundCamY = WorldData.getTerrainHeight(camX, camZ);
    var camY = Math.max(p.y + car.camera.chaseHeight, groundCamY + 1.2);

    return {
      mode: 'chase',
      position: {
        x: finiteOr(camX, p.x),
        y: finiteOr(camY, p.y + 2.6),
        z: finiteOr(camZ, p.z + 7.2)
      },
      lookAt: {
        x: finiteOr(p.x + fx * 4.0, p.x),
        y: finiteOr(p.y + 1.25, p.y + 1.25),
        z: finiteOr(p.z + fz * 4.0, p.z - 4.0)
      },
      fov: 62 + speedRatio * 18
    };
  }

  return {
    FIXED_DT: FIXED_DT,
    createSimulation: createSimulation,
    stepSimulation: stepSimulation,
    switchCar: switchCar,
    resetPlayer: resetPlayer,
    computeCameraTarget: computeCameraTarget
  };
});
