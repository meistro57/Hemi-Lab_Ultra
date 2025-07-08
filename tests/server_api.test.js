const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

jest.setTimeout(10000);

test('register and login user', async () => {
  const usersFile = path.join(__dirname, 'test_users.json');
  process.env.USERS_FILE = usersFile;
  const { start } = require('../server');
  const srv = start(0, 50);
  const port = srv.address().port;
  const url = `http://localhost:${port}`;

  let res = await fetch(url + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'pw' }),
  });
  expect(res.status).toBe(200);

  res = await fetch(url + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'pw' }),
  });
  const data = await res.json();
  expect(data.success).toBe(true);

  srv.close();
  fs.unlinkSync(usersFile);
});

test('group broadcast stays within group', (done) => {
  const { start } = require('../server');
  const srv = start(0, 50);
  const port = srv.address().port;
  const url = `ws://localhost:${port}`;
  const a = new WebSocket(url);
  const b = new WebSocket(url);
  const c = new WebSocket(url);

  a.on('open', () => a.send(JSON.stringify({ type: 'join', group: 'g1' })));
  b.on('open', () => b.send(JSON.stringify({ type: 'join', group: 'g1' })));
  c.on('open', () => c.send(JSON.stringify({ type: 'join', group: 'g2' })));

  b.on('message', (msg) => {
    const d = JSON.parse(msg);
    if (d.payload === 'hi') {
      a.close();
      b.close();
      c.close();
      srv.close(() => done());
    }
  });
  c.on('message', () => done(new Error('cross-talk')));
  a.on('open', () => {
    setTimeout(() => {
      a.send(JSON.stringify({ group: 'g1', payload: 'hi' }));
    }, 100);
  });
});
