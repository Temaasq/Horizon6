(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var Cars = require('./cars.js');
    var WorldData = require('./world_data.js');
    module.exports = factory(Cars, WorldData);
  } else {
    root.H6 = root.H6 || {};
    var CarsGlobal = root.H6.Cars || { CARS: root.H6.CARS, getCarById: root.H6.getCarById };
    root.H6.HUD = factory(CarsGlobal, root.H6.WorldData);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Cars, WorldData) {
  'use strict';

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function formatNumberRu(n) {
    var num = Math.round(Number.isFinite(n) ? n : 0);
    var sign = num < 0 ? '-' : '';
    var s = String(Math.abs(num));
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) {
        out += ' ';
      }
      out += s[i];
    }
    return sign + out;
  }

  function formatGearLabel(gear) {
    if (gear === -1) return 'R';
    if (gear === 0) return 'N';
    return String(Math.max(1, Math.round(gear || 1)));
  }

  function formatEventBanner(ev) {
    if (!ev || !ev.type) return null;
    if (ev.type === 'speed_trap') {
      var recTag = ev.isRecord ? ' — НОВЫЙ РЕКОРД!' : '';
      return {
        text: 'РАДАР «' + (ev.nameRu || 'СКОРОСТЬ') + '»: ' + Math.round(ev.speedKmh || 0) + ' КМ/Ч' + recTag + ' (+' + formatNumberRu(ev.cr || 0) + ' CR)',
        tone: ev.isRecord ? 'banner-gold' : 'banner-cyan',
        duration: 2.8
      };
    }
    if (ev.type === 'target_smash') {
      return {
        text: 'СТЕНД РАЗБИТ! (' + (ev.smashedCount || 0) + '/' + (ev.totalTargets || 24) + ') +' + formatNumberRu(ev.valueCr || 0) + ' CR',
        tone: 'banner-pink',
        duration: 2.5
      };
    }
    if (ev.type === 'drift_bank') {
      return {
        text: 'ДРИФТ ЗАСЧИТАН! ' + formatNumberRu(ev.points || 0) + ' ×' + (ev.multiplier || 1) + ' (+' + formatNumberRu(ev.cr || 0) + ' CR)',
        tone: 'banner-gold',
        duration: 2.6
      };
    }
    if (ev.type === 'drift_fail') {
      return {
        text: 'СЕРИЯ СОРВАНА! (-' + formatNumberRu(ev.lostPoints || 0) + ')',
        tone: 'banner-warn',
        duration: 2.0
      };
    }
    return null;
  }

  /**
   * Projects world (wx, wz) relative to player (px, pz, heading) onto rotating minimap canvas.
   * heading = 0 faces -Z (up on canvas).
   */
  function projectMinimapPoint(wx, wz, px, pz, heading, cx, cy, scale) {
    var dx = wx - px;
    var dz = wz - pz;
    var cosH = Math.cos(heading);
    var sinH = Math.sin(heading);
    return {
      x: cx + (dx * cosH - dz * sinH) * scale,
      y: cy + (dx * sinH + dz * cosH) * scale
    };
  }

  function drawMinimap(ctx, width, height, simState, worldData) {
    if (!ctx || !simState || !simState.player) return;
    var wd = worldData || WorldData;
    var p = simState.player;
    var cx = width * 0.5;
    var cy = height * 0.5;
    var radius = Math.min(cx, cy) - 2;
    var viewMeters = 280;
    var scale = radius / viewMeters;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Base map fill
    ctx.fillStyle = '#0d1320';
    ctx.fillRect(0, 0, width, height);

    // Region zone subtle blobs
    if (wd && wd.FUJI_PEAK) {
      var fp = projectMinimapPoint(wd.FUJI_PEAK.x, wd.FUJI_PEAK.z, p.x, p.z, p.heading, cx, cy, scale);
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, wd.FUJI_PEAK.baseRadius * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(130, 160, 210, 0.16)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fp.x, fp.y, 110 * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(235, 245, 255, 0.25)';
      ctx.fill();
    }

    // Roads
    var roads = (wd && wd.ROADS) || [];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var r = 0; r < roads.length; r++) {
      var road = roads[r];
      if (!road.points || road.points.length < 2) continue;
      ctx.beginPath();
      for (var i = 0; i < road.points.length; i++) {
        var pt = projectMinimapPoint(road.points[i].x, road.points[i].z, p.x, p.z, p.heading, cx, cy, scale);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = road.surface === 'dirt' ? '#7a5c3c' : '#4a5772';
      ctx.lineWidth = Math.max(2.5, (road.halfWidth || 9) * 1.45 * scale);
      ctx.stroke();
    }

    // Speed traps (cyan squares/diamonds)
    var traps = (wd && wd.SPEED_TRAPS) || [];
    ctx.fillStyle = '#00e5ff';
    for (var t = 0; t < traps.length; t++) {
      var tp = projectMinimapPoint(traps[t].x, traps[t].z, p.x, p.z, p.heading, cx, cy, scale);
      ctx.fillRect(tp.x - 3, tp.y - 3, 6, 6);
    }

    // Uncollected bonus boards (magenta dots)
    var targets = simState.targets || [];
    ctx.fillStyle = '#ff2e7e';
    for (var b = 0; b < targets.length; b++) {
      if (targets[b].collected) continue;
      var bp = projectMinimapPoint(targets[b].x, targets[b].z, p.x, p.z, p.heading, cx, cy, scale);
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // AI traffic & rivals
    var aiList = simState.aiTraffic || [];
    for (var a = 0; a < aiList.length; a++) {
      var ai = aiList[a];
      var ap = projectMinimapPoint(ai.x, ai.z, p.x, p.z, p.heading, cx, cy, scale);
      ctx.beginPath();
      ctx.arc(ap.x, ap.y, ai.isRival ? 3.2 : 2.3, 0, Math.PI * 2);
      ctx.fillStyle = ai.isRival ? '#ffd000' : '#cfd8dc';
      ctx.fill();
    }

    // Centered player chevron arrow pointing up
    ctx.fillStyle = '#00f5ff';
    ctx.strokeStyle = '#070b14';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx + 5.5, cy + 5.5);
    ctx.lineTo(cx, cy + 2.5);
    ctx.lineTo(cx - 5.5, cy + 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  function createHUD(options) {
    var opts = options || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var carsList = (Cars && Cars.CARS) || [];

    function byId(id) {
      return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
    }

    var dom = {
      minimapCanvas: byId('minimap-canvas'),
      regionPill: byId('hud-region-pill'),
      driftBanner: byId('drift-banner'),
      driftMult: byId('drift-banner-mult'),
      driftPts: byId('drift-banner-pts'),
      eventBanner: byId('event-banner'),
      toastBanner: byId('toast-banner'),
      crText: byId('hud-cr'),
      recordText: byId('hud-record'),
      boardsText: byId('hud-boards'),
      speedText: byId('hud-speed'),
      gearText: byId('hud-gear'),
      transBadge: byId('hud-trans-badge'),
      rpmBar: byId('hud-rpm-bar'),
      nitroBar: byId('hud-nitro-bar'),
      carName: byId('hud-car-name'),

      steerWheelWrap: byId('steer-wheel-wrap'),
      steerWheel: byId('steer-wheel'),
      steerButtonsWrap: byId('steer-buttons-wrap'),
      gyroIndicator: byId('gyro-indicator'),
      gyroBarDot: byId('gyro-bar-dot'),
      mtShifter: byId('mt-shifter'),

      btnGarage: byId('btn-garage'),
      btnCamera: byId('btn-camera'),
      btnMute: byId('btn-mute'),
      btnReset: byId('btn-reset'),
      btnSettings: byId('btn-settings'),
      btnQuickCalibrate: byId('btn-quick-calibrate'),

      modalGarage: byId('modal-garage'),
      garageGrid: byId('garage-grid'),
      btnCloseGarage: byId('btn-close-garage'),

      modalSettings: byId('modal-settings'),
      btnCloseSettings: byId('btn-close-settings'),
      optSteerWheel: byId('opt-steer-wheel'),
      optSteerButtons: byId('opt-steer-buttons'),
      optSteerGyro: byId('opt-steer-gyro'),
      btnCalibrateGyro: byId('btn-calibrate-gyro'),
      rowGyroCalibrate: byId('row-gyro-calibrate'),
      optTransAt: byId('opt-trans-at'),
      optTransMt: byId('opt-trans-mt'),
      optCamChase: byId('opt-cam-chase'),
      optCamHood: byId('opt-cam-hood'),
      optSoundToggle: byId('opt-sound-toggle'),
      btnSettingsReset: byId('btn-settings-reset'),

      modalExit: byId('modal-exit'),
      btnExitCancel: byId('btn-exit-cancel'),
      btnExitConfirm: byId('btn-exit-confirm')
    };

    var minimapCtx = null;
    if (dom.minimapCanvas && typeof dom.minimapCanvas.getContext === 'function') {
      minimapCtx = dom.minimapCanvas.getContext('2d');
    }

    var uiState = {
      openModal: null, // null | 'garage' | 'settings' | 'exit'
      eventTimer: 0,
      toastTimer: 0,
      lastRenderedCarId: null,
      lastSteerMode: null,
      lastTransMode: null
    };

    function setHidden(el, hidden) {
      if (!el || !el.classList) return;
      if (hidden) el.classList.add('hidden');
      else el.classList.remove('hidden');
    }

    function setActiveClass(el, active) {
      if (!el || !el.classList) return;
      if (active) el.classList.add('active');
      else el.classList.remove('active');
    }

    function openModal(name) {
      uiState.openModal = name || null;
      setHidden(dom.modalGarage, name !== 'garage');
      setHidden(dom.modalSettings, name !== 'settings');
      setHidden(dom.modalExit, name !== 'exit');
      if (typeof opts.onModalChange === 'function') {
        opts.onModalChange(uiState.openModal);
      }
    }

    function closeModals() {
      openModal(null);
    }

    function isAnyModalOpen() {
      return uiState.openModal !== null;
    }

    function getOpenModal() {
      return uiState.openModal;
    }

    function showToast(textRu, durationSec) {
      if (!dom.toastBanner) return;
      dom.toastBanner.textContent = textRu || '';
      setHidden(dom.toastBanner, !textRu);
      uiState.toastTimer = textRu ? (durationSec || 2.2) : 0;
    }

    function pushEvent(ev) {
      var banner = formatEventBanner(ev);
      if (!banner || !dom.eventBanner) return;
      dom.eventBanner.textContent = banner.text;
      if (dom.eventBanner.classList) {
        dom.eventBanner.classList.remove('hidden', 'banner-cyan', 'banner-gold', 'banner-pink', 'banner-warn');
        dom.eventBanner.classList.add(banner.tone);
      }
      uiState.eventTimer = banner.duration;
    }

    function buildStatRow(label, value) {
      var row = doc.createElement('div');
      row.className = 'stat-row';
      var lbl = doc.createElement('span');
      lbl.className = 'stat-label';
      lbl.textContent = label;
      var bg = doc.createElement('div');
      bg.className = 'stat-bar-bg';
      var fill = doc.createElement('div');
      fill.className = 'stat-bar-fill';
      fill.style.width = clamp(value || 0, 0, 100) + '%';
      bg.appendChild(fill);
      row.appendChild(lbl);
      row.appendChild(bg);
      return row;
    }

    function renderGarageCards(activeCarId) {
      if (!dom.garageGrid || !doc || typeof doc.createElement !== 'function') return;
      dom.garageGrid.innerHTML = '';
      for (var i = 0; i < carsList.length; i++) {
        (function (car) {
          var isSelected = car.id === activeCarId;
          var card = doc.createElement('div');
          card.className = 'car-card' + (isSelected ? ' selected' : '');
          card.setAttribute('data-car-id', car.id);

          var top = doc.createElement('div');
          top.className = 'car-card-top';

          var titleWrap = doc.createElement('div');
          var nameEl = doc.createElement('div');
          nameEl.className = 'car-name';
          nameEl.textContent = car.nameRu;
          var subEl = doc.createElement('div');
          subEl.className = 'car-sub';
          subEl.textContent = car.subtitleRu + ' · ' + car.categoryRu;
          titleWrap.appendChild(nameEl);
          titleWrap.appendChild(subEl);

          var rightMeta = doc.createElement('div');
          rightMeta.style.display = 'flex';
          rightMeta.style.alignItems = 'center';
          rightMeta.style.gap = '6px';

          var badge = doc.createElement('span');
          badge.className = 'car-badge';
          badge.textContent = car.physics.drivetrain;

          var swatch = doc.createElement('div');
          swatch.className = 'car-swatch';
          swatch.style.background = car.colors.primary;

          rightMeta.appendChild(badge);
          rightMeta.appendChild(swatch);
          top.appendChild(titleWrap);
          top.appendChild(rightMeta);
          card.appendChild(top);

          var st = car.statsDisplay || {};
          card.appendChild(buildStatRow('Скорость', st.speed));
          card.appendChild(buildStatRow('Разгон', st.accel));
          card.appendChild(buildStatRow('Сцепление', st.grip));
          card.appendChild(buildStatRow('Дрифт', st.drift));
          card.appendChild(buildStatRow('Бездорожье', st.offroad));

          var btn = doc.createElement('button');
          btn.type = 'button';
          btn.className = 'car-select-btn';
          btn.textContent = isSelected ? 'Выбрано' : 'Выбрать';
          btn.addEventListener('click', function () {
            if (typeof opts.onSelectCar === 'function') {
              opts.onSelectCar(car.id);
            }
            renderGarageCards(car.id);
            closeModals();
          });
          card.appendChild(btn);

          dom.garageGrid.appendChild(card);
        })(carsList[i]);
      }
      uiState.lastRenderedCarId = activeCarId;
    }

    function syncSettingsUI(controlsState, audioMuted) {
      if (!controlsState) return;
      var sm = controlsState.steerMode;
      var tm = controlsState.transmissionMode;
      var cm = controlsState.cameraMode;

      setActiveClass(dom.optSteerWheel, sm === 'wheel');
      setActiveClass(dom.optSteerButtons, sm === 'buttons');
      setActiveClass(dom.optSteerGyro, sm === 'gyro');
      setHidden(dom.rowGyroCalibrate, sm !== 'gyro');

      setActiveClass(dom.optTransAt, tm === 'AT');
      setActiveClass(dom.optTransMt, tm === 'MT');

      setActiveClass(dom.optCamChase, cm === 'chase');
      setActiveClass(dom.optCamHood, cm === 'hood');

      if (dom.optSoundToggle) {
        dom.optSoundToggle.textContent = audioMuted ? 'Выкл' : 'Вкл';
        setActiveClass(dom.optSoundToggle, !audioMuted);
      }
      if (dom.btnMute && dom.btnMute.classList) {
        dom.btnMute.textContent = audioMuted ? 'Без звука' : 'Звук';
        if (audioMuted) dom.btnMute.classList.add('muted-on');
        else dom.btnMute.classList.remove('muted-on');
      }
      if (dom.btnCamera) {
        dom.btnCamera.textContent = cm === 'hood' ? 'Капот' : '3-е лицо';
      }

      // Toggle on-screen steering controls visibility
      setHidden(dom.steerWheelWrap, sm !== 'wheel');
      setHidden(dom.steerButtonsWrap, sm !== 'buttons');
      setHidden(dom.gyroIndicator, sm !== 'gyro');
      setHidden(dom.mtShifter, tm !== 'MT');
      if (dom.transBadge) {
        dom.transBadge.textContent = tm === 'MT' ? 'МКПП' : 'АКПП';
      }
      uiState.lastSteerMode = sm;
      uiState.lastTransMode = tm;
    }

    function bindEvents() {
      if (dom.btnGarage) {
        dom.btnGarage.addEventListener('click', function () {
          renderGarageCards(uiState.lastRenderedCarId || (Cars && Cars.DEFAULT_CAR_ID));
          openModal(uiState.openModal === 'garage' ? null : 'garage');
        });
      }
      if (dom.btnCloseGarage) {
        dom.btnCloseGarage.addEventListener('click', closeModals);
      }
      if (dom.btnSettings) {
        dom.btnSettings.addEventListener('click', function () {
          openModal(uiState.openModal === 'settings' ? null : 'settings');
        });
      }
      if (dom.btnCloseSettings) {
        dom.btnCloseSettings.addEventListener('click', closeModals);
      }
      if (dom.btnCamera) {
        dom.btnCamera.addEventListener('click', function () {
          if (typeof opts.onToggleCamera === 'function') opts.onToggleCamera();
        });
      }
      if (dom.btnMute) {
        dom.btnMute.addEventListener('click', function () {
          if (typeof opts.onToggleMute === 'function') opts.onToggleMute();
        });
      }
      if (dom.btnReset) {
        dom.btnReset.addEventListener('click', function () {
          if (typeof opts.onResetPlayer === 'function') opts.onResetPlayer();
        });
      }
      if (dom.transBadge) {
        dom.transBadge.addEventListener('click', function () {
          if (typeof opts.onToggleTransmission === 'function') opts.onToggleTransmission();
        });
      }

      // Settings modal buttons
      if (dom.optSteerWheel) {
        dom.optSteerWheel.addEventListener('click', function () {
          if (typeof opts.onSteerModeChange === 'function') opts.onSteerModeChange('wheel');
        });
      }
      if (dom.optSteerButtons) {
        dom.optSteerButtons.addEventListener('click', function () {
          if (typeof opts.onSteerModeChange === 'function') opts.onSteerModeChange('buttons');
        });
      }
      if (dom.optSteerGyro) {
        dom.optSteerGyro.addEventListener('click', function () {
          if (typeof opts.onSteerModeChange === 'function') opts.onSteerModeChange('gyro');
        });
      }
      if (dom.btnCalibrateGyro) {
        dom.btnCalibrateGyro.addEventListener('click', function () {
          if (typeof opts.onCalibrateGyro === 'function') opts.onCalibrateGyro();
        });
      }
      if (dom.btnQuickCalibrate) {
        dom.btnQuickCalibrate.addEventListener('click', function () {
          if (typeof opts.onCalibrateGyro === 'function') opts.onCalibrateGyro();
        });
      }
      if (dom.optTransAt) {
        dom.optTransAt.addEventListener('click', function () {
          if (typeof opts.onTransmissionChange === 'function') opts.onTransmissionChange('AT');
        });
      }
      if (dom.optTransMt) {
        dom.optTransMt.addEventListener('click', function () {
          if (typeof opts.onTransmissionChange === 'function') opts.onTransmissionChange('MT');
        });
      }
      if (dom.optCamChase) {
        dom.optCamChase.addEventListener('click', function () {
          if (typeof opts.onCameraChange === 'function') opts.onCameraChange('chase');
        });
      }
      if (dom.optCamHood) {
        dom.optCamHood.addEventListener('click', function () {
          if (typeof opts.onCameraChange === 'function') opts.onCameraChange('hood');
        });
      }
      if (dom.optSoundToggle) {
        dom.optSoundToggle.addEventListener('click', function () {
          if (typeof opts.onToggleMute === 'function') opts.onToggleMute();
        });
      }
      if (dom.btnSettingsReset) {
        dom.btnSettingsReset.addEventListener('click', function () {
          if (typeof opts.onResetPlayer === 'function') opts.onResetPlayer();
          closeModals();
        });
      }

      // Exit modal
      if (dom.btnExitCancel) {
        dom.btnExitCancel.addEventListener('click', closeModals);
      }
      if (dom.btnExitConfirm) {
        dom.btnExitConfirm.addEventListener('click', function () {
          if (typeof opts.onExitConfirmed === 'function') opts.onExitConfirmed();
        });
      }
    }

    function update(simState, controlsState, audioMuted, dt) {
      if (!simState || !simState.player) return;
      var p = simState.player;
      var sc = simState.scoring || {};
      var activeCar = (Cars && typeof Cars.getCarById === 'function') ? Cars.getCarById(simState.activeCarId) : null;

      if (uiState.eventTimer > 0) {
        uiState.eventTimer -= dt || 0;
        if (uiState.eventTimer <= 0) {
          setHidden(dom.eventBanner, true);
        }
      }
      if (uiState.toastTimer > 0) {
        uiState.toastTimer -= dt || 0;
        if (uiState.toastTimer <= 0) {
          setHidden(dom.toastBanner, true);
        }
      }

      if (dom.speedText) dom.speedText.textContent = String(Math.round(p.speedKmh || 0));
      if (dom.gearText) dom.gearText.textContent = formatGearLabel(p.gear);
      if (dom.regionPill) dom.regionPill.textContent = p.regionNameRu || 'ЯПОНИЯ';
      if (dom.carName && activeCar) dom.carName.textContent = activeCar.nameRu;

      if (dom.crText) dom.crText.textContent = formatNumberRu(sc.cr || 0) + ' CR';
      if (dom.recordText) dom.recordText.textContent = 'РЕКОРД: ' + Math.round(sc.speedTrapBestKmh || 0) + ' КМ/Ч';
      if (dom.boardsText) dom.boardsText.textContent = (sc.smashedCount || 0) + '/' + (sc.totalTargets || 24);

      if (dom.rpmBar && activeCar && activeCar.physics) {
        var idle = activeCar.physics.idleRpm || 900;
        var maxRpm = activeCar.physics.maxRpm || 8000;
        var rpmPct = clamp(((p.rpm || idle) - idle) / Math.max(1, maxRpm - idle) * 100, 0, 100);
        dom.rpmBar.style.width = rpmPct.toFixed(1) + '%';
      }
      if (dom.nitroBar) {
        dom.nitroBar.style.width = clamp(p.nitro || 0, 0, 100).toFixed(1) + '%';
      }

      // Live drift chain pill
      if (dom.driftBanner) {
        var pts = Math.round(sc.driftPoints || 0);
        if (pts > 10) {
          setHidden(dom.driftBanner, false);
          if (dom.driftMult) dom.driftMult.textContent = 'x' + (sc.driftMultiplier || 1);
          if (dom.driftPts) dom.driftPts.textContent = formatNumberRu(pts);
        } else {
          setHidden(dom.driftBanner, true);
        }
      }

      // Update steering wheel visual & gyro bar
      if (controlsState) {
        if (dom.steerWheel && controlsState.steerMode === 'wheel') {
          dom.steerWheel.style.transform = 'rotate(' + (controlsState.wheelAngleDeg || 0).toFixed(1) + 'deg)';
        }
        if (dom.gyroBarDot && controlsState.steerMode === 'gyro') {
          var pct = 50 - clamp(controlsState.steer || 0, -1, 1) * 44;
          dom.gyroBarDot.style.left = pct.toFixed(1) + '%';
        }
        if (uiState.lastSteerMode !== controlsState.steerMode || uiState.lastTransMode !== controlsState.transmissionMode) {
          syncSettingsUI(controlsState, audioMuted);
        }
      }

      if (uiState.lastRenderedCarId !== simState.activeCarId) {
        uiState.lastRenderedCarId = simState.activeCarId;
      }

      if (minimapCtx && dom.minimapCanvas) {
        drawMinimap(minimapCtx, dom.minimapCanvas.width, dom.minimapCanvas.height, simState, WorldData);
      }
    }

    bindEvents();

    return {
      dom: dom,
      renderGarageCards: renderGarageCards,
      syncSettingsUI: syncSettingsUI,
      openModal: openModal,
      closeModals: closeModals,
      isAnyModalOpen: isAnyModalOpen,
      getOpenModal: getOpenModal,
      pushEvent: pushEvent,
      showToast: showToast,
      update: update
    };
  }

  return {
    formatNumberRu: formatNumberRu,
    formatGearLabel: formatGearLabel,
    formatEventBanner: formatEventBanner,
    projectMinimapPoint: projectMinimapPoint,
    drawMinimap: drawMinimap,
    createHUD: createHUD
  };
});
