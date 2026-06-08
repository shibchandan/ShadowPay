import React from 'react';
import { LockIcon, SendIcon } from './Icons.jsx';

export default function WalletPay({
  accounts,
  loading,
  walletTokens,
  lockAmount,
  setLockAmount,
  handleLockFunds,
  senderVpa,
  setSenderVpa,
  receiverVpa,
  setReceiverVpa,
  amount,
  setAmount,
  isPrefunded,
  setIsPrefunded,
  pin,
  setPin,
  handleInject
}) {
  return (
    <div className="page-container">
      <div className="page-header-block">
        <h2 className="page-title">Wallet & Payment Hub</h2>
        <p className="page-description">
          Settle pre-funded locks while connected to the internet, and compose cryptographically signed transaction payloads offline.
        </p>
      </div>

      <div className="two-column-layout">
        {/* Pre-funding locked balance creator */}
        <section className="glass-card">
          <div className="card-header-bar">
            <h3 className="card-title">
              <LockIcon />
              Lock Prefunded Balances (Online)
            </h3>
          </div>
          <div className="form-group">
            <label className="form-label">Amount to Lock (INR)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="form-input"
                type="number"
                step="50"
                value={lockAmount}
                onChange={(e) => setLockAmount(e.target.value)}
                disabled={loading}
                style={{ flexGrow: 1 }}
              />
              <button
                className="btn btn-secondary"
                onClick={handleLockFunds}
                disabled={loading || senderVpa === 'merchant@shadowpay'}
                style={{ whiteSpace: 'nowrap' }}
              >
                🔒 Lock Pool
              </button>
            </div>
            <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem', lineHeight: '1.4' }}>
              Locks funds on the bank core database, issuing a server-signed RSA cryptographic token. This allows offline double-spend-proof execution.
            </small>
          </div>
        </section>

        {/* Compose offline pay instruction form */}
        <section className="glass-card">
          <div className="card-header-bar">
            <h3 className="card-title">
              <SendIcon />
              Compose Offline UPI Payload
            </h3>
          </div>
          <form onSubmit={handleInject}>
            <div className="form-group">
              <label className="form-label">Sender VPA (Offline device)</label>
              <select className="form-input" value={senderVpa} onChange={(e) => setSenderVpa(e.target.value)}>
                {accounts.map(acc => (
                  <option key={acc._id} value={acc._id}>{acc.name} ({acc._id})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Receiver (VPA)</label>
              <select className="form-input" value={receiverVpa} onChange={(e) => setReceiverVpa(e.target.value)}>
                {accounts.map(acc => (
                  <option key={acc._id} value={acc._id}>{acc.name} ({acc._id})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Amount (INR)</label>
              <input className="form-input" type="number" step="10" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>

            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem 0' }}>
              <input
                type="checkbox"
                id="prefunded-toggle"
                checked={isPrefunded}
                onChange={(e) => setIsPrefunded(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="prefunded-toggle" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                Pay from Pre-funded Wallet {walletTokens[senderVpa] ? '🔑 (Active Token)' : '⚠️ (No active token)'}
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">UPI PIN</label>
              <input className="form-input" type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="1234" maxLength="4" />
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
              📤 Sign & Inject into Phone-Alice Queue
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
