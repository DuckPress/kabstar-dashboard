/* Simulated tide data for the nine demo stations (a sine-wave tide plus noise),
   so the dashboard has something to show besides the one real station. */

import { MYT_OFFSET_MS, STATIONS } from '../config.js';

/* ═══════════════════════════════════════════════════
   SIMULATE TIDAL DATA (sine-wave + noise)
═══════════════════════════════════════════════════ */
/**
 * generateTidalData — time-anchored simulation
 * ──────────────────────────────────────────────
 * Uses the actual epoch time for every sample point so that as real wall-clock
 * time advances the tidal curve moves accordingly.  Each call snapshots "now"
 * and builds a 24-hour window ending at that moment.  Because the tidal formula
 * is a pure function of absolute time (no random phase offset per call), the
 * curve is deterministic and continuous: calling the function 10 min later
 * produces a window shifted 10 min to the right — no jumps.
 *
 * Noise is seeded from the epoch-minute so it is stable within the same minute
 * but varies across minutes (good for "live" feel without jarring resets).
 */
function generateTidalData(stationIndex, points = 144) {
  const s = STATIONS[stationIndex];
  const now = Date.now();
  // Snap "now" to the nearest 10-min boundary for label stability
  const snapNow = Math.floor(now / (10 * 60 * 1000)) * (10 * 60 * 1000);

  const interval  = 10 * 60 * 1000;  // fixed 10-min step
  const startTime = snapNow - (points - 1) * interval;

  // ── Tidal constituents (angular frequencies in rad/ms) ──────────────────────
  // Based on standard harmonic constituents used in Malaysian coastal waters.
  // Periods sourced from IHO tidal constituent tables.
  const TWO_PI = 2 * Math.PI;
  const HOUR_MS = 3600 * 1000;

  const constituents = [
    // Semi-diurnal (two highs/lows per day) — dominant on west coast Malaysia
    { name: 'M2', period: 12.4206,  ampFactor: 1.000, phaseFactor: 0.00 },  // Principal lunar
    { name: 'S2', period: 12.0000,  ampFactor: 0.350, phaseFactor: 0.80 },  // Principal solar
    { name: 'N2', period: 12.6584,  ampFactor: 0.193, phaseFactor: 0.35 },  // Larger lunar elliptic
    { name: 'K2', period: 11.9672,  ampFactor: 0.095, phaseFactor: 1.20 },  // Lunisolar semi-diurnal

    // Diurnal (one high/low per day) — notable inequality effect
    { name: 'K1', period: 23.9345,  ampFactor: 0.420, phaseFactor: 2.10 },  // Lunisolar diurnal
    { name: 'O1', period: 25.8194,  ampFactor: 0.280, phaseFactor: 1.80 },  // Principal lunar diurnal
    { name: 'P1', period: 24.0659,  ampFactor: 0.140, phaseFactor: 2.50 },  // Principal solar diurnal
    { name: 'Q1', period: 26.8684,  ampFactor: 0.070, phaseFactor: 3.00 },  // Larger lunar elliptic diurnal

    // Long period — spring/neap modulation (~14-day cycle)
    { name: 'Mf', period: 327.86 * 24, ampFactor: 0.042, phaseFactor: 0.50 }, // Lunar fortnightly
    { name: 'Mm', period: 661.30 * 24, ampFactor: 0.022, phaseFactor: 1.10 }, // Lunar monthly

    // Shallow-water overtides — create flood/ebb asymmetry (faster rise than fall)
    { name: 'M4',  period: 6.2103,  ampFactor: 0.028, phaseFactor: 0.60 },  // First overtide of M2
    { name: 'MS4', period: 6.1033,  ampFactor: 0.018, phaseFactor: 1.40 },  // Compound M2+S2
    { name: 'M6',  period: 4.1402,  ampFactor: 0.010, phaseFactor: 0.90 },  // Second overtide
  ];

  // Per-station amplitude scaling — each station has its own tidal regime
  // West coast (Strait of Malacca) is semi-diurnal dominant; east coast & Borneo differ
  const stationProfiles = [
    // S1: Pelabuhan Klang — west coast, strong semi-diurnal, high range
    { semiAmp: 1.00, diurnalAmp: 0.38, shallowAmp: 1.10 },
    // S2: Lumut — west coast, similar to Klang
    { semiAmp: 0.92, diurnalAmp: 0.35, shallowAmp: 1.05 },
    // S3: Klang — west coast
    { semiAmp: 0.98, diurnalAmp: 0.37, shallowAmp: 1.08 },
    // S4: Tg. Pelepas — southern tip, mixed regime
    { semiAmp: 0.82, diurnalAmp: 0.55, shallowAmp: 0.90 },
    // S5: Kuantan — east coast, diurnal dominant, lower range
    { semiAmp: 0.55, diurnalAmp: 0.78, shallowAmp: 0.60 },
    // S6: Kukup — southern Johor, mixed semi-diurnal
    { semiAmp: 0.85, diurnalAmp: 0.52, shallowAmp: 0.95 },
    // S7: Kota Kinabalu — Sabah, mixed diurnal dominant
    { semiAmp: 0.48, diurnalAmp: 0.82, shallowAmp: 0.55 },
    // S8: Sandakan — Sabah east coast, mixed
    { semiAmp: 0.52, diurnalAmp: 0.75, shallowAmp: 0.60 },
    // S9: Kuching — Sarawak, semi-diurnal
    { semiAmp: 0.88, diurnalAmp: 0.42, shallowAmp: 0.80 },
    // S10: Miri — Sarawak, semi-diurnal with diurnal influence
    { semiAmp: 0.78, diurnalAmp: 0.55, shallowAmp: 0.72 },
  ];

  const profile = stationProfiles[stationIndex] || stationProfiles[0];

  // Map constituent type to profile amplitude multiplier
  function getAmpMult(name) {
    if (['M4','MS4','M6'].includes(name))           return profile.shallowAmp * 0.10;
    if (['Mf','Mm'].includes(name))                 return profile.semiAmp * 0.04;
    if (['K1','O1','P1','Q1'].includes(name))       return profile.diurnalAmp;
    return profile.semiAmp;  // semi-diurnal
  }

  const labels     = [];
  const values     = [];
  const timestamps = [];

  for (let i = 0; i < points; i++) {
    const t    = startTime + i * interval;
    // Shift the epoch by +8 h and read UTC parts so the wall-clock is MYT,
    // matching the real station and the dashboard clock on any browser.
    const date = new Date(t + MYT_OFFSET_MS);
    const hhmm = date.getUTCHours().toString().padStart(2, '0') + ':' +
                 date.getUTCMinutes().toString().padStart(2, '0');
    labels.push(hhmm);
    timestamps.push(
      date.getUTCFullYear() + '-' +
      String(date.getUTCMonth()+1).padStart(2,'0') + '-' +
      String(date.getUTCDate()).padStart(2,'0') + 'T' + hhmm
    );

    // Sum all harmonic constituents
    let tide = s.mean;
    for (const c of constituents) {
      const omega = TWO_PI / (c.period * HOUR_MS);
      const amp   = s.amp * c.ampFactor * getAmpMult(c.name);
      tide += amp * Math.cos(omega * t - (s.phase + c.phaseFactor));
    }

    // Small deterministic sensor noise (±0.008 m — realistic for ultrasonic)
    const seed      = Math.floor(t / 60000) * 31 + stationIndex * 7919;
    const noiseSeed = (Math.sin(seed) * 43758.5453) % 1;
    const noise     = (noiseSeed - 0.5) * 0.016;

    values.push(Math.round(Math.max(0.05, tide + noise) * 1000) / 1000);
  }

  // Simulate temperature (°C): diurnal cycle 28–36°C + noise
  const tempValues = [];
  const humidValues = [];
  for (let i = 0; i < points; i++) {
    const t = startTime + i * interval;
    const dM = new Date(t + MYT_OFFSET_MS);  // MYT wall-clock for the diurnal cycle
    const hr = dM.getUTCHours() + dM.getUTCMinutes() / 60;
    // Peak ~14:00, trough ~05:00
    const tempBase = 32 + 4 * Math.sin((hr - 5) * Math.PI / 12);
    const tSeed    = Math.floor(t / 60000) * 17 + stationIndex * 3571;
    const tNoise   = ((Math.sin(tSeed) * 43758.5453) % 1) * 0.8;
    tempValues.push(Math.round((tempBase + tNoise) * 10) / 10);

    // Humidity (%) inverse of temp: higher at night/morning
    const humidBase = 75 - 18 * Math.sin((hr - 5) * Math.PI / 12);
    const hSeed     = Math.floor(t / 60000) * 23 + stationIndex * 6173;
    const hNoise    = ((Math.sin(hSeed) * 43758.5453) % 1) * 3;
    humidValues.push(Math.round((humidBase + hNoise) * 10) / 10);
  }

  const latestTemp  = tempValues[tempValues.length - 1];
  const latestHumid = humidValues[humidValues.length - 1];

  return { labels, values, timestamps, tempValues, humidValues, latestTemp, latestHumid };
}

export function buildAllSimData() {
  const data = {};
  STATIONS.forEach((_, i) => {
    data[i] = generateTidalData(i);
  });
  return data;
}
