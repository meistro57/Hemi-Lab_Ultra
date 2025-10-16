class BinauralEngine {
  constructor(
    context,
    gainNode,
    compressorOptions = {},
    filterType = "lowpass",
    filterFrequency = 12000,
  ) {
    try {
      this.context =
        context ||
        new (typeof AudioContext !== "undefined"
          ? AudioContext
          : require("web-audio-mock-api").AudioContext)();

      if (!this.context) {
        throw new Error("Failed to create AudioContext");
      }

      // Resume context if it's suspended (mobile Safari requirement)
      if (this.context.state === "suspended") {
        this.context.resume().catch((err) => {
          console.warn("AudioContext resume failed:", err);
        });
      }

      this.leftOsc = null;
      this.rightOsc = null;
      this.gainNode = gainNode || this.context.createGain();
      this.filter = this.context.createBiquadFilter();
      this.setFilter(filterType, filterFrequency);
      this.compressor = this.context.createDynamicsCompressor();
      const {
        threshold = -24,
        ratio = 12,
        attack = 0.003,
        release = 0.25,
      } = compressorOptions;
      this.compressor.threshold.value = threshold;
      this.compressor.ratio.value = ratio;
      this.compressor.attack.value = attack;
      this.compressor.release.value = release;
      this.isoGain = this.context.createGain();
      this.isoGain.gain.value = 1;
      this.filter.connect(this.compressor);
      this.compressor.connect(this.isoGain);
      this.isoGain.connect(this.gainNode);
      this.gainNode.connect(this.context.destination);
      this.driftInterval = null;
      this.driftStep = 0;
      this.isochronicOsc = null;
      this.isoModGain = null;
      this.isoFilter = null;
      this.waveType = "sine";
      this.isRunning = false;
    } catch (err) {
      throw new Error(`BinauralEngine initialization failed: ${err.message}`);
    }
  }

  start(baseFreq, beatFreq, volume = 0.5, waveType = "sine") {
    try {
      // Validate parameters
      if (typeof baseFreq !== "number" || baseFreq <= 0 || baseFreq > 20000) {
        throw new Error(`Invalid base frequency: ${baseFreq}. Must be between 0 and 20000 Hz`);
      }
      if (typeof beatFreq !== "number" || beatFreq < 0 || beatFreq > 100) {
        throw new Error(`Invalid beat frequency: ${beatFreq}. Must be between 0 and 100 Hz`);
      }
      if (typeof volume !== "number" || volume < 0 || volume > 1) {
        throw new Error(`Invalid volume: ${volume}. Must be between 0 and 1`);
      }
      const validWaveTypes = ["sine", "square", "sawtooth", "triangle"];
      if (!validWaveTypes.includes(waveType)) {
        throw new Error(`Invalid wave type: ${waveType}. Must be one of ${validWaveTypes.join(", ")}`);
      }

      // Resume context if suspended
      if (this.context.state === "suspended") {
        this.context.resume();
      }

      this.stop();
      this.leftOsc = this.context.createOscillator();
      this.rightOsc = this.context.createOscillator();
      this.waveType = waveType;
      this.leftOsc.type = waveType;
      this.rightOsc.type = waveType;
      const merger = this.context.createChannelMerger(2);
      this.leftOsc.frequency.value = baseFreq;
      this.rightOsc.frequency.value = baseFreq + beatFreq;
      this.leftOsc.connect(merger, 0, 0);
      this.rightOsc.connect(merger, 0, 1);
      merger.connect(this.filter);
      this.setVolume(0);
      if (this.leftOsc.start) this.leftOsc.start();
      if (this.rightOsc.start) this.rightOsc.start();
      this.setVolume(volume);
      this.isRunning = true;
    } catch (err) {
      this.isRunning = false;
      throw new Error(`Failed to start BinauralEngine: ${err.message}`);
    }
  }

  update(baseFreq, beatFreq) {
    try {
      if (!this.isRunning) {
        throw new Error("BinauralEngine is not running. Call start() first.");
      }

      // Validate parameters if provided
      if (baseFreq !== undefined) {
        if (typeof baseFreq !== "number" || baseFreq <= 0 || baseFreq > 20000) {
          throw new Error(`Invalid base frequency: ${baseFreq}`);
        }
      }
      if (beatFreq !== undefined) {
        if (typeof beatFreq !== "number" || beatFreq < 0 || beatFreq > 100) {
          throw new Error(`Invalid beat frequency: ${beatFreq}`);
        }
      }

      const now = this.context.currentTime;
      if (baseFreq !== undefined && this.leftOsc) {
        if (this.leftOsc.frequency.cancelScheduledValues) {
          this.leftOsc.frequency.cancelScheduledValues(now);
        }
        if (this.leftOsc.frequency.setTargetAtTime) {
          this.leftOsc.frequency.setTargetAtTime(baseFreq, now, 0.1);
        }
        this.leftOsc.frequency.value = baseFreq;
      }
      if (this.rightOsc) {
        const base = baseFreq !== undefined ? baseFreq : this.leftOsc.frequency.value;
        if (beatFreq !== undefined) {
          const freq = base + beatFreq;
          if (this.rightOsc.frequency.cancelScheduledValues) {
            this.rightOsc.frequency.cancelScheduledValues(now);
          }
          if (this.rightOsc.frequency.setTargetAtTime) {
            this.rightOsc.frequency.setTargetAtTime(freq, now, 0.1);
          }
          this.rightOsc.frequency.value = freq;
        }
      }
    } catch (err) {
      throw new Error(`Failed to update frequencies: ${err.message}`);
    }
  }

  setVolume(vol) {
    try {
      if (typeof vol !== "number" || vol < 0 || vol > 1) {
        throw new Error(`Invalid volume: ${vol}. Must be between 0 and 1`);
      }

      const now = this.context.currentTime;
      if (this.gainNode.gain.cancelScheduledValues) {
        this.gainNode.gain.cancelScheduledValues(now);
      }
      if (this.gainNode.gain.setTargetAtTime) {
        this.gainNode.gain.setTargetAtTime(vol, now, 0.1);
      }
      this.gainNode.gain.value = vol;
    } catch (err) {
      throw new Error(`Failed to set volume: ${err.message}`);
    }
  }

  setWaveType(type) {
    try {
      const validWaveTypes = ["sine", "square", "sawtooth", "triangle"];
      if (!validWaveTypes.includes(type)) {
        throw new Error(`Invalid wave type: ${type}. Must be one of ${validWaveTypes.join(", ")}`);
      }

      this.waveType = type;
      if (this.leftOsc) this.leftOsc.type = type;
      if (this.rightOsc) this.rightOsc.type = type;
    } catch (err) {
      throw new Error(`Failed to set wave type: ${err.message}`);
    }
  }

  setFilter(type = "lowpass", frequency = 12000) {
    if (type === "none") {
      this.filter.type = "allpass";
    } else {
      this.filter.type = type;
      if (frequency !== undefined) {
        this.filter.frequency.value = frequency;
      }
    }
  }

  setCompressorSettings(settings = {}) {
    if (settings.threshold !== undefined) {
      this.compressor.threshold.value = settings.threshold;
    }
    if (settings.ratio !== undefined) {
      this.compressor.ratio.value = settings.ratio;
    }
    if (settings.attack !== undefined) {
      this.compressor.attack.value = settings.attack;
    }
    if (settings.release !== undefined) {
      this.compressor.release.value = settings.release;
    }
  }
  startIsochronic(rate = 10, depth = 1) {
    try {
      // Validate parameters
      if (typeof rate !== "number" || rate <= 0 || rate > 100) {
        throw new Error(`Invalid isochronic rate: ${rate}. Must be between 0 and 100 Hz`);
      }
      if (typeof depth !== "number" || depth < 0 || depth > 1) {
        throw new Error(`Invalid isochronic depth: ${depth}. Must be between 0 and 1`);
      }

      this.stopIsochronic();
      this.isochronicOsc = this.context.createOscillator();
      const harmonics = 32;
      const real = new Float32Array(harmonics + 1);
      const imag = new Float32Array(harmonics + 1);
      for (let i = 1; i <= harmonics; i += 2) {
        imag[i] = 1 / i;
      }
      const wave = this.context.createPeriodicWave(real, imag);
      this.isochronicOsc.setPeriodicWave(wave);
      this.isochronicOsc.frequency.value = rate;

      this.isoFilter = this.context.createBiquadFilter();
      this.isoFilter.type = "lowpass";
      this.isoFilter.frequency.value = rate * 4;

      this.isoModGain = this.context.createGain();
      this.isoModGain.gain.value = depth / 2;

      this.isochronicOsc.connect(this.isoFilter);
      this.isoFilter.connect(this.isoModGain);
      this.isoGain.gain.value = 1 - depth / 2;
      this.isoModGain.connect(this.isoGain.gain);

      if (this.isochronicOsc.start) this.isochronicOsc.start();
    } catch (err) {
      throw new Error(`Failed to start isochronic layer: ${err.message}`);
    }
  }

  stopIsochronic() {
    try {
      if (this.isochronicOsc) {
        if (this.isochronicOsc.stop) this.isochronicOsc.stop();
        this.isochronicOsc.disconnect();
        this.isochronicOsc = null;
      }
      if (this.isoFilter) {
        this.isoFilter.disconnect();
        this.isoFilter = null;
      }
      if (this.isoModGain) {
        this.isoModGain.disconnect();
        this.isoModGain = null;
      }
      this.isoGain.gain.value = 1;
    } catch (err) {
      // Silence errors during cleanup - nodes may already be disconnected
      console.warn("Error stopping isochronic layer:", err);
    }
  }

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
          const beat =
            this.driftMin +
            (this.driftMax - this.driftMin) *
              0.5 *
              (1 - Math.cos(2 * Math.PI * phase));
          curve[i] = base + beat;
        }
        param.setValueCurveAtTime(curve, startTime, this.driftPeriod);
      } else {
        param.setValueAtTime(base + this.driftMin, startTime);
        param.linearRampToValueAtTime(
          base + this.driftMax,
          startTime + this.driftPeriod / 2,
        );
        param.linearRampToValueAtTime(
          base + this.driftMin,
          startTime + this.driftPeriod,
        );
      }

      this.driftTimeout = setTimeout(schedule, this.driftPeriod * 1000);
    };

    schedule();
  }

  stopDrift() {
    if (this.driftTimeout) {
      clearTimeout(this.driftTimeout);
      this.driftTimeout = null;
    }
    if (this.rightOsc && this.rightOsc.frequency) {
      this.rightOsc.frequency.cancelScheduledValues(this.context.currentTime);
    }
  }

  stop() {
    try {
      this.stopDrift();
      const now = this.context.currentTime;
      this.setVolume(0);
      const stopAt = now + 0.1;
      if (this.leftOsc) {
        if (this.leftOsc.frequency && this.leftOsc.frequency.cancelScheduledValues) {
          this.leftOsc.frequency.cancelScheduledValues(now);
        }
        if (this.leftOsc.stop) this.leftOsc.stop(stopAt);
        this.leftOsc.disconnect();
        this.leftOsc = null;
      }
      if (this.rightOsc) {
        if (
          this.rightOsc.frequency &&
          this.rightOsc.frequency.cancelScheduledValues
        ) {
          this.rightOsc.frequency.cancelScheduledValues(now);
        }
        if (this.rightOsc.stop) this.rightOsc.stop(stopAt);
        this.rightOsc.disconnect();
        this.rightOsc = null;
      }
      this.isRunning = false;
      // leave filter connected for next session
    } catch (err) {
      this.isRunning = false;
      // Silence errors during cleanup
      console.warn("Error stopping BinauralEngine:", err);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = BinauralEngine;
}
if (typeof window !== 'undefined') {
  window.BinauralEngine = BinauralEngine;
}
