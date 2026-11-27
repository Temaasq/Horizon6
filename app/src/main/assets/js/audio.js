(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.H6 = root.H6 || {};
    root.H6.Audio = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_MUTE_KEY = 'h6_muted';
  var DEFAULT_MASTER_GAIN = 0.65;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function finiteOr(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
  }

  function safeStorageGet(storage, key) {
    try {
      var st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      return st ? st.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function safeStorageSet(storage, key, val) {
    try {
      var st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (st) st.setItem(key, val);
    } catch (e) {
      // Ignore storage failures in sandboxed environments
    }
  }

  function resolveAudioContextCtor(explicitCtor) {
    if (typeof explicitCtor === 'function') return explicitCtor;
    if (typeof globalThis !== 'undefined') {
      if (typeof globalThis.AudioContext === 'function') return globalThis.AudioContext;
      if (typeof globalThis.webkitAudioContext === 'function') return globalThis.webkitAudioContext;
    }
    if (typeof window !== 'undefined') {
      if (typeof window.AudioContext === 'function') return window.AudioContext;
      if (typeof window.webkitAudioContext === 'function') return window.webkitAudioContext;
    }
    return null;
  }

  function createNoiseBuffer(ctx, seconds) {
    var rate = ctx.sampleRate || 44100;
    var length = Math.max(1, Math.floor(rate * (seconds || 1.5)));
    if (typeof ctx.createBuffer !== 'function') return null;
    var buffer = ctx.createBuffer(1, length, rate);
    if (buffer && typeof buffer.getChannelData === 'function') {
      var data = buffer.getChannelData(0);
      for (var i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return buffer;
  }

  function setParamSmooth(param, value, now, tau) {
    if (!param) return;
    if (typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(value, now, tau || 0.03);
    } else if ('value' in param) {
      param.value = value;
    }
  }

  function createAudioEngine() {
    var state = {
      initialized: false,
      unlocked: false,
      muted: false,
      paused: false,
      ctx: null,
      ctor: null,
      storage: null,
      masterGain: null,
      engineGain: null,
      engineOsc1: null,
      engineOsc2: null,
      engineFilter: null,
      screechGain: null,
      screechFilter: null,
      screechSrc: null,
      nitroGain: null,
      nitroFilter: null,
      nitroSrc: null,
      noiseBuffer: null
    };

    function applyMasterGain() {
      if (!state.ctx || !state.masterGain) return;
      var target = (state.muted || state.paused) ? 0 : DEFAULT_MASTER_GAIN;
      var now = state.ctx.currentTime || 0;
      setParamSmooth(state.masterGain.gain, target, now, 0.025);
    }

    function buildGraph() {
      if (state.ctx || !state.ctor) return false;
      try {
        var ctx = new state.ctor();
        state.ctx = ctx;

        var master = ctx.createGain();
        master.gain.value = (state.muted || state.paused) ? 0 : DEFAULT_MASTER_GAIN;
        master.connect(ctx.destination);
        state.masterGain = master;

        // Engine synthesizer: sawtooth + triangle -> lowpass -> engineGain -> master
        var engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 320;
        engineFilter.Q.value = 2.4;

        var engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        engineFilter.connect(engineGain);
        engineGain.connect(master);

        var osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.value = 55;
        if (osc1.detune) osc1.detune.value = -7;
        osc1.connect(engineFilter);
        osc1.start();

        var osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = 110;
        if (osc2.detune) osc2.detune.value = 7;
        osc2.connect(engineFilter);
        osc2.start();

        state.engineFilter = engineFilter;
        state.engineGain = engineGain;
        state.engineOsc1 = osc1;
        state.engineOsc2 = osc2;

        // Shared white-noise buffer for tire screech & nitro whoosh
        var noiseBuf = createNoiseBuffer(ctx, 1.5);
        state.noiseBuffer = noiseBuf;

        if (noiseBuf && typeof ctx.createBufferSource === 'function') {
          // Tire screech loop
          var screechSrc = ctx.createBufferSource();
          screechSrc.buffer = noiseBuf;
          screechSrc.loop = true;

          var screechFilter = ctx.createBiquadFilter();
          screechFilter.type = 'bandpass';
          screechFilter.frequency.value = 1250;
          screechFilter.Q.value = 4.5;

          var screechGain = ctx.createGain();
          screechGain.gain.value = 0;

          screechSrc.connect(screechFilter);
          screechFilter.connect(screechGain);
          screechGain.connect(master);
          screechSrc.start();

          state.screechSrc = screechSrc;
          state.screechFilter = screechFilter;
          state.screechGain = screechGain;

          // Nitro whoosh loop
          var nitroSrc = ctx.createBufferSource();
          nitroSrc.buffer = noiseBuf;
          nitroSrc.loop = true;

          var nitroFilter = ctx.createBiquadFilter();
          nitroFilter.type = 'highpass';
          nitroFilter.frequency.value = 650;
          nitroFilter.Q.value = 1.8;

          var nitroGain = ctx.createGain();
          nitroGain.gain.value = 0;

          nitroSrc.connect(nitroFilter);
          nitroFilter.connect(nitroGain);
          nitroGain.connect(master);
          nitroSrc.start();

          state.nitroSrc = nitroSrc;
          state.nitroFilter = nitroFilter;
          state.nitroGain = nitroGain;
        }

        return true;
      } catch (e) {
        state.ctx = null;
        return false;
      }
    }

    function init(options) {
      var opts = options || {};
      state.storage = opts.storage || null;
      state.ctor = resolveAudioContextCtor(opts.AudioContext);
      var savedMute = safeStorageGet(state.storage, STORAGE_MUTE_KEY);
      if (typeof opts.muted === 'boolean') {
        state.muted = opts.muted;
      } else if (savedMute !== null) {
        state.muted = savedMute === 'true' || savedMute === '1';
      }
      state.paused = false;
      state.initialized = true;
      if (opts.autoCreateContext && state.ctor && !state.ctx) {
        buildGraph();
      }
      applyMasterGain();
      return !!(state.ctor);
    }

    function unlock() {
      if (!state.initialized) {
        init();
      }
      if (!state.ctx && state.ctor) {
        buildGraph();
      }
      if (state.ctx && typeof state.ctx.resume === 'function' && !state.paused) {
        try {
          var p = state.ctx.resume();
          if (p && typeof p.catch === 'function') {
            p.catch(function () {});
          }
          state.unlocked = true;
        } catch (e) {
          // Ignore resume errors
        }
      }
      applyMasterGain();
      return state.unlocked;
    }

    function updateContinuous(playerState, carSpec) {
      if (!state.ctx || state.muted || state.paused) return;
      var p = playerState || {};
      var phys = (carSpec && carSpec.physics) || {};
      var now = state.ctx.currentTime || 0;

      var idleRpm = finiteOr(phys.idleRpm, 900);
      var maxRpm = finiteOr(phys.maxRpm, 8000);
      var pitchMult = finiteOr(phys.enginePitchMult, finiteOr(p.enginePitchMult, 1.0));
      var rpm = finiteOr(p.rpm, idleRpm);
      var normRpm = clamp((rpm - idleRpm) / Math.max(1, maxRpm - idleRpm), 0, 1);

      var baseFreq = (42 + normRpm * 150) * pitchMult;
      if (state.engineOsc1) setParamSmooth(state.engineOsc1.frequency, baseFreq, now, 0.03);
      if (state.engineOsc2) setParamSmooth(state.engineOsc2.frequency, baseFreq * 1.98, now, 0.03);
      if (state.engineFilter) {
        setParamSmooth(state.engineFilter.frequency, 280 + normRpm * 2400, now, 0.04);
      }
      if (state.engineGain) {
        var engVol = 0.14 + normRpm * 0.14 + (p.isNitroActive ? 0.05 : 0);
        setParamSmooth(state.engineGain.gain, engVol, now, 0.04);
      }

      // Tire screech based on slip angle & speed
      var speedKmh = finiteOr(p.speedKmh, 0);
      var slipDeg = Math.abs(finiteOr(p.slipAngleDeg, 0));
      var driftIntensity = 0;
      if (p.isDrifting || (speedKmh > 20 && slipDeg > 11)) {
        driftIntensity = clamp((slipDeg - 8) / 28, 0, 1) * clamp(speedKmh / 45, 0.25, 1);
      }
      if (state.screechGain) {
        setParamSmooth(state.screechGain.gain, driftIntensity * 0.22, now, 0.04);
      }
      if (state.screechFilter) {
        setParamSmooth(state.screechFilter.frequency, 1100 + driftIntensity * 450, now, 0.05);
      }

      // Nitro whoosh
      var nitroOn = !!p.isNitroActive;
      if (state.nitroGain) {
        setParamSmooth(state.nitroGain.gain, nitroOn ? 0.20 : 0.0, now, 0.04);
      }
      if (state.nitroFilter) {
        setParamSmooth(state.nitroFilter.frequency, nitroOn ? 1400 : 500, now, 0.06);
      }
    }

    function playTone(freqStart, freqEnd, durationSec, type, gainVal, delaySec) {
      if (!state.ctx || !state.masterGain || state.muted || state.paused) return;
      try {
        var ctx = state.ctx;
        var start = (ctx.currentTime || 0) + (delaySec || 0);
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freqStart, start);
        if (freqEnd && freqEnd !== freqStart && typeof osc.frequency.exponentialRampToValueAtTime === 'function') {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + durationSec);
        }
        g.gain.setValueAtTime(0.0001, start);
        if (typeof g.gain.linearRampToValueAtTime === 'function') {
          g.gain.linearRampToValueAtTime(gainVal, start + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);
        }
        osc.connect(g);
        g.connect(state.masterGain);
        osc.start(start);
        osc.stop(start + durationSec + 0.02);
      } catch (e) {
        // Ignore SFX synth error
      }
    }

    function playNoiseBurst(durationSec, filterFreq, gainVal) {
      if (!state.ctx || !state.masterGain || !state.noiseBuffer || state.muted || state.paused) return;
      if (typeof state.ctx.createBufferSource !== 'function') return;
      try {
        var ctx = state.ctx;
        var now = ctx.currentTime || 0;
        var src = ctx.createBufferSource();
        src.buffer = state.noiseBuffer;

        var filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq || 420;

        var g = ctx.createGain();
        g.gain.setValueAtTime(gainVal, now);
        if (typeof g.gain.exponentialRampToValueAtTime === 'function') {
          g.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
        }

        src.connect(filter);
        filter.connect(g);
        g.connect(state.masterGain);
        src.start(now);
        src.stop(now + durationSec + 0.02);
      } catch (e) {
        // Ignore burst error
      }
    }

    function triggerEvent(event) {
      if (!event || !event.type || !state.ctx || state.muted || state.paused) return;
      switch (event.type) {
        case 'gear_shift':
          playTone(170, 95, 0.075, 'triangle', 0.16, 0);
          break;
        case 'speed_trap':
          playTone(event.isRecord ? 880 : 660, event.isRecord ? 1320 : 880, 0.14, 'sine', 0.22, 0);
          playTone(event.isRecord ? 1320 : 990, event.isRecord ? 1760 : 1100, 0.18, 'triangle', 0.18, 0.09);
          break;
        case 'target_smash':
          playNoiseBurst(0.14, 1800, 0.18);
          playTone(587, 880, 0.11, 'triangle', 0.20, 0);
          playTone(880, 1175, 0.16, 'sine', 0.22, 0.07);
          break;
        case 'drift_bank':
          playTone(440, 554, 0.12, 'triangle', 0.18, 0);
          playTone(554, 659, 0.12, 'triangle', 0.18, 0.08);
          playTone(659, 880, 0.18, 'sine', 0.20, 0.16);
          break;
        case 'drift_fail':
          playTone(220, 110, 0.24, 'sawtooth', 0.16, 0);
          break;
        case 'collision': {
          var strength = clamp(finiteOr(event.impactMs, 5) / 18, 0.25, 1.0);
          playNoiseBurst(0.18, 360 + strength * 400, 0.28 * strength);
          playTone(130, 48, 0.16, 'sine', 0.25 * strength, 0);
          break;
        }
        default:
          break;
      }
    }

    function setMuted(muted) {
      state.muted = !!muted;
      safeStorageSet(state.storage, STORAGE_MUTE_KEY, state.muted ? 'true' : 'false');
      applyMasterGain();
      return state.muted;
    }

    function toggleMute() {
      return setMuted(!state.muted);
    }

    function isMuted() {
      return !!state.muted;
    }

    function setAppPaused(paused) {
      state.paused = !!paused;
      applyMasterGain();
      if (state.ctx) {
        try {
          if (state.paused && typeof state.ctx.suspend === 'function') {
            var sp = state.ctx.suspend();
            if (sp && typeof sp.catch === 'function') sp.catch(function () {});
          } else if (!state.paused && typeof state.ctx.resume === 'function') {
            var rp = state.ctx.resume();
            if (rp && typeof rp.catch === 'function') rp.catch(function () {});
          }
        } catch (e) {
          // Ignore lifecycle suspend/resume errors
        }
      }
      return state.paused;
    }

    function getDebugState() {
      return {
        initialized: state.initialized,
        unlocked: state.unlocked,
        muted: state.muted,
        paused: state.paused,
        hasContext: !!state.ctx
      };
    }

    return {
      init: init,
      unlock: unlock,
      updateContinuous: updateContinuous,
      triggerEvent: triggerEvent,
      setMuted: setMuted,
      toggleMute: toggleMute,
      isMuted: isMuted,
      setAppPaused: setAppPaused,
      getDebugState: getDebugState
    };
  }

  var singleton = createAudioEngine();
  singleton.createAudioEngine = createAudioEngine;
  return singleton;
});
