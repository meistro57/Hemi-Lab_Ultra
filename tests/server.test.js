const WebSocket = require('ws');
const { start } = require('../server');

jest.setTimeout(5000);

test('server sends periodic ping', (done) => {
  const srv = start(0, 50);
  const port = srv.address().port;
  const ws = new WebSocket(`ws://localhost:${port}`);

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.type === 'ping') {
      ws.close();
      srv.close(() => done());
    }
  });
});
