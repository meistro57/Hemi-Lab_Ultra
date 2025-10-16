--This is a personal project of mine. It may or may not work. It may or may not cause you harm. It may or may not induce anything. Use at your own risk as I will not be responsible for whatever happens. 

# Hemi-Lab Ultra

Hemi-Lab Ultra is a lightweight browser application for exploring altered states of consciousness. The project contains a single HTML file with an audio engine and optional static server.

## Why
This project draws inspiration from the Monroe Institute's decades of
brainwave-entrainment research and the U.S. Army's interest in those
methods, revealed in declassified CIA "Gateway Process" documents. The
institute pioneered the Hemi-Sync approach to stimulate left/right brain
coherence and facilitate deep meditative states. Government analysts
later examined the techniques for potential applications in remote
viewing and psychological operations. Hemi-Lab Ultra explores similar
concepts in an open-source context so individuals can experiment with
these audio patterns themselves. The project has no affiliation with the
Monroe Institute or any government agency.

## Quick Start
1. Open `index.html` directly in a modern browser; or
2. Install dependencies with `npm install`, run `node server.js` and visit [http://localhost:3000](http://localhost:3000) for a local server.

## EEG Bridge
A Python script for streaming OpenBCI EEG data is available in `python/eeg_bridge.py`.
It broadcasts real‑time band power metrics over a WebSocket server.

### Usage
1. Install dependencies:
   ```bash
   pip install pyOpenBCI numpy scipy websockets
   ```
2. Connect your board and run:
   ```bash
   python python/eeg_bridge.py
   ```
3. Listen on `ws://localhost:3000` for JSON data (adjust `ws_port` in the script if needed).

## Features
- **Binaural Beat Engine** – custom frequency entrainment with phase shifting and comprehensive error handling
- **Focus Level Navigator** – Monroe Institute inspired presets
- **REBAL Energy Shield** – animated protection visualization
- **GPU-Accelerated Visuals** – smoother REBAL animation using CSS transforms
- **Breath Coach** – synchronized breathing prompts
- **Session Journal** – record mood and insights
- **Pattern Analysis** – discover optimal practice trends
- **Affirmation Layer** – spoken positive cues during sessions
- **Smooth Frequency Ramps** – crackle-free adjustments when changing tones
- **Data Import/Export** – backup and restore your journal history
- **Real-Time EEG Feedback** – optional audio adjustments via WebSocket
- **Session Composer** – layer multiple sound tracks
- **Advanced Breath Patterns** – choose box, 4-7-8 or Wim Hof styles
- **Contact Mode Triggers** – probabilistic deep-state events
- **AI Journal Analysis** – automatic insight summaries
- **Analytics Dashboard** – visual focus statistics
- **Secure User Accounts** – bcrypt password hashing, token-based authentication, rate limiting
- **Cloud Sync** – store sessions securely with per-user access control
- **Group Session Rooms** – synchronized multi-user experiences
- **Wearable Sensor Support** – heart rate and GSR input for biofeedback
- **VR/AR Visualization Mode** – immersive environment via WebXR
- **Offline PWA** – installable app with cached sessions

## Usage
1. Select your desired focus level.
2. Adjust base/beat frequencies, phase and volume.
3. Click **Begin Session** to start audio and visuals.
4. Optionally enable the REBAL shield or breath coach.
5. After stopping, write down your experience in the journal.
6. Click **Analyze Patterns** in the journal section to review insights.

The deeper states (Focus 15, 21, 23+) can produce profound results. Use quality headphones in a quiet space and document everything.

## API Authentication

When using the backend server, all session endpoints require authentication:

1. **Register** a new account (minimum 8 character password):
   ```bash
   curl -X POST http://localhost:3000/api/register \
     -H "Content-Type: application/json" \
     -d '{"username":"your_user","password":"your_password"}'
   ```

2. **Login** to receive a token (valid for 24 hours):
   ```bash
   curl -X POST http://localhost:3000/api/login \
     -H "Content-Type: application/json" \
     -d '{"username":"your_user","password":"your_password"}'
   ```

3. **Use the token** in subsequent requests:
   ```bash
   curl -X POST http://localhost:3000/api/sessions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     -d '{"focus":10,"duration":600}'
   ```

**Security Features:**
- bcrypt password hashing with 12 salt rounds
- Rate limiting: 5 attempts per 15 minutes on auth endpoints
- Token-based authentication with 24-hour expiry
- Users can only access their own session data

## Roadmap
### Phase 1 – MVP ✅
- Core audio engine with binaural and isochronic options
- Focus presets and basic UI controls
- REBAL visualization and session timer
- Local journal storage and statistics
- Comprehensive error handling and validation

### Phase 2 – Enhanced Features ✅
- Session composer for layering sounds
- Advanced breath coaching patterns
- Pattern analysis algorithms and contact mode
- Data import/export system
- Secure authentication and user accounts

### Phase 3 – Advanced Platform 🚧
- AI journal analysis and group synchronization
- Analytics dashboard and custom frequency programming
- Experimental protocols (entropy drift and more)

See the `goals` file for the full technical brief.

![image](https://github.com/user-attachments/assets/30e324d7-a2f5-4139-addf-73fbca760aaa)

