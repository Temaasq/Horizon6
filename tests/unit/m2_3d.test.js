'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var ROOT = path.resolve(__dirname, '../..');
var ASSETS_DIR = path.join(ROOT, 'app/src/main/assets');
var VENDOR_THREE = path.join(ASSETS_DIR, 'vendor/three.min.js');
var JS_DIR = path.join(ASSETS_DIR, 'js');

function createWebGLStub(canvas) {
  var noop = function () {};
  var gl = {
    canvas: canvas,
    drawingBufferWidth: canvas.width || 1280,
    drawingBufferHeight: canvas.height || 720,
    ZERO: 0, ONE: 1, TRUE: 1, FALSE: 0, NO_ERROR: 0,
    POINTS: 0, LINES: 1, LINE_LOOP: 2, LINE_STRIP: 3, TRIANGLES: 4, TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6,
    DEPTH_BUFFER_BIT: 256, STENCIL_BUFFER_BIT: 1024, COLOR_BUFFER_BIT: 16384,
    FRONT: 1028, BACK: 1029, FRONT_AND_BACK: 1032,
    NEVER: 512, LESS: 513, EQUAL: 514, LEQUAL: 515, GREATER: 516, NOTEQUAL: 517, GEQUAL: 518, ALWAYS: 519,
    SRC_COLOR: 768, ONE_MINUS_SRC_COLOR: 769, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771,
    DST_ALPHA: 772, ONE_MINUS_DST_ALPHA: 773, DST_COLOR: 774, ONE_MINUS_DST_COLOR: 775,
    FUNC_ADD: 32774, FUNC_SUBTRACT: 32778, FUNC_REVERSE_SUBTRACT: 32779,
    CW: 2304, CCW: 2305, CULL_FACE: 2884, BLEND: 3042, DITHER: 3024, STENCIL_TEST: 2960,
    DEPTH_TEST: 2929, SCISSOR_TEST: 3089, POLYGON_OFFSET_FILL: 32823,
    SAMPLE_ALPHA_TO_COVERAGE: 32926, SAMPLE_COVERAGE: 32928,
    BYTE: 5120, UNSIGNED_BYTE: 5121, SHORT: 5122, UNSIGNED_SHORT: 5123, INT: 5124,
    UNSIGNED_INT: 5125, FLOAT: 5126, HALF_FLOAT: 5131,
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048, STREAM_DRAW: 35040,
    TEXTURE_2D: 3553, TEXTURE_CUBE_MAP: 34067, TEXTURE_3D: 32879, TEXTURE_2D_ARRAY: 35866, TEXTURE0: 33984,
    RGB: 6407, RGBA: 6408, ALPHA: 6406, LUMINANCE: 6409, LUMINANCE_ALPHA: 6410, RED: 6403, RG: 33319,
    RGBA8: 32856, RGBA16F: 34842, RGBA32F: 34836, DEPTH_COMPONENT: 6402, DEPTH_STENCIL: 34041,
    NEAREST: 9728, LINEAR: 9729, NEAREST_MIPMAP_NEAREST: 9984, LINEAR_MIPMAP_NEAREST: 9985,
    NEAREST_MIPMAP_LINEAR: 9986, LINEAR_MIPMAP_LINEAR: 9987,
    TEXTURE_MAG_FILTER: 10240, TEXTURE_MIN_FILTER: 10241, TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243, TEXTURE_WRAP_R: 32882,
    REPEAT: 10497, CLAMP_TO_EDGE: 33071, MIRRORED_REPEAT: 33648,
    UNPACK_ALIGNMENT: 3317, PACK_ALIGNMENT: 3333,
    UNPACK_FLIP_Y_WEBGL: 37440, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441, UNPACK_COLORSPACE_CONVERSION_WEBGL: 37443,
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714, VALIDATE_STATUS: 35715,
    ACTIVE_UNIFORMS: 35718, ACTIVE_ATTRIBUTES: 35721,
    VENDOR: 7936, RENDERER: 7937, VERSION: 7938, SHADING_LANGUAGE_VERSION: 35724,
    MAX_TEXTURE_SIZE: 3379, MAX_CUBE_MAP_TEXTURE_SIZE: 34076, MAX_RENDERBUFFER_SIZE: 34024,
    MAX_VIEWPORT_DIMS: 3386, MAX_VERTEX_ATTRIBS: 34921, MAX_VERTEX_UNIFORM_VECTORS: 36347,
    MAX_FRAGMENT_UNIFORM_VECTORS: 36349, MAX_VARYING_VECTORS: 36348,
    MAX_TEXTURE_IMAGE_UNITS: 34930, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661, MAX_SAMPLES: 36183, SAMPLES: 32937,
    FRAMEBUFFER: 36160, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009, RENDERBUFFER: 36161,
    FRAMEBUFFER_COMPLETE: 36053, COLOR_ATTACHMENT0: 36064, DEPTH_ATTACHMENT: 36096,
    STENCIL_ATTACHMENT: 36128, DEPTH_STENCIL_ATTACHMENT: 33306,
    DEPTH_COMPONENT16: 33189, DEPTH_COMPONENT24: 33190, SRGB8_ALPHA8: 35907,
    TEXTURE_MAX_ANISOTROPY_EXT: 34046, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047,
    getContextAttributes: function () { return { alpha: true, antialias: true, depth: true, stencil: false }; },
    isContextLost: function () { return false; },
    getSupportedExtensions: function () {
      return ['EXT_texture_filter_anisotropic', 'OES_texture_float', 'OES_element_index_uint', 'OES_vertex_array_object', 'ANGLE_instanced_arrays'];
    },
    getExtension: function (name) {
      if (name === 'EXT_texture_filter_anisotropic') return { TEXTURE_MAX_ANISOTROPY_EXT: 34046, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047 };
      if (name === 'OES_vertex_array_object') return { createVertexArrayOES: function () { return {}; }, bindVertexArrayOES: noop, deleteVertexArrayOES: noop };
      if (name === 'ANGLE_instanced_arrays') return { drawArraysInstancedANGLE: noop, drawElementsInstancedANGLE: noop, vertexAttribDivisorANGLE: noop };
      return {};
    },
    getParameter: function (p) {
      if (p === 7938) return 'WebGL 1.0 (Node Stub)';
      if (p === 35724) return 'WebGL GLSL ES 1.00';
      if (p === 7936) return 'StubVendor';
      if (p === 7937) return 'StubRenderer';
      if (p === 3379 || p === 34076 || p === 34024) return 4096;
      if (p === 3386) return new Int32Array([4096, 4096]);
      if (p === 34921 || p === 34930 || p === 35660 || p === 35661 || p === 34047) return 16;
      if (p === 36347 || p === 36349) return 1024;
      if (p === 36348) return 30;
      return 0;
    },
    getShaderPrecisionFormat: function () { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
    getError: function () { return 0; },
    createShader: function () { return {}; },
    shaderSource: noop,
    compileShader: noop,
    getShaderParameter: function (_s, p) { return p === 35713 ? true : 0; },
    getShaderInfoLog: function () { return ''; },
    deleteShader: noop,
    createProgram: function () { return {}; },
    attachShader: noop,
    linkProgram: noop,
    validateProgram: noop,
    getProgramParameter: function (_p, pn) { return (pn === 35714 || pn === 35715) ? true : 0; },
    getProgramInfoLog: function () { return ''; },
    useProgram: noop,
    deleteProgram: noop,
    getUniformLocation: function (_p, name) { return { name: name }; },
    getAttribLocation: function () { return 0; },
    getActiveUniform: function () { return { name: 'u', type: 5126, size: 1 }; },
    getActiveAttrib: function () { return { name: 'a', type: 5126, size: 1 }; },
    createBuffer: function () { return {}; },
    bindBuffer: noop,
    bufferData: noop,
    bufferSubData: noop,
    deleteBuffer: noop,
    createTexture: function () { return {}; },
    bindTexture: noop,
    activeTexture: noop,
    texImage2D: noop,
    texSubImage2D: noop,
    texParameteri: noop,
    texParameterf: noop,
    generateMipmap: noop,
    pixelStorei: noop,
    deleteTexture: noop,
    createFramebuffer: function () { return {}; },
    bindFramebuffer: noop,
    framebufferTexture2D: noop,
    framebufferRenderbuffer: noop,
    checkFramebufferStatus: function () { return 36053; },
    deleteFramebuffer: noop,
    createRenderbuffer: function () { return {}; },
    bindRenderbuffer: noop,
    renderbufferStorage: noop,
    deleteRenderbuffer: noop,
    enableVertexAttribArray: noop,
    disableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    vertexAttribDivisor: noop,
    uniform1i: noop, uniform1f: noop, uniform2f: noop, uniform3f: noop, uniform4f: noop,
    uniform1iv: noop, uniform1fv: noop, uniform2fv: noop, uniform3fv: noop, uniform4fv: noop,
    uniformMatrix2fv: noop, uniformMatrix3fv: noop, uniformMatrix4fv: noop,
    enable: noop, disable: noop, depthFunc: noop, depthMask: noop, depthRange: noop,
    colorMask: noop, stencilMask: noop, stencilFunc: noop, stencilOp: noop,
    blendFunc: noop, blendFuncSeparate: noop, blendEquation: noop, blendEquationSeparate: noop,
    blendColor: noop, cullFace: noop, frontFace: noop, lineWidth: noop, polygonOffset: noop,
    viewport: noop, scissor: noop, clearColor: noop, clearDepth: noop, clearStencil: noop,
    clear: noop, drawArrays: noop, drawElements: noop, drawArraysInstanced: noop,
    drawElementsInstanced: noop, finish: noop, flush: noop
  };
  return gl;
}

function createMockElement(tagName) {
  var el = {
    tagName: String(tagName || 'DIV').toUpperCase(),
    style: {},
    children: [],
    clientWidth: 1280,
    clientHeight: 720,
    width: 1280,
    height: 720,
    addEventListener: function () {},
    removeEventListener: function () {},
    appendChild: function (child) {
      el.children.push(child);
      return child;
    },
    querySelector: function (sel) {
      for (var i = 0; i < el.children.length; i++) {
        if (String(el.children[i].tagName).toLowerCase() === String(sel).toLowerCase()) {
          return el.children[i];
        }
      }
      return null;
    }
  };
  if (el.tagName === 'CANVAS') {
    el.getContext = function (type) {
      if (type === '2d') {
        var noop = function () {};
        return { fillStyle: '#000', fillRect: noop, strokeRect: noop, clearRect: noop };
      }
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return createWebGLStub(el);
      }
      return null;
    };
  }
  return el;
}

