# UPI Offline Mesh — C++ & MERN Stack Demo

A hybrid Node.js and C++ backend that demonstrates **offline UPI payments routed through a Bluetooth-style mesh network**. You're in a basement with zero connectivity. You send your friend ₹500. Your phone encrypts the payment, broadcasts it to nearby phones, and the packet hops device-to-device until *some* phone walks outside, gets 4G, and silently uploads it to this backend. The backend decrypts, deduplicates, and settles.

This repo contains the **MERN + C++ server side** of that system, plus a software simulator of the mesh so you can demo the whole flow on a single laptop without any real Bluetooth hardware.

---

## Table of Contents

1. [What this demo proves](#what-this-demo-proves)
2. [Technical Stack](#technical-stack)
3. [How to run it](#how-to-run-it)
4. [The demo flow (step by step)](#the-demo-flow-step-by-step)
5. [Architecture](#architecture)
6. [The three hard problems and how they're solved](#the-three-hard-problems-and-how-theyre-solved)
7. [File-by-file walkthrough](#file-by-file-walkthrough)
8. [API reference](#api-reference)
9. [Tests](#tests)
10. [What's NOT real (and what would change for production)](#whats-not-real-and-what-would-change-for-production)
11. [Honest limitations of the concept](#honest-limitations-of-the-concept)
12. [Troubleshooting](#troubleshooting)
13. [Technical Wiki & Living Problems Ledger](#technical-wiki--living-problems-ledger)

---

## What this demo proves

The system shows three things working end to end:

1. **A payment can travel from sender to backend through untrusted intermediaries** without any of them being able to read or tamper with it. (Hybrid RSA + AES-256-GCM encryption implemented in C++.)
2. **Even if the same payment reaches the backend simultaneously through multiple bridge nodes, it settles exactly once.** (Idempotency via atomic compare-and-set on the ciphertext hash in MongoDB.)
3. **A tampered or replayed packet is rejected** before it touches the ledger.

You'll see all three in the dashboard.

---

## Technical Stack

* **Frontend**: React + Vite (Custom glassmorphic dark CSS).
* **Backend**: Node.js + Express.
* **Database**: MongoDB (via Mongoose) with TTL indexes for idempotency cache clearing and atomic updates on accounts.
* **Cryptography Engine**: Native C++ console tool (`cpp/crypto_tool.cpp`) using Windows Cryptography Next Generation (CNG) to guarantee offline execution security.

---

## How to run it

### Prerequisites

* **Node.js 18+** installed.
* **g++ compiler** (MinGW/MSYS2) on PATH.
* **MongoDB** database instance running locally at `mongodb://127.0.0.1:27017/shadowpay` (the backend will automatically fall back to an in-memory virtual database store if MongoDB is not running).

### 1. Compile the C++ Cryptography Engine
Open a terminal in the `cpp` directory and run:
```cmd
cd cpp
.\compile.bat
```
This compiles `crypto_tool.cpp` into `crypto_tool.exe` using native Windows libraries (`bcrypt.dll`, `crypt32.dll`).

### 2. Run the Express Backend
Open a terminal in the `server` directory and run:
```cmd
cd server
npm install
npm start
```
The server will start on port `8080`.

### 3. Run the React Frontend
Open a separate terminal in the `client` directory and run:
```cmd
cd client
npm install
npm run dev
```
Open your browser and navigate to **[http://localhost:5173](http://localhost:5173)**.

---

## The demo flow (step by step)

The dashboard has controls that walk through the full pipeline. The intended sequence:

### Step 1 — Compose a payment
Choose sender, receiver, amount, and PIN. Click **"📤 Inject into Mesh"**.
* **What actually happens on the backend:**
  * The server pretends to be the sender's phone.
  * It builds a `PaymentInstruction` with a unique nonce and current timestamp.
  * It encrypts that with the server's RSA public key by spawning the C++ cryptographic engine.
  * It wraps the ciphertext in a `MeshPacket` with a TTL of 5.
  * It hands the packet to `phone-alice`, an offline virtual device.

You'll see `phone-alice` now holds 1 packet.

### Step 2 — Run gossip rounds
Click **"🔄 Run Gossip Round"**. Then click it again.
* Each round, every device that holds a packet broadcasts it to every other device within range. TTL decrements per hop.
* After 1 round: every device holds the packet. After 2 rounds: still every device — TTL is just lower.

### Step 3 — Bridge node uploads to backend
Click **"📡 Bridges Upload (Flush)"**.
* `phone-bridge` is the only device with `hasInternet=true`. The dashboard simulates that phone walking outside, getting 4G, and POSTing every packet it holds to `/api/bridge/ingest`.
* The backend pipeline runs:
  1. Hash the ciphertext (`SHA-256`) via the C++ tool.
  2. Try to claim the hash in the idempotency cache (MongoDB collection).
  3. If claimed: decrypt with the server's RSA private key via C++ tool.
  4. Verify freshness (signedAt within 24 hours).
  5. Run the debit/credit atomically.

Watch the **User Account Balances** grid and the **Settled Transactions** log — money has moved.

### Step 4 — Demonstrate idempotency (the killer feature)
1. Click **"Reset Simulation"**.
2. Inject a single packet.
3. Run gossip 2 times. Now all 5 devices hold the same packet, including the bridge.
4. Click **"Bridges Upload (Flush)"**.
5. The test fires concurrent POST requests to the backend. The server processes the first one as `SETTLED` and rejects the rest as `DUPLICATE_DROPPED`.

To exercise the *concurrent duplicate* case properly, run the automated test:
```cmd
cd server
node tests/concurrency.test.js
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SENDER PHONE (offline)                          │
│  PaymentInstruction { sender, receiver, amount, pinHash, nonce, time }  │
│              │                                                          │
│              ▼ C++ encrypt with server's RSA public key                 │
│   MeshPacket { packetId, ttl, createdAt, ciphertext }                   │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ Bluetooth gossip
                                       ▼
        ┌─────────┐  hop   ┌─────────┐  hop   ┌─────────┐
        │stranger1│ ─────▶ │stranger2│ ─────▶ │ bridge  │ ◀── walks outside
        └─────────┘        └─────────┘        └────┬────┘     gets 4G
                                                   │
                                                   ▼ HTTPS POST
┌─────────────────────────────────────────────────────────────────────────┐
│                     NODE.JS / EXPRESS BACKEND                           │
│                                                                         │
│  /api/bridge/ingest                                                     │
│       │                                                                 │
│       ▼                                                                 │
│  [1] Hash ciphertext (SHA-256) ──▶ Spawns C++ crypto_tool hash          │
│       │                                                                 │
│       ▼                                                                 │
│  [2] Idempotency.create({_id: hash}) ◀── MongoDB unique index lock      │
│       │                                  Duplicates rejected here.      │
│       ▼                                                                 │
│  [3] Decrypt ciphertext ───────▶ Spawns C++ crypto_tool decrypt         │
│       │                          (RSA-OAEP + AES-256-GCM verification)  │
│       ▼                                                                 │
│  [4] Freshness check: signedAt within last 24h                          │
│       │                                                                 │
│       ▼                                                                 │
│  [5] settleTransaction()                                                │
│       Atomic update on Account (balance check + increment)              │
│       Saves Transaction ledger to MongoDB                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## The three hard problems and how they're solved

### Problem 1: Untrusted intermediates
A random stranger's phone is carrying your transaction. How do you stop them from reading the amount or changing it?

**Solution: Hybrid encryption (RSA-OAEP + AES-256-GCM) implemented in C++.**
* The sender encrypts the payload with the server's public key. Only the server holds the private key, so intermediates see opaque ciphertext.
* Since RSA cannot encrypt large data payloads, we use the hybrid pattern:
  1. Generate a fresh AES key for *this packet*.
  2. Encrypt the JSON payload with **AES-256-GCM** (fast + authenticated).
  3. Encrypt just the AES key with **RSA-OAEP** using SHA-256.
  4. Concatenate: `[256 bytes RSA-encrypted AES key][12 bytes IV][AES ciphertext][16-byte GCM tag]`.
* **Why GCM specifically?** It's authenticated encryption. If an intermediate flips one bit anywhere in the ciphertext, decryption throws an exception — the GCM tag won't verify.

### Problem 2: The duplicate-storm
Three bridge nodes hold the same packet. They all walk outside at the same instant and upload it. If you process all three, the sender is debited multiple times.

**Solution: Atomic compare-and-set on the ciphertext hash.**
* The backend computes `SHA-256(ciphertext)` using the C++ tool and tries to insert this hash as `_id` in the MongoDB `idempotency` collection.
* MongoDB's unique primary key constraint makes this operation atomic. Even if 100 threads hit the endpoint at the exact same nanosecond, exactly one succeeds; the rest fail with a duplicate key error (code 11000) and are dropped immediately.

### Problem 3: Replay attacks
An attacker who captured a ciphertext weeks ago could replay it whenever convenient.

**Solution: Two layers.**
1. **Freshness Gate**: Inside the encrypted payload, the sender includes a `signedAt` timestamp. The server rejects any packet older than 24 hours.
2. **Nonces**: Senders include a unique `nonce` UUID. If a sender legitimately sends Bob ₹100 twice, the nonces differ, making the ciphertexts and hashes different. A replay of the exact same transaction packet, however, is byte-identical and gets blocked by the idempotency gate.

---

## File-by-file walkthrough

```
upi-offline-mesh/
├── WIKI.md                              technical wiki & problems log
├── README.md                            this file
│
├── cpp/                                 ── Cryptography Module (C++)
│   ├── crypto_tool.cpp                  native Windows CNG RSA/AES engine
│   └── compile.bat                      compilation script
│
├── server/                              ── Node.js Express Backend
│   ├── package.json                     backend dependencies
│   ├── server.js                        main server + router
│   ├── crypto-helper.js                 C++ child process wrapper
│   ├── models/                          Mongoose models (Account, Transaction, Idempotency)
│   ├── service/                         Gossip simulator service
│   └── tests/                           concurrency & tampering test script
│
└── client/                              ── React Frontend
    ├── package.json                     frontend dependencies
    ├── index.html                       HTML entry point
    ├── src/                             React source (App.jsx, index.css)
    └── vite.config.js                   Vite proxy setup
```

---

## API reference

| Method | Path | What it does |
|---|---|---|
| GET | `/api/server-key` | Server's RSA public key (base64) |
| GET | `/api/accounts` | All accounts and balances |
| GET | `/api/transactions` | Last 20 settled transactions |
| GET | `/api/mesh/state` | Current state of every virtual device |
| POST | `/api/demo/send` | Simulate offline payment injection |
| POST | `/api/mesh/gossip` | Run one round of gossip across the mesh |
| POST | `/api/mesh/flush` | Upload packets from bridge nodes to backend |
| POST | `/api/mesh/reset` | Clear simulation state and balances |
| POST | `/api/bridge/ingest` | **The production endpoint.** Ingests bridge node packets |

---

## Tests

To run the automated concurrency and tampering tests:
1. Ensure the backend server is running (`npm start` in `server`).
2. Run the test command in the `server` directory:
```bash
node tests/concurrency.test.js
```
This tests:
* Server key availability.
* **Concurrent duplicate ingestion**: Simulates 3 bridge nodes uploading the same packet concurrently. Asserts exactly one settles and two are dropped.
* **Tampering**: Alters the ciphertext and verifies that decryption fails (AES-GCM tag check).

---

## What's NOT real (and what would change for production)

This is a teaching demo. To make it production-grade you'd swap these components:

| What's in the demo | What it would be in production |
|---|---|
| Local/Mock MongoDB | MongoDB Atlas / replica sets |
| MongoDB TTL Collection for cache | Redis cache with `SET NX EX` |
| Server-side `crypto_tool.exe` spawned processes | Node C++ Addon (shared library) or WebAssembly |
| Server-side `DemoService.createPacket()` | Same cryptographic packaging running inside Android Kotlin / iOS Swift apps |
| Software-simulated mesh (`mesh_simulator.js`) | Real BLE GATT or Wi-Fi Direct between mobile phones |
| Local simulated accounts | KYC'd bank users, real VPAs, and PIN verification |
| No auth on `/api/bridge/ingest` | Mutual TLS (mTLS) or signed bridge-node gateway certs |

---

## Honest limitations of the concept

1. **The receiver has no way to verify the sender has the funds.** When a sender hands a receiver a phone showing "₹500 sent," it's an IOU, not a settled payment. If the sender's account is empty when the packet finally reaches the backend, the settlement will be `REJECTED`. *This is why real offline UPI uses a pre-funded hardware-backed wallet* — to give cryptographic proof of available funds offline.
2. **A malicious sender can double-spend offline.** With ₹500 in their account, they could send a packet to Bob in basement A, walk to basement B, and send another ₹500 to Carol. Whichever packet hits the backend first wins; the other gets `REJECTED`.
3. **Bluetooth in real life is hard.** Background BLE on Android is heavily throttled. iOS peripheral mode is restricted. Two strangers' phones reliably forming a connection while the apps aren't open is difficult.
4. **Privacy / liability.** A stranger carries your encrypted transaction packet on their phone. While they cannot read it, the packet metadata exists on their device.

---

## Troubleshooting

* **`g++ : The term 'g++' is not recognized`** — Install MinGW/MSYS2 and add it to your Windows PATH environment variables.
* **Port 8080 already in use** — The port is held by another process. Run `npm run dev` again after ensuring no other Node server or background process is running on port `8080`.
* **MongoDB connection failed** — Make sure MongoDB is running on your machine (`127.0.0.1:27017`). If you don't have MongoDB installed, the backend will automatically fallback to an in-memory virtual storage mode so the demo still runs.

---

## Technical Wiki & Detailed Specifications

* For a deep-dive specification of the cryptosystems, atomic concurrency locks, and transaction packet TTL details, see the **[Cryptography, Concurrency, and Packet Lifecycle Specification](./docs/cryptography_and_concurrency.md)**.
* For the active security controls, simulated trust boundaries, and production security roadmap, see the **[Security Audit & Threat Model Analysis](./docs/security_audit.md)**.
* For the database schema layout, mesh simulation architecture, and the chronological record of engineering fixes, check out the **[Technical Wiki & Living Problems Ledger](./WIKI.md)**.
