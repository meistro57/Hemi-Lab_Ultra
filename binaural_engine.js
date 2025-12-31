class BinauralEngine {
  constructor(
    context,
    gainNode,
    compressorOptions = {},
    filterType = "lowpass",
    filterFrequency = 12000,
  ) {
    try {
      // Create high-quality audio context with optimal settings
      if (!context && typeof AudioContext !== "undefined") {
        const ContextConstructor = AudioContext || webkitAudioContext;
        this.context = new ContextConstructor({
          latencyHint: 'interactive',
          sampleRate: 48000, // High-quality sample rate
        });
      } else {
        this.context =
          context ||
          new (typeof AudioContext !== "undefined"
            ? AudioContext
            : require("web-audio-mock-api").AudioContext)();
      }

      if (!this.context) {
        throw new Error("Failed to create AudioContext");
      }

      // Resume context if it's suspended (mobile Safari requirement)
      if (this.context.state === "suspended") {
        this.context.resume().catch((err) => {
          console.warn("AudioContext resume failed:", err);
        });
      }

      // Smooth transition time constant (shorter = more responsive, but still click-free)
      this.transitionTime = 0.015; // 15ms for ultra-smooth transitions

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

      // Use exponential ramps for smoother, click-free frequency transitions
      if (baseFreq !== undefined && this.leftOsc) {
        if (this.leftOsc.frequency.cancelScheduledValues) {
          this.leftOsc.frequency.cancelScheduledValues(now);
        }
        // Exponential ramp is smoother than setTargetAtTime for frequency changes
        if (this.leftOsc.frequency.exponentialRampToValueAtTime) {
          this.leftOsc.frequency.setValueAtTime(this.leftOsc.frequency.value, now);
          this.leftOsc.frequency.exponentialRampToValueAtTime(baseFreq, now + this.transitionTime);
        } else if (this.leftOsc.frequency.setTargetAtTime) {
          this.leftOsc.frequency.setTargetAtTime(baseFreq, now, this.transitionTime);
        }
      }

      if (this.rightOsc) {
        const base = baseFreq !== undefined ? baseFreq : this.leftOsc.frequency.value;
        if (beatFreq !== undefined) {
          const freq = base + beatFreq;
          if (this.rightOsc.frequency.cancelScheduledValues) {
            this.rightOsc.frequency.cancelScheduledValues(now);
          }
          // Exponential ramp for right channel as well
          if (this.rightOsc.frequency.exponentialRampToValueAtTime) {
            this.rightOsc.frequency.setValueAtTime(this.rightOsc.frequency.value, now);
            this.rightOsc.frequency.exponentialRampToValueAtTime(freq, now + this.transitionTime);
          } else if (this.rightOsc.frequency.setTargetAtTime) {
            this.rightOsc.frequency.setTargetAtTime(freq, now, this.transitionTime);
          }
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

      // Use linear ramp for volume changes (smoother than setTargetAtTime for gain)
      if (this.gainNode.gain.linearRampToValueAtTime) {
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.linearRampToValueAtTime(vol, now + this.transitionTime);
      } else if (this.gainNode.gain.setTargetAtTime) {
        this.gainNode.gain.setTargetAtTime(vol, now, this.transitionTime);
      }
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

      // If wave type is the same, no need to change
      if (this.waveType === type) {
        return;
      }

      this.waveType = type;

      // Smooth wave type transition with brief fade
      if (this.leftOsc && this.rightOsc && this.isRunning) {
        const now = this.context.currentTime;
        const crossfadeTime = 0.05; // 50ms crossfade

        // Fade out current oscillators
        if (this.gainNode.gain.cancelScheduledValues) {
          this.gainNode.gain.cancelScheduledValues(now);
        }
        const currentGain = this.gainNode.gain.value;
        this.gainNode.gain.setValueAtTime(currentGain, now);
        this.gainNode.gain.linearRampToValueAtTime(0, now + crossfadeTime);

        // Change wave type at the crossfade midpoint
        setTimeout(() => {
          if (this.leftOsc) this.leftOsc.type = type;
          if (this.rightOsc) this.rightOsc.type = type;
        }, crossfadeTime * 500); // Halfway through the fade

        // Fade back in with new wave type
        this.gainNode.gain.linearRampToValueAtTime(currentGain, now + crossfadeTime * 2);
      } else {
        // If not running, just change the type directly
        if (this.leftOsc) this.leftOsc.type = type;
        if (this.rightOsc) this.rightOsc.type = type;
      }
    } catch (err) {
      throw new Error(`Failed to set wave type: ${err.message}`);
    }
  }

  setFilter(type = "lowpass", frequency = 12000, Q = 1) {
    const now = this.context.currentTime;

    if (type === "none") {
      this.filter.type = "allpass";
    } else {
      this.filter.type = type;

      // Smooth filter frequency transitions to avoid clicks
      if (frequency !== undefined && frequency > 0) {
        if (this.filter.frequency.cancelScheduledValues) {
          this.filter.frequency.cancelScheduledValues(now);
        }
        // Use exponential ramp for filter frequency (sounds more natural)
        if (this.filter.frequency.exponentialRampToValueAtTime) {
          this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
          this.filter.frequency.exponentialRampToValueAtTime(frequency, now + this.transitionTime);
        } else {
          this.filter.frequency.value = frequency;
        }
      }

      // Smooth Q factor transitions as well
      if (Q !== undefined && this.filter.Q) {
        if (this.filter.Q.cancelScheduledValues) {
          this.filter.Q.cancelScheduledValues(now);
        }
        if (this.filter.Q.linearRampToValueAtTime) {
          this.filter.Q.setValueAtTime(this.filter.Q.value, now);
          this.filter.Q.linearRampToValueAtTime(Q, now + this.transitionTime);
        } else {
          this.filter.Q.value = Q;
        }
      }
    }
  }

  setCompressorSettings(settings = {}) {
    const now = this.context.currentTime;

    // Smooth compressor parameter transitions
    if (settings.threshold !== undefined) {
      if (this.compressor.threshold.linearRampToValueAtTime) {
        this.compressor.threshold.setValueAtTime(this.compressor.threshold.value, now);
        this.compressor.threshold.linearRampToValueAtTime(settings.threshold, now + this.transitionTime);
      } else {
        this.compressor.threshold.value = settings.threshold;
      }
    }

    if (settings.ratio !== undefined) {
      if (this.compressor.ratio.linearRampToValueAtTime) {
        this.compressor.ratio.setValueAtTime(this.compressor.ratio.value, now);
        this.compressor.ratio.linearRampToValueAtTime(settings.ratio, now + this.transitionTime);
      } else {
        this.compressor.ratio.value = settings.ratio;
      }
    }

    if (settings.attack !== undefined) {
      if (this.compressor.attack.linearRampToValueAtTime) {
        this.compressor.attack.setValueAtTime(this.compressor.attack.value, now);
        this.compressor.attack.linearRampToValueAtTime(settings.attack, now + this.transitionTime);
      } else {
        this.compressor.attack.value = settings.attack;
      }
    }

    if (settings.release !== undefined) {
      if (this.compressor.release.linearRampToValueAtTime) {
        this.compressor.release.setValueAtTime(this.compressor.release.value, now);
        this.compressor.release.linearRampToValueAtTime(settings.release, now + this.transitionTime);
      } else {
        this.compressor.release.value = settings.release;
      }
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
