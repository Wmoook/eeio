// Lightweight client networking for EE .io clone
// Exposes window.Net with: connect(room), send(msg), on(type, handler)
(function(){
  const listeners = new Map(); // type -> Set of handlers
  let ws = null;
  let myId = null;
  let room = 'lobby';
  let statusEl = null;

  function emit(type, data){
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of set) { try { fn(data); } catch(_){} }
  }

  function setStatus(text){
    if (!statusEl) statusEl = document.getElementById('netStatus');
    if (statusEl) statusEl.textContent = text;
  }

  function getDefaultIsolatedRoom(){
    try {
      const key = 'EEO_TAB_ROOM';
      let rid = sessionStorage.getItem(key);
      if (!rid) { rid = `tab-${Math.random().toString(36).slice(2, 10)}`; sessionStorage.setItem(key, rid); }
      return rid;
    } catch (_) { return `tab-${Math.random().toString(36).slice(2, 10)}`; }
  }

  function connect(roomId){
    if (ws && ws.readyState === WebSocket.OPEN) try { ws.close(); } catch(_){ }
    room = roomId || getDefaultIsolatedRoom();
    const proto = (location.protocol === 'https:') ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(room)}`;
    ws = new WebSocket(url);
    setStatus('connecting…');
    ws.onopen = ()=>{ setStatus(`connected: ${room}`); emit('open', { room }); };
    ws.onclose = ()=>{ setStatus('offline'); emit('close', {}); };
    ws.onerror = ()=>{ setStatus('error'); };
    ws.onmessage = (ev)=>{
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') { myId = msg.id; emit('hello', { id: myId }); return; }
      if (msg.t === 'state_full') { try { window.Net._lastFull = msg; } catch(_){} emit('state_full', msg); return; }
      emit('message', msg);
      if (msg.t) emit(msg.t, msg);
    };
  }

  function send(obj){
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  function on(type, handler){
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    return () => listeners.get(type)?.delete(handler);
  }

  window.Net = { connect, send, on, get id(){ return myId; }, get room(){ return room; } };

  // Hook up UI
  const btn = document.getElementById('connectBtn');
  const input = document.getElementById('roomInput');
  if (btn) {
    btn.addEventListener('click', ()=>{
      const requested = (input && input.value.trim()) || '';
      connect(requested || undefined);
    });
  }
})();


