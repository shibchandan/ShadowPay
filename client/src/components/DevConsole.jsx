import React from 'react';

export default function DevConsole({ outcomeLogs, terminalFilter, setTerminalFilter, setOutcomeLogs }) {
  // Filter logs based on category tab
  const filteredLogs = outcomeLogs.filter(log => {
    if (terminalFilter === 'ALL') return true;
    return log.type.toUpperCase() === terminalFilter;
  });

  return (
    <div className="page-container">
      <div className="page-header-block">
        <h2 className="page-title">Developer Console</h2>
        <p className="page-description">
          Monitor the live routing console streams and debug system/cryptographic checks as packets travel through the simulated nodes.
        </p>
      </div>

      <section className="terminal-card">
        <div className="terminal-title-bar">
          <div className="terminal-window-buttons">
            <span className="terminal-btn-dot red"></span>
            <span className="terminal-btn-dot yellow"></span>
            <span className="terminal-btn-dot green"></span>
          </div>
          <div className="terminal-title">
            <span className="pulse-indicator"></span>
            Mesh Routing Console
          </div>
        </div>

        <div className="terminal-filters-row">
          <div className="terminal-filter-tabs">
            {['ALL', 'ROUTING', 'SETTLED', 'WARNING', 'ERRORS'].map(f => (
              <button
                key={f}
                className={`terminal-tab-btn ${terminalFilter === (f === 'ERRORS' ? 'ERROR' : f) ? 'active' : ''}`}
                onClick={() => setTerminalFilter(f === 'ERRORS' ? 'ERROR' : f)}
              >
                {f}
              </button>
            ))}
          </div>
          <button className="terminal-clear-btn" onClick={() => setOutcomeLogs([])}>
            🗑️ Clear Console
          </button>
        </div>

        <div className="terminal-body">
          {filteredLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Terminal empty. No routing events match filters.
            </div>
          ) : (
            filteredLogs.map(log => (
              <div className={`terminal-line terminal-msg-${log.type}`} key={log.id}>
                <span className="terminal-timestamp">[{log.time}]</span>
                <span>{log.text}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