function loadThreeAndGameInVm() {
  var doc = {
    createElement: function (tag) { return createMockElement(tag); },
    createElementNS: function (_ns, tag) { return createMockElement(tag); }
  };
  var win = {
    devicePixelRatio: 2.0,
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: function () {},
    removeEventListener: function () {},
    requestAnimationFrame: function () { return 1; },
    cancelAnimationFrame: function () {}
  };

  var sandbox = {
    globalThis: null,
    window: win,
    self: null,
    document: doc,
    console: console,
    Math: Math,
    Number: Number,
    Object: Object,
    Array: Array,
    Float32Array: Float32Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Int32Array: Int32Array,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    ArrayBuffer: ArrayBuffer,
    DataView: DataView,
    performance: { now: function () { return Date.now(); } },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    requestAnimationFrame: function () { return 1; },
    cancelAnimationFrame: function () {}
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  win.document = doc;

  vm.createContext(sandbox);

  var scripts = [
    VENDOR_THREE,
    path.join(JS_DIR, 'cars.js'),
    path.join(JS_DIR, 'world_data.js'),
    path.join(JS_DIR, 'physics.js'),
    path.join(JS_DIR, 'car_models.js'),
    path.join(JS_DIR, 'world_meshes.js'),
    path.join(JS_DIR, 'renderer3d.js')
  ];

  for (var i = 0; i < scripts.length; i++) {
    vm.runInContext(fs.readFileSync(scripts[i], 'utf8'), sandbox, { filename: scripts[i] });
  }
  return sandbox;
}

function scanForHttpUrls(dirPath) {
  var matches = [];
  var entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      matches = matches.concat(scanForHttpUrls(full));
    } else if (/\.(js|html|css|json)$/i.test(entry.name)) {
      var content = fs.readFileSync(full, 'utf8');
      if (/https?:\/\//i.test(content)) {
        matches.push(full);
      }
    }
  }
  return matches;
}

