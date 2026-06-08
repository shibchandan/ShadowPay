import React from 'react';

export default function Overview({ accounts, transactions, meshDevices, walletTokens }) {
  // Stats calculations
  const activeNodesCount = meshDevices.length;
  const onlineBridgesCount = meshDevices.filter(d => d.hasInternet).length;
  const totalPacketsInMesh = meshDevices.reduce((sum, d) => sum + (d.packetCount || 0), 0);
  const totalLockedFunds = accounts.reduce((sum, a) => sum + parseFloat(a.prefundedBalance || 0), 0).toFixed(2);
  const settledTxsCount = transactions.filter(t => t.status === 'SETTLED').length;

  return (
    <div className="page-container">
      <div className="page-header-block">
        <h2 className="page-title">Dashboard Overview</h2>
        <p className="page-description">
          Real-time summary of the offline UPI payment simulation. Monitor account ledger pools, device counts, and settlement numbers.
        </p>
      </div>

      {/* Metrics Row */}
      <section className="stats-grid">
        <div className="stat-card active-nodes">
          <div className="stat-icon-container">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{activeNodesCount} Devices</span>
            <span className="stat-label">{onlineBridgesCount} Bridge / {activeNodesCount - onlineBridgesCount} Offline</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-container">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{totalPacketsInMesh} Packets</span>
            <span className="stat-label">In-Transit Queues</span>
          </div>
        </div>

        <div className="stat-card locked-funds">
          <div className="stat-icon-container">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">₹{totalLockedFunds}</span>
            <span className="stat-label">Prefunded Pool</span>
          </div>
        </div>

        <div className="stat-card settled-txs">
          <div className="stat-icon-container">
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{settledTxsCount} Txs</span>
            <span className="stat-label">Settled Ledger</span>
          </div>
        </div>
      </section>

      {/* Production Gateway mTLS Shield Card */}
      <section className="glass-card mtls-shield-card">
        <div className="card-header-bar">
          <h3 className="card-title">
            <svg className="shield-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--success-color)', marginRight: '0.25rem' }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Production Gateway Security (mTLS & SSL Pinning)
          </h3>
          <span className="badge-pill status-secure">
            <span className="pulse-dot-green"></span>
            SECURE
          </span>
        </div>
        <div className="mtls-details-grid">
          <div className="mtls-detail-item">
            <span className="mtls-detail-label">Gateway Protocol</span>
            <span className="mtls-detail-value font-mono">HTTPS / TLS v1.3</span>
          </div>
          <div className="mtls-detail-item">
            <span className="mtls-detail-label">Client Certificate Auth</span>
            <span className="mtls-detail-value font-mono text-green">ENFORCED (2048-bit RSA)</span>
          </div>
          <div className="mtls-detail-item">
            <span className="mtls-detail-label">SSL Pinning Status</span>
            <span className="mtls-detail-value font-mono text-green">PINNED & VERIFIED</span>
          </div>
          <div className="mtls-detail-item">
            <span className="mtls-detail-label">P2P Routing Audit</span>
            <span className="mtls-detail-value font-mono text-green">SIGNATURE CHAINS ACTIVE</span>
          </div>
        </div>
        <div className="mtls-cert-chain">
          <div className="cert-node">
            <span className="cert-icon">🔑</span>
            <span className="cert-name">ShadowPay Root CA</span>
          </div>
          <div className="cert-line"></div>
          <div className="cert-node">
            <span className="cert-icon">🖥️</span>
            <span className="cert-name">localhost (Server)</span>
          </div>
          <div className="cert-line"></div>
          <div className="cert-node">
            <span className="cert-icon">📱</span>
            <span className="cert-name">Bridge Node (Client)</span>
          </div>
        </div>
      </section>

      {/* Account Ledger Card */}
      <section className="glass-card">
        <div className="card-header-bar">
          <h3 className="card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--accent-blue)' }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            User Account Ledger Pools
          </h3>
          <span className="card-subtitle">Server Bank Core</span>
        </div>

        <div className="balances-list">
          {accounts.map(acc => (
            <div className="balance-item" key={acc._id}>
              <div className="balance-meta">
                <span className="balance-name">{acc.name}</span>
                <span className="balance-vpa">{acc._id}</span>
              </div>
              <div className="balance-values">
                <span className="balance-amount-main">₹{acc.balance}</span>
                <span className="balance-amount-prefunded">
                  ₹{acc.prefundedBalance}
                  {walletTokens[acc._id] && <span className="balance-token-badge">🔑 LOCKED</span>}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
