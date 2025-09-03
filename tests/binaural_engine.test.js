const BinauralEngine = require('../binaural_engine');

jest.useFakeTimers();

describe('BinauralEngine', () => {
  test('start initializes oscillators', () => {
    const engine = new BinauralEngine();
    engine.start(100, 4, 0.8);
    expect(engine.leftOsc.frequency.value).toBe(100);
    expect(engine.rightOsc.frequency.value).toBe(104);
    expect(engine.gainNode.gain.value).toBeCloseTo(0.8);
    engine.stop();
  });

  test('update modifies frequencies', () => {
    const engine = new BinauralEngine();
    engine.start(100, 4);
    engine.update(110, 5);
    expect(engine.leftOsc.frequency.value).toBe(110);
    expect(engine.rightOsc.frequency.value).toBe(115);
    engine.stop();
  });

  test('setVolume changes gain value', () => {
    const engine = new BinauralEngine();
    engine.setVolume(0.2);
    expect(engine.gainNode.gain.value).toBeCloseTo(0.2);
  });

  test('drift mode sweeps beat frequency', () => {
    const engine = new BinauralEngine();
    engine.start(100, 3);
    engine.startDrift(1, 3, 7);
    expect(engine.rightOsc.frequency.value).toBeCloseTo(103);
    jest.advanceTimersByTime(500);
    expect(engine.rightOsc.frequency.value).toBeCloseTo(107, 1);
    jest.advanceTimersByTime(500);
    expect(engine.rightOsc.frequency.value).toBeCloseTo(103, 1);
    engine.stop();
  });

  test('setWaveType updates oscillator type', () => {
    const engine = new BinauralEngine();
    engine.start(100, 4, 0.5, 'square');
    expect(engine.leftOsc.type).toBe('square');
    engine.setWaveType('sawtooth');
    expect(engine.rightOsc.type).toBe('sawtooth');
    engine.stop();
  });

  test('isochronic oscillator starts and stops', () => {
    const engine = new BinauralEngine();
    engine.start(100, 4);
    engine.startIsochronic(5, 0.5);
    expect(engine.isochronicOsc.frequency.value).toBe(5);
    expect(engine.isoGain.gain.value).toBeCloseTo(0.75);
    engine.stopIsochronic();
    expect(engine.isochronicOsc).toBeNull();
    expect(engine.isoGain.gain.value).toBeCloseTo(1);
    engine.stop();
  });

  test('compressor settings can be updated', () => {
    const engine = new BinauralEngine(null, null, {
      threshold: -30,
      ratio: 10,
      attack: 0.01,
      release: 0.5,
    });
    expect(engine.compressor.threshold.value).toBeCloseTo(-30);
    engine.setCompressorSettings({
      threshold: -20,
      ratio: 4,
      attack: 0.005,
      release: 0.3,
    });
    expect(engine.compressor.threshold.value).toBeCloseTo(-20);
    expect(engine.compressor.ratio.value).toBeCloseTo(4);
    expect(engine.compressor.attack.value).toBeCloseTo(0.005);
    expect(engine.compressor.release.value).toBeCloseTo(0.3);
  });

  test('filter settings can be adjusted', () => {
    const engine = new BinauralEngine(null, null, {}, 'highpass', 5000);
    expect(engine.filter.type).toBe('highpass');
    expect(engine.filter.frequency.value).toBeCloseTo(5000);
    engine.setFilter('none');
    expect(engine.filter.type).toBe('allpass');
    engine.setFilter('lowpass', 200);
    expect(engine.filter.type).toBe('lowpass');
    expect(engine.filter.frequency.value).toBeCloseTo(200);
  });
});
