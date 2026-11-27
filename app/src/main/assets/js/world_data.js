(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.H6 = root.H6 || {};
    root.H6.WorldData = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WORLD_HALF_SIZE = 1000;
  var PLAYABLE_BOUND = 960;

  var SPAWN_POINT = { x: 0, y: 0, z: 50, heading: 0 };

  var FUJI_PEAK = { x: -760, z: -760, baseRadius: 380, height: 320 };

  var REGIONS = Array.from([
    {
      id: 'festival',
      nameRu: 'ФЕСТИВАЛЬ ХОРАЙЗОН',
      center: { x: 0, z: 40 },
      radius: 135
    },
    {
      id: 'tokyo',
      nameRu: 'НОЧНОЙ ТОКИО',
      bounds: { minX: -520, maxX: 220, minZ: -760, maxZ: -140 }
    },
    {
      id: 'sakura',
      nameRu: 'ДОЛИНА САКУРЫ',
      bounds: { minX: 180, maxX: 780, minZ: -320, maxZ: 480 }
    },
    {
      id: 'touge',
      nameRu: 'ТОУГЭ ФУДЗИ',
      bounds: { minX: -780, maxX: -180, minZ: 120, maxZ: 760 }
    }
  ]);

  var DEFAULT_REGION = { id: 'japan_open', nameRu: 'ЯПОНИЯ — ТРАССЫ' };

  function pt(x, y, z) {
    return { x: x, y: y, z: z };
  }

  var ROADS = [
    {
      id: 'festival_boulevard',
      nameRu: 'Бульвар Хорайзон',
      surface: 'asphalt',
      halfWidth: 12,
      points: [
        pt(0, 0, 120),
        pt(0, 0, 50),
        pt(0, 0, -70),
        pt(0, 0, -140),
        pt(0, 0, -220),
        pt(0, 0, -460),
        pt(0, 0, -680)
      ]
    },
    {
      id: 'wangan_expressway',
      nameRu: 'Шоссе Ванган',
      surface: 'asphalt',
      halfWidth: 14,
      points: [
        pt(-500, 0, -460),
        pt(-420, 0, -460),
        pt(-180, 0, -460),
        pt(-120, 0, -460),
        pt(0, 0, -460),
        pt(180, 0, -460),
        pt(460, 0, -460)
      ]
    },
    {
      id: 'tokyo_loop',
      nameRu: 'Кольцо Токио',
      surface: 'asphalt',
      halfWidth: 10,
      points: [
        pt(-420, 0, -220),
        pt(-420, 0, -460),
        pt(-420, 0, -680),
        pt(-180, 0, -680),
        pt(0, 0, -680),
        pt(180, 0, -680),
        pt(180, 0, -460),
        pt(180, 0, -220),
        pt(0, 0, -220),
        pt(-180, 0, -220),
        pt(-420, 0, -220)
      ]
    },
    {
      id: 'tokyo_mid_ave',
      nameRu: 'Авеню Сибуя',
      surface: 'asphalt',
      halfWidth: 10,
      points: [
        pt(-180, 0, -680),
        pt(-180, 0, -460),
        pt(-180, 0, -220)
      ]
    },
    {
      id: 'ring_east',
      nameRu: 'Восточное кольцо',
      surface: 'asphalt',
      halfWidth: 11,
      points: [
        pt(0, 0, 120),
        pt(180, 0, 120),
        pt(340, 2, -10),
        pt(460, 4, -140),
        pt(460, 0, -460)
      ]
    },
    {
      id: 'ring_south',
      nameRu: 'Южное шоссе',
      surface: 'asphalt',
      halfWidth: 11,
      points: [
        pt(0, 0, 120),
        pt(-200, 0, 140),
        pt(-200, 0, 420),
        pt(-200, 0, 680),
        pt(160, 0, 680),
        pt(460, 5, 440),
        pt(560, 8, 320),
        pt(610, 11, 210),
        pt(460, 4, -140)
      ]
    },
    {
      id: 'sakura_shrine_road',
      nameRu: 'Дорога Храма Сакуры',
      surface: 'asphalt',
      halfWidth: 9,
      points: [
        pt(180, 0, 120),
        pt(340, 2, -10),
        pt(420, 4, 40),
        pt(490, 6, 110),
        pt(560, 9, 175),
        pt(610, 11, 210),
        pt(560, 8, 320),
        pt(460, 5, 440),
        pt(260, 2, 360),
        pt(180, 0, 120)
      ]
    },
    {
      id: 'touge_mountain_road',
      nameRu: 'Серпантин Тоугэ Фудзи',
      surface: 'asphalt',
      halfWidth: 8.5,
      points: [
        pt(-200, 0, 140),
        pt(-380, 10, 165),
        pt(-560, 22, 195),
        pt(-420, 32, 265),
        pt(-280, 40, 315),
        pt(-460, 50, 375),
        pt(-640, 58, 425),
        pt(-590, 64, 515),
        pt(-540, 66, 560),
        pt(-460, 56, 520),
        pt(-380, 42, 420),
        pt(-300, 28, 520),
        pt(-420, 18, 620),
        pt(-340, 8, 680),
        pt(-200, 0, 680)
      ]
    },
    {
      id: 'fuji_dirt_trail',
      nameRu: 'Грунтовая тропа Фудзи',
      surface: 'dirt',
      halfWidth: 6.5,
      points: [
        pt(-420, 0, -460),
        pt(-530, 12, -340),
        pt(-640, 14, -160),
        pt(-660, 16, 120),
        pt(-620, 28, 260),
        pt(-640, 58, 425),
        pt(-540, 66, 560)
      ]
    },
    {
      id: 'touge_dirt_shortcut',
      nameRu: 'Ралли-срезка Тоугэ',
      surface: 'dirt',
      halfWidth: 6.0,
      points: [
        pt(-560, 22, 195),
        pt(-620, 28, 260),
        pt(-640, 58, 425)
      ]
    }
  ];

  // Precompute road segments with bounding boxes for fast terrain & query lookups
  var ROAD_SEGMENTS = [];
  (function buildSegments() {
    var pad = 26;
    for (var r = 0; r < ROADS.length; r++) {
      var road = ROADS[r];
      for (var i = 0; i < road.points.length - 1; i++) {
        var a = road.points[i];
        var b = road.points[i + 1];
        var dx = b.x - a.x;
        var dz = b.z - a.z;
        var lenSq = dx * dx + dz * dz;
        var len = Math.sqrt(lenSq) || 1;
        ROAD_SEGMENTS.push({
          roadIndex: r,
          road: road,
          ax: a.x,
          ay: a.y,
          az: a.z,
          bx: b.x,
          by: b.y,
          bz: b.z,
          dx: dx,
          dz: dz,
          lenSq: lenSq || 1,
          dirX: dx / len,
          dirZ: dz / len,
          minX: Math.min(a.x, b.x) - road.halfWidth - pad,
          maxX: Math.max(a.x, b.x) + road.halfWidth + pad,
          minZ: Math.min(a.z, b.z) - road.halfWidth - pad,
          maxZ: Math.max(a.z, b.z) + road.halfWidth + pad
        });
      }
    }
  })();

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function getRegionAt(x, z) {
    var df = Math.hypot(x - REGIONS[0].center.x, z - REGIONS[0].center.z);
    if (df <= REGIONS[0].radius) {
      return REGIONS[0];
    }
    for (var i = 1; i < REGIONS.length; i++) {
      var b = REGIONS[i].bounds;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        return REGIONS[i];
      }
    }
    return DEFAULT_REGION;
  }

  function getBaseHeight(x, z) {
    var dFuji = Math.hypot(x - FUJI_PEAK.x, z - FUJI_PEAK.z);
    var fujiH = 0;
    if (dFuji < FUJI_PEAK.baseRadius) {
      var tf = 1 - dFuji / FUJI_PEAK.baseRadius;
      fujiH = FUJI_PEAK.height * Math.pow(tf, 1.55);
    }

    // Flat mask keeps Festival Hub and Neon Tokyo city streets flat at y = 0
    var dHub = Math.hypot(x - 0, z - 40);
    var hubMask = smoothstep(125, 175, dHub);

    var tokyoDx = Math.max(-520 - x, 0, x - 220);
    var tokyoDz = Math.max(-760 - z, 0, z - -140);
    var dTokyo = Math.hypot(tokyoDx, tokyoDz);
    var tokyoMask = smoothstep(0, 55, dTokyo);

    var flatMask = hubMask * tokyoMask;

    // Touge mountain massif
    var tx = (x + 510) / 270;
    var tz = (z - 420) / 250;
    var tougeH = 48 * Math.exp(-(tx * tx + tz * tz) * 1.35);

    // Sakura rolling hills
    var sx = (x - 560) / 260;
    var sz = (z - 160) / 260;
    var sakuraEnv = Math.exp(-(sx * sx + sz * sz) * 1.25);
    var sakuraH = (8.5 + 3.5 * Math.sin(x * 0.013) * Math.cos(z * 0.013)) * sakuraEnv;

    return fujiH + flatMask * (tougeH + sakuraH);
  }

  function queryRoads(x, z) {
    var bestDist = Infinity;
    var bestRoad = null;
    var bestRoadY = 0;
    var bestDirX = 0;
    var bestDirZ = -1;
    var bestCx = x;
    var bestCz = z;

    var blendWeightSum = 0;
    var blendYSum = 0;
    var maxAlpha = 0;

    var onRoadBestDist = Infinity;
    var onRoadWeightSum = 0;
    var onRoadYSum = 0;

    for (var i = 0; i < ROAD_SEGMENTS.length; i++) {
      var s = ROAD_SEGMENTS[i];
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) {
        continue;
      }
      var t = clamp(((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.lenSq, 0, 1);
      var cx = s.ax + s.dx * t;
      var cz = s.az + s.dz * t;
      var dist = Math.hypot(x - cx, z - cz);
      var segY = s.ay + (s.by - s.ay) * t;

      if (dist < bestDist) {
        bestDist = dist;
        bestRoad = s.road;
        bestRoadY = segY;
        bestDirX = s.dirX;
        bestDirZ = s.dirZ;
        bestCx = cx;
        bestCz = cz;
      }

      var hw = s.road.halfWidth;
      var outer = hw + 22;
      if (dist <= hw) {
        if (dist < onRoadBestDist) {
          onRoadBestDist = dist;
        }
        var ow = 1 / (dist + 0.25);
        onRoadWeightSum += ow;
        onRoadYSum += segY * ow;
      }
      if (dist < outer) {
        var alpha = 1 - smoothstep(hw, outer, dist);
        if (alpha > maxAlpha) {
          maxAlpha = alpha;
        }
        var w = alpha / (Math.max(0, dist - hw) + 1.0);
        blendWeightSum += w;
        blendYSum += segY * w;
      }
    }

    var blendedRoadY = null;
    if (onRoadWeightSum > 0) {
      blendedRoadY = onRoadYSum / onRoadWeightSum;
      maxAlpha = 1;
    } else if (blendWeightSum > 0) {
      blendedRoadY = blendYSum / blendWeightSum;
    }

    return {
      distToRoad: bestDist,
      nearestRoad: bestRoad,
      nearestRoadY: bestRoadY,
      nearestPoint: { x: bestCx, z: bestCz },
      dirX: bestDirX,
      dirZ: bestDirZ,
      blendedRoadY: blendedRoadY,
      roadAlpha: maxAlpha
    };
  }

  function getTerrainHeight(x, z) {
    var baseH = getBaseHeight(x, z);
    var q = queryRoads(x, z);
    if (q.blendedRoadY === null || q.roadAlpha <= 0) {
      return baseH;
    }
    return baseH * (1 - q.roadAlpha) + q.blendedRoadY * q.roadAlpha;
  }

  function getTerrainNormal(x, z) {
    var eps = 0.6;
    var hL = getTerrainHeight(x - eps, z);
    var hR = getTerrainHeight(x + eps, z);
    var hD = getTerrainHeight(x, z - eps);
    var hU = getTerrainHeight(x, z + eps);
    var nx = hL - hR;
    var ny = 2 * eps;
    var nz = hD - hU;
    var inv = 1 / (Math.hypot(nx, ny, nz) || 1);
    return { x: nx * inv, y: ny * inv, z: nz * inv };
  }

  function getSurfaceInfo(x, z) {
    var q = queryRoads(x, z);
    var baseH = getBaseHeight(x, z);
    var height = (q.blendedRoadY === null || q.roadAlpha <= 0)
      ? baseH
      : baseH * (1 - q.roadAlpha) + q.blendedRoadY * q.roadAlpha;

    var hw = q.nearestRoad ? q.nearestRoad.halfWidth : 0;
    var distToRoad = q.distToRoad;
    var onRoad = q.nearestRoad !== null && distToRoad <= hw;

    // Paved central Horizon Festival stunt plaza around (0, 40)
    var distToPlaza = Math.hypot(x - 0, z - 40);
    var inPlaza = distToPlaza <= 44;

    var surface = 'grass';
    if (onRoad) {
      surface = q.nearestRoad.surface;
    } else if (inPlaza) {
      surface = 'asphalt';
      onRoad = true;
    } else if (q.nearestRoad !== null && distToRoad <= hw + 7) {
      surface = 'dirt';
    }

    var normal = getTerrainNormal(x, z);
    var region = getRegionAt(x, z);

    return {
      height: height,
      surface: surface,
      normal: normal,
      distToRoad: distToRoad,
      onRoad: onRoad,
      regionId: region.id,
      regionNameRu: region.nameRu
    };
  }

  function findNearestRoadPoint(x, z) {
    var q = queryRoads(x, z);
    if (!q.nearestRoad) {
      return {
        x: SPAWN_POINT.x,
        y: getTerrainHeight(SPAWN_POINT.x, SPAWN_POINT.z),
        z: SPAWN_POINT.z,
        heading: SPAWN_POINT.heading
      };
    }
    var rx = q.nearestPoint.x;
    var rz = q.nearestPoint.z;
    var ry = getTerrainHeight(rx, rz);
    // heading = 0 faces -Z; forward = (-sin(h), 0, -cos(h))
    var heading = Math.atan2(-q.dirX, -q.dirZ);
    return { x: rx, y: ry, z: rz, heading: heading };
  }

  // Buildings carefully placed inside city blocks / hub edges, never intersecting roads
  var BUILDINGS = [
    // Horizon Festival Hub structures
    { x: 0, z: 152, w: 46, d: 18, h: 14, color: '#1b1f2c', neonColor: '#ff2e7e', regionId: 'festival', kind: 'stage' },
    { x: -64, z: 58, w: 24, d: 30, h: 10, color: '#222736', neonColor: '#00e5ff', regionId: 'festival', kind: 'paddock' },
    { x: 64, z: 58, w: 24, d: 30, h: 10, color: '#222736', neonColor: '#ffd000', regionId: 'festival', kind: 'paddock' },

    // Neon Tokyo West-North block (x in [-390, -210], z in [-650, -490])
    { x: -355, z: -610, w: 38, d: 36, h: 68, color: '#141824', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: -275, z: -610, w: 36, d: 34, h: 84, color: '#161a28', neonColor: '#ff2e7e', regionId: 'tokyo' },
    { x: -355, z: -535, w: 34, d: 32, h: 52, color: '#181c2c', neonColor: '#ffd000', regionId: 'tokyo' },
    { x: -265, z: -535, w: 40, d: 34, h: 96, color: '#121622', neonColor: '#7cff4d', regionId: 'tokyo' },

    // Neon Tokyo West-South block (x in [-390, -210], z in [-430, -250])
    { x: -355, z: -390, w: 36, d: 36, h: 62, color: '#151926', neonColor: '#ff2e7e', regionId: 'tokyo' },
    { x: -265, z: -390, w: 38, d: 32, h: 74, color: '#181d2d', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: -355, z: -295, w: 34, d: 34, h: 48, color: '#191f30', neonColor: '#ffd000', regionId: 'tokyo' },
    { x: -265, z: -295, w: 36, d: 32, h: 58, color: '#141824', neonColor: '#00e5ff', regionId: 'tokyo' },

    // Neon Tokyo MidWest-North block (x in [-150, -30], z in [-650, -490])
    { x: -120, z: -610, w: 34, d: 34, h: 78, color: '#131722', neonColor: '#ff2e7e', regionId: 'tokyo' },
    { x: -58, z: -610, w: 32, d: 34, h: 105, color: '#161b2a', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: -120, z: -535, w: 32, d: 30, h: 56, color: '#191e2e', neonColor: '#7cff4d', regionId: 'tokyo' },
    { x: -58, z: -535, w: 34, d: 32, h: 88, color: '#141926', neonColor: '#ffd000', regionId: 'tokyo' },

    // Neon Tokyo MidWest-South block (x in [-150, -30], z in [-430, -250])
    { x: -120, z: -390, w: 32, d: 34, h: 66, color: '#171c2b', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: -58, z: -390, w: 34, d: 32, h: 72, color: '#131824', neonColor: '#ff2e7e', regionId: 'tokyo' },
    { x: -120, z: -295, w: 34, d: 32, h: 46, color: '#1a1f30', neonColor: '#ffd000', regionId: 'tokyo' },
    { x: -58, z: -295, w: 32, d: 30, h: 54, color: '#151a28', neonColor: '#7cff4d', regionId: 'tokyo' },

    // Neon Tokyo East-North block (x in [30, 150], z in [-650, -490])
    { x: 60, z: -610, w: 34, d: 34, h: 92, color: '#151927', neonColor: '#ffd000', regionId: 'tokyo' },
    { x: 122, z: -610, w: 32, d: 34, h: 70, color: '#171c2b', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: 60, z: -535, w: 34, d: 30, h: 64, color: '#141825', neonColor: '#ff2e7e', regionId: 'tokyo' },
    { x: 122, z: -535, w: 32, d: 32, h: 82, color: '#181d2c', neonColor: '#7cff4d', regionId: 'tokyo' },

    // Neon Tokyo East-South block (x in [30, 150], z in [-430, -250])
    { x: 60, z: -390, w: 32, d: 34, h: 76, color: '#161b29', neonColor: '#ff2e7e', regionId: 'tokyo' },
    { x: 122, z: -390, w: 34, d: 32, h: 60, color: '#141824', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: 60, z: -295, w: 34, d: 30, h: 50, color: '#1a2030', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: 122, z: -295, w: 32, d: 32, h: 44, color: '#171c2a', neonColor: '#ffd000', regionId: 'tokyo' },

    // Outer Neon Tokyo perimeter skyline
    { x: -480, z: -600, w: 42, d: 42, h: 90, color: '#131722', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: -480, z: -340, w: 40, d: 40, h: 72, color: '#151928', neonColor: '#ff2e7e', regionId: 'tokyo' },
    { x: 245, z: -600, w: 42, d: 42, h: 86, color: '#151928', neonColor: '#ffd000', regionId: 'tokyo' },
    { x: 245, z: -340, w: 40, d: 40, h: 64, color: '#131722', neonColor: '#7cff4d', regionId: 'tokyo' },
    { x: -120, z: -735, w: 48, d: 36, h: 112, color: '#121520', neonColor: '#00e5ff', regionId: 'tokyo' },
    { x: 80, z: -735, w: 46, d: 36, h: 98, color: '#141824', neonColor: '#ff2e7e', regionId: 'tokyo' }
  ];

  // 4 Speed Trap Radar Gates placed strictly on asphalt roads
  var SPEED_TRAPS = [
    {
      id: 'trap_festival',
      nameRu: 'Главная сцена Хорайзон',
      x: 0,
      z: -70,
      heading: 0,
      halfWidth: 13,
      recordKmh: 195
    },
    {
      id: 'trap_wangan',
      nameRu: 'Шоссе Ванган',
      x: -120,
      z: -460,
      heading: Math.PI / 2,
      halfWidth: 15,
      recordKmh: 240
    },
    {
      id: 'trap_sakura',
      nameRu: 'Аллея Сакуры',
      x: 340,
      z: -10,
      heading: Math.atan2(-(420 - 340), -(40 - -10)),
      halfWidth: 11,
      recordKmh: 180
    },
    {
      id: 'trap_touge',
      nameRu: 'Спуск Тоугэ',
      x: -380,
      z: 420,
      heading: Math.atan2(-(-300 - -380), -(520 - 420)),
      halfWidth: 10,
      recordKmh: 150
    }
  ];

  // 24 Smashable Bonus Targets across all 4 Japan regions
  var RAW_TARGETS = [
    // Festival Hub (6)
    { id: 'board_01', x: -24, z: 22, valueCr: 1000, regionId: 'festival' },
    { id: 'board_02', x: 24, z: 22, valueCr: 1000, regionId: 'festival' },
    { id: 'board_03', x: -34, z: 86, valueCr: 2500, regionId: 'festival' },
    { id: 'board_04', x: 34, z: 86, valueCr: 2500, regionId: 'festival' },
    { id: 'board_05', x: 0, z: -20, valueCr: 1000, regionId: 'festival' },
    { id: 'board_06', x: 88, z: 40, valueCr: 5000, regionId: 'festival' },

    // Neon Tokyo (6)
    { id: 'board_07', x: -300, z: -460, valueCr: 1000, regionId: 'tokyo' },
    { id: 'board_08', x: -90, z: -680, valueCr: 2500, regionId: 'tokyo' },
    { id: 'board_09', x: 90, z: -220, valueCr: 1000, regionId: 'tokyo' },
    { id: 'board_10', x: -420, z: -340, valueCr: 2500, regionId: 'tokyo' },
    { id: 'board_11', x: 180, z: -570, valueCr: 2500, regionId: 'tokyo' },
    { id: 'board_12', x: -180, z: -340, valueCr: 5000, regionId: 'tokyo' },

    // Sakura Valley (6)
    { id: 'board_13', x: 420, z: 40, valueCr: 1000, regionId: 'sakura' },
    { id: 'board_14', x: 490, z: 110, valueCr: 2500, regionId: 'sakura' },
    { id: 'board_15', x: 560, z: 175, valueCr: 2500, regionId: 'sakura' },
    { id: 'board_16', x: 635, z: 225, valueCr: 5000, regionId: 'sakura' },
    { id: 'board_17', x: 460, z: 440, valueCr: 1000, regionId: 'sakura' },
    { id: 'board_18', x: 260, z: 360, valueCr: 2500, regionId: 'sakura' },

    // Touge Mountain & Fuji Trail (6)
    { id: 'board_19', x: -560, z: 195, valueCr: 2500, regionId: 'touge' },
    { id: 'board_20', x: -280, z: 315, valueCr: 2500, regionId: 'touge' },
    { id: 'board_21', x: -640, z: 425, valueCr: 2500, regionId: 'touge' },
    { id: 'board_22', x: -540, z: 560, valueCr: 5000, regionId: 'touge' },
    { id: 'board_23', x: -420, z: 620, valueCr: 2500, regionId: 'touge' },
    { id: 'board_24', x: -640, z: -160, valueCr: 5000, regionId: 'touge' }
  ];

  var BONUS_TARGETS = RAW_TARGETS.map(function (t) {
    return {
      id: t.id,
      x: t.x,
      y: getTerrainHeight(t.x, t.z) + 1.2,
      z: t.z,
      valueCr: t.valueCr,
      regionId: t.regionId
    };
  });

  // Closed waypoint circuits for AI Traffic & Rivals
  var AI_ROUTES = [
    {
      id: 'route_tokyo_outer_cw',
      isRival: false,
      waypoints: [
        { x: -420, z: -220, targetSpeedKmh: 62 },
        { x: -420, z: -460, targetSpeedKmh: 68 },
        { x: -420, z: -680, targetSpeedKmh: 58 },
        { x: -180, z: -680, targetSpeedKmh: 70 },
        { x: 180, z: -680, targetSpeedKmh: 62 },
        { x: 180, z: -460, targetSpeedKmh: 68 },
        { x: 180, z: -220, targetSpeedKmh: 58 },
        { x: -180, z: -220, targetSpeedKmh: 70 }
      ]
    },
    {
      id: 'route_tokyo_rival',
      isRival: true,
      waypoints: [
        { x: -420, z: -460, targetSpeedKmh: 145 },
        { x: -180, z: -460, targetSpeedKmh: 155 },
        { x: 180, z: -460, targetSpeedKmh: 150 },
        { x: 460, z: -460, targetSpeedKmh: 135 },
        { x: 460, z: -140, targetSpeedKmh: 128 },
        { x: 340, z: -10, targetSpeedKmh: 122 },
        { x: 180, z: 120, targetSpeedKmh: 125 },
        { x: 0, z: 120, targetSpeedKmh: 120 },
        { x: 0, z: -220, targetSpeedKmh: 135 },
        { x: -420, z: -220, targetSpeedKmh: 130 }
      ]
    },
    {
      id: 'route_sakura_loop',
      isRival: false,
      waypoints: [
        { x: 180, z: 120, targetSpeedKmh: 56 },
        { x: 340, z: -10, targetSpeedKmh: 62 },
        { x: 420, z: 40, targetSpeedKmh: 54 },
        { x: 490, z: 110, targetSpeedKmh: 54 },
        { x: 560, z: 175, targetSpeedKmh: 52 },
        { x: 610, z: 210, targetSpeedKmh: 48 },
        { x: 560, z: 320, targetSpeedKmh: 58 },
        { x: 460, z: 440, targetSpeedKmh: 62 },
        { x: 260, z: 360, targetSpeedKmh: 60 }
      ]
    },
    {
      id: 'route_sakura_rival',
      isRival: true,
      waypoints: [
        { x: 180, z: 120, targetSpeedKmh: 125 },
        { x: 340, z: -10, targetSpeedKmh: 135 },
        { x: 460, z: -140, targetSpeedKmh: 140 },
        { x: 610, z: 210, targetSpeedKmh: 118 },
        { x: 460, z: 440, targetSpeedKmh: 128 },
        { x: 160, z: 680, targetSpeedKmh: 142 },
        { x: -200, z: 680, targetSpeedKmh: 135 },
        { x: -200, z: 140, targetSpeedKmh: 140 },
        { x: 0, z: 120, targetSpeedKmh: 126 }
      ]
    },
    {
      id: 'route_touge_circuit',
      isRival: false,
      waypoints: [
        { x: -200, z: 140, targetSpeedKmh: 64 },
        { x: -380, z: 165, targetSpeedKmh: 58 },
        { x: -560, z: 195, targetSpeedKmh: 48 },
        { x: -420, z: 265, targetSpeedKmh: 56 },
        { x: -280, z: 315, targetSpeedKmh: 48 },
        { x: -460, z: 375, targetSpeedKmh: 55 },
        { x: -640, z: 425, targetSpeedKmh: 46 },
        { x: -540, z: 560, targetSpeedKmh: 48 },
        { x: -380, z: 420, targetSpeedKmh: 58 },
        { x: -300, z: 520, targetSpeedKmh: 52 },
        { x: -420, z: 620, targetSpeedKmh: 50 },
        { x: -200, z: 680, targetSpeedKmh: 62 },
        { x: -200, z: 420, targetSpeedKmh: 72 }
      ]
    },
    {
      id: 'route_touge_rival',
      isRival: true,
      waypoints: [
        { x: -200, z: 140, targetSpeedKmh: 125 },
        { x: -380, z: 165, targetSpeedKmh: 118 },
        { x: -560, z: 195, targetSpeedKmh: 92 },
        { x: -420, z: 265, targetSpeedKmh: 110 },
        { x: -280, z: 315, targetSpeedKmh: 90 },
        { x: -460, z: 375, targetSpeedKmh: 112 },
        { x: -640, z: 425, targetSpeedKmh: 88 },
        { x: -540, z: 560, targetSpeedKmh: 94 },
        { x: -380, z: 420, targetSpeedKmh: 116 },
        { x: -200, z: 680, targetSpeedKmh: 128 },
        { x: -200, z: 420, targetSpeedKmh: 138 }
      ]
    }
  ];

  // 12 AI Vehicles: 9 civilian + 3 rivals distributed across routes (clear of spawn at (0,50))
  var AI_SPAWNS = [
    { id: 'ai_civ_1', carStyle: 'coupe', color: '#cfd8dc', routeIndex: 0, wpIndex: 0, isRival: false },
    { id: 'ai_civ_2', carStyle: 'sedan', color: '#90a4ae', routeIndex: 0, wpIndex: 3, isRival: false },
    { id: 'ai_civ_3', carStyle: 'suv', color: '#f5f5f5', routeIndex: 0, wpIndex: 6, isRival: false },
    { id: 'ai_civ_4', carStyle: 'sedan', color: '#64b5f6', routeIndex: 2, wpIndex: 0, isRival: false },
    { id: 'ai_civ_5', carStyle: 'suv', color: '#aed581', routeIndex: 2, wpIndex: 4, isRival: false },
    { id: 'ai_civ_6', carStyle: 'coupe', color: '#ffb74d', routeIndex: 2, wpIndex: 7, isRival: false },
    { id: 'ai_civ_7', carStyle: 'sedan', color: '#b0bec5', routeIndex: 4, wpIndex: 1, isRival: false },
    { id: 'ai_civ_8', carStyle: 'suv', color: '#e0e0e0', routeIndex: 4, wpIndex: 6, isRival: false },
    { id: 'ai_civ_9', carStyle: 'coupe', color: '#4dd0e1', routeIndex: 4, wpIndex: 11, isRival: false },
    { id: 'ai_rival_1', carStyle: 'hyper', color: '#ff2e7e', routeIndex: 1, wpIndex: 1, isRival: true },
    { id: 'ai_rival_2', carStyle: 'fastback', color: '#00e5ff', routeIndex: 3, wpIndex: 2, isRival: true },
    { id: 'ai_rival_3', carStyle: 'coupe', color: '#ffd000', routeIndex: 5, wpIndex: 4, isRival: true }
  ];

  return {
    WORLD_HALF_SIZE: WORLD_HALF_SIZE,
    PLAYABLE_BOUND: PLAYABLE_BOUND,
    SPAWN_POINT: SPAWN_POINT,
    FUJI_PEAK: FUJI_PEAK,
    REGIONS: REGIONS,
    ROADS: ROADS,
    BUILDINGS: BUILDINGS,
    SPEED_TRAPS: SPEED_TRAPS,
    BONUS_TARGETS: BONUS_TARGETS,
    AI_ROUTES: AI_ROUTES,
    AI_SPAWNS: AI_SPAWNS,
    getRegionAt: getRegionAt,
    getTerrainHeight: getTerrainHeight,
    getTerrainNormal: getTerrainNormal,
    getSurfaceInfo: getSurfaceInfo,
    findNearestRoadPoint: findNearestRoadPoint
  };
});
