/**
 * BinauralEngine — stereo binaural beat generator for Hemi-Lab Ultra.
 *
 * Signal chain:  L/R oscillators → merger → filter → compressor → isoGain → gainNode
 *
 * Changes in 1.2:
 *  - gainNode is only wired to context.destination when the engine creates it
 *    itself. When a caller passes a gainNode, the caller decides where it goes.
 *    (Before, layer engines were routed to the speakers twice, bypassing the
 *    master volume and stacking up into clipping.)
 *  - stop() fades out and disconnects only after the oscillators have stopped,
 *    so stopping no longer clicks.
 *  - update() takes an optional glide time for slow, musical frequency moves.
 *  - setVolume() takes an optional ramp time (session fades).
 *  - setIsochronicRate() and setIsochronicDepth() change a running pulse smoothly.
 *  - No forced 48 kHz sample rate (it made some devices resample).
 */
class BinauralEngine {
  constructor(
    context,
    gainNode,
    compressorOptions = {},
    filterType = "lowpass",
    filterFrequency = 12000,
  ) {
    try {
      if (context) {
        this.context = context;
      } else if (typeof AudioContext !== "undefined" || typeof webkitAudioContext !== "undefined") {
        const Ctor = typeof AudioContext !== "undefined" ? AudioContext : webkitAudioContext; // eslint-disable-line no-undef
        this.context = new Ctor({ latencyHint: "playback" });
      } else {
        this.context = new (require("web-audio-mock-api").AudioContext)();
      }
      if (!this.context) throw new Error("Failed to create AudioContext");

      if (this.context.state === "suspended" && this.context.resume) {
        const p = this.context.resume();
        if (p && p.catch) p.catch((err) => console.warn("AudioContext resume failed:", err));
      }

      this.transitionTime = 0.015;   // click-free parameter moves
      this.stopFade = 0.04;          // fade before oscillators stop

      this.leftOsc = null;
      this.rightOsc = null;
      this.merger = null;
      this.ownsGain = !gainNode;
      this.gainNode = gainNode || this.context.createGain();

      this.filter = this.context.createBiquadFilter();
      this.setFilter(filterType, filterFrequency);

      this.compressor = this.context.createDynamicsCompressor();
      const { threshold = -24, ratio = 12, attack = 0.003, release = 0.25 } = compressorOptions;
      this.compressor.threshold.value = threshold;
      this.compressor.ratio.value = ratio;
      this.compressor.attack.value = attack;
      this.compressor.release.value = release;

      this.isoGain = this.context.createGain();
      this.isoGain.gain.value = 1;

      this.filter.connect(this.compressor);
      this.compressor.connect(this.isoGain);
      this.isoGain.connect(this.gainNode);
      if (this.ownsGain) this.gainNode.connect(this.context.destination);

      this.driftTimeout = null;
      this.isochronicOsc = null;
      this.isoModGain = null;
      this.isoFilter = null;
      this.isoDepth = 0;
      this.waveType = "sine";
      this.isRunning = false;
    } catch (err) {
      throw new Error(`BinauralEngine initialization failed: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------- helpers
  static validWave(type) {
    return ["sine", "square", "sawtooth", "triangle"].includes(type);
  }

  /** Move an AudioParam to `value`, starting from wherever it is right now. */
  _ramp(param, value, time, curve = "linear") {
    const now = this.context.currentTime;
    if (param.cancelScheduledValues) param.cancelScheduledValues(now);
    if (param.setValueAtTime) param.setValueAtTime(param.value, now);
    if (curve === "exp" && param.exponentialRampToValueAtTime && value > 0 && param.value > 0) {
      param.exponentialRampToValueAtTime(value, now + time);
    } else if (param.linearRampToValueAtTime) {
      param.linearRampToValueAtTime(value, now + time);
    } else {
      param.value = value;
    }
  }

  // ---------------------------------------------------------------- core
  start(baseFreq, beatFreq, volume = 0.5, waveType = "sine") {
    try {
      if (typeof baseFreq !== "number" || !(baseFreq > 0) || baseFreq > 20000) {
        throw new Error(`Invalid base frequency: ${baseFreq}. Must be between 0 and 20000 Hz`);
      }
      if (typeof beatFreq !== "number" || !(beatFreq >= 0) || beatFreq > 100) {
        throw new Error(`Invalid beat frequency: ${beatFreq}. Must be between 0 and 100 Hz`);
      }
      if (typeof volume !== "number" || !(volume >= 0) || volume > 1) {
        throw new Error(`Invalid volume: ${volume}. Must be between 0 and 1`);
      }
      if (!BinauralEngine.validWave(waveType)) {
        throw new Error(`Invalid wave type: ${waveType}. Must be one of sine, square, sawtooth, triangle`);
      }
      if (this.context.state === "suspended" && this.context.resume) this.context.resume();

      this.stop();
      this.leftOsc = this.context.createOscillator();
      this.rightOsc = this.context.createOscillator();
      this.waveType = waveType;
      this.leftOsc.type = waveType;
      this.rightOsc.type = waveType;
      this.merger = this.context.createChannelMerger(2);
      this.leftOsc.frequency.value = baseFreq;
      this.rightOsc.frequency.value = baseFreq + beatFreq;
      this.leftOsc.connect(this.merger, 0, 0);
      this.rightOsc.connect(this.merger, 0, 1);
      this.merger.connect(this.filter);

      const now = this.context.currentTime;
      const g = this.gainNode.gain;
      if (g.cancelScheduledValues) g.cancelScheduledValues(now);
      if (g.setValueAtTime) g.setValueAtTime(0, now); else g.value = 0;
      if (this.leftOsc.start) this.leftOsc.start(now);
      if (this.rightOsc.start) this.rightOsc.start(now);
      this.setVolume(volume);
      this.isRunning = true;
    } catch (err) {
      this.isRunning = false;
      throw new Error(`Failed to start BinauralEngine: ${err.message}`);
    }
  }

  /**
   * Change the carrier and/or beat. `glide` is how long the move takes, in seconds.
   * Pass undefined for either frequency to leave it alone.
   */
  update(baseFreq, beatFreq, glide = this.transitionTime) {
    try {
      if (!this.isRunning) throw new Error("BinauralEngine is not running. Call start() first.");
      if (baseFreq !== undefined && (typeof baseFreq !== "number" || !(baseFreq > 0) || baseFreq > 20000)) {
        throw new Error(`Invalid base frequency: ${baseFreq}`);
      }
      if (beatFreq !== undefined && (typeof beatFreq !== "number" || !(beatFreq >= 0) || beatFreq > 100)) {
        throw new Error(`Invalid beat frequency: ${beatFreq}`);
      }
      const t = Math.max(0.005, glide);
      if (baseFreq !== undefined && this.leftOsc) this._ramp(this.leftOsc.frequency, baseFreq, t, "exp");
      if (this.rightOsc) {
        const base = baseFreq !== undefined ? baseFreq : this.leftOsc.frequency.value;
        const beat = beatFreq !== undefined ? beatFreq : this.rightOsc.frequency.value - this.leftOsc.frequency.value;
        if (baseFreq !== undefined || beatFreq !== undefined) this._ramp(this.rightOsc.frequency, base + beat, t, "exp");
      }
    } catch (err) {
      throw new Error(`Failed to update frequencies: ${err.message}`);
    }
  }

  /** Volume 0–1. `time` is the ramp length in seconds (default: click-free minimum). */
  setVolume(vol, time = this.transitionTime) {
    try {
      if (typeof vol !== "number" || !(vol >= 0) || vol > 1) {
        throw new Error(`Invalid volume: ${vol}. Must be between 0 and 1`);
      }
      this._ramp(this.gainNode.gain, vol, Math.max(0.005, time));
    } catch (err) {
      throw new Error(`Failed to set volume: ${err.message}`);
    }
  }

  setWaveType(type) {
    try {
      if (!BinauralEngine.validWave(type)) {
        throw new Error(`Invalid wave type: ${type}. Must be one of sine, square, sawtooth, triangle`);
      }
      if (this.waveType === type) return;
      this.waveType = type;
      if (!(this.leftOsc && this.rightOsc && this.isRunning)) {
        if (this.leftOsc) this.leftOsc.type = type;
        if (this.rightOsc) this.rightOsc.type = type;
        return;
      }
      // Dip the isoGain stage (not the user's volume) so the swap is silent.
      const p = this.isoGain.gain;
      const now = this.context.currentTime;
      const dip = 0.03;
      const level = this.isochronicOsc ? 1 - this.isoDepth / 2 : 1;
      if (p.cancelScheduledValues) p.cancelScheduledValues(now);
      if (p.setValueAtTime) p.setValueAtTime(level, now);
      if (p.linearRampToValueAtTime) {
        p.linearRampToValueAtTime(0, now + dip);
        p.setValueAtTime(0, now + dip + 0.005);
        p.linearRampToValueAtTime(level, now + dip * 2 + 0.005);
      }
      setTimeout(() => {
        if (this.leftOsc) this.leftOsc.type = type;
        if (this.rightOsc) this.rightOsc.type = type;
      }, dip * 1000);
    } catch (err) {
      throw new Error(`Failed to set wave type: ${err.message}`);
    }
  }

  setFilter(type = "lowpass", frequency = 12000, Q = 1) {
    if (type === "none") {
      this.filter.type = "allpass";
      return;
    }
    this.filter.type = type;
    if (frequency !== undefined && frequency > 0) this._ramp(this.filter.frequency, frequency, this.transitionTime || 0.015, "exp");
    if (Q !== undefined && this.filter.Q) this._ramp(this.filter.Q, Q, this.transitionTime || 0.015);
  }

  setCompressorSettings(settings = {}) {
    ["threshold", "ratio", "attack", "release"].forEach((k) => {
      if (settings[k] === undefined) return;
      const p = this.compressor[k];
      if (p.linearRampToValueAtTime) {
        p.setValueAtTime(p.value, this.context.currentTime);
        p.linearRampToValueAtTime(settings[k], this.context.currentTime + this.transitionTime);
      } else {
        p.value = settings[k];
      }
    });
  }

  // ---------------------------------------------------------------- isochronic
  /** Amplitude-pulse the whole tone at `rate` Hz. depth 0 = none, 1 = full on/off. */
  startIsochronic(rate = 10, depth = 1) {
    try {
      if (typeof rate !== "number" || !(rate > 0) || rate > 100) {
        throw new Error(`Invalid isochronic rate: ${rate}. Must be between 0 and 100 Hz`);
      }
      if (typeof depth !== "number" || !(depth >= 0) || depth > 1) {
        throw new Error(`Invalid isochronic depth: ${depth}. Must be between 0 and 1`);
      }
      this.stopIsochronic();
      this.isochronicOsc = this.context.createOscillator();
      // band-limited square wave so the pulse edges don't buzz
      const harmonics = 32;
      const real = new Float32Array(harmonics + 1);
      const imag = new Float32Array(harmonics + 1);
      for (let i = 1; i <= harmonics; i += 2) imag[i] = 1 / i;
      this.isochronicOsc.setPeriodicWave(this.context.createPeriodicWave(real, imag));
      this.isochronicOsc.frequency.value = rate;

      this.isoFilter = this.context.createBiquadFilter();
      this.isoFilter.type = "lowpass";
      this.isoFilter.frequency.value = Math.min(rate * 4, 400);

      this.isoDepth = depth;
      this.isoModGain = this.context.createGain();
      this.isoModGain.gain.value = depth / 2;

      this.isochronicOsc.connect(this.isoFilter);
      this.isoFilter.connect(this.isoModGain);
      if (this.isoGain.gain.cancelScheduledValues) this.isoGain.gain.cancelScheduledValues(this.context.currentTime);
      this.isoGain.gain.value = 1 - depth / 2;
      this.isoModGain.connect(this.isoGain.gain);
      if (this.isochronicOsc.start) this.isochronicOsc.start();
    } catch (err) {
      throw new Error(`Failed to start isochronic layer: ${err.message}`);
    }
  }

  setIsochronicRate(rate) {
    if (!this.isochronicOsc || !(rate > 0) || rate > 100) return;
    this._ramp(this.isochronicOsc.frequency, rate, 0.25, "exp");
    if (this.isoFilter) this.isoFilter.frequency.value = Math.min(rate * 4, 400);
  }

  setIsochronicDepth(depth) {
    if (!this.isochronicOsc || !(depth >= 0) || depth > 1) return;
    this.isoDepth = depth;
    this._ramp(this.isoModGain.gain, depth / 2, 0.1);
    this._ramp(this.isoGain.gain, 1 - depth / 2, 0.1);
  }

  stopIsochronic() {
    try {
      if (this.isochronicOsc) {
        if (this.isochronicOsc.stop) this.isochronicOsc.stop();
        this.isochronicOsc.disconnect();
        this.isochronicOsc = null;
      }
      if (this.isoFilter) { this.isoFilter.disconnect(); this.isoFilter = null; }
      if (this.isoModGain) { this.isoModGain.disconnect(); this.isoModGain = null; }
      this.isoDepth = 0;
      this.isoGain.gain.value = 1;
    } catch (err) {
      console.warn("Error stopping isochronic layer:", err);
    }
  }

  // ---------------------------------------------------------------- drift
  /** Sweep the beat between `min` and `max` Hz, once every `period` seconds. */
  startDrift(period = 60, min = 3, max = 7, waveform = "sine") {
    this.stopDrift();
    this.driftPeriod = period;
    this.driftMin = min;
    this.driftMax = max;
    this.driftWaveform = waveform;

    const schedule = () => {
      if (!this.rightOsc) return;
      const base = this.leftOsc ? this.leftOsc.frequency.value : 0;
      const param = this.rightOsc.frequency;
      const startTime = this.context.currentTime;
      param.cancelScheduledValues(startTime);
      if (this.driftWaveform === "sine") {
        const steps = 128;
        const curve = new Float32Array(steps);
        for (let i = 0; i < steps; i++) {
          const phase = i / (steps - 1);
          curve[i] = base + this.driftMin + (this.driftMax - this.driftMin) * 0.5 * (1 - Math.cos(2 * Math.PI * phase));
        }
        param.setValueCurveAtTime(curve, startTime, this.driftPeriod);
      } else {
        param.setValueAtTime(base + this.driftMin, startTime);
        param.linearRampToValueAtTime(base + this.driftMax, startTime + this.driftPeriod / 2);
        param.linearRampToValueAtTime(base + this.driftMin, startTime + this.driftPeriod);
      }
      this.driftTimeout = setTimeout(schedule, this.driftPeriod * 1000);
    };
    schedule();
  }

  get isDrifting() {
    return !!this.driftTimeout;
  }

  stopDrift() {
    if (this.driftTimeout) {
      clearTimeout(this.driftTimeout);
      this.driftTimeout = null;
    }
    if (this.rightOsc && this.rightOsc.frequency) {
      const p = this.rightOsc.frequency;
      const now = this.context.currentTime;
      const v = p.value;
      p.cancelScheduledValues(now);
      if (p.setValueAtTime) p.setValueAtTime(v, now); // hold where it is, no jump
    }
  }

  // ---------------------------------------------------------------- stop
  stop() {
    try {
      this.stopDrift();
      const now = this.context.currentTime;
      const fade = this.stopFade;
      const left = this.leftOsc;
      const right = this.rightOsc;
      const merger = this.merger;
      this.leftOsc = null;
      this.rightOsc = null;
      this.merger = null;
      this.isRunning = false;
      if (!left && !right) return;

      this.setVolume(0, fade);
      const stopAt = now + fade + 0.01;
      [left, right].forEach((osc) => {
        if (!osc) return;
        if (osc.frequency && osc.frequency.cancelScheduledValues) osc.frequency.cancelScheduledValues(now);
        if (osc.stop) osc.stop(stopAt);
      });
      // Disconnect only after the fade has finished, so nothing is cut mid-wave.
      const cleanup = () => {
        [left, right, merger].forEach((n) => { try { if (n) n.disconnect(); } catch (_) { /* already gone */ } });
      };
      if (typeof setTimeout !== "undefined") setTimeout(cleanup, (fade + 0.05) * 1000);
      else cleanup();
    } catch (err) {
      this.isRunning = false;
      console.warn("Error stopping BinauralEngine:", err);
    }
  }

  /** Fully tear down the engine's own nodes (for layer engines that are removed). */
  dispose() {
    this.stop();
    this.stopIsochronic();
    setTimeout(() => {
      [this.filter, this.compressor, this.isoGain, this.gainNode].forEach((n) => { try { n.disconnect(); } catch (_) {} });
    }, (this.stopFade + 0.1) * 1000);
  }
}

if (typeof module !== "undefined") {
  module.exports = BinauralEngine;
}
if (typeof window !== "undefined") {
  window.BinauralEngine = BinauralEngine;
}
