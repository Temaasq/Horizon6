(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.H6 = root.H6 || {};
    root.H6.Controls = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_WHEEL_DEG = 135;
  var WHEEL_SPRING_RATE = 8.0;
  var BUTTON_RAMP_RATE = 6.5;
  var DEFAULT_GYRO_DEADZONE_DEG = 4.0;
  var DEFAULT_GYRO_MAX_TILT_DEG = 35.0;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function finiteOr(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
  }

  function getAndroidBridge() {
    if (typeof globalThis !== 'undefined' && globalThis.AndroidBridge) {
      return globalThis.AndroidBridge;
    }
    if (typeof window !== 'undefined' && window.AndroidBridge) {
      return window.AndroidBridge;
    }
    return null;
  }

  function isGyroSupported(env) {
    var bridge = (env && env.androidBridge) || getAndroidBridge();
    if (bridge && typeof bridge.isNativeAndroid === 'function') {
      try {
        if (bridge.isNativeAndroid()) return true;
      } catch (e) {
        // Ignore bridge error
      }
    }
    var win = (env && env.window) || (typeof window !== 'undefined' ? window : null);
    if (win && typeof win.DeviceOrientationEvent !== 'undefined') {
      return true;
    }
    return false;
  }

  var activeState = null;

  function isControlsStateObj(v) {
    return !!(v && typeof v === 'object' && typeof v.steerMode === 'string' && v.keys);
  }

  function createControlsState(options) {
    var opts = options || {};
    var steerMode = opts.steerMode === 'buttons' || opts.steerMode === 'gyro' ? opts.steerMode : 'wheel';
    var transMode = opts.transmissionMode === 'MT' ? 'MT' : 'AT';
    var camMode = opts.cameraMode === 'hood' ? 'hood' : 'chase';

    var state = {
      steerMode: steerMode,
      transmissionMode: transMode,
      cameraMode: camMode,

      // Final normalized steer in [-1..1]: +1 = left, -1 = right
      steer: 0,
      throttle: 0,
      brake: 0,
      handbrake: false,
      nitro: false,

      // Edge-triggered requests consumed by getControlInput
      shiftUpRequested: false,
      shiftDownRequested: false,
      resetRequested: false,

      // Wheel state (CSS rotation in degrees: negative = CCW/left, positive = CW/right)
      wheelAngleDeg: 0,
      wheelActive: false,

      // Button steering state
      buttonLeft: false,
      buttonRight: false,
      buttonPriority: null, // 'left' | 'right' | null
      buttonSteer: 0,

      // Gyro state
      gyroDeadzoneDeg: finiteOr(opts.gyroDeadzoneDeg, DEFAULT_GYRO_DEADZONE_DEG),
      gyroMaxTiltDeg: finiteOr(opts.gyroMaxTiltDeg, DEFAULT_GYRO_MAX_TILT_DEG),
      gyroSensitivity: clamp(finiteOr(opts.gyroSensitivity, 1.25), 0.5, 2.5),
      gyroZeroDeg: 0,
      lastRawGyroDeg: 0,
      gyroSteer: 0,
      gyroFallbackReason: '',

      // Touch pedal states
      touchThrottle: 0,
      touchBrake: 0,
      touchHandbrake: false,
      touchNitro: false,

      // Keyboard states
      keys: {
        up: false,
        down: false,
        left: false,
        right: false,
        handbrake: false,
        nitro: false
      },

      // Active PointerEvent map: pointerId -> { role, ... }
      activePointers: new Map(),

      // Callbacks for UI sync / AndroidBridge
      onSteerModeChange: typeof opts.onSteerModeChange === 'function' ? opts.onSteerModeChange : null,
      onTransmissionChange: typeof opts.onTransmissionChange === 'function' ? opts.onTransmissionChange : null,
      onCameraChange: typeof opts.onCameraChange === 'function' ? opts.onCameraChange : null,
      onMuteToggle: typeof opts.onMuteToggle === 'function' ? opts.onMuteToggle : null,
      onBackAction: typeof opts.onBackAction === 'function' ? opts.onBackAction : null,
      onToast: typeof opts.onToast === 'function' ? opts.onToast : null,
      onUnlockAudio: typeof opts.onUnlockAudio === 'function' ? opts.onUnlockAudio : null
    };
    activeState = state;
    return state;
  }

  function syncNativeGyroFlag(enabled) {
    var bridge = getAndroidBridge();
    if (bridge && typeof bridge.setGyroEnabled === 'function') {
      try {
        bridge.setGyroEnabled(!!enabled);
      } catch (e) {
        // Ignore bridge exception
      }
    }
  }

  function setSteerMode(stateOrMode, modeOrOpts, opts) {
    var state = stateOrMode;
    var mode = modeOrOpts;
    var options = opts;
    if (!isControlsStateObj(stateOrMode)) {
      state = activeState;
      mode = stateOrMode;
      options = modeOrOpts || { checkSupport: true };
    }
    if (!state) {
      return { ok: false, mode: 'wheel', fallbackReason: '' };
    }

    var target = (mode === 'buttons' || mode === 'gyro' || mode === 'wheel') ? mode : 'wheel';
    options = options || {};

    if (target === 'gyro') {
      var hasSensor = typeof options.hasSensor === 'boolean'
        ? options.hasSensor
        : (options.checkSupport ? isGyroSupported(options.env) : true);
      if (!hasSensor) {
        state.steerMode = 'wheel';
        state.gyroSteer = 0;
        state.gyroFallbackReason = 'Гироскоп недоступен — включён руль';
        syncNativeGyroFlag(false);
        if (state.onToast) state.onToast(state.gyroFallbackReason);
        if (state.onSteerModeChange) state.onSteerModeChange('wheel');
        return { ok: false, mode: 'wheel', fallbackReason: state.gyroFallbackReason };
      }
      state.gyroFallbackReason = '';
      state.steerMode = 'gyro';
      syncNativeGyroFlag(true);
    } else {
      state.steerMode = target;
      state.gyroFallbackReason = '';
      syncNativeGyroFlag(false);
    }

    // Reset transient steering states on mode switch
    state.wheelActive = false;
    state.buttonLeft = false;
    state.buttonRight = false;
    state.buttonPriority = null;
    if (state.steerMode !== 'wheel') {
      state.wheelAngleDeg = 0;
    }
    if (state.steerMode !== 'buttons') {
      state.buttonSteer = 0;
    }
    if (state.steerMode !== 'gyro') {
      state.gyroSteer = 0;
    }
    recomputeSteering(state);

    if (state.onSteerModeChange) {
      state.onSteerModeChange(state.steerMode);
    }
    return { ok: true, mode: state.steerMode, fallbackReason: '' };
  }

  function setTransmissionMode(stateOrMode, mode) {
    var state = stateOrMode;
    var targetMode = mode;
    if (!isControlsStateObj(stateOrMode)) {
      state = activeState;
      targetMode = stateOrMode;
    }
    if (!state) return 'AT';
    var target = targetMode === 'MT' ? 'MT' : 'AT';
    state.transmissionMode = target;
    if (state.onTransmissionChange) {
      state.onTransmissionChange(target);
    }
    return target;
  }

  function setCameraMode(stateOrMode, mode) {
    var state = stateOrMode;
    var targetMode = mode;
    if (!isControlsStateObj(stateOrMode)) {
      state = activeState;
      targetMode = stateOrMode;
    }
    if (!state) return 'chase';
    var target = targetMode === 'hood' ? 'hood' : 'chase';
    state.cameraMode = target;
    if (state.onCameraChange) {
      state.onCameraChange(target);
    }
    return target;
  }

  function toggleCameraMode(state) {
    var st = isControlsStateObj(state) ? state : activeState;
    if (!st) return 'chase';
    return setCameraMode(st, st.cameraMode === 'chase' ? 'hood' : 'chase');
  }

  /**
   * Applies visual steering wheel angle in degrees [-135 .. +135].
   * CSS rotation sign: negative = counter-clockwise (left turn -> steer > 0),
   * positive = clockwise (right turn -> steer < 0).
   */
  function applyWheelAngle(state, wheelCssDeg) {
    var clamped = clamp(finiteOr(wheelCssDeg, 0), -MAX_WHEEL_DEG, MAX_WHEEL_DEG);
    state.wheelAngleDeg = clamped;
    if (state.steerMode === 'wheel') {
      state.steer = clamp(-clamped / MAX_WHEEL_DEG, -1, 1);
    }
    return state.steer;
  }

  /**
   * Applies tilt angle in degrees (positive = tilt left -> steer > 0, negative = tilt right -> steer < 0).
   * Applies zero-offset calibration, deadzone, and sensitivity scaling.
   */
  function applyGyroAngle(state, rawTiltDeg, opts) {
    var raw = finiteOr(rawTiltDeg, 0);
    state.lastRawGyroDeg = raw;
    var options = opts || {};
    var deadzone = finiteOr(options.deadzoneDeg, state.gyroDeadzoneDeg);
    var maxTilt = Math.max(deadzone + 1, finiteOr(options.maxTiltDeg, state.gyroMaxTiltDeg));
    var sens = clamp(finiteOr(options.sensitivity, state.gyroSensitivity), 0.5, 2.5);

    var delta = raw - state.gyroZeroDeg;
    var absDelta = Math.abs(delta);
    var out = 0;
    if (absDelta > deadzone) {
      var sign = delta > 0 ? 1 : -1;
      var norm = (absDelta - deadzone) / (maxTilt - deadzone);
      out = clamp(sign * norm * sens, -1, 1);
    }
    state.gyroSteer = out;
    if (state.steerMode === 'gyro') {
      state.steer = out;
    }
    return out;
  }

  /**
   * Applies pre-normalized tilt from AndroidBridge.getTilt() in [-1..1] (+ = left, - = right).
   */
  function applyNativeTilt(state, normalizedTilt) {
    var raw = finiteOr(normalizedTilt, 0);
    var normDeadzone = clamp(state.gyroDeadzoneDeg / Math.max(1, state.gyroMaxTiltDeg), 0.03, 0.06);
    var absRaw = Math.abs(raw);
    var val = 0;
    if (absRaw > normDeadzone) {
      var sign = raw > 0 ? 1 : -1;
      var scaled = (absRaw - normDeadzone) / (1 - normDeadzone);
      val = clamp(sign * scaled * state.gyroSensitivity, -1, 1);
    }
    state.gyroSteer = val;
    if (state.steerMode === 'gyro') {
      state.steer = val;
    }
    return val;
  }

  function calibrateGyro(state) {
    var st = isControlsStateObj(state) ? state : activeState;
    if (!st) return 0;
    st.gyroZeroDeg = st.lastRawGyroDeg;
    st.gyroSteer = 0;
    if (st.steerMode === 'gyro') {
      st.steer = 0;
    }
    var bridge = getAndroidBridge();
    if (bridge && typeof bridge.calibrateGyro === 'function') {
      try {
        bridge.calibrateGyro();
      } catch (e) {
        // Ignore bridge error
      }
    }
    return st.gyroZeroDeg;
  }

  function setButtonState(state, role, pressed) {
    var isDown = !!pressed;
    if (role === 'steerLeft') {
      state.buttonLeft = isDown;
      if (isDown) state.buttonPriority = 'left';
      else if (state.buttonRight) state.buttonPriority = 'right';
      else state.buttonPriority = null;
    } else if (role === 'steerRight') {
      state.buttonRight = isDown;
      if (isDown) state.buttonPriority = 'right';
      else if (state.buttonLeft) state.buttonPriority = 'left';
      else state.buttonPriority = null;
    } else if (role === 'throttle') {
      state.touchThrottle = isDown ? 1 : 0;
    } else if (role === 'brake') {
      state.touchBrake = isDown ? 1 : 0;
    } else if (role === 'handbrake') {
      state.touchHandbrake = isDown;
    } else if (role === 'nitro') {
      state.touchNitro = isDown;
    }
    recomputeOutputs(state);
  }

  function requestShiftUp(state) {
    state.shiftUpRequested = true;
  }

  function requestShiftDown(state) {
    state.shiftDownRequested = true;
  }

  function requestReset(state) {
    state.resetRequested = true;
  }

  function recomputeSteering(state) {
    var kbSteer = (state.keys.left ? 1 : 0) - (state.keys.right ? 1 : 0);
    if (kbSteer !== 0) {
      state.steer = kbSteer;
      return;
    }
    if (state.steerMode === 'wheel') {
      state.steer = clamp(-state.wheelAngleDeg / MAX_WHEEL_DEG, -1, 1);
    } else if (state.steerMode === 'buttons') {
      state.steer = clamp(state.buttonSteer, -1, 1);
    } else if (state.steerMode === 'gyro') {
      state.steer = clamp(state.gyroSteer, -1, 1);
    }
  }

  function recomputeOutputs(state) {
    state.throttle = clamp(Math.max(state.touchThrottle, state.keys.up ? 1 : 0), 0, 1);
    state.brake = clamp(Math.max(state.touchBrake, state.keys.down ? 1 : 0), 0, 1);
    state.handbrake = !!(state.touchHandbrake || state.keys.handbrake);
    state.nitro = !!(state.touchNitro || state.keys.nitro);
    recomputeSteering(state);
  }

  function updateControls(state, dt) {
    var safeDt = (Number.isFinite(dt) && dt > 0) ? Math.min(dt, 0.1) : 0;
    var kbSteer = (state.keys.left ? 1 : 0) - (state.keys.right ? 1 : 0);

    if (state.steerMode === 'wheel') {
      if (kbSteer !== 0) {
        var targetDeg = -kbSteer * MAX_WHEEL_DEG;
        var step = MAX_WHEEL_DEG * 7.5 * safeDt;
        if (Math.abs(targetDeg - state.wheelAngleDeg) <= step) {
          state.wheelAngleDeg = targetDeg;
        } else {
          state.wheelAngleDeg += Math.sign(targetDeg - state.wheelAngleDeg) * step;
        }
      } else if (!state.wheelActive && Math.abs(state.wheelAngleDeg) > 0.01) {
        var springDecay = Math.exp(-WHEEL_SPRING_RATE * safeDt);
        state.wheelAngleDeg *= springDecay;
        if (Math.abs(state.wheelAngleDeg) < 0.35) {
          state.wheelAngleDeg = 0;
        }
      }
    } else if (state.steerMode === 'buttons') {
      var targetBtn = 0;
      if (state.buttonLeft && state.buttonRight) {
        targetBtn = state.buttonPriority === 'right' ? -1 : 1;
      } else if (state.buttonLeft) {
        targetBtn = 1;
      } else if (state.buttonRight) {
        targetBtn = -1;
      }
      var maxDelta = BUTTON_RAMP_RATE * safeDt;
      if (Math.abs(targetBtn - state.buttonSteer) <= maxDelta) {
        state.buttonSteer = targetBtn;
      } else {
        state.buttonSteer += Math.sign(targetBtn - state.buttonSteer) * maxDelta;
      }
    } else if (state.steerMode === 'gyro') {
      var bridge = getAndroidBridge();
      if (bridge && typeof bridge.isNativeAndroid === 'function' && typeof bridge.getTilt === 'function') {
        try {
          if (bridge.isNativeAndroid()) {
            applyNativeTilt(state, bridge.getTilt());
          }
        } catch (e) {
          // Ignore bridge error
        }
      }
    }

    recomputeOutputs(state);
  }

  function peekControlInput(state) {
    var st = isControlsStateObj(state) ? state : activeState;
    if (!st) return null;
    recomputeOutputs(st);
    return {
      steer: st.steer,
      throttle: st.throttle,
      brake: st.brake,
      handbrake: st.handbrake,
      nitro: st.nitro,
      shiftUpRequested: !!st.shiftUpRequested,
      shiftDownRequested: !!st.shiftDownRequested,
      resetRequested: !!st.resetRequested,
      steerMode: st.steerMode,
      transmissionMode: st.transmissionMode,
      cameraMode: st.cameraMode
    };
  }

  function getControlInput(state) {
    var st = isControlsStateObj(state) ? state : activeState;
    if (!st) return null;
    var input = peekControlInput(st);
    st.shiftUpRequested = false;
    st.shiftDownRequested = false;
    st.resetRequested = false;
    return input;
  }

  function getInput() {
    return peekControlInput(activeState);
  }

  function getState() {
    return activeState;
  }

  function syncActiveRolesFromPointers(state) {
    var throttle = 0;
    var brake = 0;
    var handbrake = false;
    var nitro = false;
    var left = false;
    var right = false;

    state.activePointers.forEach(function (info) {
      if (info.role === 'throttle') throttle = 1;
      else if (info.role === 'brake') brake = 1;
      else if (info.role === 'handbrake') handbrake = true;
      else if (info.role === 'nitro') nitro = true;
      else if (info.role === 'steerLeft') left = true;
      else if (info.role === 'steerRight') right = true;
    });

    state.touchThrottle = throttle;
    state.touchBrake = brake;
    state.touchHandbrake = handbrake;
    state.touchNitro = nitro;
    state.buttonLeft = left;
    state.buttonRight = right;
    if (!left && !right) state.buttonPriority = null;
    else if (left && !right) state.buttonPriority = 'left';
    else if (right && !left) state.buttonPriority = 'right';

    recomputeOutputs(state);
  }

  function computePointerAngle(el, clientX, clientY) {
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width * 0.5;
    var cy = rect.top + rect.height * 0.5;
    return Math.atan2(clientY - cy, clientX - cx);
  }

  function shortestAngleDelta(fromRad, toRad) {
    var d = toRad - fromRad;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function bindDOM(state, elements) {
    if (isControlsStateObj(state)) activeState = state;
    var els = elements || {};
    var cleanups = [];

    function addListener(target, type, handler, opts) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, handler, opts || false);
      cleanups.push(function () {
        target.removeEventListener(type, handler, opts || false);
      });
    }

    function bindTouchButton(el, role) {
      if (!el) return;
      addListener(el, 'pointerdown', function (ev) {
        ev.preventDefault();
        if (state.onUnlockAudio) state.onUnlockAudio();
        if (typeof el.setPointerCapture === 'function') {
          try { el.setPointerCapture(ev.pointerId); } catch (e) {}
        }
        state.activePointers.set(ev.pointerId, { role: role, el: el });
        if (role === 'steerLeft') state.buttonPriority = 'left';
        if (role === 'steerRight') state.buttonPriority = 'right';
        if (el.classList) el.classList.add('active');
        syncActiveRolesFromPointers(state);
      });

      var endHandler = function (ev) {
        var entry = state.activePointers.get(ev.pointerId);
        if (entry && entry.role === role) {
          state.activePointers.delete(ev.pointerId);
          if (el.classList) el.classList.remove('active');
          syncActiveRolesFromPointers(state);
        }
      };
      addListener(el, 'pointerup', endHandler);
      addListener(el, 'pointercancel', endHandler);
      addListener(el, 'lostpointercapture', endHandler);
    }

    function bindTapButton(el, actionFn) {
      if (!el) return;
      addListener(el, 'pointerdown', function (ev) {
        ev.preventDefault();
        if (state.onUnlockAudio) state.onUnlockAudio();
        if (el.classList) el.classList.add('active');
        actionFn();
      });
      var clearCls = function () {
        if (el.classList) el.classList.remove('active');
      };
      addListener(el, 'pointerup', clearCls);
      addListener(el, 'pointercancel', clearCls);
    }

    // Steering wheel multi-touch drag (inner wheel + optional outer touch wrapper)
    function bindWheelTarget(targetEl) {
      if (!targetEl) return;
      addListener(targetEl, 'pointerdown', function (ev) {
        if (state.activePointers.has(ev.pointerId)) return;
        ev.preventDefault();
        if (state.onUnlockAudio) state.onUnlockAudio();
        if (typeof targetEl.setPointerCapture === 'function') {
          try { targetEl.setPointerCapture(ev.pointerId); } catch (e) {}
        }
        var angle = computePointerAngle(targetEl, ev.clientX, ev.clientY);
        state.activePointers.set(ev.pointerId, { role: 'wheel', lastAngle: angle, targetEl: targetEl });
        state.wheelActive = true;
      });

      addListener(targetEl, 'pointermove', function (ev) {
        var entry = state.activePointers.get(ev.pointerId);
        if (!entry || entry.role !== 'wheel' || entry.targetEl !== targetEl) return;
        var nextAngle = computePointerAngle(targetEl, ev.clientX, ev.clientY);
        var deltaRad = shortestAngleDelta(entry.lastAngle, nextAngle);
        entry.lastAngle = nextAngle;
        // Screen Y-down: positive deltaRad = clockwise = +deg CSS = right turn
        applyWheelAngle(state, state.wheelAngleDeg + deltaRad * (180 / Math.PI));
      });

      var endWheel = function (ev) {
        var entry = state.activePointers.get(ev.pointerId);
        if (entry && entry.role === 'wheel' && entry.targetEl === targetEl) {
          state.activePointers.delete(ev.pointerId);
          state.wheelActive = false;
        }
      };
      addListener(targetEl, 'pointerup', endWheel);
      addListener(targetEl, 'pointercancel', endWheel);
      addListener(targetEl, 'lostpointercapture', endWheel);
    }

    bindWheelTarget(els.wheelEl);
    if (els.wheelWrapEl && els.wheelWrapEl !== els.wheelEl) {
      bindWheelTarget(els.wheelWrapEl);
    }

    bindTouchButton(els.steerLeftEl, 'steerLeft');
    bindTouchButton(els.steerRightEl, 'steerRight');
    bindTouchButton(els.throttleEl, 'throttle');
    bindTouchButton(els.brakeEl, 'brake');
    bindTouchButton(els.handbrakeEl, 'handbrake');
    bindTouchButton(els.nitroEl, 'nitro');

    bindTapButton(els.shiftUpEl, function () { requestShiftUp(state); });
    bindTapButton(els.shiftDownEl, function () { requestShiftDown(state); });

    // Browser DeviceOrientationEvent fallback when not using native AndroidBridge
    var win = els.window || (typeof window !== 'undefined' ? window : null);
    if (win) {
      addListener(win, 'deviceorientation', function (ev) {
        if (state.steerMode !== 'gyro') return;
        var bridge = getAndroidBridge();
        if (bridge && typeof bridge.isNativeAndroid === 'function') {
          try {
            if (bridge.isNativeAndroid()) return;
          } catch (e) {}
        }
        var beta = finiteOr(ev.beta, 0);
        var gamma = finiteOr(ev.gamma, 0);
        var orientAngle = 90;
        if (win.screen && win.screen.orientation && typeof win.screen.orientation.angle === 'number') {
          orientAngle = win.screen.orientation.angle;
        } else if (typeof win.orientation === 'number') {
          orientAngle = win.orientation;
        }
        var tiltDeg;
        if (orientAngle === 90) tiltDeg = -beta;
        else if (orientAngle === 270 || orientAngle === -90) tiltDeg = beta;
        else if (orientAngle === 180) tiltDeg = -gamma;
        else tiltDeg = gamma;
        applyGyroAngle(state, tiltDeg);
      });

      addListener(win, 'keydown', function (ev) {
        if (state.onUnlockAudio) state.onUnlockAudio();
        var code = ev.code || ev.key;
        if (code === 'KeyW' || code === 'ArrowUp') state.keys.up = true;
        else if (code === 'KeyS' || code === 'ArrowDown') state.keys.down = true;
        else if (code === 'KeyA' || code === 'ArrowLeft') state.keys.left = true;
        else if (code === 'KeyD' || code === 'ArrowRight') state.keys.right = true;
        else if (code === 'Space') { state.keys.handbrake = true; ev.preventDefault(); }
        else if (code === 'ShiftLeft' || code === 'ShiftRight') state.keys.nitro = true;
        else if (!ev.repeat) {
          if (code === 'KeyE') requestShiftUp(state);
          else if (code === 'KeyQ') requestShiftDown(state);
          else if (code === 'KeyR') requestReset(state);
          else if (code === 'KeyC') toggleCameraMode(state);
          else if (code === 'KeyM' && state.onMuteToggle) state.onMuteToggle();
          else if (code === 'Escape' && state.onBackAction) state.onBackAction();
        }
        recomputeOutputs(state);
      });

      addListener(win, 'keyup', function (ev) {
        var code = ev.code || ev.key;
        if (code === 'KeyW' || code === 'ArrowUp') state.keys.up = false;
        else if (code === 'KeyS' || code === 'ArrowDown') state.keys.down = false;
        else if (code === 'KeyA' || code === 'ArrowLeft') state.keys.left = false;
        else if (code === 'KeyD' || code === 'ArrowRight') state.keys.right = false;
        else if (code === 'Space') state.keys.handbrake = false;
        else if (code === 'ShiftLeft' || code === 'ShiftRight') state.keys.nitro = false;
        recomputeOutputs(state);
      });

      addListener(win, 'blur', function () {
        state.activePointers.clear();
        state.wheelActive = false;
        state.touchThrottle = 0;
        state.touchBrake = 0;
        state.touchHandbrake = false;
        state.touchNitro = false;
        state.buttonLeft = false;
        state.buttonRight = false;
        state.buttonPriority = null;
        state.keys.up = false;
        state.keys.down = false;
        state.keys.left = false;
        state.keys.right = false;
        state.keys.handbrake = false;
        state.keys.nitro = false;
        recomputeOutputs(state);
      });
    }

    return function unbind() {
      for (var i = 0; i < cleanups.length; i++) {
        cleanups[i]();
      }
      cleanups.length = 0;
    };
  }

  return {
    MAX_WHEEL_DEG: MAX_WHEEL_DEG,
    DEFAULT_GYRO_DEADZONE_DEG: DEFAULT_GYRO_DEADZONE_DEG,
    DEFAULT_GYRO_MAX_TILT_DEG: DEFAULT_GYRO_MAX_TILT_DEG,
    createControlsState: createControlsState,
    setSteerMode: setSteerMode,
    setTransmissionMode: setTransmissionMode,
    setCameraMode: setCameraMode,
    toggleCameraMode: toggleCameraMode,
    applyWheelAngle: applyWheelAngle,
    applyGyroAngle: applyGyroAngle,
    applyNativeTilt: applyNativeTilt,
    calibrateGyro: calibrateGyro,
    setButtonState: setButtonState,
    requestShiftUp: requestShiftUp,
    requestShiftDown: requestShiftDown,
    requestReset: requestReset,
    updateControls: updateControls,
    peekControlInput: peekControlInput,
    getControlInput: getControlInput,
    getInput: getInput,
    getState: getState,
    isGyroSupported: isGyroSupported,
    bindDOM: bindDOM
  };
});
