'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

var ROOT = path.resolve(__dirname, '../..');
var ASSETS_DIR = path.join(ROOT, 'app/src/main/assets');
var JS_DIR = path.join(ASSETS_DIR, 'js');

var Cars = require(path.join(JS_DIR, 'cars.js'));
var WorldData = require(path.join(JS_DIR, 'world_data.js'));
var Physics = require(path.join(JS_DIR, 'physics.js'));
var Controls = require(path.join(JS_DIR, 'controls.js'));
var Audio = require(path.join(JS_DIR, 'audio.js'));
var HUD = require(path.join(JS_DIR, 'hud.js'));
var Main = require(path.join(JS_DIR, 'main.js'));

function createMockAudioContextClass() {
  return function MockAudioContext() {
    var ctx = this;
    ctx.sampleRate = 44100;
    ctx.currentTime = 1.0;
    ctx.state = 'suspended';
    ctx.destination = { kind: 'destination' };
    ctx.oscillators = [];
    ctx.gains = [];
    ctx.filters = [];
    ctx.bufferSources = [];

    function makeParam(initial) {
      return {
        value: initial || 0,
        calls: [],
        setTargetAtTime: function (v, t, tau) {
          this.value = v;
          this.calls.push(['setTargetAtTime', v, t, tau]);
        },
        setValueAtTime: function (v, t) {
          this.value = v;
          this.calls.push(['setValueAtTime', v, t]);
        },
        linearRampToValueAtTime: function (v, t) {
          this.value = v;
          this.calls.push(['linearRampToValueAtTime', v, t]);
        },
        exponentialRampToValueAtTime: function (v, t) {
          this.value = v;
          this.calls.push(['exponentialRampToValueAtTime', v, t]);
        }
      };
    }

    ctx.resume = function () {
      ctx.state = 'running';
      return Promise.resolve();
    };
    ctx.suspend = function () {
      ctx.state = 'suspended';
      return Promise.resolve();
    };
    ctx.createGain = function () {
      var node = {
        gain: makeParam(1),
        connectedTo: [],
        connect: function (dest) { this.connectedTo.push(dest); }
      };
      ctx.gains.push(node);
      return node;
    };
    ctx.createBiquadFilter = function () {
      var node = {
        type: 'lowpass',
        frequency: makeParam(350),
        Q: makeParam(1),
        connectedTo: [],
        connect: function (dest) { this.connectedTo.push(dest); }
      };
      ctx.filters.push(node);
      return node;
    };
    ctx.createOscillator = function () {
      var node = {
        type: 'sine',
        frequency: makeParam(440),
        detune: makeParam(0),
        started: false,
        stopped: false,
        connectedTo: [],
        connect: function (dest) { this.connectedTo.push(dest); },
        start: function () { this.started = true; },
        stop: function () { this.stopped = true; }
      };
      ctx.oscillators.push(node);
      return node;
    };
    ctx.createBuffer = function (ch, len, rate) {
      var arr = new Float32Array(len);
      return {
        numberOfChannels: ch,
        length: len,
        sampleRate: rate,
        getChannelData: function () { return arr; }
      };
    };
    ctx.createBufferSource = function () {
      var node = {
        buffer: null,
        loop: false,
        started: false,
        stopped: false,
        connectedTo: [],
        connect: function (dest) { this.connectedTo.push(dest); },
        start: function () { this.started = true; },
        stop: function () { this.stopped = true; }
      };
      ctx.bufferSources.push(node);
      return node;
    };
  };
}

