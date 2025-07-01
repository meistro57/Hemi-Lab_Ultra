--This is a personal project of mine. It may or may not work. It may or may not cause you harm. It may or may not induce anything. Use at your own risk as I will not be responsible for whatever happens. 

# Hemi-Lab Ultra

Hemi-Lab Ultra is a lightweight browser application for exploring altered states of consciousness. The project contains a single HTML file with an audio engine and optional static server.

## Quick Start
1. Open `Hemi-Lab_Ultra++.html` directly in a modern browser; or
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
- **Binaural Beat Engine** – custom frequency entrainment with phase shifting
- **Focus Level Navigator** – Monroe Institute inspired presets
- **REBAL Energy Shield** – animated protection visualization
- **Breath Coach** – synchronized breathing prompts
- **Session Journal** – record mood and insights
- **Pattern Analysis** – discover optimal practice trends
- **Affirmation Layer** – spoken positive cues during sessions
- **Data Import/Export** – backup and restore your journal history
- **Real-Time EEG Feedback** – optional audio adjustments via WebSocket

## Usage
1. Select your desired focus level.
2. Adjust base/beat frequencies, phase and volume.
3. Click **Begin Session** to start audio and visuals.
4. Optionally enable the REBAL shield or breath coach.
5. After stopping, write down your experience in the journal.
6. Click **Analyze Patterns** in the journal section to review insights.

The deeper states (Focus 15, 21, 23+) can produce profound results. Use quality headphones in a quiet space and document everything.

## Roadmap
### Phase 1 – MVP
- Core audio engine with binaural and isochronic options
- Focus presets and basic UI controls
- REBAL visualization and session timer
- Local journal storage and statistics

### Phase 2 – Enhanced Features
- Session composer for layering sounds
- Advanced breath coaching patterns
- Pattern analysis algorithms and contact mode
- Data import/export system (implemented)

### Phase 3 – Advanced Platform
- Backend API with user accounts
- AI journal analysis and group synchronization
- Analytics dashboard and custom frequency programming
- Experimental protocols (entropy drift and more)

See the `goals` file for the full technical brief.

![image](https://github.com/user-attachments/assets/ab89ef43-9738-4b50-ab92-b490adc8c0ed)

