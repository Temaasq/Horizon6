(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var WorldData = require('./world_data.js');
    module.exports = factory(
      root.THREE || (typeof globalThis !== 'undefined' ? globalThis.THREE : null),
      WorldData
    );
  } else {
    root.H6 = root.H6 || {};
    root.H6.WorldMeshes = factory(root.THREE, root.H6.WorldData);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DefaultTHREE, DefaultWorldData) {
  'use strict';

  function resolveDeps(threeOverride, worldDataOverride) {
    var T = threeOverride || DefaultTHREE || (typeof globalThis !== 'undefined' ? globalThis.THREE : null);
    var W = worldDataOverride || DefaultWorldData || (typeof globalThis !== 'undefined' && globalThis.H6 ? globalThis.H6.WorldData : null);
    if (!T) throw new Error('H6.WorldMeshes requires THREE');
    if (!W) throw new Error('H6.WorldMeshes requires H6.WorldData');
    return { THREE: T, WorldData: W };
  }

  function makeSeededRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function createWindowTexture(THREE, accentHex, seed) {
    try {
      if (typeof document === 'undefined' || !document.createElement) return null;
      var canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 256;
      var ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#0e121d';
      ctx.fillRect(0, 0, 128, 256);

      var rng = makeSeededRng(seed || 101);
      var cols = 8;
      var rows = 24;
      var padX = 4;
      var padY = 3;
      var cellW = 128 / cols;
      var cellH = 256 / rows;

      for (var r = 0; r < rows; r++) {
        var floorLit = rng() > 0.25;
        for (var c = 0; c < cols; c++) {
          var roll = rng();
          if (floorLit && roll > 0.34) {
            if (roll > 0.86) {
              ctx.fillStyle = accentHex || '#00e5ff';
            } else if (roll > 0.62) {
              ctx.fillStyle = '#ffe9b8';
            } else {
              ctx.fillStyle = '#7bd4ff';
            }
            ctx.fillRect(c * cellW + padX * 0.5, r * cellH + padY * 0.5, cellW - padX, cellH - padY);
          } else {
            ctx.fillStyle = '#151b2b';
            ctx.fillRect(c * cellW + padX * 0.5, r * cellH + padY * 0.5, cellW - padX, cellH - padY);
          }
        }
      }

      var tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      return tex;
    } catch (e) {
      return null;
    }
  }

  function buildTerrainMesh(THREE, WorldData) {
    var segs = 128;
    var size = WorldData.WORLD_HALF_SIZE * 2;
    var geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    var pos = geo.attributes.position;
    var count = pos.count;
    var colors = new Float32Array(count * 3);
    var fuji = WorldData.FUJI_PEAK || { x: -760, z: -760, baseRadius: 380, height: 320 };

    for (var i = 0; i < count; i++) {
      var x = pos.getX(i);
      var z = pos.getZ(i);
      var h = WorldData.getTerrainHeight(x, z);
      pos.setY(i, h);

      var dFuji = Math.hypot(x - fuji.x, z - fuji.z);
      var r = 0.16;
      var g = 0.31;
      var b = 0.19;

      if (dFuji < fuji.baseRadius * 0.96) {
        if (h >= 190) {
          // Snow-capped Mt. Fuji peak
          var snowT = Math.min(1, (h - 190) / 36);
          r = 0.22 + snowT * 0.72;
          g = 0.24 + snowT * 0.72;
          b = 0.30 + snowT * 0.69;
        } else {
          // Dark volcanic basalt slopes
          var slopeT = Math.min(1, h / 190);
          r = 0.15 + slopeT * 0.08;
          g = 0.20 + slopeT * 0.04;
          b = 0.18 + slopeT * 0.09;
        }
      } else if (x >= -540 && x <= 260 && z >= -780 && z <= -120) {
        // Neon Tokyo urban asphalt/slate district
        r = 0.10;
        g = 0.12;
        b = 0.17;
      } else if (Math.hypot(x, z - 40) < 135) {
        // Horizon Festival Hub grounds
        r = 0.13;
        g = 0.15;
        b = 0.21;
      } else if (x >= 180 && x <= 780 && z >= -320 && z <= 480) {
        // Sakura Valley lush moss & petal-dusted meadow
        var petalBlend = 0.5 + 0.5 * Math.sin(x * 0.04) * Math.cos(z * 0.04);
        r = 0.20 + petalBlend * 0.14;
        g = 0.38 + petalBlend * 0.04;
        b = 0.24 + petalBlend * 0.09;
      } else if (h > 18) {
        // Touge mountain ridges
        var tSlope = Math.min(1, (h - 18) / 50);
        r = 0.15 + tSlope * 0.13;
        g = 0.28 + tSlope * 0.04;
        b = 0.17 + tSlope * 0.06;
      }

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    var mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04
    });

    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'japan_terrain';
    return mesh;
  }

  function buildRibbonGeometry(THREE, WorldData, points, halfWidth, yOffset, stepSize) {
    var sampled = [];
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i];
      var b = points[i + 1];
      var segLen = Math.hypot(b.x - a.x, b.z - a.z);
      var steps = Math.max(1, Math.ceil(segLen / (stepSize || 10)));
      for (var s = 0; s < steps; s++) {
        var t = s / steps;
        sampled.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    var last = points[points.length - 1];
    sampled.push({ x: last.x, z: last.z });

    var positions = [];
    var indices = [];

    for (var k = 0; k < sampled.length; k++) {
      var p = sampled[k];
      var prev = sampled[Math.max(0, k - 1)];
      var next = sampled[Math.min(sampled.length - 1, k + 1)];
      var tx = next.x - prev.x;
      var tz = next.z - prev.z;
      var tLen = Math.hypot(tx, tz) || 1;
      // Right perpendicular in XZ
      var rx = -tz / tLen;
      var rz = tx / tLen;

      var lx = p.x - rx * halfWidth;
      var lz = p.z - rz * halfWidth;
      var rvx = p.x + rx * halfWidth;
      var rvz = p.z + rz * halfWidth;

      var ly = WorldData.getTerrainHeight(lx, lz) + yOffset;
      var ry = WorldData.getTerrainHeight(rvx, rvz) + yOffset;

      positions.push(lx, ly, lz, rvx, ry, rvz);

      if (k < sampled.length - 1) {
        var v0 = k * 2;
        var v1 = v0 + 1;
        var v2 = v0 + 2;
        var v3 = v0 + 3;
        indices.push(v0, v2, v1, v1, v2, v3);
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function buildRoadMeshes(THREE, WorldData) {
    var group = new THREE.Group();
    group.name = 'japan_roads';

    var asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x20242e,
      roughness: 0.78,
      metalness: 0.08,
      side: THREE.DoubleSide
    });
    var dirtMat = new THREE.MeshStandardMaterial({
      color: 0x6b5039,
      roughness: 0.96,
      metalness: 0.02,
      side: THREE.DoubleSide
    });
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xe6ebf5 });
    var yellowDashMat = new THREE.MeshBasicMaterial({ color: 0xffd000 });

    var roads = WorldData.ROADS || [];
    for (var r = 0; r < roads.length; r++) {
      var road = roads[r];
      var ribbonGeo = buildRibbonGeometry(THREE, WorldData, road.points, road.halfWidth, 0.09, 10);
      var ribbonMesh = new THREE.Mesh(ribbonGeo, road.surface === 'dirt' ? dirtMat : asphaltMat);
      group.add(ribbonMesh);

      // Dashed center line on asphalt roads
      if (road.surface === 'asphalt') {
        var isYellow = road.id === 'touge_mountain_road' || road.id === 'wangan_expressway';
        var lineMat = isYellow ? yellowDashMat : dashMat;
        for (var i = 0; i < road.points.length - 1; i++) {
          var a = road.points[i];
          var b = road.points[i + 1];
          var dx = b.x - a.x;
          var dz = b.z - a.z;
          var len = Math.hypot(dx, dz) || 1;
          var ux = dx / len;
          var uz = dz / len;
          var yaw = Math.atan2(-ux, -uz);

          for (var d = 6; d < len - 4; d += 14) {
            var mx = a.x + ux * d;
            var mz = a.z + uz * d;
            var my = WorldData.getTerrainHeight(mx, mz) + 0.13;
            var dash = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 4.6), lineMat);
            dash.position.set(mx, my, mz);
            dash.rotation.y = yaw;
            group.add(dash);
          }

          // Touge outer guardrails & curve chevron posts
          if (road.id === 'touge_mountain_road') {
            var railMat = new THREE.MeshStandardMaterial({ color: 0xd9dee8, roughness: 0.45, metalness: 0.6 });
            var postMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff2020, emissiveIntensity: 0.3 });
            var rx = -uz;
            var rz = ux;
            var side = (i % 2 === 0) ? 1 : -1;
            var gx = (a.x + b.x) * 0.5 + rx * (road.halfWidth + 0.8) * side;
            var gz = (a.z + b.z) * 0.5 + rz * (road.halfWidth + 0.8) * side;
            var gy = WorldData.getTerrainHeight(gx, gz) + 0.55;
            var rail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.42, len * 0.86), railMat);
            rail.position.set(gx, gy, gz);
            rail.rotation.y = yaw;
            group.add(rail);

            for (var p = 10; p < len - 8; p += 28) {
              var px = a.x + ux * p + rx * (road.halfWidth + 0.85) * side;
              var pz = a.z + uz * p + rz * (road.halfWidth + 0.85) * side;
              var py = WorldData.getTerrainHeight(px, pz) + 0.65;
              var post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.3, 0.32), postMat);
              post.position.set(px, py, pz);
              group.add(post);
            }
          }
        }
      }
    }

    // Horizon Festival Stunt Plaza Asphalt Pad
    var plazaGeo = new THREE.CircleGeometry(44, 36);
    plazaGeo.rotateX(-Math.PI / 2);
    var plazaMesh = new THREE.Mesh(plazaGeo, asphaltMat);
    plazaMesh.position.set(0, 0.07, 40);
    group.add(plazaMesh);

    var plazaRingGeo = new THREE.RingGeometry(42.5, 44, 36);
    plazaRingGeo.rotateX(-Math.PI / 2);
    var plazaRingMat = new THREE.MeshBasicMaterial({ color: 0xff2e7e, side: THREE.DoubleSide });
    var plazaRing = new THREE.Mesh(plazaRingGeo, plazaRingMat);
    plazaRing.position.set(0, 0.10, 40);
    group.add(plazaRing);

    // Perimeter boundary chevrons at +/-960m
    var bound = WorldData.PLAYABLE_BOUND || 960;
    var chevRed = new THREE.MeshBasicMaterial({ color: 0xff2e44 });
    var chevWhite = new THREE.MeshBasicMaterial({ color: 0xf4f7fc });
    for (var posCoord = -bound; posCoord <= bound; posCoord += 80) {
      var sides = [
        [posCoord, -bound],
        [posCoord, bound],
        [-bound, posCoord],
        [bound, posCoord]
      ];
      for (var si = 0; si < sides.length; si++) {
        var bx = sides[si][0];
        var bz = sides[si][1];
        var by = WorldData.getTerrainHeight(bx, bz) + 1.1;
        var marker = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 2.2, 0.6),
          ((Math.abs(posCoord) / 80) % 2 === 0) ? chevRed : chevWhite
        );
        marker.position.set(bx, by, bz);
        if (si >= 2) marker.rotation.y = Math.PI / 2;
        group.add(marker);
      }
    }

    return group;
  }

  function buildBuildingsAndFestival(THREE, WorldData) {
    var group = new THREE.Group();
    group.name = 'buildings_and_festival';

    var texCache = {
      '#00e5ff': createWindowTexture(THREE, '#00e5ff', 11),
      '#ff2e7e': createWindowTexture(THREE, '#ff2e7e', 23),
      '#ffd000': createWindowTexture(THREE, '#ffd000', 37),
      '#7cff4d': createWindowTexture(THREE, '#7cff4d', 53)
    };

    var buildings = WorldData.BUILDINGS || [];
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      var baseY = WorldData.getTerrainHeight(b.x, b.z);
      var winTex = texCache[b.neonColor] || texCache['#00e5ff'];
      var bMat = new THREE.MeshStandardMaterial({
        color: b.color || '#151926',
        roughness: 0.45,
        metalness: 0.55,
        map: winTex || null,
        emissive: winTex ? 0x161c2e : 0x05070c,
        emissiveMap: winTex || null,
        emissiveIntensity: winTex ? 1.1 : 0.2
      });

      var body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), bMat);
      body.position.set(b.x, baseY + b.h * 0.5, b.z);
      group.add(body);

      // Glowing neon rooftop trim & vertical signboards
      var neonMat = new THREE.MeshBasicMaterial({ color: b.neonColor || '#00e5ff' });
      var crown = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.6, 0.9, b.d + 0.6), neonMat);
      crown.position.set(b.x, baseY + b.h + 0.45, b.z);
      group.add(crown);

      if (b.regionId === 'tokyo') {
        var signW = Math.min(b.w * 0.42, 12);
        var signH = Math.min(b.h * 0.36, 18);
        var sign = new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.8), neonMat);
        sign.position.set(b.x, baseY + b.h * 0.62, b.z + b.d * 0.5 + 0.45);
        group.add(sign);
      }

      if (b.kind === 'stage') {
        // Festival DJ stage arch & equalizer towers
        var stageScreen = new THREE.Mesh(
          new THREE.BoxGeometry(b.w * 0.65, b.h * 0.55, 0.6),
          new THREE.MeshBasicMaterial({ color: 0x00e5ff })
        );
        stageScreen.position.set(b.x, baseY + b.h * 0.52, b.z - b.d * 0.5 - 0.35);
        group.add(stageScreen);
      }
    }

    // 3 Horizon Festival Gantry Arches spanning Festival Boulevard
    var archZList = [78, 12, -46];
    var archColors = [0xff2e7e, 0x00e5ff, 0xffd000];
    for (var a = 0; a < archZList.length; a++) {
      var az = archZList[a];
      var ay = WorldData.getTerrainHeight(0, az);
      var pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e2230, roughness: 0.4, metalness: 0.7 });
      var glowMat = new THREE.MeshBasicMaterial({ color: archColors[a] });

      var leftP = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9.5, 1.4), pillarMat);
      leftP.position.set(-13.5, ay + 4.75, az);
      group.add(leftP);

      var rightP = new THREE.Mesh(new THREE.BoxGeometry(1.4, 9.5, 1.4), pillarMat);
      rightP.position.set(13.5, ay + 4.75, az);
      group.add(rightP);

      var span = new THREE.Mesh(new THREE.BoxGeometry(28.4, 1.8, 1.6), pillarMat);
      span.position.set(0, ay + 9.2, az);
      group.add(span);

      var neonStrip = new THREE.Mesh(new THREE.BoxGeometry(27.0, 0.65, 1.75), glowMat);
      neonStrip.position.set(0, ay + 9.2, az);
      group.add(neonStrip);
    }

    // Tokyo & Wangan streetlamps
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x2a3040, metalness: 0.7, roughness: 0.35 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff });
    for (var lx = -400; lx <= 180; lx += 80) {
      var lzPositions = [-444, -476];
      for (var lzi = 0; lzi < lzPositions.length; lzi++) {
        var lz = lzPositions[lzi];
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 8.5, 6), poleMat);
        pole.position.set(lx, 4.25, lz);
        group.add(pole);

        var bulb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 0.6), lampMat);
        bulb.position.set(lx, 8.4, lz + (lzi === 0 ? -0.6 : 0.6));
        group.add(bulb);
      }
    }

    return group;
  }

  function buildSakuraAndFuji(THREE, WorldData) {
    var group = new THREE.Group();
    group.name = 'sakura_and_fuji';

    // 3 Vermilion Torii Gates along Sakura Shrine Road
    var toriiMat = new THREE.MeshStandardMaterial({ color: 0xd92b2b, roughness: 0.42, metalness: 0.12 });
    var toriiCapMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.55 });
    var toriiCoords = [
      { x: 420, z: 40, nextX: 490, nextZ: 110 },
      { x: 490, z: 110, nextX: 560, nextZ: 175 },
      { x: 560, z: 175, nextX: 610, nextZ: 210 }
    ];

    for (var t = 0; t < toriiCoords.length; t++) {
      var tc = toriiCoords[t];
      var ty = WorldData.getTerrainHeight(tc.x, tc.z);
      var yaw = Math.atan2(-(tc.nextX - tc.x), -(tc.nextZ - tc.z));
      var torii = new THREE.Group();

      var colL = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 8.6, 10), toriiMat);
      colL.position.set(-7.5, 4.3, 0);
      torii.add(colL);

      var colR = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 8.6, 10), toriiMat);
      colR.position.set(7.5, 4.3, 0);
      torii.add(colR);

      var crossLow = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.65, 0.7), toriiMat);
      crossLow.position.set(0, 6.7, 0);
      torii.add(crossLow);

      var kasagi = new THREE.Mesh(new THREE.BoxGeometry(20.6, 0.85, 1.15), toriiMat);
      kasagi.position.set(0, 8.6, 0);
      torii.add(kasagi);

      var cap = new THREE.Mesh(new THREE.BoxGeometry(21.2, 0.32, 1.25), toriiCapMat);
      cap.position.set(0, 9.15, 0);
      torii.add(cap);

      torii.position.set(tc.x, ty, tc.z);
      torii.rotation.y = yaw;
      group.add(torii);
    }

    // Shrine Pavilion beside summit plaza (clear of road)
    var shrineX = 638;
    var shrineZ = 216;
    var shrineY = WorldData.getTerrainHeight(shrineX, shrineZ);
    var shrine = new THREE.Group();
    shrine.position.set(shrineX, shrineY, shrineZ);
    var shrineBase = new THREE.Mesh(new THREE.BoxGeometry(14, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x3b3532, roughness: 0.85 }));
    shrineBase.position.y = 0.9;
    shrine.add(shrineBase);
    var shrineHall = new THREE.Mesh(new THREE.BoxGeometry(10, 5.2, 8.5), toriiMat);
    shrineHall.position.y = 4.4;
    shrine.add(shrineHall);
    var shrineRoof = new THREE.Mesh(new THREE.ConeGeometry(9.6, 3.8, 4), toriiCapMat);
    shrineRoof.rotation.y = Math.PI / 4;
    shrineRoof.position.y = 8.6;
    shrine.add(shrineRoof);
    group.add(shrine);

    // 96 Sakura Blossom Trees (InstancedMesh if available for mobile GPU speed)
    var rng = makeSeededRng(2026);
    var treePositions = [];
    var attempts = 0;
    while (treePositions.length < 96 && attempts < 800) {
      attempts++;
      var tx = 195 + rng() * 570;
      var tz = -290 + rng() * 750;
      var surf = WorldData.getSurfaceInfo(tx, tz);
      if (!surf.onRoad && surf.distToRoad > 13) {
        treePositions.push({ x: tx, y: surf.height, z: tz, scale: 0.85 + rng() * 0.55, rot: rng() * Math.PI * 2 });
      }
    }

    var trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 4.2, 7);
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2820, roughness: 0.92 });
    var crownGeo = new THREE.IcosahedronGeometry(2.6, 1);
    var crownMat1 = new THREE.MeshStandardMaterial({ color: 0xffb7d5, roughness: 0.72, emissive: 0x330d1e, emissiveIntensity: 0.25 });
    var crownMat2 = new THREE.MeshStandardMaterial({ color: 0xff7eb6, roughness: 0.72, emissive: 0x2b0818, emissiveIntensity: 0.22 });

    if (typeof THREE.InstancedMesh === 'function') {
      var count = treePositions.length;
      var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      var crownsA = new THREE.InstancedMesh(crownGeo, crownMat1, count);
      var crownsB = new THREE.InstancedMesh(crownGeo, crownMat2, count);
      var dummy = new THREE.Object3D();

      for (var idx = 0; idx < count; idx++) {
        var tp = treePositions[idx];
        dummy.position.set(tp.x, tp.y + 2.0 * tp.scale, tp.z);
        dummy.rotation.set(0, tp.rot, 0);
        dummy.scale.set(tp.scale, tp.scale, tp.scale);
        dummy.updateMatrix();
        trunks.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(tp.x, tp.y + 4.9 * tp.scale, tp.z);
        dummy.scale.set(tp.scale * 1.15, tp.scale * 0.75, tp.scale * 1.15);
        dummy.updateMatrix();
        crownsA.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(tp.x + Math.cos(tp.rot) * 1.1, tp.y + 4.2 * tp.scale, tp.z + Math.sin(tp.rot) * 1.1);
        dummy.scale.set(tp.scale * 0.85, tp.scale * 0.65, tp.scale * 0.85);
        dummy.updateMatrix();
        crownsB.setMatrixAt(idx, dummy.matrix);
      }
      trunks.instanceMatrix.needsUpdate = true;
      crownsA.instanceMatrix.needsUpdate = true;
      crownsB.instanceMatrix.needsUpdate = true;
      group.add(trunks, crownsA, crownsB);
    } else {
      for (var ti = 0; ti < treePositions.length; ti++) {
        var p = treePositions[ti];
        var tr = new THREE.Mesh(trunkGeo, trunkMat);
        tr.position.set(p.x, p.y + 2.0 * p.scale, p.z);
        group.add(tr);
        var cr = new THREE.Mesh(crownGeo, crownMat1);
        cr.position.set(p.x, p.y + 4.9 * p.scale, p.z);
        group.add(cr);
      }
    }

    // Mt. Fuji Summit Crater Rim Accent Ring
    var fuji = WorldData.FUJI_PEAK || { x: -760, z: -760, height: 320 };
    var crater = new THREE.Mesh(
      new THREE.TorusGeometry(26, 5.5, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xeaf2ff, roughness: 0.7 })
    );
    crater.rotation.x = Math.PI / 2;
    crater.position.set(fuji.x, fuji.height - 6, fuji.z);
    group.add(crater);

    return group;
  }

  function buildSakuraPetals(THREE) {
    var count = 750;
    var positions = new Float32Array(count * 3);
    var phases = new Float32Array(count);
    var rng = makeSeededRng(777);

    for (var i = 0; i < count; i++) {
      // Spread across Sakura Valley & drifting toward Festival Hub
      positions[i * 3] = 100 + rng() * 700;
      positions[i * 3 + 1] = 2 + rng() * 38;
      positions[i * 3 + 2] = -320 + rng() * 820;
      phases[i] = rng() * Math.PI * 2;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    var mat = new THREE.PointsMaterial({
      color: 0xffb7d5,
      size: 0.55,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });

    var points = new THREE.Points(geo, mat);
    points.name = 'sakura_petals';
    points.userData = {
      count: count,
      phases: phases
    };
    return points;
  }

  function buildSpeedTraps(THREE, WorldData) {
    var group = new THREE.Group();
    group.name = 'speed_traps';
    var traps = WorldData.SPEED_TRAPS || [];
    var trapMeshes = [];

    var frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1f2c, roughness: 0.35, metalness: 0.75 });
    var cyanGlow = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    var magentaGlow = new THREE.MeshBasicMaterial({ color: 0xff2e7e });

    for (var i = 0; i < traps.length; i++) {
      var tr = traps[i];
      var y = WorldData.getTerrainHeight(tr.x, tr.z);
      var gate = new THREE.Group();
      gate.position.set(tr.x, y, tr.z);
      gate.rotation.y = tr.heading;

      var span = tr.halfWidth * 2;
      var leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.8, 0.9), frameMat);
      leftPost.position.set(-tr.halfWidth, 3.4, 0);
      gate.add(leftPost);

      var rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.9, 6.8, 0.9), frameMat);
      rightPost.position.set(tr.halfWidth, 3.4, 0);
      gate.add(rightPost);

      var beam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.2, 1.1, 1.0), frameMat);
      beam.position.set(0, 6.8, 0);
      gate.add(beam);

      var pulseStrip = new THREE.Mesh(new THREE.BoxGeometry(span * 0.92, 0.36, 1.15), cyanGlow);
      pulseStrip.position.set(0, 6.8, 0);
      gate.add(pulseStrip);

      var radarPodL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.2), magentaGlow);
      radarPodL.position.set(-tr.halfWidth * 0.35, 6.0, 0);
      gate.add(radarPodL);

      var radarPodR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.2), magentaGlow);
      radarPodR.position.set(tr.halfWidth * 0.35, 6.0, 0);
      gate.add(radarPodR);

      group.add(gate);
      trapMeshes.push({ id: tr.id, group: gate, pulseStrip: pulseStrip });
    }

    return { group: group, trapMeshes: trapMeshes };
  }

  function buildBonusTargets(THREE, WorldData) {
    var group = new THREE.Group();
    group.name = 'bonus_targets';
    var targets = WorldData.BONUS_TARGETS || [];
    var targetMap = {};
    var targetList = [];

    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var colorHex = t.valueCr >= 5000 ? 0xffd000 : (t.valueCr >= 2500 ? 0x00e5ff : 0xff2e7e);

      var holder = new THREE.Group();
      holder.position.set(t.x, t.y, t.z);

      var boardMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.95,
        roughness: 0.25,
        metalness: 0.3
      });

      var board = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.45, 0.24), boardMat);
      holder.add(board);

      var core = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      core.position.y = 1.25;
      holder.add(core);

      var ring = new THREE.Mesh(
        new THREE.RingGeometry(1.3, 1.6, 18),
        new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -1.1;
      holder.add(ring);

      group.add(holder);
      var entry = { id: t.id, x: t.x, y: t.y, z: t.z, colorHex: colorHex, mesh: holder, collected: false };
      targetMap[t.id] = entry;
      targetList.push(entry);
    }

    return { group: group, targetMap: targetMap, targetList: targetList };
  }

  function createSmashBurstPool(THREE) {
    var pool = [];
    for (var p = 0; p < 4; p++) {
      var shardCount = 24;
      var positions = new Float32Array(shardCount * 3);
      var velocities = new Float32Array(shardCount * 3);
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      var mat = new THREE.PointsMaterial({
        color: 0xffd000,
        size: 0.55,
        transparent: true,
        opacity: 1.0,
        depthWrite: false
      });
      var pts = new THREE.Points(geo, mat);
      pts.visible = false;
      pool.push({
        points: pts,
        positions: positions,
        velocities: velocities,
        life: 0,
        maxLife: 0.75,
        active: false
      });
    }
    return pool;
  }

  function triggerSmashBurst(pool, x, y, z, colorHex) {
    if (!pool || pool.length === 0) return;
    var slot = pool[0];
    for (var i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        slot = pool[i];
        break;
      }
    }
    slot.active = true;
    slot.life = slot.maxLife;
    slot.points.visible = true;
    slot.points.material.color.setHex(colorHex || 0xffd000);
    slot.points.material.opacity = 1.0;

    var count = slot.positions.length / 3;
    for (var k = 0; k < count; k++) {
      var angle = (k / count) * Math.PI * 2;
      var speed = 5 + (k % 5) * 2.2;
      slot.positions[k * 3] = x;
      slot.positions[k * 3 + 1] = y + 0.3;
      slot.positions[k * 3 + 2] = z;
      slot.velocities[k * 3] = Math.cos(angle) * speed;
      slot.velocities[k * 3 + 1] = 4 + (k % 4) * 2.5;
      slot.velocities[k * 3 + 2] = Math.sin(angle) * speed;
    }
    slot.points.geometry.attributes.position.needsUpdate = true;
  }

  function buildWorld(scene, threeOverride, worldDataOverride) {
    var deps = resolveDeps(threeOverride, worldDataOverride);
    var THREE = deps.THREE;
    var WorldData = deps.WorldData;

    var rootGroup = new THREE.Group();
    rootGroup.name = 'horizon6_japan_world';

    var terrain = buildTerrainMesh(THREE, WorldData);
    var roads = buildRoadMeshes(THREE, WorldData);
    var buildings = buildBuildingsAndFestival(THREE, WorldData);
    var sakuraAndFuji = buildSakuraAndFuji(THREE, WorldData);
    var sakuraPetals = buildSakuraPetals(THREE);
    var traps = buildSpeedTraps(THREE, WorldData);
    var targets = buildBonusTargets(THREE, WorldData);
    var smashPool = createSmashBurstPool(THREE);

    rootGroup.add(terrain, roads, buildings, sakuraAndFuji, sakuraPetals, traps.group, targets.group);
    for (var sp = 0; sp < smashPool.length; sp++) {
      rootGroup.add(smashPool[sp].points);
    }

    if (scene && typeof scene.add === 'function') {
      scene.add(rootGroup);
    }

    function updateWorld(simState, dt, elapsedSec) {
      var safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;
      var tNow = Number.isFinite(elapsedSec) ? elapsedSec : 0;

      // 1. Animate falling sakura petals
      var petalPos = sakuraPetals.geometry.attributes.position;
      var petalArr = petalPos.array;
      var phases = sakuraPetals.userData.phases;
      var pCount = sakuraPetals.userData.count;
      for (var i = 0; i < pCount; i++) {
        var idx = i * 3;
        var ph = phases[i];
        petalArr[idx] += Math.sin(tNow * 1.1 + ph) * 1.4 * safeDt - 0.65 * safeDt;
        petalArr[idx + 1] -= (1.5 + (i % 4) * 0.35) * safeDt;
        petalArr[idx + 2] += Math.cos(tNow * 0.9 + ph) * 1.1 * safeDt;
        if (petalArr[idx + 1] < 0.2) {
          petalArr[idx + 1] = 34 + (i % 10);
        }
      }
      petalPos.needsUpdate = true;

      // 2. Rotate uncollected bonus boards & trigger bursts on newly collected targets
      var simTargets = simState && simState.targets;
      if (simTargets) {
        for (var j = 0; j < simTargets.length; j++) {
          var st = simTargets[j];
          var entry = targets.targetMap[st.id];
          if (!entry) continue;
          if (st.collected && !entry.collected) {
            entry.collected = true;
            entry.mesh.visible = false;
            triggerSmashBurst(smashPool, entry.x, entry.y, entry.z, entry.colorHex);
          } else if (!st.collected) {
            entry.collected = false;
            entry.mesh.visible = true;
          }
        }
      }

      for (var k = 0; k < targets.targetList.length; k++) {
        var item = targets.targetList[k];
        if (item.mesh.visible) {
          item.mesh.rotation.y = tNow * 1.8 + k * 0.4;
        }
      }

      // 3. Update active smash burst particles
      for (var b = 0; b < smashPool.length; b++) {
        var burst = smashPool[b];
        if (!burst.active) continue;
        burst.life -= safeDt;
        if (burst.life <= 0) {
          burst.active = false;
          burst.points.visible = false;
          continue;
        }
        var bArr = burst.positions;
        var vArr = burst.velocities;
        var nShards = bArr.length / 3;
        for (var s = 0; s < nShards; s++) {
          var si = s * 3;
          vArr[si + 1] -= 14.0 * safeDt;
          bArr[si] += vArr[si] * safeDt;
          bArr[si + 1] += vArr[si + 1] * safeDt;
          bArr[si + 2] += vArr[si + 2] * safeDt;
        }
        burst.points.material.opacity = Math.max(0, burst.life / burst.maxLife);
        burst.points.geometry.attributes.position.needsUpdate = true;
      }

      // 4. Subtle speed trap pulse
      for (var tr = 0; tr < traps.trapMeshes.length; tr++) {
        var tm = traps.trapMeshes[tr];
        if (tm.pulseStrip && tm.pulseStrip.material) {
          tm.pulseStrip.material.color.setHex(
            Math.sin(tNow * 4 + tr) > 0 ? 0x00e5ff : 0x38f6ff
          );
        }
      }
    }

    function dispose() {
      rootGroup.traverse(function (obj) {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') {
          obj.geometry.dispose();
        }
        if (obj.material) {
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (var m = 0; m < mats.length; m++) {
            if (mats[m].map && typeof mats[m].map.dispose === 'function') {
              mats[m].map.dispose();
            }
            if (mats[m].emissiveMap && typeof mats[m].emissiveMap.dispose === 'function') {
              mats[m].emissiveMap.dispose();
            }
            if (typeof mats[m].dispose === 'function') {
              mats[m].dispose();
            }
          }
        }
      });
    }

    return {
      rootGroup: rootGroup,
      terrainMesh: terrain,
      targetMeshes: targets.targetList,
      trapMeshes: traps.trapMeshes,
      sakuraPetals: sakuraPetals,
      smashPool: smashPool,
      updateWorld: updateWorld,
      dispose: dispose
    };
  }

  return {
    buildWorld: buildWorld
  };
});
