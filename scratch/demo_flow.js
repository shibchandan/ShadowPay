import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'https://127.0.0.1:8080';

const agent = new https.Agent({
  rejectUnauthorized: false
});

function postJson(urlPath, body = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(`${BASE_URL}${urlPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      agent
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('=== STARTING AUTOMATED DEMO TRANSACTION FLOW ===');
  
  // 1. Lock funds (Alice: ₹300)
  console.log('\n[1/5] Locking ₹300.00 for Alice...');
  const lockData = await postJson('/api/wallet/lock', {
    senderVpa: 'alice@shadowpay',
    amount: '300.00'
  });
  console.log('Lock outcome:', lockData.success ? '✔ Funds Locked' : '❌ Failed');
  if (!lockData.success) return;

  // 2. Compose and Inject Payment (Alice -> Merchant: ₹250)
  console.log('\n[2/5] Injecting payment: Alice -> Merchant (₹250.00)...');
  const sendData = await postJson('/api/demo/send', {
    senderVpa: 'alice@shadowpay',
    receiverVpa: 'merchant@shadowpay',
    amount: '250.00',
    pin: '1234',
    isPrefunded: true,
    offlineWalletToken: lockData.token
  });
  console.log('Injection outcome:', sendData.success ? '✔ Packet Injected' : '❌ Failed');
  if (!sendData.success) return;

  // 3. Gossip Round 1
  console.log('\n[3/5] Running Gossip Round 1...');
  const gossip1 = await postJson('/api/mesh/gossip');
  console.log('Gossip 1 transfers:', gossip1.transfers);

  // 4. Gossip Round 2
  console.log('\n[4/5] Running Gossip Round 2...');
  const gossip2 = await postJson('/api/mesh/gossip');
  console.log('Gossip 2 transfers:', gossip2.transfers);

  // 5. Ingest Flush
  console.log('\n[5/5] Flushing Bridge Gateway Ingestion...');
  const flushData = await postJson('/api/mesh/flush');
  console.log('Flush outcome uploads count:', flushData.uploadsCount);
  console.log('Outcomes:', flushData.outcomes);

  console.log('\n=== FLOW COMPLETED SUCCESSFULLY! ===');
  console.log('Open your browser at http://localhost:5173/ and check the "Audit Ledger" page to inspect the verified P2P signature audit chain!');
}

run().catch(console.error);
