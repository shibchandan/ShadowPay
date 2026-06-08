import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import selfsigned from 'selfsigned';
import https from 'https';

import { Account } from './models/Account.js';
import { Transaction } from './models/Transaction.js';
import { Idempotency } from './models/Idempotency.js';
import { cryptoHelper } from './crypto-helper.js';
import { meshSimulator } from './service/mesh_simulator.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { keyVault } from './service/key_vault.js';

const KEYS_DIR = path.resolve(__dirname, './keys');
const USERS_KEYS_DIR = path.join(KEYS_DIR, 'users');
const PUB_KEY_PATH = path.join(KEYS_DIR, 'server_pub.key');
const PRIV_KEY_PATH = path.join(KEYS_DIR, 'server_priv.key'); // Used as token reference inside helper

const CERTS_DIR = path.join(KEYS_DIR, 'certs');
const CA_CRT_PATH = path.join(CERTS_DIR, 'ca.crt');
const CA_KEY_PATH = path.join(CERTS_DIR, 'ca.key');
const SERVER_CRT_PATH = path.join(CERTS_DIR, 'server.crt');
const SERVER_KEY_PATH = path.join(CERTS_DIR, 'server.key');
const CLIENT_CRT_PATH = path.join(CERTS_DIR, 'client.crt');
const CLIENT_KEY_PATH = path.join(CERTS_DIR, 'client.key');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize keys and start server
async function bootstrap() {
  // 1. Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shadowpay';
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');
  } catch (err) {
    console.error('Failed to connect to MongoDB. Is MongoDB running locally?', err.message);
    console.log('Falling back to a mock in-memory DB mode (virtual storage) for demo purposes.');
    setupMockDatabaseFallback();
  }

  // 2. Ensure keys directories exist
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_KEYS_DIR)) {
    fs.mkdirSync(USERS_KEYS_DIR, { recursive: true });
  }

  // 3. Unlock Key Vault securely
  const masterPassword = process.env.MASTER_PASSWORD || 'shadowpay-dev-vault-secret';
  try {
    await keyVault.unlock(masterPassword);
  } catch (err) {
    console.error('Critical: Failed to unlock server key vault on bootstrap:', err.message);
    process.exit(1);
  }

  // Generate user keypairs for digital signatures
  console.log('Ensuring offline user keypairs exist for signatures...');
  try {
    await ensureUserKeys();
  } catch (err) {
    console.error('Failed to generate user keys:', err);
    process.exit(1);
  }

  // Generate mTLS certificates
  console.log('Ensuring mTLS SSL certificates exist...');
  try {
    await ensureCerts();
  } catch (err) {
    console.error('Failed to generate/load SSL certificates:', err);
    process.exit(1);
  }

  // 3. Seed Accounts
  await seedAccounts();

  // 4. Start listening (HTTPS + mTLS)
  const port = process.env.PORT || 8080;
  const serverOptions = {
    key: fs.readFileSync(SERVER_KEY_PATH),
    cert: fs.readFileSync(SERVER_CRT_PATH),
    ca: fs.readFileSync(CA_CRT_PATH),
    requestCert: true,
    rejectUnauthorized: false // Do not reject globally so dashboard remains accessible
  };

  const secureServer = https.createServer(serverOptions, app);
  secureServer.listen(port, () => {
    console.log(`ShadowPay Secure Server (HTTPS/mTLS) listening on port ${port}`);
  });
}

// Generates simulated offline client keypairs for users, transit stranger nodes, and bridges
async function ensureUserKeys() {
  const users = ['alice', 'bob', 'carol', 'stranger1', 'stranger2', 'stranger3', 'bridge'];
  for (const user of users) {
    const pubPath = path.join(USERS_KEYS_DIR, `${user}_pub.key`);
    const privPath = path.join(USERS_KEYS_DIR, `${user}_priv.key`);
    if (!fs.existsSync(pubPath) || !fs.existsSync(privPath)) {
      console.log(`Generating user keypair for ${user}...`);
      await cryptoHelper.genKeys(pubPath, privPath);
    }
  }
}