test('Offline Three.js and M2 assets contain zero http:// or https:// strings', function () {
  assert.ok(fs.existsSync(VENDOR_THREE), 'three.min.js must exist');
  var vendorHits = scanForHttpUrls(path.join(ASSETS_DIR, 'vendor'));
  assert.deepEqual(vendorHits, [], 'Vendor directory must have 0 http(s):// matches');

  var m2Files = ['car_models.js', 'world_meshes.js', 'renderer3d.js'];
  for (var i = 0; i < m2Files.length; i++) {
    var txt = fs.readFileSync(path.join(JS_DIR, m2Files[i]), 'utf8');
    assert.equal(/https?:\/\//i.test(txt), false, m2Files[i] + ' must have 0 http(s):// matches');
  }
});

test('Three.js UMD instantiates WebGLRenderer, Scene, PerspectiveCamera, Points, and MeshStandardMaterial in VM', function () {
  var sb = loadThreeAndGameInVm();
  var THREE = sb.THREE;
  assert.ok(THREE, 'THREE global must be defined');
  assert.equal(typeof THREE.WebGLRenderer, 'function');
  assert.equal(typeof THREE.Scene, 'function');
  assert.equal(typeof THREE.PerspectiveCamera, 'function');
  assert.equal(typeof THREE.Points, 'function');
  assert.equal(typeof THREE.MeshStandardMaterial, 'function');

  var canvas = createMockElement('canvas');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas });
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.35, 2000);
  var pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffb7d5 }));
  var mat = new THREE.MeshStandardMaterial({ color: 0x1560bd });
  scene.add(pts);
  renderer.render(scene, camera);
  assert.ok(mat.isMeshStandardMaterial);
  renderer.dispose();
});

