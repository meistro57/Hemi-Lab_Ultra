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
});
