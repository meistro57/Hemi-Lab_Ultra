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

  test('drift mode schedules sine waveform with setValueCurveAtTime', () => {
    const engine = new BinauralEngine();
    engine.start(100, 3);
    const spy = jest.spyOn(engine.rightOsc.frequency, 'setValueCurveAtTime');
    engine.startDrift(1, 3, 7, 'sine');
    expect(spy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(2);
    engine.stop();
  });

  test('drift mode schedules triangle waveform with linear ramps', () => {
    const engine = new BinauralEngine();
    engine.start(100, 3);
    const spy = jest.spyOn(engine.rightOsc.frequency, 'linearRampToValueAtTime');
    const now = engine.context.currentTime;
    engine.startDrift(1, 3, 7, 'triangle');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toBe(107);
    expect(spy.mock.calls[0][1]).toBeCloseTo(now + 0.5);
    expect(spy.mock.calls[1][0]).toBe(103);
    expect(spy.mock.calls[1][1]).toBeCloseTo(now + 1);
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

  test('throws error for invalid base frequency', () => {
    const engine = new BinauralEngine();
    expect(() => engine.start(-10, 4)).toThrow('Invalid base frequency');
    expect(() => engine.start(25000, 4)).toThrow('Invalid base frequency');
    expect(() => engine.start('invalid', 4)).toThrow('Invalid base frequency');
  });

  test('throws error for invalid beat frequency', () => {
    const engine = new BinauralEngine();
    expect(() => engine.start(100, -5)).toThrow('Invalid beat frequency');
    expect(() => engine.start(100, 150)).toThrow('Invalid beat frequency');
    expect(() => engine.start(100, 'invalid')).toThrow('Invalid beat frequency');
  });

  test('throws error for invalid volume', () => {
    const engine = new BinauralEngine();
    expect(() => engine.start(100, 4, -0.5)).toThrow('Invalid volume');
    expect(() => engine.start(100, 4, 2)).toThrow('Invalid volume');
    expect(() => engine.setVolume(-1)).toThrow('Invalid volume');
    expect(() => engine.setVolume(1.5)).toThrow('Invalid volume');
  });

  test('throws error for invalid wave type', () => {
    const engine = new BinauralEngine();
    expect(() => engine.start(100, 4, 0.5, 'invalid')).toThrow('Invalid wave type');
    expect(() => engine.setWaveType('cosine')).toThrow('Invalid wave type');
  });

  test('throws error when updating without starting', () => {
    const engine = new BinauralEngine();
    expect(() => engine.update(110, 5)).toThrow('BinauralEngine is not running');
  });

  test('throws error for invalid isochronic parameters', () => {
    const engine = new BinauralEngine();
    engine.start(100, 4);
    expect(() => engine.startIsochronic(-5)).toThrow('Invalid isochronic rate');
    expect(() => engine.startIsochronic(150)).toThrow('Invalid isochronic rate');
    expect(() => engine.startIsochronic(10, -0.5)).toThrow('Invalid isochronic depth');
    expect(() => engine.startIsochronic(10, 2)).toThrow('Invalid isochronic depth');
    engine.stop();
  });

  test('isRunning flag is set correctly', () => {
    const engine = new BinauralEngine();
    expect(engine.isRunning).toBe(false);
    engine.start(100, 4);
    expect(engine.isRunning).toBe(true);
    engine.stop();
    expect(engine.isRunning).toBe(false);
  });

  test('update validates parameters when running', () => {
    const engine = new BinauralEngine();
    engine.start(100, 4);
    expect(() => engine.update(-10, 5)).toThrow('Invalid base frequency');
    expect(() => engine.update(100, -5)).toThrow('Invalid beat frequency');
    expect(() => engine.update(25000, 5)).toThrow('Invalid base frequency');
    engine.stop();
  });
});
