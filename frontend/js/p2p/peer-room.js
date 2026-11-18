// P2P-комната на WebRTC.
// Сервер SkillOrbit (WebSocket /ws/signal) только знакомит участников и пересылает
// SDP/ICE. Сами сообщения идут напрямую между браузерами по RTCDataChannel (mesh-сеть).
//
// Протокол сигналинга (JSON):
//   → { type: 'join', room, name }          ← { type: 'welcome', peerId, room, peers: [{ id, name }] }
//   → { type: 'signal', to, data }          ← { type: 'signal', from, data }   data: { sdp } | { candidate }
//   → { type: 'leave' } / { type: 'ping' }  ← { type: 'peer-joined', peer } / { type: 'peer-left', peerId } / { type: 'pong' }
//                                           ← { type: 'error', message }
//
// События: status, peer-joined, peer-connected, peer-left, message, error.

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const MAX_MESSAGE = 2000;

export class PeerRoom extends EventTarget {
  constructor({ url, room, name, iceServers = DEFAULT_ICE_SERVERS }) {
    super();
    this.url = url;
    this.room = room;
    this.name = name;
    this.iceServers = iceServers;
    this.peers = new Map();
    this.selfId = null;
    this.ws = null;
    this.heartbeat = 0;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  /** Подключается к сигнальному серверу; промис выполняется после 'welcome'. */
  join() {
    return new Promise((resolve, reject) => {
      let welcomed = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      this.emit('status', { state: 'connecting' });

      ws.addEventListener('open', () => {
        this.sendSignal({ type: 'join', room: this.room, name: this.name });
        this.heartbeat = setInterval(() => this.sendSignal({ type: 'ping' }), 25000);
      });

      ws.addEventListener('message', (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'welcome') welcomed = true;
        if (msg.type === 'error' && !welcomed) reject(new Error(msg.message || 'The room refused the connection.'));
        this.onSignal(msg, resolve).catch((error) => this.emit('error', { message: error.message }));
      });

      ws.addEventListener('close', () => {
        clearInterval(this.heartbeat);
        this.closeAll();
        this.emit('status', { state: 'closed' });
        if (!welcomed) reject(new Error('The signaling server is not reachable. Start the backend and try again.'));
      });
    });
  }

  /** Отправляет текст всем, с кем открыт канал. Возвращает число получателей. */
  send(text) {
    const payload = JSON.stringify({ type: 'chat', text: String(text).slice(0, MAX_MESSAGE) });
    let sent = 0;
    for (const peer of this.peers.values()) {
      if (peer.channel && peer.channel.readyState === 'open') {
        peer.channel.send(payload);
        sent++;
      }
    }
    return sent;
  }

  leave() {
    this.sendSignal({ type: 'leave' });
    if (this.ws) this.ws.close();
    this.closeAll();
  }

  // ------------------------------------------------------------ сигналинг

  async onSignal(msg, resolveJoin) {
    switch (msg.type) {
      case 'welcome':
        this.selfId = msg.peerId;
        this.emit('status', { state: 'joined', peerId: msg.peerId, room: msg.room });
        resolveJoin(msg);
        // Новичок сам звонит всем, кто уже в комнате, — так не бывает встречных offer
        for (const peer of msg.peers || []) await this.callPeer(peer);
        break;
      case 'peer-joined':
        this.ensurePeer(msg.peer);
        this.emit('peer-joined', msg.peer);
        break;
      case 'peer-left':
        this.dropPeer(msg.peerId);
        break;
      case 'signal':
        await this.handleSignal(msg.from, msg.data || {});
        break;
      case 'error':
        this.emit('error', { message: msg.message });
        break;
      default:
        break;
    }
  }

  sendSignal(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  ensurePeer(info) {
    const existing = this.peers.get(info.id);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = { id: info.id, name: info.name || 'Peer', pc, channel: null, pendingCandidates: [] };
    this.peers.set(info.id, peer);

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) this.sendSignal({ type: 'signal', to: peer.id, data: { candidate: event.candidate } });
    });
    pc.addEventListener('datachannel', (event) => this.bindChannel(peer, event.channel));
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') this.dropPeer(peer.id);
    });
    return peer;
  }

  async callPeer(info) {
    const peer = this.ensurePeer(info);
    this.bindChannel(peer, peer.pc.createDataChannel('chat', { ordered: true }));
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    this.sendSignal({ type: 'signal', to: peer.id, data: { sdp: peer.pc.localDescription } });
  }

  async handleSignal(from, data) {
    const peer = this.peers.get(from) || this.ensurePeer({ id: from });
    const pc = peer.pc;

    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        this.sendSignal({ type: 'signal', to: from, data: { sdp: pc.localDescription } });
      }
      // ICE-кандидаты, пришедшие раньше SDP
      for (const candidate of peer.pendingCandidates.splice(0)) {
        await pc.addIceCandidate(candidate).catch(() => {});
      }
    } else if (data.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
      else peer.pendingCandidates.push(data.candidate);
    }
  }

  bindChannel(peer, channel) {
    peer.channel = channel;
    channel.addEventListener('open', () => this.emit('peer-connected', { id: peer.id, name: peer.name }));
    channel.addEventListener('message', (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (payload && payload.type === 'chat' && typeof payload.text === 'string') {
        this.emit('message', { from: peer.id, name: peer.name, text: payload.text.slice(0, MAX_MESSAGE) });
      }
    });
  }

  dropPeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    if (peer.channel) peer.channel.close();
    peer.pc.close();
    this.emit('peer-left', { id, name: peer.name });
  }

  closeAll() {
    for (const id of [...this.peers.keys()]) this.dropPeer(id);
  }
}
