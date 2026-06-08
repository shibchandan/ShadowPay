# Cryptography, Concurrency, and Packet Lifecycle Specification

This document provides a detailed technical reference for the security, concurrency, and routing mechanics implemented in **ShadowPay**. It explains how offline transactions are encrypted, how duplicate ingestions are blocked on the server, how the Time-To-Live (TTL) mechanisms govern packet lifecycles, and how server private keys are protected at rest.

---

## 1. Hybrid Encryption and Hashing Protocol

Because offline transactions are transported through third-party intermediate devices, they must be fully protected from eavesdropping (reading the transaction details) and tampering (altering the amount or recipient VPA).

```
[Transaction Payload JSON]
        │
        ▼ (1) Encrypt with 32-byte AES Key
  [AES-256-GCM Ciphertext] + [12-byte IV] + [16-byte Auth Tag]
        │
        ├────────────────────────────┐
        │                            ▼ (2) Encrypt key with Server RSA PubKey
        │                      [RSA-Encrypted AES Key] (256 bytes)
        │                            │
        ▼                            ▼
[━━━━━━━━━━━━━━━━━━━━━━ PACKED BINARY BUFFER ━━━━━━━━━━━━━━━━━━━━━━]
[RSA-Encrypted AES Key]  │  [IV]  │  [AES Ciphertext]  │  [GCM Tag]
[    256 bytes        ]  │[12 B]  │  [Variable length] │  [16 bytes]
```

### Cryptographic Operations
1. **Symmetric Encryption (AES-256-GCM)**:
   * A unique **32-byte AES session key** and a random **12-byte Initialization Vector (IV)** are generated for every transaction.
   * The transaction JSON instruction is encrypted with AES-256-GCM, producing the ciphertext and a **16-byte authentication tag**.
   * AES-256-GCM provides *Authenticated Encryption*, meaning that if a carrying node modifies even a single bit of the ciphertext, the decryption stage will fail because the GCM authentication tag will no longer match.
2. **Asymmetric Key Wrapping (RSA-OAEP-SHA256)**:
   * Since RSA cannot encrypt large data blocks directly, we encrypt only the 32-byte AES session key with the server's **RSA-2048 Public Key**, using **SHA-256 OAEP padding**.
3. **Packed Binary Wire Format**:
   * The components are packed into a single byte array:
     `[256 bytes RSA-Encrypted AES Key] + [12 bytes IV] + [Variable Length AES Ciphertext] + [16 bytes GCM Auth Tag]`
   * This packed binary buffer is Base64 encoded and set as the `ciphertext` field inside the `MeshPacket`.
4. **Ciphertext Hashing (SHA-256)**:
   * When a bridge node uploads a packet, the server hashes the entire Base64 ciphertext string using **SHA-256** in the C++ cryptographic engine.
   * This creates a unique identifier (hash) for that transaction, which is used for idempotency tracking.

---

## 2. Concurrent Transaction Requests & Idempotency Guard

Due to the nature of gossip networks, a single transaction packet is copied to multiple device queues. When these devices gain internet connectivity (such as when multiple bridge nodes walk into 4G range simultaneously), they will upload the **exact same packet** to the server in concurrent HTTP requests.

```
Bridge 1 (uploads packet) ──┐
Bridge 2 (uploads packet) ──┼──▶ [Express /api/bridge/ingest]
Bridge 3 (uploads packet) ──┘        │
                                     ▼ Compute SHA-256(ciphertext)
                            [Packet Hash: 910bfe79e2...]
                                     │
                                     ▼ Atomic MongoDB Write
                            Idempotency.create({ _id: packetHash })
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼ (Thread A succeeds)                   ▼ (Thread B/C fails)
             [SETTLED]                               [DUPLICATE_DROPPED]
       Proceeds to decryption                     Dropped immediately with
       and balance debiting.                       HTTP status 200/outcome.
```

### The Ingestion Pipeline Guard
To prevent a sender's account from being debited multiple times for the same transaction, we implement an atomic database-level lock:

1. **Atomic Write-Lock (Idempotency Claim)**:
   * The Express backend computes `SHA-256(ciphertext)`.
   * It attempts to insert a record into the `idempotencies` collection using the transaction hash as the primary key (`_id`):
     `Idempotency.create({ _id: packetHash })`
2. **Race-Condition Resolution**:
   * MongoDB enforces a strict, atomic unique index constraint on the `_id` field.
   * If three threads attempt to ingest the same packet concurrently, the database coordinator lets **exactly one** write succeed.
   * The other two threads instantly throw a duplicate key error (code `11000`).
   * The Express backend intercepts this error, halts execution immediately, and returns `{ outcome: "DUPLICATE_DROPPED" }`, preventing duplicate debits.
3. **Atomic Balance Settlement**:
   * For the successful thread, balance adjustments are performed using atomic database updates rather than a read-modify-write pattern, preventing race conditions:
     `Account.findOneAndUpdate({ _id: senderVpa, balance: { $gte: amount } }, { $inc: { balance: -amount } })`

---

## 3. TTL, Freshness, and Cache Eviction Mechanics

To prevent transactions from routing forever, and to protect the server from replay attacks (where an attacker captures a transaction packet and uploads it weeks later), the system implements a multi-layered Time-To-Live (TTL) policy:

