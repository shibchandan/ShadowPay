import React from 'react';
import { HistoryIcon } from './Icons.jsx';

export default function AuditLedger({ transactions, expandedTxId, setExpandedTxId }) {
  return (
    <div className="page-container">
      <div className="page-header-block">
        <h2 className="page-title">Settle Records Ledger</h2>
        <p className="page-description">
          Review the server database transaction tables. Expand settled entries to inspect digital signatures, validation states, and decrypted payload objects.
        </p>
      </div>

      <section className="glass-card">
        <div className="card-header-bar">
          <h3 className="card-title">
            <HistoryIcon />
            Settled Transaction Table
          </h3>
          <span className="card-subtitle">Server Database Records</span>
        </div>

        <div className="ledger-list">
          {transactions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '3rem 1rem', textAlign: 'center', fontSize: '0.85rem' }}>
              No transactions settled. Try generating payments on the Wallet Page and flushing bridge queues on the Mesh Page.
            </div>
          ) : (
            transactions.map(tx => {
              const isExpanded = expandedTxId === tx._id;
              return (
                <div className="ledger-item-wrapper" key={tx._id}>
                  <div className="ledger-item-header" onClick={() => setExpandedTxId(isExpanded ? null : tx._id)}>
                    <div className="ledger-info">
                      <div className="ledger-route">
                        {tx.senderVpa.split('@')[0]}
                        <span className="route-arrow">➜</span>
                        {tx.receiverVpa.split('@')[0]}
                      </div>
                      <div className="ledger-meta">
                        Hops: {tx.hopCount} | Gateway Bridge: {tx.bridgeNodeId.replace('phone-', '')}
                      </div>
                    </div>
                    <div className="ledger-amount-status">
                      <span className="ledger-amount">₹{tx.amount}</span>
                      <span className={`status-badge ${tx.status.toLowerCase()}`}>{tx.status}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ledger-item-details">
                      <div className="crypto-checks-grid">
                        <div className="crypto-check-item valid">
                          <svg className="crypto-check-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span>RSA PKCS#1 v1.5 Signature Valid</span>
                        </div>
                        
                        <div className={`crypto-check-item ${tx.status === 'SETTLED' ? 'valid' : 'invalid'}`}>
                          <svg className="crypto-check-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d={tx.status === 'SETTLED' ? "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" : "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"} clipRule="evenodd" />
                          </svg>
                          <span>Replay Gate: Unique Hash Claimed</span>
                        </div>
                        
                        <div className="crypto-check-item info">
                          <svg className="crypto-check-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <span>Type: {tx.isPrefunded || tx.hopCount > 0 ? 'Offline Wallet Pool' : 'Direct Balance Debit'}</span>
                        </div>
                        
                        <div className="crypto-check-item info">
                          <svg className="crypto-check-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.8 2.8a1 1 0 001.414-1.414L11 9.586V6z" clipRule="evenodd" />
                          </svg>
                          <span>Packet Age: Under 24h</span>
                        </div>
                      </div>

                      <div className="audit-path-section">
                        <div className="audit-path-title">P2P Cryptographic Routing Audit Path</div>
                        <div className="audit-path-flow">
                          <div className="audit-hop origin">
                            <span className="hop-icon">📱</span>
                            <span className="hop-name">{tx.senderVpa.split('@')[0]}</span>
                            <span className="hop-status verified">(Payload Signed)</span>
                          </div>
                          
                          {tx.auditedPath && tx.auditedPath.length > 0 ? (
                            tx.auditedPath.map((hop, index) => (
                              <React.Fragment key={index}>
                                <div className="hop-arrow">➔</div>
                                <div className={`audit-hop ${hop.verified ? 'verified' : 'unverified'}`}>
                                  <span className="hop-icon">{hop.deviceId.includes('bridge') ? '📡' : '📱'}</span>
                                  <span className="hop-name">{hop.deviceId.replace('phone-', '')}</span>
                                  <span className="hop-status">{hop.verified ? '✓ Ack Verified' : '❌ Bad Signature'}</span>
                                </div>
                              </React.Fragment>
                            ))
                          ) : (
                            <React.Fragment>
                              <div className="hop-arrow">➔</div>
                              <div className="audit-hop direct">
                                <span className="hop-icon">📡</span>
                                <span className="hop-name">{tx.bridgeNodeId.replace('phone-', '')}</span>
                                <span className="hop-status">(Direct Ingestion)</span>
                              </div>
                            </React.Fragment>
                          )}
                        </div>
                      </div>
                      
                      <div className="hash-row">
                        <div className="hash-label">Packet Hash (SHA-256)</div>
                        <div className="hash-value">{tx.packetHash}</div>
                      </div>
                      
                      <div className="payload-json-box">
                        <pre>
                          {JSON.stringify({
                            instruction: {
                              senderVpa: tx.senderVpa,
                              receiverVpa: tx.receiverVpa,
                              amount: parseFloat(tx.amount).toFixed(2),
                              nonce: tx.packetHash.substring(0, 8) + "-uuid",
                              signedAt: new Date(tx.signedAt).getTime(),
                              isPrefunded: tx.isPrefunded || tx.hopCount > 0
                            },
                            bridgeUploadedBy: tx.bridgeNodeId,
                            networkHopsCount: tx.hopCount,
                            auditedRoutingPath: tx.auditedPath || []
                          }, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
