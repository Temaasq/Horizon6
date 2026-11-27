(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.THREE || (typeof globalThis !== 'undefined' ? globalThis.THREE : null));
  } else {
    root.H6 = root.H6 || {};
    root.H6.CarModels = factory(root.THREE);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DefaultTHREE) {
  'use strict';

  function resolveTHREE(threeOverride) {
    var T = threeOverride || DefaultTHREE || (typeof globalThis !== 'undefined' ? globalThis.THREE : null);
    if (!T) {
      throw new Error('H6.CarModels requires THREE to be loaded');
    }
    return T;
  }

  function makeMat(THREE, opts) {
    return new THREE.MeshStandardMaterial(opts);
  }

  function addBox(THREE, parent, w, h, d, mat, x, y, z, rx, ry, rz) {
    var geo = new THREE.BoxGeometry(w, h, d);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x || 0, y || 0, z || 0);
    if (rx) mesh.rotation.x = rx;
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    parent.add(mesh);
    return mesh;
  }

  function addCyl(THREE, parent, rTop, rBot, h, segs, mat, x, y, z, rx, ry, rz) {
    var geo = new THREE.CylinderGeometry(rTop, rBot, h, segs || 12);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x || 0, y || 0, z || 0);
    if (rx) mesh.rotation.x = rx;
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    parent.add(mesh);
    return mesh;
  }

  function buildWheel(THREE, radius, width, rimColor, isPlayer) {
    var wheelGroup = new THREE.Group();
    var tireMat = makeMat(THREE, { color: 0x16181e, roughness: 0.88, metalness: 0.1 });
    var rimMat = makeMat(THREE, { color: rimColor || 0xcfd6e2, roughness: 0.28, metalness: 0.82 });

    var tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, isPlayer ? 18 : 12),
      tireMat
    );
    tire.rotation.z = Math.PI / 2;
    wheelGroup.add(tire);

    var rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.015, isPlayer ? 14 : 8),
      rimMat
    );
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);

    if (isPlayer) {
      var spokeMat = makeMat(THREE, { color: 0x20252f, roughness: 0.4, metalness: 0.65 });
      for (var s = 0; s < 5; s++) {
        var angle = (s * Math.PI) / 5;
        var spoke = new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.024, radius * 1.12, radius * 0.14),
          spokeMat
        );
        spoke.rotation.x = angle;
        wheelGroup.add(spoke);
      }
      var hub = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, width + 0.03, 10),
        rimMat
      );
      hub.rotation.z = Math.PI / 2;
      wheelGroup.add(hub);
    }

    return wheelGroup;
  }

  function buildLightsAndFlames(THREE, chassis, flameParent, spec, dims, mats, isPlayer) {
    var hw = dims.width * 0.5;
    var hl = dims.length * 0.5;
    var baseY = dims.clearance + 0.34;
    var taillightMats = [];
    var headlightMats = [];
    var nitroFlames = [];

    var headMat = makeMat(THREE, {
      color: 0xeef7ff,
      emissive: 0xd9eeff,
      emissiveIntensity: 1.6,
      roughness: 0.2
    });
    headlightMats.push(headMat);

    var tailMat = makeMat(THREE, {
      color: 0xff2233,
      emissive: 0xff1122,
      emissiveIntensity: 0.9,
      roughness: 0.25
    });
    taillightMats.push(tailMat);

    // Headlights tailored per style
    if (spec.bodyStyle === 'hyper') {
      addBox(THREE, chassis, 0.36, 0.09, 0.14, headMat, -hw * 0.68, baseY - 0.02, -hl + 0.05, 0.1, 0.24, 0);
      addBox(THREE, chassis, 0.36, 0.09, 0.14, headMat, hw * 0.68, baseY - 0.02, -hl + 0.05, 0.1, -0.24, 0);
    } else if (spec.bodyStyle === 'suv') {
      addCyl(THREE, chassis, 0.11, 0.11, 0.08, 12, headMat, -hw * 0.64, baseY + 0.08, -hl + 0.02, Math.PI / 2, 0, 0);
      addCyl(THREE, chassis, 0.11, 0.11, 0.08, 12, headMat, hw * 0.64, baseY + 0.08, -hl + 0.02, Math.PI / 2, 0, 0);
    } else {
      addBox(THREE, chassis, 0.34, 0.11, 0.10, headMat, -hw * 0.66, baseY, -hl + 0.03);
      addBox(THREE, chassis, 0.34, 0.11, 0.10, headMat, hw * 0.66, baseY, -hl + 0.03);
    }

    // Taillights tailored per style
    if (spec.id === 'skyline_gtr') {
      // Signature quad circular R34 taillights
      var rOffsets = [-hw * 0.72, -hw * 0.48, hw * 0.48, hw * 0.72];
      for (var t = 0; t < rOffsets.length; t++) {
        var rSize = (t === 0 || t === 3) ? 0.095 : 0.075;
        addCyl(THREE, chassis, rSize, rSize, 0.08, 12, tailMat, rOffsets[t], baseY + 0.10, hl - 0.02, Math.PI / 2, 0, 0);
      }
    } else if (spec.bodyStyle === 'fastback') {
      // Full-width RX-7 FD taillight bar
      addBox(THREE, chassis, dims.width * 0.78, 0.11, 0.08, tailMat, 0, baseY + 0.04, hl - 0.02);
    } else {
      addBox(THREE, chassis, 0.36, 0.12, 0.08, tailMat, -hw * 0.64, baseY + 0.08, hl - 0.02);
      addBox(THREE, chassis, 0.36, 0.12, 0.08, tailMat, hw * 0.64, baseY + 0.08, hl - 0.02);
    }

    if (isPlayer) {
      var flameMat = new THREE.MeshBasicMaterial({
        color: 0x00eaff,
        transparent: true,
        opacity: 0.88
      });
      var flameCoreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95
      });

      var exhaustPositions = spec.bodyStyle === 'hyper'
        ? [-0.14, 0.14]
        : [-hw * 0.52, hw * 0.52];

      for (var f = 0; f < exhaustPositions.length; f++) {
        var flameGroup = new THREE.Group();
        var outerCone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.85, 10), flameMat);
        outerCone.rotation.x = Math.PI / 2;
        outerCone.position.z = 0.42;
        flameGroup.add(outerCone);

        var innerCone = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.52, 8), flameCoreMat);
        innerCone.rotation.x = Math.PI / 2;
        innerCone.position.z = 0.28;
        flameGroup.add(innerCone);

        flameGroup.position.set(exhaustPositions[f], dims.clearance + 0.16, hl + 0.04);
        flameGroup.visible = false;
        (flameParent || chassis).add(flameGroup);
        nitroFlames.push(flameGroup);
      }
    }

    return {
      taillightMats: taillightMats,
      headlightMats: headlightMats,
      nitroFlames: nitroFlames
    };
  }

  function buildBodySilhouette(THREE, chassis, spec, dims, mats, isPlayer) {
    var w = dims.width;
    var l = dims.length;
    var h = dims.height;
    var clr = dims.clearance;
    var style = spec.bodyStyle || 'coupe';

    var bodyBaseY = clr + 0.28;
    var lowerH = (style === 'suv') ? 0.56 : (style === 'hyper') ? 0.36 : 0.44;

    // Lower sculpted body
    addBox(THREE, chassis, w, lowerH, l * 0.94, mats.primary, 0, bodyBaseY, 0);

    // Front & rear bumpers / aero splitters
    addBox(THREE, chassis, w * 0.98, lowerH * 0.46, 0.24, mats.secondary, 0, clr + 0.14, -l * 0.47);
    addBox(THREE, chassis, w * 0.98, lowerH * 0.46, 0.24, mats.secondary, 0, clr + 0.16, l * 0.47);

    // Underbody dark chassis pan
    addBox(THREE, chassis, w * 0.84, 0.10, l * 0.88, mats.dark, 0, clr + 0.05, 0);

    if (style === 'coupe') {
      // Skyline R34: boxy muscular coupe, carbon hood, tall twin-post GT wing, intercooler
      addBox(THREE, chassis, w * 0.80, 0.06, l * 0.33, mats.secondary, 0, bodyBaseY + lowerH * 0.5 + 0.01, -l * 0.28);
      addBox(THREE, chassis, w * 0.46, 0.16, 0.10, mats.chrome, 0, clr + 0.16, -l * 0.48); // Intercooler
      // Cabin & glass
      var cabinY = bodyBaseY + lowerH * 0.5 + (h - lowerH - clr) * 0.44;
      addBox(THREE, chassis, w * 0.82, 0.44, l * 0.42, mats.glass, 0, cabinY, 0.12);
      addBox(THREE, chassis, w * 0.78, 0.07, l * 0.34, mats.primary, 0, cabinY + 0.23, 0.14);
      // Accent side skirts
      addBox(THREE, chassis, 0.06, 0.10, l * 0.62, mats.accent, -w * 0.50, clr + 0.11, 0);
      addBox(THREE, chassis, 0.06, 0.10, l * 0.62, mats.accent, w * 0.50, clr + 0.11, 0);
      // Twin-post GT rear wing
      addBox(THREE, chassis, 0.06, 0.32, 0.14, mats.dark, -w * 0.30, bodyBaseY + lowerH * 0.5 + 0.15, l * 0.41);
      addBox(THREE, chassis, 0.06, 0.32, 0.14, mats.dark, w * 0.30, bodyBaseY + lowerH * 0.5 + 0.15, l * 0.41);
      addBox(THREE, chassis, w * 0.98, 0.05, 0.26, mats.secondary, 0, bodyBaseY + lowerH * 0.5 + 0.31, l * 0.42, -0.10, 0, 0);
      addBox(THREE, chassis, 0.04, 0.16, 0.30, mats.accent, -w * 0.49, bodyBaseY + lowerH * 0.5 + 0.31, l * 0.42);
      addBox(THREE, chassis, 0.04, 0.16, 0.30, mats.accent, w * 0.49, bodyBaseY + lowerH * 0.5 + 0.31, l * 0.42);
      // Dual exhausts
      if (isPlayer) {
        addCyl(THREE, chassis, 0.065, 0.065, 0.18, 10, mats.chrome, -w * 0.28, clr + 0.14, l * 0.48, Math.PI / 2, 0, 0);
        addCyl(THREE, chassis, 0.065, 0.065, 0.18, 10, mats.chrome, w * 0.28, clr + 0.14, l * 0.48, Math.PI / 2, 0, 0);
      }
    } else if (style === 'fastback') {
      // Mazda RX-7 FD: sleek sloped nose, fastback roof, black roof, white door plates, swan-neck wing
      addBox(THREE, chassis, w * 0.92, 0.18, l * 0.30, mats.primary, 0, bodyBaseY + 0.08, -l * 0.33, 0.16, 0, 0);
      var fCabinY = bodyBaseY + lowerH * 0.5 + 0.18;
      addBox(THREE, chassis, w * 0.78, 0.34, l * 0.44, mats.glass, 0, fCabinY, 0.18);
      addBox(THREE, chassis, w * 0.74, 0.06, l * 0.28, mats.secondary, 0, fCabinY + 0.18, 0.05);
      // Sloped fastback rear glass
      addBox(THREE, chassis, w * 0.72, 0.10, l * 0.32, mats.glass, 0, fCabinY + 0.04, l * 0.28, 0.34, 0, 0);
      // White drift door number plates + yellow accent stripe
      var plateMat = makeMat(THREE, { color: 0xf4f6fa, roughness: 0.45 });
      addBox(THREE, chassis, 0.04, 0.26, 0.58, plateMat, -w * 0.50, bodyBaseY + 0.05, 0.05);
      addBox(THREE, chassis, 0.04, 0.26, 0.58, plateMat, w * 0.50, bodyBaseY + 0.05, 0.05);
      addBox(THREE, chassis, w * 0.28, 0.03, l * 0.42, mats.accent, 0, bodyBaseY + lowerH * 0.5 + 0.03, -l * 0.25);
      // Swan-neck wide drift wing
      addBox(THREE, chassis, 0.05, 0.36, 0.12, mats.dark, -w * 0.24, bodyBaseY + lowerH * 0.5 + 0.18, l * 0.40, 0.12, 0, 0);
      addBox(THREE, chassis, 0.05, 0.36, 0.12, mats.dark, w * 0.24, bodyBaseY + lowerH * 0.5 + 0.18, l * 0.40, 0.12, 0, 0);
      addBox(THREE, chassis, w * 1.06, 0.045, 0.28, mats.secondary, 0, bodyBaseY + lowerH * 0.5 + 0.34, l * 0.44, -0.08, 0, 0);
      if (isPlayer) {
        addCyl(THREE, chassis, 0.08, 0.08, 0.22, 10, mats.chrome, w * 0.28, clr + 0.14, l * 0.48, Math.PI / 2, 0, 0.15);
      }
    } else if (style === 'sedan') {
      // Lancer Evo IX: upright rally sedan, hood scoop, roof vent, mudflaps, quad rally fog-lights, pink/magenta slashes
      var sCabinY = bodyBaseY + lowerH * 0.5 + 0.24;
      addBox(THREE, chassis, w * 0.84, 0.48, l * 0.48, mats.glass, 0, sCabinY, 0.06);
      addBox(THREE, chassis, w * 0.80, 0.07, l * 0.36, mats.primary, 0, sCabinY + 0.25, 0.06);
      // Hood intake scoop & roof vent
      addBox(THREE, chassis, 0.58, 0.09, 0.44, mats.secondary, 0, bodyBaseY + lowerH * 0.5 + 0.04, -l * 0.25);
      addBox(THREE, chassis, 0.26, 0.08, 0.32, mats.secondary, 0, sCabinY + 0.30, -0.05);
      // Rally slash stripes
      addBox(THREE, chassis, 0.04, 0.14, l * 0.72, mats.accent, -w * 0.50, bodyBaseY + 0.04, 0.05);
      addBox(THREE, chassis, 0.04, 0.14, l * 0.72, mats.accent, w * 0.50, bodyBaseY + 0.04, 0.05);
      // Quad bumper rally fog-lights
      if (isPlayer) {
        var fogMat = makeMat(THREE, { color: 0xfff3c4, emissive: 0xffd27d, emissiveIntensity: 1.4 });
        for (var q = -1.5; q <= 1.5; q += 1) {
          addCyl(THREE, chassis, 0.07, 0.07, 0.07, 10, fogMat, q * 0.22, clr + 0.22, -l * 0.49, Math.PI / 2, 0, 0);
        }
      }
      // Tall Evo rear wing + mudflaps
      addBox(THREE, chassis, 0.07, 0.30, 0.24, mats.primary, -w * 0.38, bodyBaseY + lowerH * 0.5 + 0.15, l * 0.42);
      addBox(THREE, chassis, 0.07, 0.30, 0.24, mats.primary, w * 0.38, bodyBaseY + lowerH * 0.5 + 0.15, l * 0.42);
      addBox(THREE, chassis, w * 0.86, 0.05, 0.22, mats.secondary, 0, bodyBaseY + lowerH * 0.5 + 0.28, l * 0.42);
      addBox(THREE, chassis, 0.28, 0.24, 0.03, mats.accent, -w * 0.44, clr + 0.08, l * 0.42);
      addBox(THREE, chassis, 0.28, 0.24, 0.03, mats.accent, w * 0.44, clr + 0.08, l * 0.42);
    } else if (style === 'hyper') {
      // Lexus LFA GT: ultra-low wide wedge, side air intakes, gold splitter & diffuser, tri-center exhaust
      addBox(THREE, chassis, w * 0.94, 0.16, l * 0.32, mats.primary, 0, bodyBaseY + 0.05, -l * 0.34, 0.18, 0, 0);
      var hCabinY = bodyBaseY + lowerH * 0.5 + 0.24;
      addBox(THREE, chassis, w * 0.72, 0.42, l * 0.44, mats.glass, 0, hCabinY, 0.02);
      addBox(THREE, chassis, w * 0.66, 0.07, l * 0.28, mats.secondary, 0, hCabinY + 0.23, 0.02);
      // Side air intake pods
      addBox(THREE, chassis, 0.16, 0.28, l * 0.38, mats.secondary, -w * 0.49, bodyBaseY + 0.08, 0.20);
      addBox(THREE, chassis, 0.16, 0.28, l * 0.38, mats.secondary, w * 0.49, bodyBaseY + 0.08, 0.20);
      // Gold front aero splitter & rear diffuser fins
      addBox(THREE, chassis, w * 1.04, 0.05, 0.34, mats.accent, 0, clr + 0.04, -l * 0.48);
      addBox(THREE, chassis, w * 0.92, 0.08, 0.26, mats.accent, 0, clr + 0.06, l * 0.48);
      // Active wedge rear spoiler
      addBox(THREE, chassis, w * 0.96, 0.045, 0.28, mats.secondary, 0, bodyBaseY + lowerH * 0.5 + 0.16, l * 0.44, -0.14, 0, 0);
      addBox(THREE, chassis, w * 0.96, 0.025, 0.06, mats.accent, 0, bodyBaseY + lowerH * 0.5 + 0.17, l * 0.47);
      // Tri-center exhaust
      if (isPlayer) {
        addCyl(THREE, chassis, 0.055, 0.055, 0.16, 10, mats.chrome, -0.075, clr + 0.19, l * 0.48, Math.PI / 2, 0, 0);
        addCyl(THREE, chassis, 0.055, 0.055, 0.16, 10, mats.chrome, 0.075, clr + 0.19, l * 0.48, Math.PI / 2, 0, 0);
        addCyl(THREE, chassis, 0.055, 0.055, 0.16, 10, mats.chrome, 0, clr + 0.12, l * 0.48, Math.PI / 2, 0, 0);
      }
    } else {
      // Suzuki Jimny Raid SUV: tall boxy 4x4, roof rack + 4 amber floodlights, snorkel, rear spare wheel
      var uCabinY = bodyBaseY + lowerH * 0.5 + 0.34;
      addBox(THREE, chassis, w * 0.90, 0.66, l * 0.58, mats.primary, 0, uCabinY, 0.22);
      addBox(THREE, chassis, w * 0.92, 0.46, l * 0.52, mats.glass, 0, uCabinY + 0.02, 0.22);
      // Heavy off-road fender flares
      addBox(THREE, chassis, w * 1.08, 0.16, 0.72, mats.secondary, 0, clr + 0.34, -dims.wheelbase * 0.5);
      addBox(THREE, chassis, w * 1.08, 0.16, 0.72, mats.secondary, 0, clr + 0.34, dims.wheelbase * 0.5);
      // Front steel bullbar & skidplate
      addBox(THREE, chassis, w * 0.86, 0.22, 0.16, mats.secondary, 0, clr + 0.26, -l * 0.50);
      // Snorkel up right A-pillar
      addCyl(THREE, chassis, 0.05, 0.05, 0.78, 8, mats.secondary, w * 0.48, uCabinY - 0.04, -l * 0.14);
      // Roof expedition rack + 4 amber floodlights
      var roofY = uCabinY + 0.36;
      addBox(THREE, chassis, w * 0.84, 0.08, l * 0.50, mats.secondary, 0, roofY, 0.22);
      var floodMat = makeMat(THREE, { color: 0xffb300, emissive: 0xff8f00, emissiveIntensity: 1.8 });
      for (var fl = -1.5; fl <= 1.5; fl += 1) {
        addCyl(THREE, chassis, 0.075, 0.075, 0.08, 10, floodMat, fl * 0.28, roofY + 0.06, -l * 0.02, Math.PI / 2, 0, 0);
      }
      // Rear tailgate spare wheel
      var spareWheel = buildWheel(THREE, dims.wheelRadius * 0.90, 0.24, 0x222629, false);
      spareWheel.rotation.y = Math.PI / 2;
      spareWheel.position.set(0, bodyBaseY + 0.28, l * 0.51);
      chassis.add(spareWheel);
    }

    // Side mirrors (player cars)
    if (isPlayer) {
      var mirrorY = bodyBaseY + lowerH * 0.5 + 0.14;
      addBox(THREE, chassis, 0.14, 0.09, 0.10, mats.secondary, -w * 0.52, mirrorY, -0.25);
      addBox(THREE, chassis, 0.14, 0.09, 0.10, mats.secondary, w * 0.52, mirrorY, -0.25);
    }
  }

  function normalizeSpec(carSpec) {
    var spec = carSpec || {};
    var style = spec.bodyStyle || 'coupe';
    var defaultDims = {
      coupe: { length: 4.6, width: 1.84, height: 1.36, wheelbase: 2.67, wheelRadius: 0.34, clearance: 0.14 },
      fastback: { length: 4.3, width: 1.82, height: 1.24, wheelbase: 2.43, wheelRadius: 0.33, clearance: 0.12 },
      sedan: { length: 4.49, width: 1.81, height: 1.45, wheelbase: 2.63, wheelRadius: 0.34, clearance: 0.17 },
      hyper: { length: 4.51, width: 1.92, height: 1.16, wheelbase: 2.61, wheelRadius: 0.34, clearance: 0.10 },
      suv: { length: 3.85, width: 1.78, height: 1.78, wheelbase: 2.35, wheelRadius: 0.45, clearance: 0.28 }
    }[style] || { length: 4.5, width: 1.82, height: 1.36, wheelbase: 2.6, wheelRadius: 0.34, clearance: 0.14 };

    var dims = spec.dimensions || defaultDims;
    var colors = spec.colors || {
      primary: spec.color || '#cfd8dc',
      secondary: '#1d222b',
      accent: spec.isRival ? '#ff2e7e' : '#00e5ff',
      caliper: '#ff2e7e'
    };
    return {
      id: spec.id || ('ai_' + style),
      bodyStyle: style,
      colors: colors,
      dimensions: dims
    };
  }

  function buildCarMesh(carSpec, isPlayer, threeOverride) {
    var THREE = resolveTHREE(threeOverride);
    var spec = normalizeSpec(carSpec);
    var dims = spec.dimensions;
    var isPlayerFlag = isPlayer !== false;

    var root = new THREE.Group();
    root.name = 'car_' + spec.id;

    var chassisGroup = new THREE.Group();
    chassisGroup.name = 'chassis';
    root.add(chassisGroup);

    var rimColor = spec.id === 'rx7_drift'
      ? 0xf5b800
      : (spec.id === 'lfa_hyper' ? 0xd4a42a : 0xd0d8e4);

    var mats = {
      primary: makeMat(THREE, {
        color: spec.colors.primary,
        roughness: spec.bodyStyle === 'suv' ? 0.55 : 0.24,
        metalness: spec.bodyStyle === 'suv' ? 0.25 : 0.62
      }),
      secondary: makeMat(THREE, {
        color: spec.colors.secondary || '#1d222b',
        roughness: 0.42,
        metalness: 0.45
      }),
      accent: makeMat(THREE, {
        color: spec.colors.accent || '#00e5ff',
        emissive: spec.colors.accent || '#00e5ff',
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.5
      }),
      glass: makeMat(THREE, {
        color: 0x0d1522,
        roughness: 0.12,
        metalness: 0.78
      }),
      dark: makeMat(THREE, {
        color: 0x13161c,
        roughness: 0.75,
        metalness: 0.25
      }),
      chrome: makeMat(THREE, {
        color: 0xdbe2ee,
        roughness: 0.18,
        metalness: 0.90
      })
    };

    buildBodySilhouette(THREE, chassisGroup, spec, dims, mats, isPlayerFlag);
    var lights = buildLightsAndFlames(THREE, chassisGroup, root, spec, dims, mats, isPlayerFlag);

    // 4 wheels: FL, FR inside steering pivots; RL, RR directly on root
    var wheelR = dims.wheelRadius || 0.34;
    var wheelW = spec.bodyStyle === 'suv' ? 0.30 : 0.24;
    var trackHalf = dims.width * 0.5 - wheelW * 0.38;
    var axleHalf = dims.wheelbase * 0.5;

    var flPivot = new THREE.Group();
    flPivot.position.set(-trackHalf, wheelR, -axleHalf);
    var flWheel = buildWheel(THREE, wheelR, wheelW, rimColor, isPlayerFlag);
    flPivot.add(flWheel);
    root.add(flPivot);

    var frPivot = new THREE.Group();
    frPivot.position.set(trackHalf, wheelR, -axleHalf);
    var frWheel = buildWheel(THREE, wheelR, wheelW, rimColor, isPlayerFlag);
    frPivot.add(frWheel);
    root.add(frPivot);

    var rlWheel = buildWheel(THREE, wheelR, wheelW, rimColor, isPlayerFlag);
    rlWheel.position.set(-trackHalf, wheelR, axleHalf);
    root.add(rlWheel);

    var rrWheel = buildWheel(THREE, wheelR, wheelW, rimColor, isPlayerFlag);
    rrWheel.position.set(trackHalf, wheelR, axleHalf);
    root.add(rrWheel);

    root.userData = {
      carId: spec.id,
      bodyStyle: spec.bodyStyle,
      isPlayer: isPlayerFlag,
      dimensions: dims,
      chassisGroup: chassisGroup,
      wheels: [flWheel, frWheel, rlWheel, rrWheel],
      frontSteerPivots: [flPivot, frPivot],
      taillightMats: lights.taillightMats,
      headlightMats: lights.headlightMats,
      nitroFlames: lights.nitroFlames
    };

    var glbMap = {
      skyline_gtr: 'models/mercedes_c63.glb'
    };
    var modelPath = glbMap[spec.id];

    if (isPlayerFlag && modelPath && typeof THREE.GLTFLoader === 'function') {
      loadPlayerGlb(THREE, modelPath, root, dims, chassisGroup, flPivot, frPivot, rlWheel, rrWheel);
    }

    return root;
  }

  function decodeBase64ToArrayBuffer(b64) {
    if (typeof atob === 'function') {
      var bin = atob(b64);
      var len = bin.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return bytes.buffer;
    }
    var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    var outLen = (clean.length * 3) >> 2;
    if (clean.charAt(clean.length - 1) === '=') outLen--;
    if (clean.charAt(clean.length - 2) === '=') outLen--;
    var out = new Uint8Array(Math.max(0, outLen));
    var p = 0;
    for (var j = 0; j < clean.length; j += 4) {
      var e1 = lookup.indexOf(clean.charAt(j));
      var e2 = lookup.indexOf(clean.charAt(j + 1));
      var e3 = lookup.indexOf(clean.charAt(j + 2));
      var e4 = lookup.indexOf(clean.charAt(j + 3));
      out[p++] = (e1 << 2) | (e2 >> 4);
      if (e3 !== -1 && clean.charAt(j + 2) !== '=') {
        out[p++] = ((e2 & 15) << 4) | (e3 >> 2);
      }
      if (e4 !== -1 && clean.charAt(j + 3) !== '=') {
        out[p++] = ((e3 & 3) << 6) | e4;
      }
    }
    return out.buffer;
  }

  function applyGlbModelToCarRoot(THREE, root, model, dims, chassisGroup, flPivot, frPivot, rlWheel, rrWheel) {
    model.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(model);
    var size = new THREE.Vector3();
    box.getSize(size);
    var maxHoriz = Math.max(size.x, size.z, 0.001);
    var scale = (dims.length || 4.6) / maxHoriz;
    model.scale.setScalar(scale);

    model.updateMatrixWorld(true);
    box.setFromObject(model);
    var center = new THREE.Vector3();
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.rotation.y = 0;

    if (typeof model.traverse === 'function') {
      model.traverse(function (child) {
        if (!child.isMesh || !child.material) return;
        var matList = Array.isArray(child.material) ? child.material : [child.material];
        for (var m = 0; m < matList.length; m++) {
          var mat = matList[m];
          if (mat.map) {
            if (typeof THREE.LinearEncoding !== 'undefined') {
              mat.map.encoding = THREE.LinearEncoding;
            }
            mat.map.anisotropy = 4;
            mat.map.needsUpdate = true;
          }
          if (typeof mat.envMapIntensity === 'number') {
            mat.envMapIntensity = 0.85;
          }
          if (mat.transparent) {
            child.renderOrder = 2;
          }
          mat.needsUpdate = true;
        }
      });
    }

    var glbGroup = new THREE.Group();
    glbGroup.name = 'glb_body';
    glbGroup.add(model);

    chassisGroup.visible = false;
    flPivot.visible = false;
    frPivot.visible = false;
    rlWheel.visible = false;
    rrWheel.visible = false;

    root.add(glbGroup);
    root.userData.glbModel = glbGroup;
    root.userData.glbScene = model;
  }

  function disposeObjectResources(obj) {
    if (!obj || typeof obj.traverse !== 'function') return;
    obj.traverse(function (child) {
      if (child.geometry && typeof child.geometry.dispose === 'function') {
        child.geometry.dispose();
      }
      if (child.material) {
        var mats = Array.isArray(child.material) ? child.material : [child.material];
        for (var m = 0; m < mats.length; m++) {
          if (mats[m].map && typeof mats[m].map.dispose === 'function') {
            mats[m].map.dispose();
          }
          if (typeof mats[m].dispose === 'function') {
            mats[m].dispose();
          }
        }
      }
    });
  }

  function loadPlayerGlb(THREE, modelPath, root, dims, chassisGroup, flPivot, frPivot, rlWheel, rrWheel) {
    var gltfLoader = new THREE.GLTFLoader();

    function onModelReady(gltf) {
      if (!gltf || !gltf.scene) return;
      if (root.userData && root.userData._disposed) {
        disposeObjectResources(gltf.scene);
        return;
      }
      applyGlbModelToCarRoot(THREE, root, gltf.scene, dims, chassisGroup, flPivot, frPivot, rlWheel, rrWheel);
    }

    function onModelError(err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('GLB load fallback to procedural mesh:', modelPath, err);
      }
    }

    // 1. Primary Android WebView offline path: direct APK AssetManager read via AndroidBridge (bypasses XHR / file:// CORS)
    var win = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis.window : null);
    var bridge = win && win.AndroidBridge;
    if (bridge && typeof bridge.readAssetBase64 === 'function') {
      try {
        var b64 = bridge.readAssetBase64(modelPath);
        if (b64 && b64.length > 0) {
          var buf = decodeBase64ToArrayBuffer(b64);
          gltfLoader.parse(buf, '', onModelReady, onModelError);
          return;
        }
      } catch (err) {
        onModelError(err);
      }
    }

    // 2. Optional preloaded ArrayBuffer cache hook (useful for offline tests / bundles)
    var g = typeof globalThis !== 'undefined' ? globalThis : null;
    var preloaded = (win && win.H6 && win.H6.GLB_BUFFERS && win.H6.GLB_BUFFERS[modelPath])
      || (g && g.H6 && g.H6.GLB_BUFFERS && g.H6.GLB_BUFFERS[modelPath]);
    if (preloaded) {
      try {
        gltfLoader.parse(preloaded, '', onModelReady, onModelError);
        return;
      } catch (err2) {
        onModelError(err2);
      }
    }

    // 3. HTTP(S) dev server / browser fallback (avoid fetch on file:// origin)
    var isFileProto = typeof location !== 'undefined' && location.protocol === 'file:';
    if (!isFileProto && typeof fetch === 'function') {
      fetch(modelPath)
        .then(function (resp) { return resp.arrayBuffer(); })
        .then(function (buf) { gltfLoader.parse(buf, '', onModelReady, onModelError); })
        .catch(onModelError);
      return;
    }

    // 4. Last-resort XHR loader fallback
    if (typeof XMLHttpRequest !== 'undefined') {
      gltfLoader.load(modelPath, onModelReady, undefined, onModelError);
    }
  }

  function buildAICarMesh(aiState, threeOverride) {
    var ai = aiState || {};
    var spec = {
      id: ai.id || 'ai_car',
      bodyStyle: ai.carStyle || 'sedan',
      colors: {
        primary: ai.color || '#cfd8dc',
        secondary: '#1c2026',
        accent: ai.isRival ? '#ff2e7e' : '#4dd0e1',
        caliper: '#ff2e7e'
      }
    };
    return buildCarMesh(spec, false, threeOverride);
  }

  function updateCarVisuals(carGroup, stateData, elapsedSec) {
    if (!carGroup || !stateData) return;
    var ud = carGroup.userData || {};

    carGroup.position.set(
      Number.isFinite(stateData.x) ? stateData.x : 0,
      Number.isFinite(stateData.y) ? stateData.y : 0,
      Number.isFinite(stateData.z) ? stateData.z : 0
    );
    carGroup.rotation.y = Number.isFinite(stateData.heading) ? stateData.heading : 0;

    var pitch = Number.isFinite(stateData.pitch) ? stateData.pitch : 0;
    var roll = Number.isFinite(stateData.roll) ? stateData.roll : 0;
    if (ud.chassisGroup) {
      ud.chassisGroup.rotation.x = pitch;
      ud.chassisGroup.rotation.z = roll;
    }
    if (ud.glbModel) {
      ud.glbModel.rotation.x = pitch;
      ud.glbModel.rotation.z = roll;
    }

    var steer = Number.isFinite(stateData.steerAngle) ? stateData.steerAngle : 0;
    if (ud.frontSteerPivots) {
      for (var p = 0; p < ud.frontSteerPivots.length; p++) {
        ud.frontSteerPivots[p].rotation.y = steer;
      }
    }

    var spin = Number.isFinite(stateData.wheelSpin) ? stateData.wheelSpin : 0;
    if (ud.wheels) {
      for (var w = 0; w < ud.wheels.length; w++) {
        ud.wheels[w].rotation.x = -spin;
      }
    }

    if (ud.taillightMats) {
      var brakeIntensity = stateData.isBraking ? 3.2 : 0.9;
      for (var t = 0; t < ud.taillightMats.length; t++) {
        ud.taillightMats[t].emissiveIntensity = brakeIntensity;
      }
    }

    if (ud.nitroFlames) {
      var nitroOn = !!stateData.isNitroActive;
      var pulse = 0.85 + 0.35 * Math.sin((elapsedSec || 0) * 48);
      for (var n = 0; n < ud.nitroFlames.length; n++) {
        var flame = ud.nitroFlames[n];
        flame.visible = nitroOn;
        if (nitroOn) {
          flame.scale.set(1, 1, pulse);
        }
      }
    }
  }

  return {
    buildCarMesh: buildCarMesh,
    buildAICarMesh: buildAICarMesh,
    updateCarVisuals: updateCarVisuals
  };
});