```
                ┌──────────────────────────────────────┐
                │        PACKET LIFECYCLE TIMELINE     │
                └──────────────────────────────────────┘
 0 hour                                                                24 hours
 ├─────────────────────────────────────────────────────────────────────────┤
 ▲                                                                         ▲
 │                                                                         │
 ├─► [Gossip Stage] ─► [Bridge Sync] ─► [Settle]                           │
 │   Hops: Max 5                                                           │
 │                                                                         │
 ├─► [Idempotency Record in MongoDB] ──────────────────────────────────────┤
 │   Hash stored in DB to block duplicate replays.                         │
 │                                                                         │
 └─► [Freshness Gate] ─────────────────────────────────────────────────────► [Replay Rejected]
     `signedAt` verified against Server clock.                               After 24h, signed
     Must be under 24 hours.                                                 payload is invalid.
                                                                             DB TTL index auto-deletes
                                                                             idempotency record.
```

### A. Mesh Hop TTL
* When a payment packet is created on the sender device, it is initialized with a **Hop TTL of 5**.
* During each round of gossip, when a node forwards a packet to a peer, it decrements the packet's TTL field by **1** (`ttl - 1`).
* Once the TTL reaches **0**, nodes will refuse to forward it. This prevents expired packets from looping infinitely in the wireless mesh, saving device battery and memory.

### B. Payload Freshness Check
* Every payment instruction contains a `signedAt` timestamp generated by the sender's client clock and sealed inside the encrypted payload.
* Upon decryption, the server performs a **Freshness Gate** check:
  `ageInSeconds = (Date.now() - instruction.signedAt) / 1000`
* If `ageInSeconds` exceeds **86,400 seconds (24 hours)**, the server rejects the transaction as `INVALID` with the reason `stale_packet`. This ensures that an attacker cannot execute an old offline transaction packet.

### C. Database Cache Eviction (Mongoose TTL Index)
* If the idempotency cache was kept forever, the database size would grow indefinitely. If it was cleared too quickly, an attacker could replay a packet once its hash was deleted.
* **The Solution**: We set the idempotency cache lifetime to align exactly with the freshness gate (**24 hours**).
* In [Idempotency.js](file:///d:/ShadowPay/server/models/Idempotency.js), the schema defines a TTL index:
  ```javascript
  const idempotencySchema = new mongoose.Schema({
    _id: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 86400 } // 24 hours
  });
  ```
* MongoDB automatically evicts the transaction hash 24 hours after creation. Because any packet older than 24 hours is blocked by the Freshness Gate, this guarantees 100% protection against replay attacks while keeping the database footprint small.

---

## 4. Server Key Vault & Encrypted Storage At-Rest Spec

To protect the server from compromise or filesystem theft, the server's private RSA key is encrypted at rest on disk and isolated securely inside Node.js memory.

```
[Plaintext Key File] ──▶ PBKDF2(Salt, MasterPassword) ──▶ AES-256-GCM Encrypt
                                                                │
                                                                ▼ Save to disk
                                                 [server_priv.enc] + [server_priv.salt]
                                                                │
 [Plaintext key is shredded by overwriting with zeros] ◀────────┤
                                                                │
 ───────────────────────────────────────────────────────────────┼─── (Server Boot)
                                                                ▼
                                                 AES-256-GCM Decrypt in-memory
                                                                │
                                                                ▼ Held in private closure scope
                                                      [KeyVaultService]
                                                                │
                                                                ▼ Passed directly to C++ stdin
                                                     [Spawned crypto_tool.exe]
```

### Key Vault Specifications
1. **Key Derivation (PBKDF2)**:
   * A master password is read from `process.env.MASTER_PASSWORD` (or a fallback passphrase in dev environments).
   * A random **16-byte salt** is generated.
   * The server derives a **256-bit AES key** using **PBKDF2** with **100,000 hashing iterations** and the `sha256` digest:
     `aesKey = pbkdf2Sync(MasterPassword, Salt, 100000, 32, 'sha256')`
2. **Encrypted Envelope Layout**:
   * The plaintext RSA private key is encrypted with **AES-256-GCM** using a random **12-byte IV**.
   * The encrypted key is saved as a packed envelope inside `server_priv.enc`:
     `[IV (12 bytes)] + [Authentication Tag (16 bytes)] + [AES-GCM Ciphertext]`
   * The PBKDF2 salt is saved separately inside `server_priv.salt`.
3. **Secure Shredding (Anti-Forensics)**:
   * During key generation, after writing the encrypted files, the temporary plaintext `server_priv.key` file is shredded:
     * Overwritten completely with repeating `'0'` characters to overwrite filesystem disk sectors.
     * Unlinked (deleted) from the filesystem.
4. **In-Memory Closure Isolation**:
   * On server boot, `keyVault.unlock(MasterPassword)` reads the encrypted envelope and salt, decrypts the private key, and holds it inside a local closure variable (`inMemoryPrivateKey`) within `key_vault.js`.
   * The decrypted private key is never exported as a public property, preventing other server scripts or modules from reading it.
5. **C++ Raw Key Parameter Fallback**:
   * The C++ executable expects the key parameter. Since the plaintext file no longer exists, Node.js passes the raw in-memory decrypted private key string to the spawn call.
   * Inside `crypto_tool.cpp`, key loaders attempt to read the file. If the file is missing, the parameter string itself is base64-decoded as the raw key bytes, preventing any disk-writes of the private key during operation.
