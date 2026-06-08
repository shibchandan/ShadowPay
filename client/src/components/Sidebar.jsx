import React from 'react';
import { LogoIcon, NetworkIcon, SendIcon, HistoryIcon } from './Icons.jsx';

export default function Sidebar({ activeTab, setActiveTab, totalPacketsInMesh }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <LogoIcon />
        <h2 className="brand-title">ShadowPay</h2>
      </div>
      
      <nav className="sidebar-menu">
        <button className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
          <svg className="nav-item-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Overview
        </button>
        
        <button className={`nav-item ${activeTab === 'mesh' ? 'active' : ''}`} onClick={() => setActiveTab('mesh')}>
          <NetworkIcon />
          Mesh Simulator
        </button>
        
        <button className={`nav-item ${activeTab === 'wallet' ? 'active' : ''}`} onClick={() => setActiveTab('wallet')}>
          <SendIcon />
          Wallet & Pay
        </button>
        
        <button className={`nav-item ${activeTab === 'ledger' ? 'active' : ''}`} onClick={() => setActiveTab('ledger')}>
          <HistoryIcon />
          Audit Ledger
        </button>
        
        <button className={`nav-item ${activeTab === 'console' ? 'active' : ''}`} onClick={() => setActiveTab('console')}>
          <svg className="nav-item-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Dev Console
        </button>

        <button className={`nav-item ${activeTab === 'threats' ? 'active' : ''}`} onClick={() => setActiveTab('threats')}>
          <svg className="nav-item-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="20" height="20">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Threat Model
        </button>
      </nav>
      
      <div className="sidebar-footer">
        <div className="status-badge-container">
          <span className="badge-pill status-active">
            <span className="pulse-dot"></span>
            Live Grid
          </span>
          <span className="badge-pill">
            📦 {totalPacketsInMesh} Queue Packets
          </span>
          <span className="badge-pill mtls-active" title="Mutual TLS Gateway Ingestion Enforced">
            <span className="mtls-shield-dot"></span>
            🛡️ mTLS Secure
          </span>
        </div>
      </div>
    </aside>
  );
}
