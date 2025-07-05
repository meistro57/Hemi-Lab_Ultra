import asyncio
import json
import threading

import numpy as np
from scipy.signal import welch

try:
    from pyOpenBCI import OpenBCICyton
except ImportError:  # pragma: no cover - library may not be installed
    OpenBCICyton = None

import websockets

FS = 250  # Sampling rate in Hz for Cyton
WINDOW_SIZE = FS  # 1 second of data
BANDS = {
    "delta": (1, 4),
    "theta": (4, 8),
    "alpha": (8, 12),
    "beta": (12, 30),
}


class EEGBridge:
    """Read EEG samples from OpenBCI and broadcast band power via WebSocket."""

    def __init__(self, port="/dev/ttyUSB0", host="localhost", ws_port=8765):
        if OpenBCICyton is None:
            raise RuntimeError("pyOpenBCI library is required")
        self.board = OpenBCICyton(port=port)
        self.host = host
        self.ws_port = ws_port
        self.clients = set()
        self.loop = asyncio.get_event_loop()
        self.buffer = []

    def start(self):
        """Start the board thread and WebSocket server."""
        thread = threading.Thread(
            target=self.board.start_streaming, args=(self.handle_sample,), daemon=True
        )
        thread.start()
        self.loop.run_until_complete(self._serve())

    async def _serve(self):
        async with websockets.serve(self._handler, self.host, self.ws_port):
            await asyncio.Future()  # run forever

    async def _handler(self, websocket):
        self.clients.add(websocket)
        try:
            await websocket.wait_closed()
        finally:
            self.clients.remove(websocket)

    def handle_sample(self, sample):
        self.buffer.append(np.array(sample.channels_data, dtype=np.float32))
        if len(self.buffer) >= WINDOW_SIZE:
            data = np.array(self.buffer[-WINDOW_SIZE:])
            metrics = self.compute_bandpower(data)
            self.loop.call_soon_threadsafe(asyncio.create_task, self.broadcast(metrics))
            self.buffer = self.buffer[-WINDOW_SIZE // 2 :]

    def compute_bandpower(self, samples):
        bp = {}
        for ch in range(samples.shape[1]):
            f, psd = welch(samples[:, ch], FS)
            channel_power = {}
            for name, (lo, hi) in BANDS.items():
                idx = np.logical_and(f >= lo, f <= hi)
                channel_power[name] = float(np.trapz(psd[idx], f[idx]))
            bp[f"ch{ch+1}"] = channel_power

        avg = {name: float(np.mean([ch[name] for ch in bp.values()])) for name in BANDS}
        return {"channels": bp, "average": avg}

    async def broadcast(self, metrics):
        if not self.clients:
            return
        message = json.dumps(metrics)
        await asyncio.gather(*[ws.send(message) for ws in self.clients])


if __name__ == "__main__":
    bridge = EEGBridge()
    bridge.start()
