# Sound pops and crackles during playback

## Description
During playback, the audio output produces noticeable popping and crackling noises. This occurs both when running `index.html` directly and when using the `node server.js` backend. The issue is most apparent when the base frequency or beat frequency is adjusted quickly.

## Steps to Reproduce
1. Start the application and begin a session.
2. Adjust the base frequency and/or beat frequency using the UI sliders.
3. Listen for pops or crackles in the audio output.

## Expected Behavior
The audio should remain smooth and continuous without popping or crackling artifacts when adjusting parameters.

## Additional Information
- Using modern browsers (tested in Chrome/Edge).
- Issue occurs regardless of audio output device.
- Possibly related to oscillator restart logic in `binaural_engine.js` or Web Audio context configuration.


