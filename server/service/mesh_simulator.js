import path from 'path';
import { fileURLToPath } from 'url';
import { cryptoHelper } from '../crypto-helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = path.resolve(__dirname, '../keys');
const USERS_KEYS_DIR = path.join(KEYS_DIR, 'users');

class VirtualDevice {
  constructor(deviceId, hasInternet) {
    this.deviceId = deviceId;
    this.hasInternet = hasInternet;
    this.heldPackets = new Map(); // packetId -> MeshPacket
  }

  hold(packet) {
    this.heldPackets.set(packet.packetId, packet);
  }

  holds(packetId) {
    return this.heldPackets.has(packetId);
  }

  packetCount() {
    return this.heldPackets.size;
  }

  getPackets() {
    return Array.from(this.heldPackets.values());
  }

  clear() {
    this.heldPackets.clear();
  }
}

class MeshSimulatorService {
  constructor() {
    this.devices = new Map();
    this.connections = [
      ['phone-alice', 'phone-stranger1'],
      ['phone-alice', 'phone-stranger2'],
      ['phone-stranger1', 'phone-stranger2'],
      ['phone-stranger1', 'phone-bridge'],
      ['phone-stranger2', 'phone-stranger3'],
      ['phone-stranger2', 'phone-bridge'],
      ['phone-stranger3', 'phone-bridge']
    ];
    this.seedDefaultDevices();
  }

  isNeighbor(id1, id2) {
    return this.connections.some(([n1, n2]) => 
      (n1 === id1 && n2 === id2) || (n1 === id2 && n2 === id1)
    );
  }

  seedDefaultDevices() {
    this.devices.set('phone-alice', new VirtualDevice('phone-alice', false));
    this.devices.set('phone-stranger1', new VirtualDevice('phone-stranger1', false));
    this.devices.set('phone-stranger2', new VirtualDevice('phone-stranger2', false));
    this.devices.set('phone-stranger3', new VirtualDevice('phone-stranger3', false));
    this.devices.set('phone-bridge', new VirtualDevice('phone-bridge', true));
  }

  getDevicesState() {
    const state = [];
    for (const d of this.devices.values()) {
      state.push({
        deviceId: d.deviceId,
        hasInternet: d.hasInternet,
        packetCount: d.packetCount(),
        packets: d.getPackets().map(p => ({
          packetId: p.packetId,
          ttl: p.ttl,
          createdAt: p.createdAt,
          ciphertext: p.ciphertext,
          path: p.path || []
        }))
      });
    }
    return state;
  }

  inject(deviceId, packet) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }
    // Set initial path as empty array
    packet.path = packet.path || [];
    device.hold(packet);
    console.log(`Packet ${packet.packetId.substring(0, 8)} injected into ${deviceId} with TTL ${packet.ttl}`);
  }

  async gossip() {
    let transfers = 0;
    const hops = [];
    const deviceList = Array.from(this.devices.values());

    // Snapshot current packet hold state to avoid multi-hopping in a single round
    const snapshot = new Map();
    for (const d of deviceList) {
      snapshot.set(d.deviceId, d.getPackets());
    }

    for (const src of deviceList) {
      const srcPackets = snapshot.get(src.deviceId) || [];
      for (const pkt of srcPackets) {
        if (pkt.ttl <= 0) continue; // Do not forward packets that have expired TTL

        for (const dst of deviceList) {
          if (dst.deviceId === src.deviceId) continue;
          if (dst.holds(pkt.packetId)) continue; // Already holds it

          // Enforce physical connections topology (BLE/Wi-Fi range)
          if (!this.isNeighbor(src.deviceId, dst.deviceId)) continue;

          // Generate peer-signed acknowledgment (Ack) for the new hop
          const receiverNodeId = dst.deviceId;
          const userName = receiverNodeId.replace('phone-', '');
          const privKeyPath = path.join(USERS_KEYS_DIR, `${userName}_priv.key`);
          const timestamp = Date.now();
          const hopCount = (pkt.path ? pkt.path.length : 0) + 1;

          const ackPayload = {
            packetId: pkt.packetId,
            hopCount,
            receiverNodeId,
            timestamp
          };
          const ackPayloadStr = JSON.stringify(ackPayload);
          let signature = '';
          try {
            signature = await cryptoHelper.sign(privKeyPath, ackPayloadStr);
          } catch (err) {
            console.error(`Gossip Ack signing failed for ${receiverNodeId}:`, err.message);
          }

          const ack = {
            ...ackPayload,
            signature
          };

          // Create a copy and decrement TTL, and append the new Ack to the path list
          const copy = {
            packetId: pkt.packetId,
            ttl: pkt.ttl - 1,
            createdAt: pkt.createdAt,
            ciphertext: pkt.ciphertext,
            path: pkt.path ? [...pkt.path, ack] : [ack]
          };
          dst.hold(copy);
          transfers++;
          hops.push({ from: src.deviceId, to: dst.deviceId });
        }
      }
    }

    console.log(`Gossip completed: ${transfers} packet transfers.`);
    
    const deviceCounts = {};
    for (const d of this.devices.values()) {
      deviceCounts[d.deviceId] = d.packetCount();
    }
    return { transfers, deviceCounts, hops };
  }

  collectBridgeUploads() {
    const uploads = [];
    for (const d of this.devices.values()) {
      if (!d.hasInternet) continue;
      for (const pkt of d.getPackets()) {
        uploads.push({
          bridgeNodeId: d.deviceId,
          packet: pkt
        });
      }
    }
    return uploads;
  }

  reset() {
    for (const d of this.devices.values()) {
      d.clear();
    }
  }
}

export const meshSimulator = new MeshSimulatorService();
