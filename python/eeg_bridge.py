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

    def __init__(
        self,
        port: str = "/dev/ttyUSB0",
        host: str = "localhost",
        ws_port: int = 8765,
        output_file: str | None = None,
    ) -> None:
        if OpenBCICyton is None:
            raise RuntimeError("pyOpenBCI library is required")
        self.board = OpenBCICyton(port=port)
        self.host = host
        self.ws_port = ws_port
        self.clients = set()
        self.loop = asyncio.get_event_loop()
        self.buffer = []
        self.output_file = output_file

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
        self.log_metrics(metrics)

    def log_metrics(self, metrics: dict) -> None:
        if not self.output_file:
            return
        with open(self.output_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(metrics) + "\n")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--serial-port", default="/dev/ttyUSB0")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--ws-port", type=int, default=8765)
    parser.add_argument("--output-file")
    args = parser.parse_args()

    bridge = EEGBridge(
        port=args.serial_port,
        host=args.host,
        ws_port=args.ws_port,
        output_file=args.output_file,
    )
    bridge.start()