// Generates Root CA, Server key/cert, and Client key/cert
async function ensureCerts() {
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
  }

  if (!fs.existsSync(CA_CRT_PATH) || !fs.existsSync(CA_KEY_PATH)) {
    console.log('Generating Root CA certificates...');
    const caAttrs = [{ name: 'commonName', value: 'ShadowPay Root CA' }];
    const caOptions = {
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [{ name: 'basicConstraints', cA: true }]
    };
    const caPems = await selfsigned.generate(caAttrs, caOptions);
    fs.writeFileSync(CA_CRT_PATH, caPems.cert);
    fs.writeFileSync(CA_KEY_PATH, caPems.private);
    console.log('Root CA certificate generated.');
  }

  const caCert = fs.readFileSync(CA_CRT_PATH, 'utf8');
  const caKey = fs.readFileSync(CA_KEY_PATH, 'utf8');

  if (!fs.existsSync(SERVER_CRT_PATH) || !fs.existsSync(SERVER_KEY_PATH)) {
    console.log('Generating Server certificate signed by CA...');
    const serverAttrs = [{ name: 'commonName', value: 'localhost' }];
    const serverOptions = {
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' }
        ]}
      ],
      ca: { key: caKey, cert: caCert }
    };
    const serverPems = await selfsigned.generate(serverAttrs, serverOptions);
    fs.writeFileSync(SERVER_CRT_PATH, serverPems.cert);
    fs.writeFileSync(SERVER_KEY_PATH, serverPems.private);
    console.log('Server certificate generated.');
  }

  if (!fs.existsSync(CLIENT_CRT_PATH) || !fs.existsSync(CLIENT_KEY_PATH)) {
    console.log('Generating Client certificate signed by CA...');
    const clientAttrs = [{ name: 'commonName', value: 'ShadowPay Client' }];
    const clientOptions = {
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true },
        { name: 'extKeyUsage', clientAuth: true }
      ],
      ca: { key: caKey, cert: caCert }
    };
    const clientPems = await selfsigned.generate(clientAttrs, clientOptions);
    fs.writeFileSync(CLIENT_CRT_PATH, clientPems.cert);
    fs.writeFileSync(CLIENT_KEY_PATH, clientPems.private);
    console.log('Client certificate generated.');
  }
}

// Seeds default accounts if none exist
async function seedAccounts() {
  try {
    const count = await Account.countDocuments();
    const first = await Account.findOne({ _id: 'alice@shadowpay' });
    if (count === 0 || !first || !first.publicKeyPath) {
      console.log('Force re-seeding accounts with keypaths...');
      await Account.deleteMany({});
      await Account.create([
        {
          _id: 'alice@shadowpay',
          name: 'Alice',
          balance: mongoose.Types.Decimal128.fromString('1000.00'),
          prefundedBalance: mongoose.Types.Decimal128.fromString('0.00'),
          publicKeyPath: path.join(USERS_KEYS_DIR, 'alice_pub.key')
        },
        {
          _id: 'bob@shadowpay',
          name: 'Bob',
          balance: mongoose.Types.Decimal128.fromString('1000.00'),
          prefundedBalance: mongoose.Types.Decimal128.fromString('0.00'),
          publicKeyPath: path.join(USERS_KEYS_DIR, 'bob_pub.key')
        },
        {
          _id: 'carol@shadowpay',
          name: 'Carol',
          balance: mongoose.Types.Decimal128.fromString('1000.00'),
          prefundedBalance: mongoose.Types.Decimal128.fromString('0.00'),
          publicKeyPath: path.join(USERS_KEYS_DIR, 'carol_pub.key')
        },
        {
          _id: 'merchant@shadowpay',
          name: 'Merchant',
          balance: mongoose.Types.Decimal128.fromString('0.00'),
          prefundedBalance: mongoose.Types.Decimal128.fromString('0.00'),
          publicKeyPath: ''
        }
      ]);
      console.log('Default accounts seeded.');
    }
  } catch (err) {
    console.error('Database write error during seeding:', err.message);
  }
}

