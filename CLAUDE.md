# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hemi-Lab Ultra is a browser-based consciousness exploration platform that combines binaural beat audio therapy with Monroe Institute focus level protocols. The project consists of a single-file HTML application (`index.html`) with an audio engine (`binaural_engine.js`), Node.js WebSocket server (`server.js`), and Python EEG bridge (`python/eeg_bridge.py`) for optional OpenBCI integration.

## Architecture

### Frontend (index.html)
- **Single-page application** with vanilla JavaScript and inline styles
- **Web Audio API** for binaural beat generation and audio processing
- **Focus Level Navigator** with Monroe Institute inspired presets (Focus 10, 12, 15, 21, 23+)
- **REBAL visualization** using CSS transforms and GPU acceleration
- **Session journaling** with local IndexedDB/localStorage
- Audio features: binaural beats, isochronic pulses, frequency drift, breath coaching, affirmations

### Audio Engine (binaural_engine.js)
The `BinauralEngine` class is the core audio synthesis component:
- Dual-channel stereo oscillators for binaural beat generation
- Dynamic frequency ramping using `setTargetAtTime` and `setValueCurveAtTime` for crackle-free adjustments
- Isochronic pulse layer with custom periodic waveforms (32 harmonics)
- Frequency drift mode with sine/linear waveforms for altered state exploration
- Filter chain: BiquadFilter → DynamicsCompressor → GainNode
- **Comprehensive error handling** with parameter validation:
  - Base frequency: 0-20,000 Hz
  - Beat frequency: 0-100 Hz
  - Volume: 0-1
  - Wave types: sine, square, sawtooth, triangle
  - State validation (prevents operations before start())
- **Mobile Safari support** - Automatic AudioContext resume when suspended
- Exports to both Node.js (CommonJS) and browser (window global)

### Backend Server (server.js)
- **HTTP server** serving static files (index.html, binaural_engine.js, etc.)
- **REST API** for user accounts, session storage, and journal analysis
  - `POST /api/register` - User registration with bcrypt password hashing (12 salt rounds, 8+ char minimum)
  - `POST /api/login` - Authentication with token generation (24-hour expiry)
  - `POST /api/sessions` - Save session data (requires Bearer token authentication)
  - `GET /api/sessions` - Retrieve user's own sessions (requires Bearer token authentication)
  - `POST /api/analyze` - Basic keyword frequency analysis of journal text
- **Security features**
  - bcrypt password hashing with per-user salts
  - Token-based authentication using Bearer tokens in Authorization header
  - Rate limiting: 5 attempts per 15 minutes on auth endpoints (prevents brute force)
  - Users can only access their own session data
- **WebSocket server** for real-time EEG data broadcast and group session synchronization
  - Groups/rooms system via `{type: "join", group: "roomname"}` messages
  - Periodic ping/pong for connection health monitoring
- Persistent storage in `users.json` and `sessions.json` files

### EEG Bridge (python/eeg_bridge.py)
- **OpenBCI Cyton integration** (250 Hz sampling rate)
- **Real-time band power computation** using Welch's method (scipy)
  - Delta (1-4 Hz), Theta (4-8 Hz), Alpha (8-12 Hz), Beta (12-30 Hz)
- **WebSocket broadcast** of per-channel and averaged metrics as JSON
- Optional JSONL logging to file for session recording
- Runs on separate WebSocket port (default 8765) from main server

## Development Commands

### Running the application
```bash
# Install Node.js dependencies
npm install

# Install Python dependencies (for EEG bridge)
pip install numpy scipy websockets pyOpenBCI

# Start the web server (serves at http://localhost:3000)
node server.js

# Run EEG bridge (optional, separate terminal)
python python/eeg_bridge.py --ws-port 8765 --output-file logs/eeg_data.jsonl
```

### Testing
```bash
# Run all JavaScript tests
npm test

# Run specific test file
npx jest tests/binaural_engine.test.js
npx jest tests/server.test.js

# Run Python EEG bridge tests
python -m pytest tests/test_eeg_bridge.py
```

### Code Style
- **JavaScript**: ES6+ syntax, prefer `const`/`let`, use async/await for async operations
- **Python**: Python 3.10+, type hints preferred, use `black` for formatting
- Binaural engine uses Web Audio API best practices (exponential ramps, scheduled value changes)

## Key Implementation Details

### Audio Synthesis
- **Binaural beats**: Left channel = base frequency, right channel = base + beat frequency
- **Smooth frequency transitions**: Use `setTargetAtTime(target, time, 0.1)` with 0.1s time constant to avoid clicks/pops
- **Frequency drift**: Pre-computed value curves (`setValueCurveAtTime`) for smooth periodic modulation
- **Volume ramping**: Always ramp gain to 0 before stopping oscillators to prevent clicks

### WebSocket Communication
- EEG bridge broadcasts to port 8765 (separate from main server on 3000)
- Main server WebSocket handles group sessions and inter-client sync
- All messages are JSON with `{type: string, ...}` structure
- Clients must send `{type: "join", group: "roomname"}` to participate in group sessions

### Focus Level Presets
Focus levels map to specific audio parameters (defined in index.html):
- **Focus 10**: ~100 Hz base, 7.5 Hz beat (theta) - "Body asleep, mind awake"
- **Focus 12**: ~110 Hz base, 9 Hz beat (alpha) - "Expanded awareness"
- **Focus 15**: ~80 Hz base, 1 Hz beat (delta) - "No-time zone"
- **Focus 21**: ~90 Hz base, 4 Hz beat (theta) - "Gateway threshold"
- **Focus 23+**: ~70 Hz base, 2.5 Hz beat (delta) - "Contact states"

### Session Data Schema
Sessions stored in `sessions.json` include:
- `id`, `timestamp`, `focusLevel`, `duration`
- `audioSettings`: baseFreq, beatFreq, volume, waveType
- `moodBefore`, `moodAfter` (1-10 scale)
- `journalText`, `contactEvent` (boolean)

## Testing Notes

- Binaural engine tests use `web-audio-mock-api` to mock Web Audio API in Node.js
- Server tests mock HTTP requests and WebSocket connections
- EEG bridge tests verify band power computation and WebSocket broadcast logic
- Run tests before committing changes to ensure audio engine stability
- Authentication tests verify token generation, bcrypt hashing, and rate limiting
- Error handling tests verify parameter validation in BinauralEngine

## API Authentication

All session endpoints require authentication. After registering or logging in, include the token in requests:

```javascript
// Register or login to get token
const res = await fetch('/api/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'user', password: 'password123' })
});
const { token } = await res.json();

// Use token for authenticated requests
await fetch('/api/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ focus: 10, duration: 600 })
});
```