test('CarModels builds 5 distinct car meshes with wheels, steering pivots, brake lights, and nitro cones', function () {
  var sb = loadThreeAndGameInVm();
  var THREE = sb.THREE;
  var cars = sb.H6.CARS;
  var CarModels = sb.H6.CarModels;

  assert.equal(cars.length, 5);
  var fingerprints = new Set();

  for (var i = 0; i < cars.length; i++) {
    var car = cars[i];
    var mesh = CarModels.buildCarMesh(car, true);
    assert.ok(mesh instanceof THREE.Group);
    var ud = mesh.userData;
    assert.equal(ud.carId, car.id);
    assert.equal(ud.bodyStyle, car.bodyStyle);
    assert.equal(ud.wheels.length, 4, car.id + ' must have 4 wheels');
    assert.equal(ud.frontSteerPivots.length, 2, car.id + ' must have 2 steering pivots');
    assert.ok(ud.taillightMats.length >= 1, car.id + ' must have taillight material(s)');
    assert.equal(ud.nitroFlames.length, 2, car.id + ' must have 2 nitro flame cones');

    var box = new THREE.Box3().setFromObject(mesh);
    var size = new THREE.Vector3();
    box.getSize(size);
    assert.ok(size.x > 1.5 && size.y > 1.0 && size.z > 3.5, car.id + ' bounds should be realistic');

    var childCount = ud.chassisGroup.children.length;
    var fp = childCount + ':' + size.x.toFixed(2) + 'x' + size.y.toFixed(2) + 'x' + size.z.toFixed(2);
    fingerprints.add(fp);

    // Verify dynamic visual updates (steer, spin, braking, nitro)
    CarModels.updateCarVisuals(mesh, {
      x: 10, y: 1, z: -20, heading: 0.4, pitch: 0.03, roll: -0.04,
      steerAngle: 0.35, wheelSpin: 2.5, isBraking: true, isNitroActive: true
    }, 0.5);
    assert.ok(Math.abs(ud.frontSteerPivots[0].rotation.y - 0.35) < 1e-6);
    assert.ok(Math.abs(ud.wheels[0].rotation.x - (-2.5)) < 1e-6);
    assert.equal(ud.nitroFlames[0].visible, true);
    assert.ok(ud.taillightMats[0].emissiveIntensity > 2.0);
  }

  assert.equal(fingerprints.size, 5, 'All 5 car meshes must have distinct geometry/dimensions');

  // Lightweight AI car mesh
  var aiMesh = CarModels.buildAICarMesh({ id: 'ai_1', carStyle: 'sedan', color: '#64b5f6', isRival: false });
  assert.equal(aiMesh.userData.wheels.length, 4);
  assert.equal(aiMesh.userData.isPlayer, false);
});

