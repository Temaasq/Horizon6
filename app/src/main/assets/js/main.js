(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var Cars = require('./cars.js');
    var Physics = require('./physics.js');
    var Controls = require('./controls.js');
    var Audio = require('./audio.js');
    var HUD = require('./hud.js');
    module.exports = factory(root, {
      Cars: Cars,
      Physics: Physics,
      Controls: Controls,
      Audio: Audio,
      HUD: HUD,
      Renderer3D: null
    });
  } else {
    root.H6 = root.H6 || {};
    var api = factory(root, root.H6);
    root.H6.Main = api;
    root.HorizonBridge = api.HorizonBridge;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, deps) {
  'use strict';

  var STORAGE_KEYS = {
    cr: 'h6_cr',
    bestTrap: 'h6_best_trap',
    activeCar: 'h6_active_car',
    muted: 'h6_muted',
    steerMode: 'h6_steer_mode',
    transMode: 'h6_trans_mode',
    camMode: 'h6_cam_mode'
  };

  function safeGet(storage, key) {
    try {
      var st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      return st ? st.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function safeSet(storage, key, val) {
    try {
      var st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (st) st.setItem(key, String(val));
    } catch (e) {
      // Ignore storage errors
    }
  }

  function safeNumber(val, fallback) {
    var n = Number(val);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  var runtime = {
    appPaused: false,
    rafId: null,
    lastTimeMs: 0,
    simState: null,
    controlsState: null,
    hud: null,
    renderer: null,
    audio: null,
    storage: null,
    lastCameraMode: 'chase'
  };

  function persistScoring(simState, storage) {
    if (!simState || !simState.scoring) return;
    safeSet(storage, STORAGE_KEYS.cr, Math.round(simState.scoring.cr || 0));
    safeSet(storage, STORAGE_KEYS.bestTrap, Math.round(simState.scoring.speedTrapBestKmh || 0));
  }

  function bootstrap(options) {
    var opts = options || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    var storage = opts.storage || null;
    runtime.storage = storage;

    var Cars = opts.Cars || deps.Cars || { CARS: deps.CARS, getCarById: deps.getCarById };
    var Physics = opts.Physics || deps.Physics;
    var Controls = opts.Controls || deps.Controls;
    var Audio = opts.Audio || deps.Audio;
    var HUD = opts.HUD || deps.HUD;
    var Renderer3D = opts.Renderer3D || deps.Renderer3D || (root.H6 && root.H6.Renderer3D) || null;

    var savedCar = safeGet(storage, STORAGE_KEYS.activeCar) || (Cars && Cars.DEFAULT_CAR_ID) || 'skyline_gtr';
    var savedSteer = safeGet(storage, STORAGE_KEYS.steerMode) || 'wheel';
    var savedTrans = safeGet(storage, STORAGE_KEYS.transMode) || 'AT';
    var savedCam = safeGet(storage, STORAGE_KEYS.camMode) || 'chase';

    var simState = Physics.createSimulation(savedCar);
    var savedCr = safeNumber(safeGet(storage, STORAGE_KEYS.cr), 0);
    var savedBestTrap = safeNumber(safeGet(storage, STORAGE_KEYS.bestTrap), 0);
    simState.scoring.cr = savedCr;
    simState.scoring.speedTrapBestKmh = savedBestTrap;
    simState.transmissionMode = savedTrans === 'MT' ? 'MT' : 'AT';

    runtime.simState = simState;
    runtime.renderer = Renderer3D;
    runtime.audio = Audio;

    // Initialize Audio
    if (Audio && typeof Audio.init === 'function') {
      Audio.init({ storage: storage });
    }

    // Initialize 3D Renderer if available
    var containerEl = doc && typeof doc.getElementById === 'function' ? doc.getElementById('webgl-container') : null;
    if (Renderer3D && typeof Renderer3D.init === 'function' && containerEl) {
      Renderer3D.init(containerEl, simState);
      if (typeof Renderer3D.setCameraMode === 'function') {
        Renderer3D.setCameraMode(savedCam === 'hood' ? 'hood' : 'chase');
      }
    }

    var hud = null;
    var controlsState = null;

    function handleToggleMute() {
      if (!Audio) return;
      var muted = Audio.toggleMute();
      safeSet(storage, STORAGE_KEYS.muted, muted ? 'true' : 'false');
      if (hud) {
        hud.syncSettingsUI(controlsState, muted);
        hud.showToast(muted ? 'Звук выключен' : 'Звук включён', 1.6);
      }
    }

    function handleSteerModeChange(mode) {
      if (!controlsState) return;
      var res = Controls.setSteerMode(controlsState, mode, {
        checkSupport: true,
        env: { window: win, androidBridge: win && win.AndroidBridge }
      });
      safeSet(storage, STORAGE_KEYS.steerMode, controlsState.steerMode);
      if (hud) {
        hud.syncSettingsUI(controlsState, Audio ? Audio.isMuted() : false);
        if (!res.ok && res.fallbackReason) {
          hud.showToast(res.fallbackReason, 2.8);
        }
      }
    }

    function handleTransmissionChange(mode) {
      if (!controlsState) return;
      var target = Controls.setTransmissionMode(controlsState, mode);
      simState.transmissionMode = target;
      safeSet(storage, STORAGE_KEYS.transMode, target);
      if (hud) {
        hud.syncSettingsUI(controlsState, Audio ? Audio.isMuted() : false);
      }
    }

    function handleCameraChange(mode) {
      if (!controlsState) return;
      var target = Controls.setCameraMode(controlsState, mode);
      runtime.lastCameraMode = target;
      safeSet(storage, STORAGE_KEYS.camMode, target);
      if (Renderer3D && typeof Renderer3D.setCameraMode === 'function') {
        Renderer3D.setCameraMode(target);
      }
      if (hud) {
        hud.syncSettingsUI(controlsState, Audio ? Audio.isMuted() : false);
      }
    }

    function handleBackAction() {
      if (!hud) return false;
      var open = hud.getOpenModal();
      if (open === 'garage' || open === 'settings' || open === 'exit') {
        hud.closeModals();
      } else {
        hud.openModal('exit');
      }
      return true;
    }

    controlsState = Controls.createControlsState({
      steerMode: savedSteer === 'gyro' && !Controls.isGyroSupported({ window: win, androidBridge: win && win.AndroidBridge }) ? 'wheel' : savedSteer,
      transmissionMode: savedTrans,
      cameraMode: savedCam,
      onSteerModeChange: function (m) {
        safeSet(storage, STORAGE_KEYS.steerMode, m);
        if (hud) hud.syncSettingsUI(controlsState, Audio ? Audio.isMuted() : false);
      },
      onTransmissionChange: function (m) {
        simState.transmissionMode = m;
        safeSet(storage, STORAGE_KEYS.transMode, m);
        if (hud) hud.syncSettingsUI(controlsState, Audio ? Audio.isMuted() : false);
      },
      onCameraChange: function (m) {
        runtime.lastCameraMode = m;
        safeSet(storage, STORAGE_KEYS.camMode, m);
        if (Renderer3D && typeof Renderer3D.setCameraMode === 'function') {
          Renderer3D.setCameraMode(m);
        }
        if (hud) hud.syncSettingsUI(controlsState, Audio ? Audio.isMuted() : false);
      },
      onMuteToggle: handleToggleMute,
      onBackAction: handleBackAction,
      onToast: function (msg) {
        if (hud) hud.showToast(msg, 2.5);
      },
      onUnlockAudio: function () {
        if (Audio && typeof Audio.unlock === 'function') Audio.unlock();
      }
    });
    runtime.controlsState = controlsState;
    runtime.lastCameraMode = controlsState.cameraMode;

    if (controlsState.steerMode === 'gyro') {
      Controls.setSteerMode(controlsState, 'gyro', { checkSupport: true, env: { window: win, androidBridge: win && win.AndroidBridge } });
    }

    hud = HUD.createHUD({
      document: doc,
      onSelectCar: function (carId) {
        var car = Physics.switchCar(simState, carId);
        safeSet(storage, STORAGE_KEYS.activeCar, simState.activeCarId);
        if (Renderer3D && typeof Renderer3D.setActiveCar === 'function') {
          Renderer3D.setActiveCar(simState.activeCarId);
        }
        if (car) {
          hud.showToast('Выбрана: ' + car.nameRu, 2.2);
        }
      },
      onSteerModeChange: handleSteerModeChange,
      onCalibrateGyro: function () {
        Controls.calibrateGyro(controlsState);
        hud.showToast('Гироскоп откалиброван', 2.0);
      },
      onTransmissionChange: handleTransmissionChange,
      onToggleTransmission: function () {
        handleTransmissionChange(controlsState.transmissionMode === 'AT' ? 'MT' : 'AT');
      },
      onCameraChange: handleCameraChange,
      onToggleCamera: function () {
        handleCameraChange(controlsState.cameraMode === 'chase' ? 'hood' : 'chase');
      },
      onToggleMute: handleToggleMute,
      onResetPlayer: function () {
        Controls.requestReset(controlsState);
        hud.showToast('Возврат на дорогу', 1.8);
      },
      onExitConfirmed: function () {
        var bridge = win && win.AndroidBridge;
        if (bridge && typeof bridge.exitApp === 'function') {
          try {
            bridge.exitApp();
          } catch (e) {
            hud.closeModals();
          }
        } else {
          hud.closeModals();
        }
      }
    });
    runtime.hud = hud;

    if (hud) {
      hud.renderGarageCards(simState.activeCarId);
      hud.syncSettingsUI(controlsState, Audio ? Audio.isMuted() : false);
      if (typeof Controls.bindDOM === 'function') {
        Controls.bindDOM(controlsState, {
          window: win,
          wheelEl: hud.dom.steerWheel,
          wheelWrapEl: hud.dom.steerWheelWrap,
          steerLeftEl: doc && doc.getElementById('btn-steer-left'),
          steerRightEl: doc && doc.getElementById('btn-steer-right'),
          throttleEl: doc && doc.getElementById('btn-gas'),
          brakeEl: doc && doc.getElementById('btn-brake'),
          handbrakeEl: doc && doc.getElementById('btn-handbrake'),
          nitroEl: doc && doc.getElementById('btn-nitro'),
          shiftUpEl: doc && doc.getElementById('btn-shift-up'),
          shiftDownEl: doc && doc.getElementById('btn-shift-down')
        });
      }
    }

    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('resize', function () {
        if (Renderer3D && typeof Renderer3D.resize === 'function') {
          Renderer3D.resize(win.innerWidth || 1280, win.innerHeight || 720);
        }
      });
    }

    function stepFrame(dtSec) {
      var clampedDt = (Number.isFinite(dtSec) && dtSec > 0) ? Math.min(dtSec, 0.05) : (1 / 60);
      var modalOpen = hud && hud.isAnyModalOpen();

      Controls.updateControls(controlsState, clampedDt);
      var input = Controls.getControlInput(controlsState);

      if (input.cameraMode !== runtime.lastCameraMode) {
        runtime.lastCameraMode = input.cameraMode;
        if (Renderer3D && typeof Renderer3D.setCameraMode === 'function') {
          Renderer3D.setCameraMode(input.cameraMode);
        }
        if (hud) hud.syncSettingsUI(controlsState, Audio ? Audio.isMuted() : false);
      }

      if (!modalOpen && !runtime.appPaused) {
        Physics.stepSimulation(simState, input, clampedDt);

        if (simState.events && simState.events.length > 0) {
          var scoreChanged = false;
          for (var i = 0; i < simState.events.length; i++) {
            var ev = simState.events[i];
            if (Audio && typeof Audio.triggerEvent === 'function') {
              Audio.triggerEvent(ev);
            }
            if (hud && typeof hud.pushEvent === 'function') {
              hud.pushEvent(ev);
            }
            if (ev.type === 'speed_trap' || ev.type === 'target_smash' || ev.type === 'drift_bank') {
              scoreChanged = true;
            }
          }
          simState.events.length = 0;
          if (scoreChanged) {
            persistScoring(simState, storage);
          }
        }

        var activeCar = Cars && typeof Cars.getCarById === 'function' ? Cars.getCarById(simState.activeCarId) : null;
        if (Audio && typeof Audio.updateContinuous === 'function') {
          Audio.updateContinuous(simState.player, activeCar);
        }
      } else if (Audio && typeof Audio.updateContinuous === 'function') {
        Audio.updateContinuous({ rpm: 900, speedKmh: 0, slipAngleDeg: 0, isDrifting: false, isNitroActive: false }, null);
      }

      if (Renderer3D && typeof Renderer3D.render === 'function') {
        Renderer3D.render(simState, clampedDt);
      }
      if (hud && typeof hud.update === 'function') {
        hud.update(simState, controlsState, Audio ? Audio.isMuted() : false, clampedDt);
      }
    }

    var rafFn = (win && typeof win.requestAnimationFrame === 'function')
      ? win.requestAnimationFrame.bind(win)
      : (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);

    function loop(nowMs) {
      if (runtime.appPaused) {
        runtime.rafId = null;
        return;
      }
      if (!runtime.lastTimeMs) runtime.lastTimeMs = nowMs;
      var dt = Math.min(Math.max(0, (nowMs - runtime.lastTimeMs) / 1000), 0.05);
      runtime.lastTimeMs = nowMs;

      stepFrame(dt > 0 ? dt : 1 / 60);

      if (rafFn) {
        runtime.rafId = rafFn(loop);
      }
    }

    runtime.loopFn = loop;
    runtime.rafFn = rafFn;

    if (rafFn && !opts.noLoop) {
      runtime.appPaused = false;
      runtime.lastTimeMs = 0;
      runtime.rafId = rafFn(loop);
    }

    return {
      simState: simState,
      controlsState: controlsState,
      hud: hud,
      stepFrame: stepFrame
    };
  }

  var HorizonBridge = {
    onAppPause: function () {
      runtime.appPaused = true;
      if (runtime.audio && typeof runtime.audio.setAppPaused === 'function') {
        runtime.audio.setAppPaused(true);
      }
    },
    onAppResume: function () {
      runtime.appPaused = false;
      runtime.lastTimeMs = 0;
      if (runtime.audio && typeof runtime.audio.setAppPaused === 'function') {
        runtime.audio.setAppPaused(false);
      }
      if (!runtime.rafId && runtime.rafFn && runtime.loopFn) {
        runtime.rafId = runtime.rafFn(runtime.loopFn);
      }
    },
    onBackPressed: function () {
      if (!runtime.hud) return false;
      var open = runtime.hud.getOpenModal();
      if (open === 'garage' || open === 'settings' || open === 'exit') {
        runtime.hud.closeModals();
      } else {
        runtime.hud.openModal('exit');
      }
      return true;
    },
    getSimState: function () {
      return runtime.simState;
    }
  };

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof module === 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        bootstrap();
      });
    } else {
      bootstrap();
    }
  }

  return {
    bootstrap: bootstrap,
    HorizonBridge: HorizonBridge
  };
});
