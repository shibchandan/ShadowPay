# Future Engineering Challenges & Roadmap

This document outlines the next level of security, performance, and UI features for **ShadowPay**. Each challenge addresses a real-world limitation of the current mock/offline mesh payment protocol and outlines the proposed technical implementation.

---

## Challenge 1: Cryptographic Digital Signatures (Authentication)

### The Problem
Currently, the Express backend trustfully accepts whatever `senderVpa` is provided inside the decrypted packet. Any node or attacker with the server's public key can create a payment instruction claiming to be `alice@shadowpay`, draining her account without her permission.

### The Solution
Implement sender digital signatures.
1. **User Keypairs**: Every user has a public/private keypair (using RSA-2048 or ECDSA). The **public key** is uploaded to the server during signup and stored in their `Account` document in MongoDB.
2. **Offline Signing**: When composing a payment offline, the sender's client hashes the transaction details (`sender`, `receiver`, `amount`, `nonce`, `timestamp`) and signs this hash with their **private key**.
3. **Packaging**: The signature is appended inside the encrypted payload JSON.
4. **Server Verification**: In [server.js](file:///d:/ShadowPay/server/server.js), before starting the settlement:
   * Load the sender's public key from MongoDB.
   * Spawn the C++ crypto helper to verify that the signature matches the decrypted payload details.
   * If verification fails, reject the packet as `INVALID` with reason `signature_verification_failed`.

---

## Challenge 2: In-Process Node.js Native C++ Addon (Performance)

### The Problem
The Node.js server currently spawns a child process (`crypto_tool.exe`) for every encryption, decryption, and hash calculation. Process spawning creates substantial OS overhead (loading binary, memory allocation), which will cause the server to crash under a concurrent upload storm of thousands of packets.

### The Solution
Port the C++ code to a Node.js Native Addon.
1. **Tooling**: Install `node-gyp` and configure `binding.gyp`.
2. **Bindings**: Use the `node-addon-api` header-only wrapper to expose the C++ functions (RSA decryption, AES-GCM decryption, SHA-256 hashing) directly to Javascript.
3. **Compilation**: Build the addon into a native shared library (`crypto_addon.node`).
4. **Integration**: Update [crypto-helper.js](file:///d:/ShadowPay/server/crypto-helper.js) to import the compiled addon directly:
   ```javascript
   import cryptoAddon from '../build/Release/crypto_addon.node';
   
   // Direct, ultra-fast in-process execution:
   const plaintext = cryptoAddon.decrypt(privateKeyBlob, ciphertextBlob);
   ```

---

## Challenge 3: Pre-Funded Offline Wallets (Double-Spend Mitigation)

### The Problem
Because there is no real-time connectivity, the merchant (receiver) has no way of knowing if the sender actually has the funds. An offline sender can easily double-spend their balance, leaving the merchant unpaid once the transaction is processed on the backend and rejected.

### The Solution
Implement a simulated hardware-secured offline wallet.
1. **Funding (Online)**: Senders must lock a balance (e.g. ₹1000) into their offline wallet while they have internet. The server debits their main account and issues a cryptographically signed balance token:
   `[Alice, LockedBalance: 1000, ExpiryTime, ServerSignature]`
2. **Spending (Offline)**: When Alice pays Bob ₹200 offline:
   * Her client verifies the previous local balance, subtracts ₹200, and writes a new state token: `[Alice, NewBalance: 800, SpendAmount: 200, ExpiryTime, ServerSignature]` signed by Alice's private key.
3. **Verification (Offline)**: Bob's client checks the server's signature on the root token and Alice's signature on the spend token, guaranteeing the funds are reserved.
4. **Settlement (Online)**: The merchant uploads the spend token chain to settle the locked funds on the server.

---

## Challenge 4: Real-time Gossip Visualization (UI/UX)

### The Problem
Clicking the "Run Gossip Round" button instantly increments the packet badges on the nodes. This lacks visual feedback, making it hard to see the route the packet takes as it hops across the network.

### The Solution
Animate packet transfers along the connections.
1. **Active Hop Detection**: When the gossip service runs, return a list of active transfers: `[{ from: 'phone-alice', to: 'phone-stranger1', packetId: '...' }]`.
2. **CSS/SVG Transitions**: Use React state to trigger animations. Render small glowing circular nodes (representing packets) and animate them using SVG path transitions or CSS offsets sliding from the coordinate of the `from` node to the coordinate of the `to` node.
3. **Delay updates**: Update the final packet badge numbers only *after* the animation completes.