test('WorldMeshes builds 2000x2000 Japan world, 4 speed traps, 24 bonus targets, and falling sakura petals', function () {
  var sb = loadThreeAndGameInVm();
  var scene = new sb.THREE.Scene();
  var world = sb.H6.WorldMeshes.buildWorld(scene);

  assert.ok(world.rootGroup);
  assert.equal(world.trapMeshes.length, 4);
  assert.equal(world.targetMeshes.length, 24);
  assert.equal(world.sakuraPetals.userData.count, 750);

  var petalYBefore = world.sakuraPetals.geometry.attributes.position.array[1];
  var sim = sb.H6.Physics.createSimulation('skyline_gtr');
  sim.targets[0].collected = true;
  world.updateWorld(sim, 1 / 60, 0.5);

  var petalYAfter = world.sakuraPetals.geometry.attributes.position.array[1];
  assert.ok(petalYAfter !== petalYBefore, 'Sakura petals must animate per frame');
  assert.equal(world.targetMeshes[0].mesh.visible, false, 'Collected bonus target must hide');
  assert.ok(world.smashPool.some(function (b) { return b.active; }), 'Smash burst pool should activate on target smash');

  world.dispose();
});

test('Renderer3D initializes, switches all 5 cars & chase/hood cameras, renders 60 ticks with zero NaNs, resizes, and disposes', function () {
  var sb = loadThreeAndGameInVm();
  var container = createMockElement('div');
  var sim = sb.H6.Physics.createSimulation('skyline_gtr');

  var r3d = sb.H6.Renderer3D;
  r3d.init(container, sim);

  var stats = r3d.getDebugStats();
  assert.equal(stats.initialized, true);
  assert.equal(stats.cachedCarIds.length, 5);
  assert.equal(stats.aiMeshCount, 12);
  assert.equal(stats.targetMeshCount, 24);
  assert.equal(stats.trapMeshCount, 4);
  assert.equal(r3d.getCameraMode(), 'chase');

  // Cycle all 5 cars cleanly
  var carIds = ['skyline_gtr', 'rx7_drift', 'evo_touge', 'lfa_hyper', 'jimny_raid'];
  for (var c = 0; c < carIds.length; c++) {
    sb.H6.Physics.switchCar(sim, carIds[c]);
    r3d.setActiveCar(carIds[c]);
    assert.equal(r3d.getDebugStats().activeCarId, carIds[c]);
  }

  // Test chase and hood camera modes over 60 simulated frames
  for (var tick = 0; tick < 60; tick++) {
    if (tick === 20) {
      r3d.setCameraMode('hood');
      assert.equal(r3d.getCameraMode(), 'hood');
    } else if (tick === 40) {
      r3d.setCameraMode('chase');
      assert.equal(r3d.getCameraMode(), 'chase');
    }

    sb.H6.Physics.stepSimulation(sim, {
      steer: tick > 15 ? 0.45 : 0,
      throttle: 1.0,
      brake: 0,
      handbrake: false,
      nitro: tick < 30,
      transmissionMode: 'AT'
    }, 1 / 60);

    r3d.render(sim, 1 / 60);

    var s = r3d.getDebugStats();
    assert.ok(Number.isFinite(s.cameraPos.x) && Number.isFinite(s.cameraPos.y) && Number.isFinite(s.cameraPos.z),
      'Camera position must stay finite on tick ' + tick);
    assert.ok(Number.isFinite(s.cameraFov) && s.cameraFov >= 60 && s.cameraFov <= 95,
      'Camera FOV must stay valid on tick ' + tick);
  }

  r3d.resize(800, 480);
  r3d.dispose();
  assert.equal(r3d.getDebugStats().initialized, false);

  // Re-initialize directly on a <canvas> element and verify DPR cap <= 1.75
  var directCanvas = createMockElement('canvas');
  r3d.init(directCanvas, sim);
  assert.equal(r3d.getDebugStats().initialized, true);
  r3d.render(sim, 1 / 60);
  assert.ok(directCanvas.width <= 1280 * 1.75 + 1, 'DPR must be capped at <= 1.75');
  r3d.dispose();
});

test('CommonJS UMD require() loads car_models, world_meshes, and renderer3d cleanly', function () {
  var sb = loadThreeAndGameInVm();
  globalThis.THREE = sb.THREE;
  try {
    var CarModels = require(path.join(JS_DIR, 'car_models.js'));
    var WorldMeshes = require(path.join(JS_DIR, 'world_meshes.js'));
    var Renderer3D = require(path.join(JS_DIR, 'renderer3d.js'));
    assert.equal(typeof CarModels.buildCarMesh, 'function');
    assert.equal(typeof WorldMeshes.buildWorld, 'function');
    assert.equal(typeof Renderer3D.init, 'function');
  } finally {
    delete globalThis.THREE;
  }
});

