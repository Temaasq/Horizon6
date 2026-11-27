(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var Cars = require('./cars.js');
    var WorldData = require('./world_data.js');
    var Physics = require('./physics.js');
    var CarModels = require('./car_models.js');
    var WorldMeshes = require('./world_meshes.js');
    module.exports = factory(
      root.THREE || (typeof globalThis !== 'undefined' ? globalThis.THREE : null),
      Cars,
      WorldData,
      Physics,
      CarModels,
      WorldMeshes
    );
  } else {
    root.H6 = root.H6 || {};
    var CarsG = root.H6.Cars || { CARS: root.H6.CARS, getCarById: root.H6.getCarById };
    root.H6.Renderer3D = factory(
      root.THREE,
      CarsG,
      root.H6.WorldData,
      root.H6.Physics,
      root.H6.CarModels,
      root.H6.WorldMeshes
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  DefaultTHREE,
  DefaultCars,
  DefaultWorldData,
  DefaultPhysics,
  DefaultCarModels,
  DefaultWorldMeshes
) {
  'use strict';

  var state = {
    initialized: false,
    THREE: null,
    Cars: null,
    WorldData: null,
    Physics: null,
    CarModels: null,
    WorldMeshes: null,
    containerEl: null,
    canvas: null,
    renderer: null,
    scene: null,
    camera: null,
    skyMesh: null,
    envMap: null,
    worldHandle: null,
    carMeshesById: {},
    carSpecById: {},
    aiMeshes: [],
    activeCarId: 'skyline_gtr',
    cameraMode: 'chase',
    snapCamera: true,
    camPos: { x: 0, y: 2.6, z: 57.2 },
    camLook: { x: 0, y: 1.25, z: 46 },
    elapsedSec: 0
  };

  function resolveDeps() {
    var g = typeof globalThis !== 'undefined' ? globalThis : {};
    var h6 = g.H6 || {};
    var T = DefaultTHREE || g.THREE;
    var C = DefaultCars || h6.Cars || { CARS: h6.CARS, getCarById: h6.getCarById };
    var W = DefaultWorldData || h6.WorldData;
    var P = DefaultPhysics || h6.Physics;
    var CM = DefaultCarModels || h6.CarModels;
    var WM = DefaultWorldMeshes || h6.WorldMeshes;
    if (!T) throw new Error('H6.Renderer3D requires THREE');
    if (!CM) throw new Error('H6.Renderer3D requires H6.CarModels');
    if (!WM) throw new Error('H6.Renderer3D requires H6.WorldMeshes');
    return { THREE: T, Cars: C, WorldData: W, Physics: P, CarModels: CM, WorldMeshes: WM };
  }

  function finiteOr(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
  }

  function buildSkyDome(THREE) {
    var geo = new THREE.SphereGeometry(1450, 20, 12);
    var pos = geo.attributes.position;
    var count = pos.count;
    var colors = new Float32Array(count * 3);

    for (var i = 0; i < count; i++) {
      var y = pos.getY(i);
      var t = Math.max(0, Math.min(1, (y + 80) / 1450));
      var r, g, b;
      if (t < 0.16) {
        var ht = t / 0.16;
        r = 0.48 - ht * 0.28;
        g = 0.18 - ht * 0.06;
        b = 0.34 + ht * 0.04;
      } else {
        var zt = (t - 0.16) / 0.84;
        r = 0.20 * (1 - zt) + 0.04 * zt;
        g = 0.12 * (1 - zt) + 0.06 * zt;
        b = 0.38 * (1 - zt) + 0.16 * zt;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });
    var sky = new THREE.Mesh(geo, mat);
    sky.name = 'japan_twilight_sky';
    return sky;
  }

  function createTwilightEnvMap(THREE) {
    try {
      if (typeof document === 'undefined' || !document.createElement || typeof THREE.CubeTexture !== 'function') {
        return null;
      }
      var size = 16;
      var faces = [];
      var specs = [
        { top: '#3c346e', mid: '#6b5698', bot: '#262838' },
        { top: '#3c346e', mid: '#6b5698', bot: '#262838' },
        { top: '#2b3262', mid: '#3f4b82', bot: '#3f4b82' },
        { top: '#20222e', mid: '#1c1e28', bot: '#161820' },
        { top: '#3c346e', mid: '#7d4e8c', bot: '#262838' },
        { top: '#3c346e', mid: '#4e749c', bot: '#262838' }
      ];
      for (var i = 0; i < 6; i++) {
        var c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        var ctx = c.getContext && c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = specs[i].top;
        ctx.fillRect(0, 0, size, 6);
        ctx.fillStyle = specs[i].mid;
        ctx.fillRect(0, 6, size, 4);
        ctx.fillStyle = specs[i].bot;
        ctx.fillRect(0, 10, size, 6);
        faces.push(c);
      }
      var cube = new THREE.CubeTexture(faces);
      cube.needsUpdate = true;
      return cube;
    } catch (_e) {
      return null;
    }
  }

  function prepareCanvas(containerEl) {
    var isCanvas = containerEl && (
      String(containerEl.tagName || '').toUpperCase() === 'CANVAS' ||
      typeof containerEl.getContext === 'function'
    );
    if (isCanvas) {
      return containerEl;
    }

    var doc = typeof document !== 'undefined' ? document : null;
    if (containerEl && containerEl.querySelector) {
      var existing = containerEl.querySelector('canvas');
      if (existing) return existing;
    }
    if (!doc || !doc.createElement) {
      throw new Error('H6.Renderer3D requires a canvas or DOM document');
    }
    var canvas = doc.createElement('canvas');
    if (canvas.style) {
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
    if (containerEl && typeof containerEl.appendChild === 'function') {
      containerEl.appendChild(canvas);
    }
    return canvas;
  }

  function createWebGLRenderer(THREE, canvas) {
    var attempts = [
      { canvas: canvas, antialias: true, powerPreference: 'high-performance' },
      { canvas: canvas, antialias: false, powerPreference: 'default' },
      { canvas: canvas }
    ];
    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        return new THREE.WebGLRenderer(attempts[i]);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Failed to create THREE.WebGLRenderer');
  }

  function fallbackCameraTarget(simState, mode) {
    var p = (simState && simState.player) || { x: 0, y: 0, z: 50, heading: 0, pitch: 0, speedKmh: 0 };
    var fx = -Math.sin(p.heading || 0);
    var fz = -Math.cos(p.heading || 0);
    if (mode === 'hood') {
      return {
        mode: 'hood',
        position: { x: p.x - fx * 0.5, y: p.y + 1.18, z: p.z - fz * 0.5 },
        lookAt: { x: p.x + fx * 28, y: p.y + 1.05, z: p.z + fz * 28 },
        fov: 74
      };
    }
    return {
      mode: 'chase',
      position: { x: p.x - fx * 7.2, y: p.y + 2.6, z: p.z - fz * 7.2 },
      lookAt: { x: p.x + fx * 4.0, y: p.y + 1.25, z: p.z + fz * 4.0 },
      fov: 64
    };
  }

  function computeTarget(simState) {
    if (state.Physics && typeof state.Physics.computeCameraTarget === 'function' && simState) {
      return state.Physics.computeCameraTarget(simState, state.cameraMode);
    }
    return fallbackCameraTarget(simState, state.cameraMode);
  }

  function init(containerEl, simState) {
    if (state.initialized) {
      dispose();
    }

    var deps = resolveDeps();
    state.THREE = deps.THREE;
    state.Cars = deps.Cars;
    state.WorldData = deps.WorldData;
    state.Physics = deps.Physics;
    state.CarModels = deps.CarModels;
    state.WorldMeshes = deps.WorldMeshes;

    var THREE = state.THREE;
    state.containerEl = containerEl || null;
    state.canvas = prepareCanvas(containerEl);

    var win = typeof window !== 'undefined' ? window : {};
    var width = finiteOr((containerEl && containerEl.clientWidth) || (state.canvas && state.canvas.width) || win.innerWidth, 1280);
    var height = finiteOr((containerEl && containerEl.clientHeight) || (state.canvas && state.canvas.height) || win.innerHeight, 720);
    if (width <= 0) width = 1280;
    if (height <= 0) height = 720;

    state.renderer = createWebGLRenderer(THREE, state.canvas);
    var dpr = Math.min(finiteOr(win.devicePixelRatio, 1), 1.75);
    if (typeof state.renderer.setPixelRatio === 'function') {
      state.renderer.setPixelRatio(Math.max(1, dpr));
    }
    if (typeof state.renderer.setSize === 'function') {
      state.renderer.setSize(width, height, false);
    }
    if (typeof THREE.ACESFilmicToneMapping !== 'undefined') {
      state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      state.renderer.toneMappingExposure = 1.05;
    }

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x0d1022);
    state.scene.fog = new THREE.FogExp2(0x16142b, 0.00145);

    state.envMap = createTwilightEnvMap(THREE);
    if (state.envMap) {
      state.scene.environment = state.envMap;
    }

    state.skyMesh = buildSkyDome(THREE);
    state.scene.add(state.skyMesh);

    // Balanced Japanese twilight PBR lighting (key + cool fill + hemi + soft ambient)
    var hemi = new THREE.HemisphereLight(0x9cc4ff, 0x262038, 0.72);
    state.scene.add(hemi);

    var sunLight = new THREE.DirectionalLight(0xffe4cc, 1.05);
    sunLight.position.set(-240, 260, -180);
    state.scene.add(sunLight);

    var fillLight = new THREE.DirectionalLight(0x7cb8ff, 0.42);
    fillLight.position.set(220, 140, 240);
    state.scene.add(fillLight);

    var ambient = new THREE.AmbientLight(0x423a5a, 0.32);
    state.scene.add(ambient);

    // Build 2000x2000 Japan world
    state.worldHandle = state.WorldMeshes.buildWorld(state.scene, THREE, state.WorldData);

    // Pre-cache all 5 player car models so car switching never leaks geometry
    state.carMeshesById = {};
    state.carSpecById = {};
    var carList = (state.Cars && state.Cars.CARS) || [];
    var initialCarId = (simState && simState.activeCarId) || (carList[0] && carList[0].id) || 'skyline_gtr';

    for (var i = 0; i < carList.length; i++) {
      var spec = carList[i];
      var carMesh = state.CarModels.buildCarMesh(spec, true, THREE);
      carMesh.visible = (spec.id === initialCarId);
      state.scene.add(carMesh);
      state.carMeshesById[spec.id] = carMesh;
      state.carSpecById[spec.id] = spec;
    }
    state.activeCarId = state.carMeshesById[initialCarId] ? initialCarId : (carList[0] && carList[0].id) || 'skyline_gtr';

    // Pre-build 12 AI traffic & rival meshes
    state.aiMeshes = [];
    var aiList = (simState && simState.aiTraffic) || [];
    for (var a = 0; a < aiList.length; a++) {
      var aiMesh = state.CarModels.buildAICarMesh(aiList[a], THREE);
      state.scene.add(aiMesh);
      state.aiMeshes.push(aiMesh);
    }

    state.camera = new THREE.PerspectiveCamera(64, width / height, 0.35, 2400);
    state.cameraMode = 'chase';
    state.snapCamera = true;
    state.elapsedSec = 0;
    state.initialized = true;

    if (simState) {
      render(simState, 1 / 60);
    }

    return api;
  }

  function setActiveCar(carId) {
    if (!state.initialized) {
      state.activeCarId = carId;
      return;
    }
    if (!state.carMeshesById[carId]) return;
    for (var id in state.carMeshesById) {
      if (Object.prototype.hasOwnProperty.call(state.carMeshesById, id)) {
        state.carMeshesById[id].visible = (id === carId);
      }
    }
    state.activeCarId = carId;
  }

  function setCameraMode(mode) {
    var nextMode = mode === 'hood' ? 'hood' : 'chase';
    if (state.cameraMode !== nextMode) {
      state.cameraMode = nextMode;
      state.snapCamera = true;
    }
    return state.cameraMode;
  }

  function getCameraMode() {
    return state.cameraMode;
  }

  function render(simState, dt) {
    if (!state.initialized || !state.renderer || !state.scene || !state.camera) return;

    var safeDt = (Number.isFinite(dt) && dt > 0) ? Math.min(dt, 0.1) : 1 / 60;
    state.elapsedSec += safeDt;

    if (simState) {
      if (simState.activeCarId && simState.activeCarId !== state.activeCarId) {
        setActiveCar(simState.activeCarId);
      }

      // 1. Update player car transform, pitch/roll, steering pivots, spinning wheels, brake lights & nitro cones
      var activeMesh = state.carMeshesById[state.activeCarId];
      if (activeMesh && simState.player) {
        state.CarModels.updateCarVisuals(activeMesh, simState.player, state.elapsedSec);
      }

      // 2. Update AI traffic meshes
      var aiList = simState.aiTraffic || [];
      for (var i = 0; i < aiList.length; i++) {
        var aiData = aiList[i];
        var aiMesh = state.aiMeshes[i];
        if (!aiMesh) {
          aiMesh = state.CarModels.buildAICarMesh(aiData, state.THREE);
          state.scene.add(aiMesh);
          state.aiMeshes[i] = aiMesh;
        }
        state.CarModels.updateCarVisuals(aiMesh, aiData, state.elapsedSec);
      }

      // 3. Keep sky dome centered on player X/Z
      if (state.skyMesh && simState.player) {
        state.skyMesh.position.set(
          finiteOr(simState.player.x, 0),
          0,
          finiteOr(simState.player.z, 0)
        );
      }
    }

    // 4. Update world animations (sakura petals, bonus boards, smash particles, speed traps)
    if (state.worldHandle) {
      state.worldHandle.updateWorld(simState, safeDt, state.elapsedSec);
    }

    // 5. Update camera (chase spring damping vs hood crisp attachment)
    var target = computeTarget(simState);
    if (target) {
      var tx = finiteOr(target.position.x, 0);
      var ty = finiteOr(target.position.y, 2.6);
      var tz = finiteOr(target.position.z, 57.2);
      var lx = finiteOr(target.lookAt.x, 0);
      var ly = finiteOr(target.lookAt.y, 1.25);
      var lz = finiteOr(target.lookAt.z, 46);
      var targetFov = finiteOr(target.fov, 64);

      if (state.cameraMode === 'hood' || state.snapCamera) {
        state.camPos.x = tx;
        state.camPos.y = ty;
        state.camPos.z = tz;
        state.camLook.x = lx;
        state.camLook.y = ly;
        state.camLook.z = lz;
        state.camera.fov = targetFov;
        state.snapCamera = false;
      } else {
        var posAlpha = 1 - Math.exp(-9.5 * safeDt);
        var lookAlpha = 1 - Math.exp(-13.0 * safeDt);
        state.camPos.x += (tx - state.camPos.x) * posAlpha;
        state.camPos.y += (ty - state.camPos.y) * posAlpha;
        state.camPos.z += (tz - state.camPos.z) * posAlpha;
        state.camLook.x += (lx - state.camLook.x) * lookAlpha;
        state.camLook.y += (ly - state.camLook.y) * lookAlpha;
        state.camLook.z += (lz - state.camLook.z) * lookAlpha;
        state.camera.fov += (targetFov - state.camera.fov) * Math.min(1, 8.0 * safeDt);
      }

      if (state.cameraMode === 'chase' && state.WorldData && typeof state.WorldData.getTerrainHeight === 'function') {
        var groundY = state.WorldData.getTerrainHeight(state.camPos.x, state.camPos.z);
        if (Number.isFinite(groundY) && state.camPos.y < groundY + 1.0) {
          state.camPos.y = groundY + 1.0;
        }
      }

      state.camera.position.set(state.camPos.x, state.camPos.y, state.camPos.z);
      state.camera.lookAt(state.camLook.x, state.camLook.y, state.camLook.z);
      if (typeof state.camera.updateProjectionMatrix === 'function') {
        state.camera.updateProjectionMatrix();
      }
    }

    state.renderer.render(state.scene, state.camera);
  }

  function resize(w, h) {
    if (!state.initialized || !state.renderer || !state.camera) return;
    var width = finiteOr(w, 1280);
    var height = finiteOr(h, 720);
    if (width <= 0 || height <= 0) return;

    state.camera.aspect = width / height;
    if (typeof state.camera.updateProjectionMatrix === 'function') {
      state.camera.updateProjectionMatrix();
    }
    if (typeof state.renderer.setSize === 'function') {
      state.renderer.setSize(width, height, false);
    }
  }

  function disposeGroup(group) {
    if (!group || typeof group.traverse !== 'function') return;
    if (group.userData) {
      group.userData._disposed = true;
    }
    group.traverse(function (obj) {
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
          if (typeof mats[m].dispose === 'function') mats[m].dispose();
        }
      }
    });
  }

  function dispose() {
    if (!state.initialized) return;
    if (state.worldHandle && typeof state.worldHandle.dispose === 'function') {
      state.worldHandle.dispose();
    }
    for (var id in state.carMeshesById) {
      if (Object.prototype.hasOwnProperty.call(state.carMeshesById, id)) {
        disposeGroup(state.carMeshesById[id]);
      }
    }
    for (var i = 0; i < state.aiMeshes.length; i++) {
      disposeGroup(state.aiMeshes[i]);
    }
    disposeGroup(state.skyMesh);
    if (state.envMap && typeof state.envMap.dispose === 'function') {
      state.envMap.dispose();
    }
    if (state.renderer && typeof state.renderer.dispose === 'function') {
      try {
        state.renderer.dispose();
      } catch (_e) {
        // Ignore mock window lacking cancelAnimationFrame during headless dispose
      }
    }

    state.initialized = false;
    state.renderer = null;
    state.scene = null;
    state.camera = null;
    state.worldHandle = null;
    state.carMeshesById = {};
    state.aiMeshes = [];
    state.skyMesh = null;
    state.envMap = null;
  }

  function getDebugStats() {
    return {
      initialized: state.initialized,
      activeCarId: state.activeCarId,
      cameraMode: state.cameraMode,
      cachedCarIds: Object.keys(state.carMeshesById),
      aiMeshCount: state.aiMeshes.length,
      targetMeshCount: state.worldHandle ? state.worldHandle.targetMeshes.length : 0,
      trapMeshCount: state.worldHandle ? state.worldHandle.trapMeshes.length : 0,
      sakuraPetalCount: (state.worldHandle && state.worldHandle.sakuraPetals && state.worldHandle.sakuraPetals.userData)
        ? state.worldHandle.sakuraPetals.userData.count
        : 0,
      cameraPos: { x: state.camPos.x, y: state.camPos.y, z: state.camPos.z },
      cameraFov: state.camera ? state.camera.fov : 0
    };
  }

  var api = {
    init: init,
    setActiveCar: setActiveCar,
    setCameraMode: setCameraMode,
    getCameraMode: getCameraMode,
    render: render,
    resize: resize,
    dispose: dispose,
    getDebugStats: getDebugStats
  };

  return api;
});
