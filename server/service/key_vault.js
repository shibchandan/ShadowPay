import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { cryptoHelper } from '../crypto-helper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYS_DIR = path.resolve(__dirname, '../keys');
const PUB_KEY_PATH = path.join(KEYS_DIR, 'server_pub.key');
const ENC_PRIV_KEY_PATH = path.join(KEYS_DIR, 'server_priv.enc');
const SALT_PATH = path.join(KEYS_DIR, 'server_priv.salt');

let inMemoryPrivateKey = null;

// Derive key using PBKDF2
function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

// Encrypt plaintext key buffer with AES-256-GCM
function encryptKey(plaintext, password) {
  const salt = crypto.randomBytes(16);
  const aesKey = deriveKey(password, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  // Pack: [IV (12B)][Tag (16B)][Ciphertext]
  const packet = Buffer.concat([iv, tag, encrypted]);
  return { packet, salt };
}

// Decrypt ciphertext key buffer with AES-256-GCM
function decryptKey(packet, salt, password) {
  const aesKey = deriveKey(password, salt);
  const iv = packet.subarray(0, 12);
  const tag = packet.subarray(12, 28);
  const encrypted = packet.subarray(28);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export const keyVault = {
  isUnlocked() {
    return inMemoryPrivateKey !== null;
  },

  getPrivateKey() {
    if (!inMemoryPrivateKey) {
      throw new Error('Key vault is locked. Unlock it on server bootstrap.');
    }
    return inMemoryPrivateKey;
  },

  async unlock(password) {
    if (this.isUnlocked()) return true;

    // Ensure directory exists
    if (!fs.existsSync(KEYS_DIR)) {
      fs.mkdirSync(KEYS_DIR, { recursive: true });
    }

    const tempPrivPath = path.join(KEYS_DIR, 'server_priv.key');

    // 1. Generate keys if not exist
    if (!fs.existsSync(PUB_KEY_PATH) || !fs.existsSync(ENC_PRIV_KEY_PATH)) {
      console.log('No encrypted key found. Initializing server RSA-2048 keys at-rest...');
      
      // Delete old plain file if it is lying around
      if (fs.existsSync(tempPrivPath)) {
        fs.unlinkSync(tempPrivPath);
      }

      // Generate using helper (writes to temporary file)
      await cryptoHelper.genKeys(PUB_KEY_PATH, tempPrivPath);

      // Read the generated plaintext private key
      const plaintextKey = fs.readFileSync(tempPrivPath, 'utf8').trim();

      // Encrypt private key at rest
      const { packet, salt } = encryptKey(plaintextKey, password);

      // Save encrypted key and salt to disk
      fs.writeFileSync(ENC_PRIV_KEY_PATH, packet);
      fs.writeFileSync(SALT_PATH, salt);

      // Shred temporary plaintext file securely by overwriting with zeros
      fs.writeFileSync(tempPrivPath, '0'.repeat(plaintextKey.length));
      fs.unlinkSync(tempPrivPath);
      console.log('✔ Server private key successfully encrypted and stored. Plaintext shredded.');
      
      inMemoryPrivateKey = plaintextKey;
      return true;
    }

    // 2. Decrypt existing key into memory
    try {
      const packet = fs.readFileSync(ENC_PRIV_KEY_PATH);
      const salt = fs.readFileSync(SALT_PATH);
      inMemoryPrivateKey = decryptKey(packet, salt, password);
      console.log('✔ Server key vault unlocked in-memory successfully.');
      return true;
    } catch (err) {
      console.error('❌ Failed to decrypt server private key: invalid master password.');
      throw err;
    }
  }
};
