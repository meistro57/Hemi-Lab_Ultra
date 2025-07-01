import asyncio
import json
from typing import Any
import sys
from pathlib import Path

import pytest
import websockets

sys.path.append(str(Path(__file__).resolve().parents[1] / "python"))
import eeg_bridge


class DummyWebSocket:
    def __init__(self) -> None:
        self.messages: list[str] = []

    async def send(self, message: str) -> None:
        self.messages.append(message)


@pytest.fixture()
def bridge() -> eeg_bridge.EEGBridge:
    br = eeg_bridge.EEGBridge.__new__(eeg_bridge.EEGBridge)
    br.clients = set()
    br.host = "localhost"
    br.ws_port = 0
    br.loop = asyncio.new_event_loop()
    br.buffer = []
    return br


@pytest.mark.asyncio
async def test_broadcast_sends_json_to_clients(bridge: eeg_bridge.EEGBridge) -> None:
    ws1, ws2 = DummyWebSocket(), DummyWebSocket()
    bridge.clients = {ws1, ws2}
    metrics = {"ch1": {"alpha": 1.0}}

    await bridge.broadcast(metrics)

    expected = json.dumps(metrics)
    assert ws1.messages == [expected]
    assert ws2.messages == [expected]


@pytest.mark.asyncio
async def test_websocket_broadcast_loop(bridge: eeg_bridge.EEGBridge) -> None:
    server = await websockets.serve(bridge._handler, bridge.host, 0)
    port = server.sockets[0].getsockname()[1]

    async with websockets.connect(f"ws://{bridge.host}:{port}") as client:
        await asyncio.sleep(0.1)
        metrics = {"value": 42}
        await bridge.broadcast(metrics)
        received = await asyncio.wait_for(client.recv(), timeout=1)
        assert json.loads(received) == metrics

    server.close()
    await server.wait_closed()
