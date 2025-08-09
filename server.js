// Simple multiplayer server: serves static files and relays WebSocket messages by room
// Usage: npm install, then: node server.js
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const app = express();

app.use(express.static(path.join(__dirname, 'io-game')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// roomId -> Set of clients
const rooms = new Map();
const roomStates = new Map(); // roomId -> { edits: Map, shift: {...}, keys: {...}, doorsOpen: bool }

let nextId = 1;

function getRoomSet(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  return rooms.get(roomId);
}

function broadcast(roomId, data, except) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  for (const ws of room) {
    if (ws !== except && ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch (_) {}
    }
  }
}

function getHostId(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.size === 0) return null;
  let min = null;
  for (const ws of room) {
    const v = parseInt(ws.id, 10) || 0;
    if (min === null || v < min) min = v;
  }
  return (min === null) ? null : String(min);
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const roomId = (url.searchParams.get('room') || 'default').slice(0, 32);
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.id = `${nextId++}`;
    ws.roomId = roomId;
    const room = getRoomSet(roomId);
    room.add(ws);
    // initialize room state if missing
    if (!roomStates.has(roomId)) roomStates.set(roomId, { edits: new Map(), shift: {}, keys: {}, doorsOpen: false });
    const state = roomStates.get(roomId);
    // Notify join to others
    broadcast(roomId, { t: 'join', id: ws.id }, ws);
    // Send full state snapshot to the new client
    try {
      const editsArr = Array.from(state.edits.entries()).map(([k, id]) => {
        const [layer, xy] = k.split(':');
        const [x, y] = xy.split(',').map(v=>parseInt(v,10));
        return { layer, x, y, id };
      });
      ws.send(JSON.stringify({ t: 'state_full', id: ws.id, shift: state.shift||{}, keys: state.keys||{}, doorsOpen: !!state.doorsOpen, edits: editsArr }));
    } catch(_){ }
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      // Attach sender id
      msg.from = ws.id;
      // Update room state for late-join sync
      let shouldBroadcast = true;
      try {
        const st = roomStates.get(roomId) || { edits: new Map(), shift: {}, keys: {}, doorsOpen: false };
        const hostId = getHostId(roomId);
        if (msg.t === 'edit') {
          const key = `${msg.layer}:${msg.x|0},${msg.y|0}`;
          st.edits.set(key, msg.id|0);
        } else if (msg.t === 'shift_place') {
          if (ws.id !== hostId) { shouldBroadcast = false; }
          else {
            st.shift = Object.assign({}, st.shift, { level: msg.level|0, box: msg.box|0, startAtWall: undefined, goAtWall: undefined, graceEndWall: undefined });
            st.doorsOpen = false;
          }
        } else if (msg.t === 'shift_start') {
          if (ws.id !== hostId) { shouldBroadcast = false; }
          else {
            const now = Date.now();
            const lockUntil = (st.shift && st.shift.lockUntilWall) ? (st.shift.lockUntilWall|0) : 0;
            if (lockUntil && now < lockUntil) {
              // Cooldown active: reject this start
              shouldBroadcast = false;
            } else {
              const newLock = now + 60000; // 1 minute cooldown
              st.shift = Object.assign({}, st.shift, { level: msg.level|0, box: msg.box|0, startAtWall: msg.startAtWall|0, firstRound: !!msg.firstRound, lockUntilWall: newLock });
              msg.lockUntilWall = newLock;
            }
          }
        } else if (msg.t === 'shift_go') {
          if (ws.id !== hostId) { shouldBroadcast = false; }
          else {
            st.shift = Object.assign({}, st.shift, { goAtWall: Date.now() });
          }
        } else if (msg.t === 'shift_grace') {
          st.shift = Object.assign({}, st.shift, { graceEndWall: msg.graceEndWall|0 });
        } else if (msg.t === 'key') {
          if (!st.keys) st.keys = {};
          if (msg.color) st.keys[msg.color] = Date.now() + ((msg.durationMs|0)||5000);
        } else if (msg.t === 'doors') {
          st.doorsOpen = true;
        } else if (msg.t === 'reset_room') {
          // Clear all server-side state for this room and broadcast a reset notice
          st.edits = new Map();
          st.shift = {};
          st.keys = {};
          st.doorsOpen = false;
          roomStates.set(roomId, st);
          // First broadcast an instruction for clients to hard-reload the base world from disk
          broadcast(roomId, { t: 'reset_room' });
          // Then also send a fresh full state (now empty) to everyone to ensure new joiners are clean
          const editsArr = [];
          const stateMsg = { t: 'state_full', id: 'server', shift: st.shift||{}, keys: st.keys||{}, doorsOpen: !!st.doorsOpen, edits: editsArr };
          broadcast(roomId, stateMsg);
          return; // already broadcast reset event
        }
        roomStates.set(roomId, st);
      } catch(_){ }
      // Relay to room unless suppressed
      if (shouldBroadcast) broadcast(roomId, msg, ws);
    });
    ws.on('close', () => {
      const r = rooms.get(roomId);
      if (r) { r.delete(ws); if (r.size === 0) { rooms.delete(roomId); roomStates.delete(roomId); } }
      broadcast(roomId, { t: 'leave', id: ws.id });
    });
    // Welcome with your id
    try { ws.send(JSON.stringify({ t: 'hello', id: ws.id })); } catch (_) {}
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Open that URL to play. WebSocket at ws://localhost:${PORT}/ws?room=ROOM`);
});


