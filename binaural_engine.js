class BinauralEngine {
  constructor(context, gainNode) {
    this.context = context || new (typeof AudioContext !== 'undefined' ? AudioContext : require('web-audio-mock-api').AudioContext)();
    this.leftOsc = null;
    this.rightOsc = null;
    this.gainNode = gainNode || this.context.createGain();
    this.gainNode.connect(this.context.destination);
    this.driftInterval = null;
    this.driftStep = 0;
  }

  start(baseFreq, beatFreq, volume = 0.5) {
    this.stop();
    this.leftOsc = this.context.createOscillator();
    this.rightOsc = this.context.createOscillator();
    const merger = this.context.createChannelMerger(2);
    this.leftOsc.frequency.value = baseFreq;
    this.rightOsc.frequency.value = baseFreq + beatFreq;
    this.leftOsc.connect(merger, 0, 0);
    this.rightOsc.connect(merger, 0, 1);
    merger.connect(this.gainNode);
    this.setVolume(volume);
    if (this.leftOsc.start) this.leftOsc.start();
    if (this.rightOsc.start) this.rightOsc.start();
  }

  update(baseFreq, beatFreq) {
    if (baseFreq !== undefined && this.leftOsc) {
      this.leftOsc.frequency.value = baseFreq;
    }
    if (this.rightOsc) {
      const base = baseFreq !== undefined ? baseFreq : this.leftOsc.frequency.value;
      if (beatFreq !== undefined) {
        this.rightOsc.frequency.value = base + beatFreq;
      }
    }
  }

  setVolume(vol) {
    this.gainNode.gain.value = vol;
  }

  startDrift(period = 60, min = 3, max = 7) {
    this.stopDrift();
    this.driftPeriod = period;
    this.driftMin = min;
    this.driftMax = max;
    this.driftStep = 0;
    this.driftInterval = setInterval(() => {
      this.driftStep = (this.driftStep + 0.1) % this.driftPeriod;
      const phase = this.driftStep / this.driftPeriod;
      const progress = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      const beat = this.driftMin + (this.driftMax - this.driftMin) * progress;
      this.update(undefined, beat);
    }, 100);
  }

  stopDrift() {
    if (this.driftInterval) {
      clearInterval(this.driftInterval);
      this.driftInterval = null;
    }
  }

  stop() {
    this.stopDrift();
    if (this.leftOsc) {
      if (this.leftOsc.stop) this.leftOsc.stop();
      this.leftOsc.disconnect();
      this.leftOsc = null;
    }
    if (this.rightOsc) {
      if (this.rightOsc.stop) this.rightOsc.stop();
      this.rightOsc.disconnect();
      this.rightOsc = null;
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = BinauralEngine;
}
if (typeof window !== 'undefined') {
  window.BinauralEngine = BinauralEngine;
}
