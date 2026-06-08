import React from 'react';

export default function ThreatModel() {
  return (
    <div className="page-container">
      <div className="page-header-block">
        <h2 className="page-title">Threat Model & Security Auditing</h2>
        <p className="page-description">
          Review the active threat mitigation strategies and cryptographic controls protecting the offline mesh payment system.
        </p>
      </div>

      <div className="threats-grid">
        <div className="threat-card active-mitigation">
          <div className="threat-header">
            <h4>Payload Confidentiality</h4>
            <span className="threat-badge green">🔒 SECURED</span>
          </div>
          <p className="threat-description"><strong>Threat:</strong> Eavesdropping on transaction payloads by nodes carrying packets in the offline mesh.</p>
          <div className="threat-tech font-mono">AES-256-GCM + RSA-OAEP-SHA256</div>
        </div>

        <div className="threat-card active-mitigation">
          <div className="threat-header">
            <h4>Payload Integrity</h4>
            <span className="threat-badge green">🛡️ SECURED</span>
          </div>
          <p className="threat-description"><strong>Threat:</strong> Intermediary nodes tampering with transaction values or destination VPAs in transit.</p>
          <div className="threat-tech font-mono">GCM Authentication Tags</div>
        </div>

        <div className="threat-card active-mitigation">
          <div className="threat-header">
            <h4>Node Authentication</h4>
            <span className="threat-badge green">🔑 SECURED</span>
          </div>
          <p className="threat-description"><strong>Threat:</strong> Spoofing identities to forge payments or submit unauthorized transaction payloads.</p>
          <div className="threat-tech font-mono">Offline RSA-2048 Signatures</div>
        </div>

        <div className="threat-card active-mitigation">
          <div className="threat-header">
            <h4>Replay Resistance</h4>
            <span className="threat-badge green">🔄 SECURED</span>
          </div>
          <p className="threat-description"><strong>Threat:</strong> Re-broadcasting intercepted payment payloads to trigger double settlements.</p>
          <div className="threat-tech font-mono">Nonces + 24h fresh gate + Idempotency</div>
        </div>

        <div className="threat-card active-mitigation">
          <div className="threat-header">
            <h4>Double-Spend Protection</h4>
            <span className="threat-badge green">💰 SECURED</span>
          </div>
          <p className="threat-description"><strong>Threat:</strong> Users double-spending balances locally without real-time database connectivity.</p>
          <div className="threat-tech font-mono">Server-signed Prefunded locks</div>
        </div>

        <div className="threat-card active-mitigation">
          <div className="threat-header">
            <h4>Server Key Safety</h4>
            <span className="threat-badge green">🗝️ SECURED</span>
          </div>
          <p className="threat-description"><strong>Threat:</strong> Attackers gaining server private keys to forge valid wallet tokens.</p>
          <div className="threat-tech font-mono">AES-256 key vault + Disk Shredding</div>
        </div>

        <div className="threat-card active-mitigation">
          <div className="threat-header">
            <h4>Gateway mTLS Shield</h4>
            <span className="threat-badge green">🌐 SECURED</span>
          </div>
          <p className="threat-description"><strong>Threat:</strong> Rogue bridge nodes spamming the server or forging uploads to ingestion paths.</p>
          <div className="threat-tech font-mono">HTTPS client certificate validation</div>
        </div>

        <div className="threat-card active-mitigation">
          <div className="threat-header">
            <h4>P2P Routing Auditing</h4>
            <span className="threat-badge green">🛰️ SECURED</span>
          </div>
          <p className="threat-description"><strong>Threat:</strong> Rogue mesh nodes acting as blackholes, discarding packets instead of forwarding.</p>
          <div className="threat-tech font-mono">Hop Ack signature chain audit</div>
        </div>
      </div>

      <div className="two-column-layout" style={{ marginTop: '1rem' }}>
        <section className="glass-card">
          <div className="card-header-bar">
            <h3 className="card-title">🔬 Prototype Sandbox Limits</h3>
          </div>
          <ul className="threats-list-styled">
            <li>
              <strong>Local Memory Storage</strong>
              <p>Balances and private keys are currently held in client-side JS variables for simulation convenience.</p>
            </li>
            <li>
              <strong>Virtual mTLS bypass</strong>
              <p>The dashboard connects over HTTPS but does not require certificates for admin metrics endpoints.</p>
            </li>
          </ul>
        </section>

        <section className="glass-card">
          <div className="card-header-bar">
            <h3 className="card-title">🚀 Production Architecture</h3>
          </div>
          <ul className="threats-list-styled">
            <li>
              <strong>Hardware Secure Enclaves</strong>
              <p>Keys and offline balance checking must run inside a TEE/Secure Enclave, preventing device owners from tampering.</p>
            </li>
            <li>
              <strong>SSL Pinning Enforcement</strong>
              <p>Mobile clients hardcode the gateway CA certificate to protect against DNS spoofing and proxy MITM attacks.</p>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
