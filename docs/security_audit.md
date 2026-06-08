# ShadowPay Security Audit & Threat Model Analysis

This document provides a comprehensive security review of **ShadowPay**, outlining active threat mitigation strategies, simulated trust boundaries of the prototype, and security recommendations for production environments.

---

## 1. What Security is Fully Handled (Active Now)

The current hybrid C++ and Node.js codebase implements multiple active cryptographic and database-level protections:

### 🔒 Payload Confidentiality
* **Threat Addressed**: Eavesdropping by carrying nodes in the offline mesh network.
* **Implementation**: Transaction instructions are encrypted using **AES-256-GCM**. The session key is protected with **RSA-OAEP-SHA256**. Intermediary devices carrying packets see only opaque base64 data.
* **Status**: `[Secured]`

### 🛡️ Payload Integrity
* **Threat Addressed**: Tampering with transaction values in transit.
* **Implementation**: **AES-GCM** provides *Authenticated Encryption*. If an intermediary modifies even a single bit of the ciphertext, decryption will fail at the server (GCM tag check fails) and the packet is rejected.
* **Status**: `[Secured]`

### 🔑 Authentication
* **Threat Addressed**: Forging transactions or impersonating senders.
* **Implementation**: Every payment payload is signed with the user's **RSA-2048 private key** offline. The server verifies this signature using the user's public key loaded from MongoDB before settlement.
* **Status**: `[Secured]`

### 🔄 Replay Attack Resistance
* **Threat Addressed**: Re-submitting stale payloads to double-settle payments.
* **Implementation**: Senders include a unique `nonce` (so distinct transactions produce different ciphertexts) and a `signedAt` timestamp. The server enforces a **24-hour freshness gate** and atomic **idempotency checks** on MongoDB.
* **Status**: `[Secured]`

### 💰 Double-Spend Protection
* **Threat Addressed**: Offline balance overdrafts or double-spending.
* **Implementation**: Users pre-lock funds on the server, generating a server-signed wallet token. Spends are signed and deducted from this pre-locked pool, guaranteeing merchant settlement without real-time database checks.
* **Status**: `[Secured]`

### 🗝️ Server Key Security
* **Threat Addressed**: File theft or leakage of the server private key.
* **Implementation**: The server's RSA private key is encrypted at rest (`server_priv.enc`) using **AES-256-GCM** with a **Master Password** (via PBKDF2). Plaintext key files are shredded from disk and decrypted solely in-memory within `key_vault.js`.
* **Status**: `[Secured]`

### 🌐 mTLS Gateway Ingestion
* **Threat Addressed**: Unauthorized bridge nodes uploading rogue/spam payloads to the gateway.
* **Implementation**: The ingestion endpoint `/api/bridge/ingest` enforces **Mutual TLS (mTLS)**. Connections are only accepted from clients presenting a client certificate signed by the Root Certificate Authority (CA).
* **Status**: `[Secured]`

### 🛰️ P2P Routing Audit Chain
* **Threat Addressed**: Rogue/Sybil mesh nodes dropping or hijacking packets (Blackhole Attack).
* **Implementation**: When packets hop from node to node, each receiving node signs a cryptographic acknowledgment receipt (Ack). The gateway verifies this signature chain before settling the transaction.
* **Status**: `[Secured]`

---

## 2. Simulated Trust Boundaries (Demo Limitations)

For the purpose of running a local software simulation on a single laptop without specialized hardware, some security components are simulated in software or memory:

### A. Local Balance & Key Tampering
* **The Prototype**: User pre-funded balances and private keys reside in client-side React memory.
* **The Threat**: On a real device, a malicious user could open a debugger or console, manually override the balance variables, and double-spend their pre-funded balance.
* **Production Recommendation**: Keys and offline wallet operations must reside within a hardware-backed **Trusted Execution Environment (TEE)** or **Secure Enclave** (such as Apple's Secure Enclave or Android Keystore with StrongBox). This guarantees that balances cannot be incremented by local device owners, and private keys can never be extracted.

### B. SSL Pinning Verification
* **The Prototype**: Client-side certificate fingerprint validation is simulated in the React dashboard.
* **The Threat**: An attacker on the same local network could inject a proxy certificate (MITM attack) to read client payloads in transit.
* **Production Recommendation**: Mobile clients must use strict **SSL Pinning** by hardcoding the ingestion gateway's public certificate key hash inside the mobile application package.

---

## 3. Production Security Roadmap

To scale ShadowPay to production-grade security, the following controls should be added to the roadmap:

```
┌──────────────────────────────┐       ┌──────────────────────────────┐
│       APP CLIENT (TEE)       │       │    INGESTION GATEWAY (HSM)   │
├──────────────────────────────┤       ├──────────────────────────────┤
│  ✔ Keys in Secure Enclave    │       │  ✔ Gateway mTLS Certificate  │
│  ✔ Offline Wallet HSM Loop   │ ────▶ │  ✔ SSL Pinning Verification  │
│  ✔ Client-side SSL Pinning   │       │  ✔ Keys inside Hardware HSM  │
└──────────────────────────────┘       └──────────────────────────────┘
```

1. **Secure Enclave Core**:
   * Port the client-side signing and balance checking logic from Javascript to native mobile modules (Kotlin/Swift) leveraging Hardware Enclaves.
2. **Hardware Security Module (HSM)**:
   * Keep the Root CA and the Server's private key inside a dedicated HSM/KMS instead of local disk storage.
3. **Sybil & Network Auditing**:
   * Expand P2P path acknowledgments to track routing behavior over time, lowering trust scores and blacklisting rogue nodes that repeatedly drop or modify packets.