function createMockElement(id) {
  var listeners = {};
  var classes = new Set();
  var attrs = {};
  var el = {
    id: id || '',
    textContent: '',
    innerHTML: '',
    children: [],
    style: {},
    width: 144,
    height: 144,
    classList: {
      add: function () {
        for (var i = 0; i < arguments.length; i++) classes.add(arguments[i]);
      },
      remove: function () {
        for (var i = 0; i < arguments.length; i++) classes.delete(arguments[i]);
      },
      contains: function (c) { return classes.has(c); }
    },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return attrs[k]; },
    appendChild: function (child) { this.children.push(child); return child; },
    addEventListener: function (type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    removeEventListener: function (type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(function (f) { return f !== fn; });
    },
    dispatchEvent: function (ev) {
      var list = listeners[ev.type] || [];
      for (var i = 0; i < list.length; i++) {
        list[i](ev);
      }
    },
    setPointerCapture: function () {},
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 150, height: 150 };
    },
    getContext: function () {
      if (id !== 'minimap-canvas') return null;
      return {
        calls: [],
        clearRect: function () { this.calls.push('clearRect'); },
        save: function () {},
        restore: function () {},
        beginPath: function () {},
        closePath: function () {},
        arc: function () {},
        clip: function () {},
        fillRect: function () {},
        fill: function () {},
        stroke: function () {},
        moveTo: function () {},
        lineTo: function () {}
      };
    }
  };
  Object.defineProperty(el, 'className', {
    get: function () { return Array.from(classes).join(' '); },
    set: function (val) {
      classes.clear();
      String(val).split(/\s+/).filter(Boolean).forEach(function (c) { classes.add(c); });
    }
  });
  return el;
}

function createMockDocument(ids) {
  var map = {};
  for (var i = 0; i < ids.length; i++) {
    map[ids[i]] = createMockElement(ids[i]);
  }
  return {
    readyState: 'complete',
    _map: map,
    getElementById: function (id) { return map[id] || null; },
    createElement: function (tag) { return createMockElement(tag); },
    addEventListener: function () {}
  };
}

test('Controls: wheel steering sign, spring return, buttons priority, gyro deadzone/calibration/fallback', function () {
  var st = Controls.createControlsState();
  assert.equal(st.steerMode, 'wheel');
  assert.equal(st.transmissionMode, 'AT');
  assert.equal(st.cameraMode, 'chase');

  // Wheel: CCW (-135 deg) -> +1 (left), CW (+135 deg) -> -1 (right)
  Controls.applyWheelAngle(st, -135);
  assert.equal(st.steer, 1);
  Controls.applyWheelAngle(st, 135);
  assert.equal(st.steer, -1);

  // Spring back when not active
  st.wheelActive = false;
  for (var i = 0; i < 60; i++) Controls.updateControls(st, 1 / 60);
  assert.ok(Math.abs(st.steer) < 0.05, 'Wheel should spring back near center');

  // Buttons mode ramp & opposing priority
  Controls.setSteerMode(st, 'buttons');
  assert.equal(st.steerMode, 'buttons');
  Controls.setButtonState(st, 'steerLeft', true);
  for (var j = 0; j < 20; j++) Controls.updateControls(st, 1 / 60);
  assert.ok(st.steer > 0.9, 'Left button should steer positive (left)');

  // Opposing right press overrides while both held
  Controls.setButtonState(st, 'steerRight', true);
  for (var k = 0; k < 40; k++) Controls.updateControls(st, 1 / 60);
  assert.ok(st.steer < -0.9, 'Latest opposing right press should win');

  // Gyro mode fallback when sensor unavailable
  var fallbackRes = Controls.setSteerMode(st, 'gyro', { hasSensor: false });
  assert.equal(fallbackRes.ok, false);
  assert.equal(st.steerMode, 'wheel');
  assert.ok(st.gyroFallbackReason.length > 0);

  // Gyro deadzone, sensitivity & calibration when sensor available
  var okRes = Controls.setSteerMode(st, 'gyro', { hasSensor: true });
  assert.equal(okRes.ok, true);
  assert.equal(st.steerMode, 'gyro');
  assert.equal(Controls.applyGyroAngle(st, 2.5), 0, 'Within 4 deg deadzone');
  assert.ok(Controls.applyGyroAngle(st, 22) > 0.4, 'Positive left tilt -> steer > 0');
  assert.ok(Controls.applyGyroAngle(st, -22) < -0.4, 'Negative right tilt -> steer < 0');

  Controls.applyGyroAngle(st, 15);
  Controls.calibrateGyro(st);
  assert.equal(Controls.applyGyroAngle(st, 15), 0, 'Calibrated neutral should yield 0');
});

