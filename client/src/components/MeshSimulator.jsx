import React from 'react';
import { AntennaIcon, PhoneIcon } from './Icons.jsx';

export default function MeshSimulator({
  meshDevices,
  loading,
  handleGossip,
  handleFlush,
  handleReset,
  handleToggleInternet,
  selectedNode,
  setSelectedNode,
  flyingPackets
}) {
  const nodePositions = {
    'phone-alice': { x: 18, y: 72 },
    'phone-stranger1': { x: 18, y: 28 },
    'phone-stranger2': { x: 50, y: 50 },
    'phone-stranger3': { x: 82, y: 72 },
    'phone-bridge': { x: 82, y: 28 }
  };

  const connections = [
    ['phone-alice', 'phone-stranger1'],
    ['phone-alice', 'phone-stranger2'],
    ['phone-stranger1', 'phone-stranger2'],
    ['phone-stranger1', 'phone-bridge'],
    ['phone-stranger2', 'phone-stranger3'],
    ['phone-stranger2', 'phone-bridge'],
    ['phone-stranger3', 'phone-bridge']
  ];

  const getDevicePacketCount = (id) => {
    const dev = meshDevices.find(d => d.deviceId === id);
    return dev ? dev.packetCount : 0;
  };

  const isDeviceBridge = (id) => {
    const dev = meshDevices.find(d => d.deviceId === id);
    return dev ? dev.hasInternet : false;
  };

  const getDeviceLabel = (id) => {
    switch (id) {
      case 'phone-alice': return 'Alice (phone-alice)';
      case 'phone-stranger1': return 'Stranger 1 (transit)';
      case 'phone-stranger2': return 'Stranger 2 (transit)';
      case 'phone-stranger3': return 'Stranger 3 (transit)';
      case 'phone-bridge': return 'Internet Bridge Gateway';
      default: return id;
    }
  };

  const isConnectionActive = (n1, n2) => {
    return flyingPackets.some(p => 
      (p.from === n1 && p.to === n2) || (p.from === n2 && p.to === n1)
    );
  };

  const selectedDevInfo = meshDevices.find(d => d.deviceId === selectedNode);

  return (
    <div className="page-container">
      <div className="page-header-block">
        <h2 className="page-title">Mesh Routing Simulator</h2>
        <p className="page-description">
          Graph visualizer of the offline device mesh. Click any device in the canvas below to inspect its local packet queue and toggle its internet connectivity in real-time.
        </p>
      </div>

      <section className="glass-card">
        <div className="mesh-layout-container">
          {/* Canvas Graph */}
          <div className="mesh-network">
            {/* SVG Link connections */}
            <svg className="mesh-connections">
              {connections.map(([n1, n2], idx) => {
                const p1 = nodePositions[n1];
                const p2 = nodePositions[n2];
                if (!p1 || !p2) return null;
                const isActive = isConnectionActive(n1, n2);
                return (
                  <line
                    key={idx}
                    x1={`${p1.x}%`}
                    y1={`${p1.y}%`}
                    x2={`${p2.x}%`}
                    y2={`${p2.y}%`}
                    stroke={isActive ? "rgba(236, 72, 153, 0.8)" : "rgba(139, 92, 246, 0.2)"}
                    strokeWidth={isActive ? "3" : "2"}
                    className={isActive ? "highlighted" : ""}
                  />
                );
              })}
            </svg>

            {/* Animated Flying packets */}
            {flyingPackets.map(f => {
              const start = nodePositions[f.from];
              const end = nodePositions[f.to];
              if (!start || !end) return null;
              return (
                <div
                  key={f.id}
                  className="flying-packet"
                  style={{
                    '--start-x': `${start.x}%`,
                    '--start-y': `${start.y}%`,
                    '--end-x': `${end.x}%`,
                    '--end-y': `${end.y}%`
                  }}
                >
                  <div className="flying-packet-inner" />
                </div>
              );
            })}

            {/* Nodes */}
            {Object.entries(nodePositions).map(([id, pos]) => {
              const count = getDevicePacketCount(id);
              const isBridge = isDeviceBridge(id);
              const hasPackets = count > 0;
              const isSelected = selectedNode === id;
              
              return (
                <div
                  key={id}
                  className={`mesh-node ${isBridge ? 'bridge' : ''} ${hasPackets ? 'has-packets' : ''} ${isSelected ? 'selected' : ''}`}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                  onClick={() => setSelectedNode(isSelected ? null : id)}
                >
                  {isBridge ? <AntennaIcon /> : <PhoneIcon />}
                  <span className="node-id">{id.replace('phone-', '')}</span>
                  <span className="node-net">{isBridge ? '📡 Bridge' : '📴 Offline'}</span>
                  {count > 0 && <span className="node-badge">{count}</span>}
                </div>
              );
            })}
          </div>

          {/* Node Inspector side drawer */}
          <div className="node-inspector-panel">
            {selectedDevInfo ? (
              <div>
                <div className="inspector-header">
                  <span className="inspector-title">
                    {selectedDevInfo.hasInternet ? '📡' : '📴'}
                    {getDeviceLabel(selectedDevInfo.deviceId)}
                  </span>
                </div>

                <div className="inspector-net-toggle">
                  <span className="switch-label">
                    {selectedDevInfo.hasInternet ? 'Bridge Gateway Active' : 'Offline Node (Gossip only)'}
                  </span>
                  <label className="switch-container">
                    <input
                      type="checkbox"
                      checked={selectedDevInfo.hasInternet}
                      onChange={() => handleToggleInternet(selectedDevInfo.deviceId)}
                      disabled={loading}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>

                <div className="packet-queue-title">Held Queued Packets ({selectedDevInfo.packetCount})</div>
                {selectedDevInfo.packets && selectedDevInfo.packets.length > 0 ? (
                  <div className="inspector-packet-list">
                    {selectedDevInfo.packets.map(pkt => (
                      <div key={pkt.packetId} className="inspector-packet-item">
                        <div className="packet-item-meta">
                          <span className="packet-item-id">📦 {pkt.packetId.substring(0, 8)}...</span>
                          <span className="packet-item-ttl">TTL: {pkt.ttl}</span>
                        </div>
                        <div className="packet-item-ciphertext" title={pkt.ciphertext}>
                          {pkt.ciphertext}
                        </div>
                        {pkt.path && pkt.path.length > 0 && (
                          <div style={{ marginTop: '0.25rem', fontSize: '0.65rem', color: 'var(--success-color)' }}>
                            ✔ Gossip Hops: {pkt.path.map(h => h.receiverNodeId.replace('phone-', '')).join(' ➔ ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
                    No offline packets currently held in this node's storage.
                  </div>
                )}
              </div>
            ) : (
              <div className="inspector-placeholder">
                <svg className="inspector-placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>Click a device node in the graph to inspect its packet queue and toggle 4G internet connection.</span>
              </div>
            )}
          </div>
        </div>

        {/* Simulator controls buttons */}
        <div className="simulator-controls">
          <button className="btn btn-primary" onClick={handleGossip} disabled={loading}>
            🔄 Run Gossip Round
          </button>
          <button className="btn btn-secondary" onClick={handleFlush} disabled={loading}>
            📡 Ingest Flush (Bridges)
          </button>
          <button className="btn btn-danger" onClick={handleReset} disabled={loading}>
            🧹 Reset Simulation
          </button>
        </div>
      </section>
    </div>
  );
}
