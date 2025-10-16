const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

jest.setTimeout(10000);

test('register and login user', async () => {
  const usersFile = path.join(__dirname, 'test_users.json');
  process.env.USERS_FILE = usersFile;
  jest.resetModules();
  const { start } = require('../server');
  const srv = start(0, 50);
  const port = srv.address().port;
  const url = `http://localhost:${port}`;

  let res = await fetch(url + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'password123' }),
  });
  expect(res.status).toBe(200);
  const registerData = await res.json();
  expect(registerData.success).toBe(true);
  expect(registerData.token).toBeDefined();

  res = await fetch(url + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'password123' }),
  });
  const data = await res.json();
  expect(data.success).toBe(true);
  expect(data.token).toBeDefined();

  srv.close();
  fs.unlinkSync(usersFile);
});

test('group broadcast stays within group', (done) => {
  jest.resetModules();
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
    if (d.type === 'ping') return; // Ignore system ping messages
    if (d.payload === 'hi') {
      a.close();
      b.close();
      c.close();
      srv.close(() => done());
    }
  });
  c.on('message', (msg) => {
    const d = JSON.parse(msg);
    if (d.type === 'ping') return; // Ignore system ping messages
    done(new Error('cross-talk'));
  });
  a.on('open', () => {
    setTimeout(() => {
      a.send(JSON.stringify({ group: 'g1', payload: 'hi' }));
    }, 100);
  });
});

test('create and fetch sessions', async () => {
  const sessionsFile = path.join(__dirname, 'test_sessions.json');
  const usersFile = path.join(__dirname, 'test_users2.json');
  process.env.SESSIONS_FILE = sessionsFile;
  process.env.USERS_FILE = usersFile;
  jest.resetModules();
  const { start } = require('../server');
  const srv = start(0, 50);
  const port = srv.address().port;
  const base = `http://localhost:${port}`;

  // First, register and get a token
  let res = await fetch(base + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'bob', password: 'password123' }),
  });
  const registerData = await res.json();
  const token = registerData.token;

  // Create session with authentication
  res = await fetch(base + '/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ focus: 10 }),
  });
  expect(res.status).toBe(200);

  // Fetch sessions with authentication
  res = await fetch(base + '/api/sessions', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const list = await res.json();
  expect(list.length).toBe(1);
  expect(list[0].user).toBe('bob');

  srv.close();
  if (fs.existsSync(sessionsFile)) fs.unlinkSync(sessionsFile);
  if (fs.existsSync(usersFile)) fs.unlinkSync(usersFile);
});
