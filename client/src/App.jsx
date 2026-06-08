import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Overview from './components/Overview.jsx';
import MeshSimulator from './components/MeshSimulator.jsx';
import WalletPay from './components/WalletPay.jsx';
import AuditLedger from './components/AuditLedger.jsx';
import DevConsole from './components/DevConsole.jsx';
import ThreatModel from './components/ThreatModel.jsx';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [meshDevices, setMeshDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [outcomeLogs, setOutcomeLogs] = useState([]);
  
  // Custom states for interactive features
  const [selectedNode, setSelectedNode] = useState(null);
  const [terminalFilter, setTerminalFilter] = useState('ALL');
  const [expandedTxId, setExpandedTxId] = useState(null);

  // Pre-funding and Offline Wallet Token States
  const [walletTokens, setWalletTokens] = useState({});
  const [lockAmount, setLockAmount] = useState('300');
  const [isPrefunded, setIsPrefunded] = useState(false);
  const [flyingPackets, setFlyingPackets] = useState([]);

  // Form states
  const [senderVpa, setSenderVpa] = useState('alice@shadowpay');
  const [receiverVpa, setReceiverVpa] = useState('merchant@shadowpay');
  const [amount, setAmount] = useState('250.00');
  const [pin, setPin] = useState('1234');

  const fetchData = async () => {
    try {
      const [accRes, txRes, meshRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/transactions'),
        fetch('/api/mesh/state')
      ]);

      const [accData, txData, meshData] = await Promise.all([
        accRes.json(),
        txRes.json(),
        meshRes.json()
      ]);

      setAccounts(accData);
      setTransactions(txData);
      setMeshDevices(meshData);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll data every 2.5 seconds for active simulation updates
    const interval = setInterval(fetchData, 2500);
    return () => clearInterval(interval);
  }, []);

  const addLog = (msg) => {
    let type = 'system';
    if (msg.includes('❌') || msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('rejected')) {
      type = 'error';
    } else if (msg.includes('⚠️') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('warning')) {
      type = 'warning';
    } else if (msg.includes('✅') || msg.toLowerCase().includes('settled') || msg.toLowerCase().includes('succeeded')) {
      type = 'settled';
    } else if (msg.includes('🔄') || msg.includes('📡') || msg.includes('📤') || msg.toLowerCase().includes('gossip') || msg.toLowerCase().includes('transfers')) {
      type = 'routing';
    }

    const logEntry = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      time: new Date().toLocaleTimeString(),
      type,
      text: msg
    };
    setOutcomeLogs(prev => [logEntry, ...prev].slice(0, 50));
  };

  const handleToggleInternet = async (deviceId) => {
    setLoading(true);
    try {
      const res = await fetch('/api/mesh/toggle-internet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`📡 Node ${deviceId.replace('phone-', '')} internet connectivity toggled: ${data.hasInternet ? 'ONLINE (Bridge)' : 'OFFLINE'}`);
        fetchData();
      } else {
        addLog(`❌ Internet toggle failed: ${data.error}`);
      }
    } catch (err) {
      addLog(`❌ Internet toggle failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLockFunds = async () => {
    if (senderVpa === 'merchant@shadowpay') {
      addLog('❌ Merchant account cannot lock pre-funded offline balances.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/wallet/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderVpa, amount: lockAmount })
      });
      const data = await res.json();
      if (data.success) {
        setWalletTokens(prev => ({ ...prev, [senderVpa]: data.token }));
        addLog(`🔒 Prefunded wallet pool lock: ₹${lockAmount} secured for ${senderVpa}. Signed token generated.`);
        fetchData();
      } else {
        addLog(`❌ Wallet pre-funding failed: ${data.error}`);
      }
    } catch (err) {
      addLog(`❌ Wallet pre-funding failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInject = async (e) => {
    e.preventDefault();

    if (isPrefunded && !walletTokens[senderVpa]) {
      addLog(`❌ Payment Rejected: ${senderVpa.split('@')[0]} holds no active pre-funded offline token. Lock funds first.`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        senderVpa,
        receiverVpa,
        amount,
        pin,
        isPrefunded,
        offlineWalletToken: isPrefunded ? walletTokens[senderVpa] : null
      };

      const res = await fetch('/api/demo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        const type = isPrefunded ? 'Pre-funded Wallet' : 'Direct Debit (IOU)';
        addLog(`📤 Client signed offline payload. Injected transaction (₹${amount}, ${type}) into phone-alice queue.`);
        fetchData();
      } else {
        addLog(`❌ Transaction injection failed: ${data.error}`);
      }
    } catch (err) {
      addLog(`❌ Transaction injection failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGossip = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mesh/gossip', { method: 'POST' });
      const data = await res.json();
      
      if (data.hops && data.hops.length > 0) {
        const newFlights = data.hops.map((h, i) => ({
          id: `${Date.now()}-${i}`,
          from: h.from,
          to: h.to
        }));
        setFlyingPackets(newFlights);
        // Clear flights and refresh data after animation finishes (1.2s)
        setTimeout(() => {
          setFlyingPackets([]);
          fetchData();
        }, 1200);
      } else {
        fetchData();
      }

      addLog(`🔄 Gossip Round complete. Transferred ${data.transfers} packet hops across offline storage queues.`);
    } catch (err) {
      addLog(`❌ Gossip round failed: ${err.message}`);
      fetchData();
    } finally {
      setLoading(false);
    }
  };

  const handleFlush = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mesh/flush', { method: 'POST' });
      const data = await res.json();
      
      if (data.uploadsCount === 0) {
        addLog(`📡 Gateway Flush: No internet-capable bridge nodes hold any packets.`);
      } else {
        addLog(`📡 Connected Bridge Node(s) uploaded ${data.uploadsCount} encrypted packet(s) to ledger gateway.`);
        data.outcomes.forEach(out => {
          if (out.outcome === 'SETTLED') {
            addLog(`✅ Transaction settled: packet hash ${out.packetHash.substring(0, 16)}... approved.`);
            // Consume the pre-funded token locally on success
            setWalletTokens(prev => ({ ...prev, [senderVpa]: null }));
          } else if (out.outcome === 'DUPLICATE_DROPPED') {
            addLog(`⚠️ Duplicate transaction dropped: packet hash ${out.packetHash.substring(0, 16)}... already settled.`);
          } else if (out.outcome === 'INVALID') {
            addLog(`❌ Security rejection: packet hash ${out.packetHash.substring(0, 16)}... rejected: ${out.reason}`);
          }
        });
      }
      fetchData();
    } catch (err) {
      addLog(`❌ Upload flush failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      await fetch('/api/mesh/reset', { method: 'POST' });
      setOutcomeLogs([]);
      setWalletTokens({});
      setSelectedNode(null);
      addLog('🧹 Simulation restored: transaction tables, idempotency records, and wallet locks cleared.');
      fetchData();
    } catch (err) {
      addLog(`❌ Reset failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalPacketsInMesh = meshDevices.reduce((sum, d) => sum + (d.packetCount || 0), 0);

  return (
    <div className="app-layout">
      {/* Sidebar Navigation Panel */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalPacketsInMesh={totalPacketsInMesh}
      />

      {/* Dynamic Sub-page view renderer */}
      <main className="content-area">
        {activeTab === 'overview' && (
          <Overview
            accounts={accounts}
            transactions={transactions}
            meshDevices={meshDevices}
            walletTokens={walletTokens}
          />
        )}
        
        {activeTab === 'mesh' && (
          <MeshSimulator
            meshDevices={meshDevices}
            loading={loading}
            handleGossip={handleGossip}
            handleFlush={handleFlush}
            handleReset={handleReset}
            handleToggleInternet={handleToggleInternet}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            flyingPackets={flyingPackets}
          />
        )}
        
        {activeTab === 'wallet' && (
          <WalletPay
            accounts={accounts}
            loading={loading}
            walletTokens={walletTokens}
            lockAmount={lockAmount}
            setLockAmount={setLockAmount}
            handleLockFunds={handleLockFunds}
            senderVpa={senderVpa}
            setSenderVpa={setSenderVpa}
            receiverVpa={receiverVpa}
            setReceiverVpa={setReceiverVpa}
            amount={amount}
            setAmount={setAmount}
            isPrefunded={isPrefunded}
            setIsPrefunded={setIsPrefunded}
            pin={pin}
            setPin={setPin}
            handleInject={handleInject}
          />
        )}
        
        {activeTab === 'ledger' && (
          <AuditLedger
            transactions={transactions}
            expandedTxId={expandedTxId}
            setExpandedTxId={setExpandedTxId}
          />
        )}
        
        {activeTab === 'console' && (
          <DevConsole
            outcomeLogs={outcomeLogs}
            terminalFilter={terminalFilter}
            setTerminalFilter={setTerminalFilter}
            setOutcomeLogs={setOutcomeLogs}
          />
        )}

        {activeTab === 'threats' && (
          <ThreatModel />
        )}
      </main>
    </div>
  );
}