// DB fallback check helper (for developer convenience if local Mongo is not running)
let isMockDb = false;
const mockDb = { accounts: {}, transactions: [], idempotency: new Set() };
function setupMockDatabaseFallback() {
  isMockDb = true;
  mockDb.accounts = {
    'alice@shadowpay': { _id: 'alice@shadowpay', name: 'Alice', balance: 1000.00, prefundedBalance: 0.00 },
    'bob@shadowpay': { _id: 'bob@shadowpay', name: 'Bob', balance: 1000.00, prefundedBalance: 0.00 },
    'carol@shadowpay': { _id: 'carol@shadowpay', name: 'Carol', balance: 1000.00, prefundedBalance: 0.00 },
    'merchant@shadowpay': { _id: 'merchant@shadowpay', name: 'Merchant', balance: 0.00, prefundedBalance: 0.00 }
  };
}

// ==========================================
// REST API ENDPOINTS
// ==========================================

// Get Server Public Key (Base64)
app.get('/api/server-key', (req, res) => {
  try {
    const pubKey = fs.readFileSync(PUB_KEY_PATH, 'utf8').trim();
    res.json({ publicKey: pubKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read public key' });
  }
});

// Get Accounts
app.get('/api/accounts', async (req, res) => {
  if (isMockDb) {
    return res.json(Object.values(mockDb.accounts).map(a => ({
      _id: a._id,
      name: a.name,
      balance: a.balance.toFixed(2),
      prefundedBalance: (a.prefundedBalance || 0).toFixed(2)
    })));
  }
  try {
    const list = await Account.find({});
    res.json(list.map(a => ({
      _id: a._id,
      name: a.name,
      balance: a.balance.toString(),
      prefundedBalance: a.prefundedBalance ? a.prefundedBalance.toString() : '0.00'
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Transactions (last 20)
app.get('/api/transactions', async (req, res) => {
  if (isMockDb) {
    return res.json(mockDb.transactions.slice(-20).reverse());
  }
  try {
    const list = await Transaction.find({}).sort({ settledAt: -1 }).limit(20);
    res.json(list.map(t => ({
      ...t.toObject(),
      amount: t.amount.toString()
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Mesh State
app.get('/api/mesh/state', (req, res) => {
  res.json(meshSimulator.getDevicesState());
});

// Pre-fund Offline Wallet (Lock Main Balance into Offline Pool)
app.post('/api/wallet/lock', async (req, res) => {
  const { senderVpa, amount } = req.body;
  const numericAmount = parseFloat(amount);
  if (!senderVpa || isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: 'Invalid VPA or lock amount.' });
  }

  const lockPayload = {
    ownerVpa: senderVpa,
    lockedBalance: numericAmount.toFixed(2),
    nonce: crypto.randomUUID(),
    timestamp: Date.now()
  };

  if (isMockDb) {
    const acc = mockDb.accounts[senderVpa];
    if (!acc) return res.status(404).json({ error: 'Account not found.' });
    if (acc.balance < numericAmount) return res.status(400).json({ error: 'Insufficient balance.' });

    acc.balance -= numericAmount;
    acc.prefundedBalance = (acc.prefundedBalance || 0) + numericAmount;

    try {
      const tokenSignature = await cryptoHelper.sign(PRIV_KEY_PATH, JSON.stringify(lockPayload));
      return res.json({
        success: true,
        token: { payload: lockPayload, signature: tokenSignature },
        balance: acc.balance.toFixed(2),
        prefundedBalance: acc.prefundedBalance.toFixed(2)
      });
    } catch (err) {
      return res.status(500).json({ error: 'Signing token failed: ' + err.message });
    }
  }

  try {
    const account = await Account.findOneAndUpdate(
      { _id: senderVpa, balance: { $gte: numericAmount } },
      { $inc: { balance: -numericAmount, prefundedBalance: numericAmount } },
      { new: true }
    );

    if (!account) {
      return res.status(400).json({ error: 'Insufficient balance or account not found.' });
    }

    const tokenSignature = await cryptoHelper.sign(PRIV_KEY_PATH, JSON.stringify(lockPayload));

    res.json({
      success: true,
      token: { payload: lockPayload, signature: tokenSignature },
      balance: account.balance.toString(),
      prefundedBalance: account.prefundedBalance.toString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simulate Sender Phone (Compose and Inject Payment)
app.post('/api/demo/send', async (req, res) => {
  const { senderVpa, receiverVpa, amount, pin, isPrefunded, offlineWalletToken } = req.body;
  if (!senderVpa || !receiverVpa || !amount) {
    return res.status(400).json({ error: 'Missing payment fields.' });
  }

  try {
    // 1. Create Payment Instruction payload
    const instruction = {
      senderVpa,
      receiverVpa,
      amount: parseFloat(amount).toFixed(2),
      pinHash: pin ? pin : '1234',
      nonce: crypto.randomUUID(),
      signedAt: Date.now(),
      isPrefunded: !!isPrefunded,
      offlineWalletToken: isPrefunded ? offlineWalletToken : null
    };

    const instructionJson = JSON.stringify(instruction);

    // 2. Sign on behalf of user offline (using Alice/Bob's local private key file)
    const userName = senderVpa.split('@')[0];
    const senderPrivKeyPath = path.join(USERS_KEYS_DIR, `${userName}_priv.key`);
    
    let senderSignature;
    try {
      senderSignature = await cryptoHelper.sign(senderPrivKeyPath, instructionJson);
    } catch (err) {
      return res.status(500).json({ error: `Sender signing failed: ${err.message}` });
    }

    // 3. Encrypt payload containing both the instruction and Alice's signature
    const payloadToEncrypt = JSON.stringify({
      instruction,
      senderSignature
    });

    const ciphertext = await cryptoHelper.encrypt(PUB_KEY_PATH, payloadToEncrypt);

    // 4. Build Mesh Packet
    const packet = {
      packetId: crypto.randomUUID(),
      ttl: 5,
      createdAt: Date.now(),
      ciphertext
    };

    // 5. Inject into phone-alice
    meshSimulator.inject('phone-alice', packet);

    res.json({ success: true, packetId: packet.packetId });
  } catch (err) {
    console.error('Failed to create/inject demo packet:', err);
    res.status(500).json({ error: err.message });
  }
});

// Run Gossip Round
app.post('/api/mesh/gossip', async (req, res) => {
  const result = await meshSimulator.gossip();
  res.json(result);
});

// Flush Bridges (Bridges Upload to Ingest)
app.post('/api/mesh/flush', async (req, res) => {
  const uploads = meshSimulator.collectBridgeUploads();
  const results = [];

  for (const item of uploads) {
    const res = await processIngestion(item.packet, item.bridgeNodeId, item.packet.ttl);
    results.push(res);
  }

  res.json({ uploadsCount: uploads.length, outcomes: results });
});

// Toggle Node Internet Status
app.post('/api/mesh/toggle-internet', (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: 'Missing deviceId.' });
  }
  try {
    const device = meshSimulator.devices.get(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }
    device.hasInternet = !device.hasInternet;
    console.log(`Node ${deviceId} internet connectivity toggled to: ${device.hasInternet}`);
    res.json({ success: true, deviceId, hasInternet: device.hasInternet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Mesh & Idempotency Cache
app.post('/api/mesh/reset', async (req, res) => {
  meshSimulator.reset();
  if (isMockDb) {
    mockDb.idempotency.clear();
    mockDb.transactions = [];
    // Reset balances
    for (const key of Object.keys(mockDb.accounts)) {
      mockDb.accounts[key].balance = 1000.00;
      mockDb.accounts[key].prefundedBalance = 0.00;
    }
    mockDb.accounts['merchant@shadowpay'].balance = 0.00;
  } else {
    try {
      await Idempotency.deleteMany({});
      await Transaction.deleteMany({});
      await Account.updateMany({}, { balance: mongoose.Types.Decimal128.fromString('1000.00'), prefundedBalance: mongoose.Types.Decimal128.fromString('0.00') });
      await Account.updateOne({ _id: 'merchant@shadowpay' }, { balance: mongoose.Types.Decimal128.fromString('0.00') });
    } catch (err) {
      console.error('Error during DB reset:', err.message);
    }
  }
  res.json({ success: true });
});

// Middleware to enforce mTLS client certificate validation on gateway ingestion
function enforceMTLS(req, res, next) {
  if (!req.secure) {
    return res.status(400).json({ error: 'HTTPS connection required' });
  }
  const cert = req.socket.getPeerCertificate();
  if (!cert || Object.keys(cert).length === 0) {
    return res.status(401).json({ error: 'Client certificate required (mTLS verification failed)' });
  }
  if (!req.socket.authorized) {
    return res.status(403).json({ error: 'Client certificate not authorized' });
  }
  next();
}

// Ingest bridge node upload (Production Endpoint)
app.post('/api/bridge/ingest', enforceMTLS, async (req, res) => {
  const packet = req.body;
  const bridgeNodeId = req.headers['x-bridge-node-id'] || 'anonymous-bridge';
  const hopCount = parseInt(req.headers['x-hop-count']) || 0;

  const result = await processIngestion(packet, bridgeNodeId, hopCount);
  res.json(result);
});

// ==========================================
// INGESTION & SETTLEMENT PIPELINE
// ==========================================

async function processIngestion(packet, bridgeNodeId, hopCount) {
  let packetHash = '';
  try {
    packetHash = await cryptoHelper.hash(packet.ciphertext);

    // 1. Idempotency Check
    const claimed = await claimIdempotency(packetHash);
    if (!claimed) {
      console.log(`DUPLICATE packet ${packetHash.substring(0, 12)}... from bridge ${bridgeNodeId} - dropped`);
      return { outcome: 'DUPLICATE_DROPPED', packetHash };
    }

    // 2. Decrypt Ciphertext
    let decryptedPayload;
    try {
      decryptedPayload = await cryptoHelper.decrypt(PRIV_KEY_PATH, packet.ciphertext);
    } catch (err) {
      console.warn(`Decryption failed for packet ${packetHash.substring(0, 12)}... : ${err.message}`);
      return { outcome: 'INVALID', packetHash, reason: 'decryption_failed' };
    }

    // Parse payload (contains instruction and senderSignature)
    const { instruction, senderSignature } = JSON.parse(decryptedPayload);

    // 3. Verify Sender's Digital Signature
    const userName = instruction.senderVpa.split('@')[0];
    let senderPublicKeyPath = '';
    if (isMockDb) {
      senderPublicKeyPath = path.join(USERS_KEYS_DIR, `${userName}_pub.key`);
    } else {
      const senderAcc = await Account.findById(instruction.senderVpa);
      if (!senderAcc) {
        return { outcome: 'INVALID', packetHash, reason: 'unknown_sender' };
      }
      senderPublicKeyPath = senderAcc.publicKeyPath;
    }

    const instructionJson = JSON.stringify(instruction);
    const sigValid = await cryptoHelper.verify(senderPublicKeyPath, instructionJson, senderSignature);
    if (!sigValid) {
      console.warn(`Signature verification failed for packet ${packetHash.substring(0, 12)}...`);
      return { outcome: 'INVALID', packetHash, reason: 'signature_verification_failed' };
    }

    // 4. Verify Server's Signature on Wallet Token (if prefunded)
    if (instruction.isPrefunded) {
      const token = instruction.offlineWalletToken;
      if (!token || !token.payload || !token.signature) {
        return { outcome: 'INVALID', packetHash, reason: 'missing_wallet_token' };
      }
      const tokenValid = await cryptoHelper.verify(PUB_KEY_PATH, JSON.stringify(token.payload), token.signature);
      if (!tokenValid) {
        console.warn(`Wallet token server signature check failed for packet ${packetHash.substring(0, 12)}...`);
        return { outcome: 'INVALID', packetHash, reason: 'wallet_token_invalid' };
      }
      if (token.payload.ownerVpa !== instruction.senderVpa) {
        return { outcome: 'INVALID', packetHash, reason: 'wallet_token_owner_mismatch' };
      }
      if (parseFloat(token.payload.lockedBalance) < parseFloat(instruction.amount)) {
        return { outcome: 'INVALID', packetHash, reason: 'wallet_token_insufficient_locked_balance' };
      }
    }

    // 5. Freshness Check (24 hour limit)
    const ageSeconds = (Date.now() - instruction.signedAt) / 1000;
    const maxAgeSeconds = 86400; // 24 hours
    if (ageSeconds > maxAgeSeconds) {
      console.warn(`Packet ${packetHash.substring(0, 12)}... too old (${ageSeconds}s), rejected`);
      return { outcome: 'INVALID', packetHash, reason: 'stale_packet' };
    }
    if (ageSeconds < -300) { // Future dated tolerance
      return { outcome: 'INVALID', packetHash, reason: 'future_dated' };
    }

    // Verify P2P Gossip Acknowledgment Chain (Sybil / Blackhole Defense)
    const auditedPath = [];
    if (packet.path && Array.isArray(packet.path)) {
      for (const ack of packet.path) {
        const userName = ack.receiverNodeId.replace('phone-', '');
        const pubKeyPath = path.join(USERS_KEYS_DIR, `${userName}_pub.key`);
        
        // Prepare original sign string
        const ackPayload = {
          packetId: ack.packetId,
          hopCount: ack.hopCount,
          receiverNodeId: ack.receiverNodeId,
          timestamp: ack.timestamp
        };
        const ackPayloadStr = JSON.stringify(ackPayload);
        const valid = await cryptoHelper.verify(pubKeyPath, ackPayloadStr, ack.signature);
        
        auditedPath.push({
          deviceId: ack.receiverNodeId,
          verified: valid,
          timestamp: ack.timestamp
        });
      }
    }

    // 6. Settle Transaction
    const tx = await settleTransaction(instruction, packetHash, bridgeNodeId, hopCount, auditedPath);
    return { outcome: 'SETTLED', packetHash, transactionId: tx._id };

  } catch (err) {
    console.error('Ingestion pipeline error:', err);
    return { outcome: 'INVALID', packetHash, reason: 'internal_error: ' + err.message };
  }
}

// Atomic claim using MongoDB unique constraints or local set fallback
async function claimIdempotency(packetHash) {
  if (isMockDb) {
    if (mockDb.idempotency.has(packetHash)) return false;
    mockDb.idempotency.add(packetHash);
    return true;
  }
  try {
    await Idempotency.create({ _id: packetHash });
    return true;
  } catch (err) {
    if (err.code === 11000) {
      return false;
    }
    throw err;
  }
}

// Atomic Ledger update
async function settleTransaction(instruction, packetHash, bridgeNodeId, hopCount, auditedPath = []) {
  const { senderVpa, receiverVpa, amount, signedAt, isPrefunded } = instruction;
  const numericAmount = parseFloat(amount);

  if (isMockDb) {
    const sender = mockDb.accounts[senderVpa];
    const receiver = mockDb.accounts[receiverVpa];
    if (!sender || !receiver) throw new Error('Unknown accounts');

    const walletBalance = isPrefunded ? (sender.prefundedBalance || 0) : sender.balance;

    if (walletBalance < numericAmount) {
      const tx = {
        _id: Date.now(),
        packetHash,
        senderVpa,
        receiverVpa,
        amount: numericAmount,
        signedAt: new Date(signedAt),
        settledAt: new Date(),
        bridgeNodeId,
        hopCount,
        status: 'REJECTED',
        auditedPath
      };
      mockDb.transactions.push(tx);
      return tx;
    }

    if (isPrefunded) {
      sender.prefundedBalance -= numericAmount;
    } else {
      sender.balance -= numericAmount;
    }
    receiver.balance += numericAmount;

    const tx = {
      _id: Date.now(),
      packetHash,
      senderVpa,
      receiverVpa,
      amount: numericAmount,
      signedAt: new Date(signedAt),
      settledAt: new Date(),
      bridgeNodeId,
      hopCount,
      status: 'SETTLED',
      auditedPath
    };
    mockDb.transactions.push(tx);
    return tx;
  }

  // --- Real MongoDB flow using atomic updates ---
  if (isPrefunded) {
    // Settle from prefunded offline pool
    const deductResult = await Account.findOneAndUpdate(
      { _id: senderVpa, prefundedBalance: { $gte: numericAmount } },
      { $inc: { prefundedBalance: -numericAmount } },
      { new: true }
    );

    if (!deductResult) {
      console.warn(`Insufficient prefunded balance: ${senderVpa} tried to send ${numericAmount}`);
      const tx = await Transaction.create({
        packetHash,
        senderVpa,
        receiverVpa,
        amount: mongoose.Types.Decimal128.fromString(amount),
        signedAt: new Date(signedAt),
        bridgeNodeId,
        hopCount,
        status: 'REJECTED',
        auditedPath
      });
      return tx;
    }

    await Account.findOneAndUpdate(
      { _id: receiverVpa },
      { $inc: { balance: numericAmount } }
    );

    const tx = await Transaction.create({
      packetHash,
      senderVpa,
      receiverVpa,
      amount: mongoose.Types.Decimal128.fromString(amount),
      signedAt: new Date(signedAt),
      bridgeNodeId,
      hopCount,
      status: 'SETTLED',
      auditedPath
    });

    console.log(`SETTLED (PRE-FUNDED) ₹${numericAmount} from ${senderVpa} to ${receiverVpa}`);
    return tx;
  } else {
    // Settle from main balance (Direct Offline)
    const deductResult = await Account.findOneAndUpdate(
      { _id: senderVpa, balance: { $gte: numericAmount } },
      { $inc: { balance: -numericAmount } },
      { new: true }
    );

    if (!deductResult) {
      console.warn(`Insufficient balance: ${senderVpa} tried to send ${numericAmount}`);
      const tx = await Transaction.create({
        packetHash,
        senderVpa,
        receiverVpa,
        amount: mongoose.Types.Decimal128.fromString(amount),
        signedAt: new Date(signedAt),
        bridgeNodeId,
        hopCount,
        status: 'REJECTED',
        auditedPath
      });
      return tx;
    }

    await Account.findOneAndUpdate(
      { _id: receiverVpa },
      { $inc: { balance: numericAmount } }
    );

    const tx = await Transaction.create({
      packetHash,
      senderVpa,
      receiverVpa,
      amount: mongoose.Types.Decimal128.fromString(amount),
      signedAt: new Date(signedAt),
      bridgeNodeId,
      hopCount,
      status: 'SETTLED',
      auditedPath
    });

    console.log(`SETTLED ₹${numericAmount} from ${senderVpa} to ${receiverVpa}`);
    return tx;
  }
}

// Bootstrap
bootstrap();
