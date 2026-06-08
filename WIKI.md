# ShadowPay — Technical Wiki

Welcome to the ShadowPay technical wiki. This document serves as an in-depth reference for the cryptographic protocol, database schema constraints, gossip simulator design, and the **living ledger of practical problems and solutions** handled in this project.

> [!NOTE]
> For a detailed technical breakdown of **Hybrid Encryption & Hashing**, **Concurrent Ingestion Guards**, and **TTL Packet Lifecycle** mechanics, please refer to [Cryptography, Concurrency, and Packet Lifecycle Specification](file:///d:/ShadowPay/docs/cryptography_and_concurrency.md).
> For the threat modeling analysis, active security controls, and production roadmap, refer to [Security Audit & Threat Model Analysis](file:///d:/ShadowPay/docs/security_audit.md).

---

## 1. Cryptographic Protocol Spec

All offline payments are packed into a secure binary format before being Base64-serialized for transmission. The server private key is RSA-2048, and symmetric encryption uses AES-256-GCM.

### Packet Wire Format (Packed Binary)
When a device encrypts a `PaymentInstruction` JSON string, it generates a random 32-byte AES key and a 12-byte IV. The payload is encrypted with AES-256-GCM, producing a ciphertext and a 16-byte authentication tag. The AES key is then encrypted with the server's RSA-2048 public key (using SHA-256 OAEP padding).

The final binary packet is packed as follows:

```
┌───────────────────────────────┬──────────────┬────────────────────────┬─────────────┐
│    RSA-Encrypted AES Key      │   GCM IV     │  AES GCM Ciphertext    │   GCM Tag   │
│          (256 bytes)          │  (12 bytes)  │    (Variable length)   │ (16 bytes)  │
└───────────────────────────────┴──────────────┴────────────────────────┴─────────────┘
```

This packed byte array is Base64 encoded and set as the `ciphertext` field inside the `MeshPacket`.

---

## 2. Database Schema & Concurrency Design

ShadowPay uses MongoDB (via Mongoose) to manage state. The schema is configured with safety locks to guarantee ledger integrity.

### A. Account Schema (`Account.js`)
* **Collection**: `accounts`
* **Optimistic Concurrency**: Enabled via `optimisticConcurrency: true` (version key `version`).
* **Precise Math**: Uses `Decimal128` to avoid floating-point rounding errors on balances.

### B. Transaction Schema (`Transaction.js`)
* **Collection**: `transactions`
* **Integrity Guard**: The `packetHash` field has a database-level `unique` index. This guarantees that even if the cache layer fails, the database will abort any duplicate transaction write.

### C. Idempotency Schema (`Idempotency.js`)
* **Collection**: `idempotency`
* **Automated Expiry**: Uses MongoDB's built-in **TTL index** on `createdAt` with `expires: 86400` (24 hours). This automatically evicts hashes from the database when they are older than 24 hours.

---

## 3. Living Ledger of Practical Problems & Solutions

This section acts as a chronological record of the engineering problems encountered during this project, the solutions applied, and a template for recording future challenges.

| Date       | Category        | Problem Description                                                                                             | Solution Applied                       | Technical Details                                                                                                                                                                                                                                           |
| :--------- | :-------------- | :------------------------------------------------------------------------------------------------------------- | :------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-08 | **Security**    | Intermediaries carrying offline packets can tamper with the payment amount or VPA.                             | **Authenticated Encryption (AES-GCM)** | Encrypted the payload using AES-GCM. Decryption verifies the 16-byte auth tag. Any alteration throws a `decryption_failed` error.                                                                                            |
| 2026-06-08 | **Concurrency** | Multiple bridge nodes uploading the same packet concurrently causes multiple debits.                           | **Atomic Idempotency Lock**            | Implemented a `claimIdempotency` check using MongoDB's unique document constraints on `packetHash` (equivalent to Redis `SET NX`).                                                                                          |
| 2026-06-08 | **Concurrency** | Race condition: two distinct transactions try to debit the same account at the same millisecond.                | **Atomic Balance Deductions**          | Replaced read-modify-write with an atomic update: `findOneAndUpdate({ _id: sender, balance: { $gte: amount } }, { $inc: { balance: -amount } })`.                                                                           |
| 2026-06-08 | **Security**    | Server private key stored in plaintext on disk (`server_priv.key`), exposing it to filesystem theft.            | **Encrypted Key Vault At-Rest**        | Encrypted key with AES-256-GCM using PBKDF2 (100,000 iterations) derived from master password. Decrypted key in-memory on boot in isolated closure scope (`key_vault.js`), passing it directly as Base64 to C++ tool.       |
| 2026-06-08 | **Performance** | Spawning a C++ CLI process for every packet under high load is CPU expensive.                                  | *Pending / Future Task*                | Compile the C++ cryptographic engine as a Node.js Native Addon using `node-addon-api`.                                                                                                                                      |

---

## How to Add New Problems & Solutions in the Future

When you handle a new problem (e.g. implementing the C++ Node addon, adding signature checks, or building an offline wallet balance token):

1. **Open this Wiki file** (`WIKI.md`).
2. Add a new row to the **Living Ledger** table above, specifying:
   * **Date**: The date of the implementation.
   * **Category**: e.g., Cryptography, Network, UI, Database.
   * **Problem Description**: Describe the bug, security flaw, or bottleneck.
   * **Solution Applied**: Summarize what code was added/modified.
   * **Technical Details**: Explain the files, API classes, or commands used.
3. Update the corresponding `README.md` if any new environment variables, dependencies, or run commands were introduced.
