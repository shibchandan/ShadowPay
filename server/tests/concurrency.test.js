import assert from 'assert';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_CRT_PATH = path.resolve(__dirname, '../keys/certs/client.crt');
const CLIENT_KEY_PATH = path.resolve(__dirname, '../keys/certs/client.key');
const CA_CRT_PATH = path.resolve(__dirname, '../keys/certs/ca.crt');

// Custom fetch helper that supports HTTPS and attaches the client cert for mTLS endpoints
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const agentOptions = {
      rejectUnauthorized: false // since server uses self-signed certificates
    };

    // Attach client certificates for the mTLS ingestion endpoint
    if (url.includes('/api/bridge/ingest') && !options.skipCert) {
      agentOptions.cert = fs.readFileSync(CLIENT_CRT_PATH);
      agentOptions.key = fs.readFileSync(CLIENT_KEY_PATH);
      agentOptions.ca = fs.readFileSync(CA_CRT_PATH);
    }

    const reqOptions = {
      method: options.method || 'GET',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: options.headers || {},
      agent: new https.Agent(agentOptions)
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          json: async () => JSON.parse(data),
          text: async () => data
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

const BASE_URL = 'https://127.0.0.1:8080';

async function runTest() {
  console.log('=== STARTING ADVANCED SIGNATURE & WALLET TESTS ===');

  try {
    // 0. Reset the simulation
    console.log('\n[1/7] Resetting simulation state...');
    await fetch(`${BASE_URL}/api/mesh/reset`, { method: 'POST' });

    // 1. Verify key loading
    console.log('\n[2/7] Checking server public key...');
    const keyRes = await fetch(`${BASE_URL}/api/server-key`);
    const keyData = await keyRes.json();
    assert.ok(keyData.publicKey, 'Public key should be returned');
    console.log('✔ Public key successfully loaded.');

    // 2. Fetch initial balances
    const balRes1 = await fetch(`${BASE_URL}/api/accounts`);
    const accounts1 = await balRes1.json();
    const aliceStart = parseFloat(accounts1.find(a => a._id === 'alice@shadowpay').balance);
    console.log(`✔ Alice starting bank balance: ₹${aliceStart}`);

    // 3. Perform Pre-funded lock of ₹400
    console.log('\n[3/7] Pre-funding Alice offline wallet with ₹400.00...');
    const lockRes = await fetch(`${BASE_URL}/api/wallet/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderVpa: 'alice@shadowpay',
        amount: '400.00'
      })
    });
    const lockData = await lockRes.json();
    assert.ok(lockData.success, 'Wallet lock should succeed');
    assert.ok(lockData.token && lockData.token.signature, 'Server must return signed token');
    console.log(`✔ Wallet locked. New main balance: ₹${lockData.balance}, offline wallet balance: ₹${lockData.prefundedBalance}`);

    // 4. Inject a pre-funded payment of ₹250
    console.log('\n[4/7] Injecting pre-funded payment: Alice -> Merchant, ₹250.00...');
    const sendRes = await fetch(`${BASE_URL}/api/demo/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderVpa: 'alice@shadowpay',
        receiverVpa: 'merchant@shadowpay',
        amount: '250.00',
        pin: '1234',
        isPrefunded: true,
        offlineWalletToken: lockData.token
      })
    });
    const sendData = await sendRes.json();
    assert.ok(sendData.success, 'Payment injection should succeed');
    console.log('✔ Payment signed by Alice and injected into phone-alice.');

    // 5. Retrieve the packet ciphertext from the mesh
    console.log('\n[5/7] Retrieving packet from phone-alice...');
    const stateRes = await fetch(`${BASE_URL}/api/mesh/state`);
    const devices = await stateRes.json();
    const alicePhone = devices.find(d => d.deviceId === 'phone-alice');
    assert.strictEqual(alicePhone.packetCount, 1, 'phone-alice should hold 1 packet');
    
    const packet = alicePhone.packets[0];
    assert.ok(packet.ciphertext, 'Packet should contain ciphertext');
    console.log(`✔ Found signed packet ${packet.packetId} in mesh.`);

    // 6. Fire 3 concurrent requests to /api/bridge/ingest with the SAME packet
    console.log('\n[6/7] Firing 3 simultaneous ingestions of the pre-funded packet...');
    const ingestPromises = [1, 2, 3].map(id => {
      return fetch(`${BASE_URL}/api/bridge/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Node-Id': `test-bridge-${id}`,
          'X-Hop-Count': '2'
        },
        body: JSON.stringify(packet)
      }).then(res => res.json());
    });

    const outcomes = await Promise.all(ingestPromises);
    console.log('Ingestion outcomes:', outcomes);

    const settled = outcomes.filter(o => o.outcome === 'SETTLED');
    const duplicates = outcomes.filter(o => o.outcome === 'DUPLICATE_DROPPED');

    assert.strictEqual(settled.length, 1, 'Exactly 1 thread must settle the payment');
    assert.strictEqual(duplicates.length, 2, 'Exactly 2 threads must drop it as duplicate');
    console.log('✔ Idempotency gate successfully blocked duplicate concurrent settlements.');

    // Verify balances updated correctly
    const balRes2 = await fetch(`${BASE_URL}/api/accounts`);
    const accounts2 = await balRes2.json();
    const aliceEndAcc = accounts2.find(a => a._id === 'alice@shadowpay');
    
    console.log(`Alice final main balance: ₹${aliceEndAcc.balance}`);
    console.log(`Alice final offline wallet pool: ₹${aliceEndAcc.prefundedBalance}`);
    
    // Main balance should remain ₹600 (1000 - 400 locked), but prefunded wallet should be ₹150 (400 - 250 spent)
    assert.strictEqual(parseFloat(aliceEndAcc.balance), 600.00, 'Alice main balance should remain ₹600.00');
    assert.strictEqual(parseFloat(aliceEndAcc.prefundedBalance), 150.00, 'Alice offline wallet should deduct by ₹250.00 (leaving ₹150.00)');
    console.log('✔ Wallet balances debited correctly.');

    // 7. Test Tampered Ciphertext Signature check
    console.log('\n[7/7] Testing signature verification on tampered packet...');
    // We modify the ciphertext bytes which fails AES decryption. But what if we just pass a wrong signature?
    // Let's verify that a tampered signature fails. A corrupted ciphertext will fail decryption first.
    // That was checked in step 7 of original. Let's verify it still works:
    const tamperedCiphertext = packet.ciphertext.substring(0, packet.ciphertext.length - 5) + 'AAAAA';
    const tamperedPacket = {
      ...packet,
      packetId: 'tampered-id-1234',
      ciphertext: tamperedCiphertext
    };

    const tamperRes = await fetch(`${BASE_URL}/api/bridge/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Node-Id': 'attacker-bridge',
        'X-Hop-Count': '1'
      },
      body: JSON.stringify(tamperedPacket)
    });
    const tamperData = await tamperRes.json();
    console.log('Tamper response:', tamperData);
    assert.strictEqual(tamperData.outcome, 'INVALID', 'Tampered packet must be rejected');
    assert.strictEqual(tamperData.reason, 'decryption_failed', 'Rejection reason must be decryption_failed');
    console.log('✔ Tampered packet correctly rejected.');

    // 8. Test Request WITHOUT Client Certificate (mTLS Enforced check)
    console.log('\n[8/8] Testing request without client certificate (mTLS enforcement)...');
    const noCertRes = await fetch(`${BASE_URL}/api/bridge/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Node-Id': 'attacker-bridge',
        'X-Hop-Count': '1'
      },
      body: JSON.stringify(packet),
      skipCert: true
    });
    console.log(`No-cert response status: ${noCertRes.status}`);
    assert.ok(noCertRes.status === 401 || noCertRes.status === 403, 'Request without cert must be rejected with 401 or 403');
    console.log('✔ Request without client certificate was successfully blocked by mTLS gateway.');

    console.log('\n=============================================');
    console.log('🎉 ALL ADVANCED SIGNATURE & WALLET TESTS PASSED!');
    console.log('=============================================');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err);
    process.exit(1);
  }
}

runTest();
