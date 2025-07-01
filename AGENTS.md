# AGENTS.md

## Focus Areas
- `Hemi-Lab_Ultra+.html`: main app UI
- `server.js`: WebSocket backend
- `python/eeg_bridge.py`: EEG streaming bridge

## Goals
- Improve code readability and modularity
- Suggest UI enhancements and stability improvements
- Generate automated tests for Python/WebSocket comms
- Review WebSocket handling for edge cases and data sync issues

## How to Test
- Run `node server.js` and open in browser at `http://localhost:3000`
- For EEG bridge: run `python/python/eeg_bridge.py` and ensure it connects via WebSocket
- Validate data stream in browser and console logs

## Coding Style
- Use ES6+ JavaScript syntax
- Python 3.10+, prefer type hints
- Use `black` for formatting Python code