test('Controls: multi-touch PointerEvent isolation, MT shift edges, and camera/keyboard parity', function () {
  var st = Controls.createControlsState();
  var wheelEl = createMockElement('steer-wheel');
  var gasEl = createMockElement('btn-gas');
  var brakeEl = createMockElement('btn-brake');
  var hbEl = createMockElement('btn-handbrake');
  var nitroEl = createMockElement('btn-nitro');
  var shiftUpEl = createMockElement('btn-shift-up');
  var shiftDownEl = createMockElement('btn-shift-down');
  var winEl = createMockElement('window');

  Controls.bindDOM(st, {
    window: winEl,
    wheelEl: wheelEl,
    throttleEl: gasEl,
    brakeEl: brakeEl,
    handbrakeEl: hbEl,
    nitroEl: nitroEl,
    shiftUpEl: shiftUpEl,
    shiftDownEl: shiftDownEl
  });

  // Simultaneous multi-touch: pointer 1 on wheel (top -> drag CCW left), pointer 2 on gas, pointer 3 on nitro, pointer 4 on handbrake
  wheelEl.dispatchEvent({ type: 'pointerdown', pointerId: 1, clientX: 75, clientY: 10, preventDefault: function () {} });
  wheelEl.dispatchEvent({ type: 'pointermove', pointerId: 1, clientX: 10, clientY: 75, preventDefault: function () {} });
  gasEl.dispatchEvent({ type: 'pointerdown', pointerId: 2, preventDefault: function () {} });
  nitroEl.dispatchEvent({ type: 'pointerdown', pointerId: 3, preventDefault: function () {} });
  hbEl.dispatchEvent({ type: 'pointerdown', pointerId: 4, preventDefault: function () {} });

  var inp1 = Controls.getControlInput(st);
  assert.ok(inp1.steer > 0.4, 'CCW wheel drag should produce positive left steer: ' + inp1.steer);
  assert.equal(inp1.throttle, 1);
  assert.equal(inp1.nitro, true);
  assert.equal(inp1.handbrake, true);
  assert.equal(inp1.brake, 0);

  // Release pointer 3 (nitro) -> gas, handbrake, and wheel stay active
  nitroEl.dispatchEvent({ type: 'pointerup', pointerId: 3 });
  var inp2 = Controls.getControlInput(st);
  assert.equal(inp2.nitro, false);
  assert.equal(inp2.throttle, 1);
  assert.equal(inp2.handbrake, true);
  assert.ok(inp2.steer > 0.4);

  // MT shift edge consumption
  Controls.setTransmissionMode(st, 'MT');
  shiftUpEl.dispatchEvent({ type: 'pointerdown', pointerId: 5, preventDefault: function () {} });
  var inp3 = Controls.getControlInput(st);
  assert.equal(inp3.transmissionMode, 'MT');
  assert.equal(inp3.shiftUpRequested, true);
  var inp4 = Controls.getControlInput(st);
  assert.equal(inp4.shiftUpRequested, false, 'Shift edge must be consumed once');

  // Keyboard camera toggle & brake
  winEl.dispatchEvent({ type: 'keydown', code: 'KeyC', repeat: false, preventDefault: function () {} });
  winEl.dispatchEvent({ type: 'keydown', code: 'KeyS', repeat: false, preventDefault: function () {} });
  var inp5 = Controls.getControlInput(st);
  assert.equal(inp5.cameraMode, 'hood');
  assert.equal(inp5.brake, 1);
});

test('Audio: graceful no-op without AudioContext + full procedural synthesis, mute & pause with mock AudioContext', function () {
  var noCtxEngine = Audio.createAudioEngine();
  assert.equal(noCtxEngine.init({ AudioContext: null }), false);
  noCtxEngine.unlock();
  noCtxEngine.updateContinuous({ rpm: 4000, speedKmh: 120, slipAngleDeg: 20, isDrifting: true, isNitroActive: true }, Cars.CARS[0]);
  noCtxEngine.triggerEvent({ type: 'speed_trap', speedKmh: 210, isRecord: true });
  noCtxEngine.setAppPaused(true);
  noCtxEngine.setAppPaused(false);

  var storageMap = {};
  var mockStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(storageMap, k) ? storageMap[k] : null; },
    setItem: function (k, v) { storageMap[k] = String(v); }
  };

  var MockCtx = createMockAudioContextClass();
  var eng = Audio.createAudioEngine();
  assert.equal(eng.init({ AudioContext: MockCtx, storage: mockStorage }), true);
  assert.equal(eng.unlock(), true);

  eng.updateContinuous({ rpm: 6200, speedKmh: 165, slipAngleDeg: 24, isDrifting: true, isNitroActive: true }, Cars.CARS[1]);
  eng.triggerEvent({ type: 'gear_shift', gear: 3 });
  eng.triggerEvent({ type: 'speed_trap', speedKmh: 250, isRecord: true });
  eng.triggerEvent({ type: 'target_smash', valueCr: 2500 });
  eng.triggerEvent({ type: 'drift_bank', points: 1800, multiplier: 3, cr: 1350 });
  eng.triggerEvent({ type: 'collision', impactMs: 12 });

  assert.equal(eng.isMuted(), false);
  assert.equal(eng.toggleMute(), true);
  assert.equal(storageMap.h6_muted, 'true');
  assert.equal(eng.setMuted(false), false);
  assert.equal(storageMap.h6_muted, 'false');

  assert.equal(eng.setAppPaused(true), true);
  assert.equal(eng.setAppPaused(false), false);
});