test('Offline AndroidBridge GLB path loads mercedes_c63.glb with 15 materials, 9 embedded textures, Y=0 clearance, and no XHR/fetch', async function () {
  var loadedImageDataUris = [];
  var listenersMap = new WeakMap();

  function makeImgMock() {
    var listeners = {};
    var img = {
      tagName: 'IMG',
      style: {},
      width: 512,
      height: 512,
      complete: false,
      addEventListener: function (t, fn) {
        if (!listeners[t]) listeners[t] = [];
        listeners[t].push(fn);
      },
      removeEventListener: function (t, fn) {
        if (!listeners[t]) return;
        listeners[t] = listeners[t].filter(function (f) { return f !== fn; });
      }
    };
    listenersMap.set(img, listeners);
    var srcVal = '';
    Object.defineProperty(img, 'src', {
      get: function () { return srcVal; },
      set: function (val) {
        srcVal = String(val);
        loadedImageDataUris.push(srcVal);
        setTimeout(function () {
          img.complete = true;
          var cbs = (listeners.load || []).slice();
          for (var i = 0; i < cbs.length; i++) {
            cbs[i].call(img);
          }
        }, 0);
      }
    });
    return img;
  }

  var doc = {
    createElement: function (tag) { return createMockElement(tag); },
    createElementNS: function (_ns, tag) {
      if (String(tag).toLowerCase() === 'img') return makeImgMock();
      return createMockElement(tag);
    }
  };
  var win = {
    devicePixelRatio: 2.0,
    innerWidth: 1280,
    innerHeight: 720,
    location: { protocol: 'file:', href: 'file:///android_asset/index.html' },
    AndroidBridge: {
      isNativeAndroid: function () { return true; },
      readAssetBase64: function (assetPath) {
        var resolved = path.resolve(ASSETS_DIR, assetPath);
        assert.ok(resolved.startsWith(ASSETS_DIR + path.sep), 'Must stay within assets dir');
        return fs.readFileSync(resolved).toString('base64');
      }
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    requestAnimationFrame: function () { return 1; },
    cancelAnimationFrame: function () {}
  };

  var sandbox = {
    globalThis: null,
    window: win,
    self: null,
    document: doc,
    location: win.location,
    console: console,
    Math: Math,
    Number: Number,
    Object: Object,
    Array: Array,
    String: String,
    Boolean: Boolean,
    Promise: Promise,
    RegExp: RegExp,
    Error: Error,
    TypeError: TypeError,
    TextDecoder: TextDecoder,
    atob: atob,
    btoa: btoa,
    Float32Array: Float32Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Int32Array: Int32Array,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    ArrayBuffer: ArrayBuffer,
    DataView: DataView,
    Map: Map,
    Set: Set,
    WeakMap: WeakMap,
    performance: { now: function () { return Date.now(); } },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    requestAnimationFrame: function () { return 1; },
    cancelAnimationFrame: function () {}
  };
  // Explicitly omit XMLHttpRequest and fetch to guarantee zero XHR/fetch usage on file:// path
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  win.document = doc;
  vm.createContext(sandbox);

  var scripts = [
    VENDOR_THREE,
    path.join(ASSETS_DIR, 'vendor/GLTFLoader.js'),
    path.join(JS_DIR, 'cars.js'),
    path.join(JS_DIR, 'world_data.js'),
    path.join(JS_DIR, 'physics.js'),
    path.join(JS_DIR, 'car_models.js'),
    path.join(JS_DIR, 'world_meshes.js'),
    path.join(JS_DIR, 'renderer3d.js')
  ];
  for (var i = 0; i < scripts.length; i++) {
    vm.runInContext(fs.readFileSync(scripts[i], 'utf8'), sandbox, { filename: scripts[i] });
  }

  var THREE = sandbox.THREE;
  var Cars = sandbox.H6.Cars;
  var CarModels = sandbox.H6.CarModels;
  assert.equal(typeof THREE.GLTFLoader, 'function');
  assert.match(Cars.CARS[0].nameRu, /Мерседес/i);

  var carMesh = CarModels.buildCarMesh(Cars.CARS[0], true);
  // Wait for async GLTFLoader.parse + data-URI texture decode callbacks
  for (var w = 0; w < 20 && !carMesh.userData.glbModel; w++) {
    await new Promise(function (resolve) { setTimeout(resolve, 15); });
  }

  assert.ok(carMesh.userData.glbModel, 'skyline_gtr must load mercedes_c63.glb via AndroidBridge without XHR/fetch');
  assert.ok(carMesh.userData.glbScene, 'glbScene must be stored on userData');
  assert.equal(carMesh.userData.chassisGroup.visible, false, 'Procedural chassis must hide after GLB loads');

  var materials = new Map();
  var textures = new Set();
  carMesh.userData.glbScene.traverse(function (obj) {
    if (obj.isMesh && obj.material) {
      var list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (var m = 0; m < list.length; m++) {
        materials.set(list[m].name, list[m]);
        if (list[m].map) textures.add(list[m].map);
      }
    }
  });

  assert.equal(materials.size, 15, 'mercedes_c63.glb must preserve all 15 materials');
  assert.equal(textures.size, 9, 'mercedes_c63.glb must load all 9 embedded textures');
  textures.forEach(function (tex) {
    assert.equal(tex.encoding, THREE.LinearEncoding, 'GLB textures must use LinearEncoding to match Renderer3D outputEncoding');
  });
  assert.equal(loadedImageDataUris.length, 9, 'All 9 textures must load via offline data:image/jpeg URIs');
  for (var u = 0; u < loadedImageDataUris.length; u++) {
    assert.ok(loadedImageDataUris[u].startsWith('data:image/jpeg;base64,'), 'Embedded texture must be data:image/jpeg URI');
    var jpgBytes = Buffer.from(loadedImageDataUris[u].split(',')[1], 'base64');
    assert.equal(jpgBytes[0], 0xff);
    assert.equal(jpgBytes[1], 0xd8);
  }

  // Verify grounding (Y = 0), centering, scale, and forward alignment
  var box = new THREE.Box3().setFromObject(carMesh.userData.glbModel);
  var size = new THREE.Vector3();
  var center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  assert.ok(Math.abs(box.min.y) < 1e-3, 'Car tires must rest cleanly on road at Y=0 (got min.y=' + box.min.y + ')');
  assert.ok(Math.abs(center.x) < 1e-3 && Math.abs(center.z) < 1e-3, 'Car model must be centered on X/Z');
  assert.ok(Math.abs(size.z - 4.6) < 0.05, 'Scaled C63 length must match 4.6m (got ' + size.z + ')');
  assert.equal(carMesh.userData.glbScene.rotation.y, 0, 'C63 must stay aligned with -Z forward axis');
  assert.ok(Cars.CARS[0].camera.hoodZ <= -0.75 && Cars.CARS[0].camera.hoodY >= 1.18,
    'Hood camera must sit forward of C63 windshield with clean vertical clearance');

  // Verify pitch/roll and nitro flames still work when GLB is active
  CarModels.updateCarVisuals(carMesh, {
    x: 4, y: 0, z: -12, heading: 0.25, pitch: 0.03, roll: -0.02,
    steerAngle: 0.2, wheelSpin: 1.5, isBraking: true, isNitroActive: true
  }, 0.25);
  assert.ok(Math.abs(carMesh.userData.glbModel.rotation.x - 0.03) < 1e-6);
  assert.ok(Math.abs(carMesh.userData.glbModel.rotation.z - (-0.02)) < 1e-6);
  assert.equal(carMesh.userData.nitroFlames[0].visible, true, 'Nitro flames must remain visible with GLB body');

  // Verify old placeholder GLBs were removed and other 4 cars do not try to load removed GLBs
  assert.equal(fs.existsSync(path.join(ASSETS_DIR, 'models/car1_truck.glb')), false);
  assert.equal(fs.existsSync(path.join(ASSETS_DIR, 'models/car2_dragster.glb')), false);
  assert.equal(fs.existsSync(path.join(ASSETS_DIR, 'models/car3_minivan.glb')), false);
  var rx7Mesh = CarModels.buildCarMesh(Cars.CARS[1], true);
  assert.equal(rx7Mesh.userData.glbModel, undefined, 'Non-C63 cars must keep their distinct procedural silhouettes');
});
