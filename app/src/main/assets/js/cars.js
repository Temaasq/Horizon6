(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.H6 = root.H6 || {};
    var api = factory();
    root.H6.CARS = api.CARS;
    root.H6.Cars = api;
    root.H6.getCarById = api.getCarById;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CARS = Array.from([
    {
      id: 'skyline_gtr',
      nameRu: 'Мерседес-Бенц C63 AMG',
      subtitleRu: 'W204 · Токио Ночь',
      categoryRu: 'AMG Спорт-купе',
      bodyStyle: 'coupe',
      colors: {
        primary: '#8f9aa8',
        secondary: '#1d222b',
        accent: '#00e5ff',
        caliper: '#ff2e7e'
      },
      statsDisplay: {
        speed: 84,
        accel: 82,
        grip: 80,
        drift: 76,
        offroad: 48
      },
      dimensions: {
        length: 4.60,
        width: 1.84,
        height: 1.36,
        wheelbase: 2.67,
        wheelRadius: 0.34,
        clearance: 0.14
      },
      camera: {
        hoodY: 1.20,
        hoodZ: -0.82,
        chaseDist: 7.2,
        chaseHeight: 2.6
      },
      physics: {
        mass: 1560,
        maxSpeedKmh: 285,
        topSpeed: 285,
        reverseMaxKmh: 65,
        engineForce: 24.5,
        brakeForce: 36.0,
        lateralGrip: 1.05,
        driftSlip: 0.72,
        offRoadGrip: 0.58,
        steerRate: 1.00,
        drivetrain: 'AWD',
        gearRatios: [3.82, 2.36, 1.68, 1.31, 1.00, 0.79],
        finalDrive: 3.54,
        idleRpm: 950,
        redlineRpm: 7200,
        maxRpm: 7800,
        nitroBoost: 1.32,
        enginePitchMult: 1.00
      }
    },
    {
      id: 'rx7_drift',
      nameRu: 'Мазда RX-7 FD',
      subtitleRu: 'Хаконэ Дрифт',
      categoryRu: 'Роторный дрифт',
      bodyStyle: 'fastback',
      colors: {
        primary: '#ff4d1a',
        secondary: '#141418',
        accent: '#ffd000',
        caliper: '#ffd000'
      },
      statsDisplay: {
        speed: 76,
        accel: 78,
        grip: 68,
        drift: 96,
        offroad: 35
      },
      dimensions: {
        length: 4.30,
        width: 1.82,
        height: 1.24,
        wheelbase: 2.43,
        wheelRadius: 0.33,
        clearance: 0.12
      },
      camera: {
        hoodY: 1.12,
        hoodZ: -0.50,
        chaseDist: 7.0,
        chaseHeight: 2.5
      },
      physics: {
        mass: 1280,
        maxSpeedKmh: 255,
        topSpeed: 255,
        reverseMaxKmh: 60,
        engineForce: 22.8,
        brakeForce: 33.0,
        lateralGrip: 0.88,
        driftSlip: 0.48,
        offRoadGrip: 0.45,
        steerRate: 1.12,
        drivetrain: 'RWD',
        gearRatios: [3.48, 2.02, 1.39, 1.00, 0.76],
        finalDrive: 4.10,
        idleRpm: 1100,
        redlineRpm: 8200,
        maxRpm: 8800,
        nitroBoost: 1.30,
        enginePitchMult: 1.28
      }
    },
    {
      id: 'evo_touge',
      nameRu: 'Лансер Evo IX',
      subtitleRu: 'Тоугэ Ралли',
      categoryRu: 'Полный привод ралли',
      bodyStyle: 'sedan',
      colors: {
        primary: '#f2f5f8',
        secondary: '#1c2026',
        accent: '#ff2e7e',
        caliper: '#ff2e7e'
      },
      statsDisplay: {
        speed: 74,
        accel: 88,
        grip: 94,
        drift: 78,
        offroad: 86
      },
      dimensions: {
        length: 4.49,
        width: 1.81,
        height: 1.45,
        wheelbase: 2.63,
        wheelRadius: 0.34,
        clearance: 0.17
      },
      camera: {
        hoodY: 1.24,
        hoodZ: -0.52,
        chaseDist: 7.2,
        chaseHeight: 2.65
      },
      physics: {
        mass: 1410,
        maxSpeedKmh: 245,
        topSpeed: 245,
        reverseMaxKmh: 60,
        engineForce: 26.2,
        brakeForce: 38.0,
        lateralGrip: 1.18,
        driftSlip: 0.68,
        offRoadGrip: 0.88,
        steerRate: 1.06,
        drivetrain: 'AWD',
        gearRatios: [3.63, 2.37, 1.69, 1.30, 1.01, 0.81],
        finalDrive: 4.53,
        idleRpm: 950,
        redlineRpm: 7200,
        maxRpm: 7800,
        nitroBoost: 1.28,
        enginePitchMult: 1.10
      }
    },
    {
      id: 'lfa_hyper',
      nameRu: 'Лексус LFA GT',
      subtitleRu: 'Сибуя Апекс',
      categoryRu: 'Японский гиперкар',
      bodyStyle: 'hyper',
      colors: {
        primary: '#14161c',
        secondary: '#262933',
        accent: '#f5b800',
        caliper: '#f5b800'
      },
      statsDisplay: {
        speed: 99,
        accel: 96,
        grip: 90,
        drift: 70,
        offroad: 24
      },
      dimensions: {
        length: 4.51,
        width: 1.92,
        height: 1.16,
        wheelbase: 2.61,
        wheelRadius: 0.34,
        clearance: 0.10
      },
      camera: {
        hoodY: 1.04,
        hoodZ: -0.60,
        chaseDist: 7.4,
        chaseHeight: 2.45
      },
      physics: {
        mass: 1480,
        maxSpeedKmh: 340,
        topSpeed: 340,
        reverseMaxKmh: 72,
        engineForce: 28.5,
        brakeForce: 42.0,
        lateralGrip: 1.12,
        driftSlip: 0.64,
        offRoadGrip: 0.35,
        steerRate: 1.04,
        drivetrain: 'RWD',
        gearRatios: [3.23, 2.19, 1.61, 1.23, 0.97, 0.78],
        finalDrive: 3.42,
        idleRpm: 1050,
        redlineRpm: 8800,
        maxRpm: 9400,
        nitroBoost: 1.40,
        enginePitchMult: 1.45
      }
    },
    {
      id: 'jimny_raid',
      nameRu: 'Сузуки Джимни Рейд',
      subtitleRu: 'Тропа Фудзи',
      categoryRu: 'Внедорожник 4x4',
      bodyStyle: 'suv',
      colors: {
        primary: '#7b8c5a',
        secondary: '#222629',
        accent: '#ff9d00',
        caliper: '#ff9d00'
      },
      statsDisplay: {
        speed: 56,
        accel: 64,
        grip: 72,
        drift: 60,
        offroad: 98
      },
      dimensions: {
        length: 3.85,
        width: 1.78,
        height: 1.78,
        wheelbase: 2.35,
        wheelRadius: 0.45,
        clearance: 0.28
      },
      camera: {
        hoodY: 1.54,
        hoodZ: -0.40,
        chaseDist: 7.5,
        chaseHeight: 3.0
      },
      physics: {
        mass: 1750,
        maxSpeedKmh: 195,
        topSpeed: 195,
        reverseMaxKmh: 52,
        engineForce: 19.5,
        brakeForce: 30.0,
        lateralGrip: 0.84,
        driftSlip: 0.75,
        offRoadGrip: 0.96,
        steerRate: 0.94,
        drivetrain: '4WD',
        gearRatios: [4.10, 2.52, 1.67, 1.18, 0.88],
        finalDrive: 4.30,
        idleRpm: 850,
        redlineRpm: 6400,
        maxRpm: 7000,
        nitroBoost: 1.25,
        enginePitchMult: 0.82
      }
    }
  ]);

  function getCarById(id) {
    for (var i = 0; i < CARS.length; i++) {
      if (CARS[i].id === id) {
        return CARS[i];
      }
    }
    return null;
  }

  function resolveCar(id) {
    return getCarById(id) || CARS[0];
  }

  return {
    CARS: CARS,
    DEFAULT_CAR_ID: CARS[0].id,
    getCarById: getCarById,
    resolveCar: resolveCar
  };
});