test('HUD & Main: Russian formatting, rotating minimap projection, 5-car garage render, and HorizonBridge loop', function () {
  assert.equal(HUD.formatNumberRu(12500), '12 500');
  assert.equal(HUD.formatGearLabel(-1), 'R');
  assert.equal(HUD.formatGearLabel(0), 'N');
  assert.equal(HUD.formatGearLabel(4), '4');

  var banner = HUD.formatEventBanner({ type: 'speed_trap', nameRu: 'Шоссе Ванган', speedKmh: 268, isRecord: true, cr: 2340 });
  assert.ok(banner.text.indexOf('РАДАР') !== -1 && banner.text.indexOf('268') !== -1);

  // Rotating minimap projection check: North (-Z) at heading = PI/2 (facing West -X) appears to RIGHT (+x) on minimap
  var pt = HUD.projectMinimapPoint(0, -100, 0, 0, Math.PI / 2, 72, 72, 0.25);
  assert.ok(pt.x > 90 && Math.abs(pt.y - 72) < 1e-6);

  var ids = [
    'webgl-container', 'minimap-canvas', 'hud-region-pill', 'drift-banner',
    'drift-banner-mult', 'drift-banner-pts', 'event-banner', 'toast-banner',
    'hud-cr', 'hud-record', 'hud-boards', 'hud-speed', 'hud-gear',
    'hud-trans-badge', 'hud-rpm-bar', 'hud-nitro-bar', 'hud-car-name',
    'steer-wheel-wrap', 'steer-wheel', 'steer-buttons-wrap', 'gyro-indicator',
    'gyro-bar-dot', 'mt-shifter', 'btn-garage', 'btn-camera', 'btn-mute',
    'btn-reset', 'btn-settings', 'btn-quick-calibrate', 'modal-garage',
    'garage-grid', 'btn-close-garage', 'modal-settings', 'btn-close-settings',
    'opt-steer-wheel', 'opt-steer-buttons', 'opt-steer-gyro', 'btn-calibrate-gyro',
    'row-gyro-calibrate', 'opt-trans-at', 'opt-trans-mt', 'opt-cam-chase',
    'opt-cam-hood', 'opt-sound-toggle', 'btn-settings-reset', 'modal-exit',
    'btn-exit-cancel', 'btn-exit-confirm', 'btn-steer-left', 'btn-steer-right',
    'btn-gas', 'btn-brake', 'btn-handbrake', 'btn-nitro', 'btn-shift-up', 'btn-shift-down'
  ];
  var doc = createMockDocument(ids);
  var rendererCalls = { init: 0, render: 0, setActiveCar: [], setCameraMode: [] };
  var mockRenderer = {
    init: function () { rendererCalls.init++; },
    render: function () { rendererCalls.render++; },
    setActiveCar: function (id) { rendererCalls.setActiveCar.push(id); },
    setCameraMode: function (m) { rendererCalls.setCameraMode.push(m); },
    resize: function () {}
  };

  var win = createMockElement('window');
  win.innerWidth = 1280;
  win.innerHeight = 720;

  var app = Main.bootstrap({
    document: doc,
    window: win,
    noLoop: true,
    Renderer3D: mockRenderer,
    Audio: Audio.createAudioEngine(),
    storage: {
      getItem: function () { throw new Error('sandboxed storage'); },
      setItem: function () { throw new Error('sandboxed storage'); }
    }
  });

  assert.equal(rendererCalls.init, 1);
  assert.equal(doc._map['garage-grid'].children.length, 5, 'Garage must render all 5 car cards');

  // Drive a few frames
  Controls.setButtonState(app.controlsState, 'throttle', true);
  for (var f = 0; f < 30; f++) {
    app.stepFrame(1 / 60);
  }
  assert.ok(app.simState.player.speedKmh > 5);
  assert.equal(rendererCalls.render, 30);
  assert.ok(Number(doc._map['hud-speed'].textContent) > 0);

  // HorizonBridge back button opens exit modal then closes it
  assert.equal(Main.HorizonBridge.onBackPressed(), true);
  assert.equal(app.hud.getOpenModal(), 'exit');
  assert.equal(Main.HorizonBridge.onBackPressed(), true);
  assert.equal(app.hud.getOpenModal(), null);
  assert.equal(Main.HorizonBridge.getSimState(), app.simState);
});

test('index.html & all M3 assets: offline zero http(s)://, ordered deferred scripts, and required Russian HUD IDs', function () {
  var html = fs.readFileSync(path.join(ASSETS_DIR, 'index.html'), 'utf8');
  var css = fs.readFileSync(path.join(ASSETS_DIR, 'css/style.css'), 'utf8');
  var m3Files = [
    html,
    css,
    fs.readFileSync(path.join(JS_DIR, 'controls.js'), 'utf8'),
    fs.readFileSync(path.join(JS_DIR, 'audio.js'), 'utf8'),
    fs.readFileSync(path.join(JS_DIR, 'hud.js'), 'utf8'),
    fs.readFileSync(path.join(JS_DIR, 'main.js'), 'utf8')
  ];

  for (var i = 0; i < m3Files.length; i++) {
    assert.equal(/https?:\/\//i.test(m3Files[i]), false, 'Zero http:// or https:// allowed in M3 files');
  }

  var expectedScripts = [
    'vendor/three.min.js',
    'js/cars.js',
    'js/world_data.js',
    'js/physics.js',
    'js/car_models.js',
    'js/world_meshes.js',
    'js/renderer3d.js',
    'js/controls.js',
    'js/audio.js',
    'js/hud.js',
    'js/main.js'
  ];
  var prevIdx = -1;
  for (var s = 0; s < expectedScripts.length; s++) {
    var needle = '<script defer src="' + expectedScripts[s] + '">';
    var idx = html.indexOf(needle);
    assert.ok(idx > prevIdx, 'Missing or out-of-order deferred script: ' + expectedScripts[s]);
    prevIdx = idx;
  }

  var requiredRussianTokens = [
    'ФЕСТИВАЛЬ ХОРАЙЗОН', 'КМ/Ч', 'ОБ/МИН', 'НИТРО', 'ГАЗ', 'ТОРМОЗ', 'РУЧНИК',
    'Гараж', 'Камера', 'Звук', 'Сброс', 'Настройки', 'Руль', 'Кнопки', 'Гироскоп',
    'АКПП', 'МКПП', '3-е лицо', 'Капот', 'Вернуться на дорогу', 'ВЫХОД ИЗ ИГРЫ'
  ];
  for (var r = 0; r < requiredRussianTokens.length; r++) {
    assert.ok(html.indexOf(requiredRussianTokens[r]) !== -1, 'Missing Russian HUD text: ' + requiredRussianTokens[r]);
  }
});

test('UMD global exports for M3 scripts work cleanly in browser VM sandbox', function () {
  var sandbox = {
    globalThis: null,
    Math: Math,
    Number: Number,
    Object: Object,
    Array: Array,
    Map: Map,
    Set: Set,
    Float32Array: Float32Array,
    String: String,
    Promise: Promise
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  var scripts = ['cars.js', 'world_data.js', 'physics.js', 'controls.js', 'audio.js', 'hud.js', 'main.js'];
  for (var i = 0; i < scripts.length; i++) {
    vm.runInContext(fs.readFileSync(path.join(JS_DIR, scripts[i]), 'utf8'), sandbox);
  }

  assert.ok(sandbox.H6 && sandbox.H6.Controls && sandbox.H6.Audio && sandbox.H6.HUD && sandbox.H6.Main);
  assert.ok(sandbox.HorizonBridge && typeof sandbox.HorizonBridge.onAppPause === 'function');
  assert.equal(typeof sandbox.HorizonBridge.onBackPressed, 'function');
});
