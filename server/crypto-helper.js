import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Path to the compiled C++ executable
const CRYPTO_TOOL_PATH = path.resolve(__dirname, '../cpp/crypto_tool.exe');

function runCryptoTool(args, stdinInput = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(CRYPTO_TOOL_PATH, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`crypto_tool failed with code ${code}: ${stderr.trim()}`));
      }
    });

    if (stdinInput !== null) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }
  });
}

export const cryptoHelper = {
  /**
   * Generates a 2048-bit RSA keypair.
   * @param {string} pubPath Path to save public key
   * @param {string} privPath Path to save private key
   */
  async genKeys(pubPath, privPath) {
    return runCryptoTool(['genkeys', pubPath, privPath]);
  },

  /**
   * Encrypts plaintext using hybrid RSA-OAEP + AES-256-GCM.
   * @param {string} pubPath Path to public key
   * @param {string} plaintext Text to encrypt
   * @returns {Promise<string>} Base64 encoded ciphertext packet
   */
  async encrypt(pubPath, plaintext) {
    return runCryptoTool(['encrypt', pubPath, '-'], plaintext);
  },

  /**
   * Decrypts ciphertext packet.
   * @param {string} privPath Path to private key
   * @param {string} ciphertext Base64 encoded ciphertext packet
   * @returns {Promise<string>} Plaintext string
   */
  async decrypt(privPath, ciphertext) {
    let key = privPath;
    if (privPath.endsWith('server_priv.key')) {
      const { keyVault } = await import('./service/key_vault.js');
      key = keyVault.getPrivateKey();
    }
    return runCryptoTool(['decrypt', key, '-'], ciphertext);
  },

  /**
   * Computes SHA-256 hash of base64 ciphertext packet.
   * @param {string} ciphertext Base64 encoded ciphertext packet
   * @returns {Promise<string>} SHA-256 hex string
   */
  async hash(ciphertext) {
    return runCryptoTool(['hash', '-'], ciphertext);
  },

  /**
   * Signs plaintext data using a private key.
   * @param {string} privPath Path to private key
   * @param {string} data Plaintext to sign
   * @returns {Promise<string>} Base64 encoded signature
   */
  async sign(privPath, data) {
    let key = privPath;
    if (privPath.endsWith('server_priv.key')) {
      const { keyVault } = await import('./service/key_vault.js');
      key = keyVault.getPrivateKey();
    }
    return runCryptoTool(['sign', key, '-'], data);
  },

  /**
   * Verifies plaintext data signature using a public key.
   * @param {string} pubPath Path to public key
   * @param {string} data Plaintext that was signed
   * @param {string} signature Base64 encoded signature
   * @returns {Promise<boolean>} True if signature matches and is valid
   */
  async verify(pubPath, data, signature) {
    try {
      const result = await runCryptoTool(['verify', pubPath, '-', signature], data);
      return result === 'VALID';
    } catch (err) {
      console.warn('Signature verification check failed:', err.message);
      return false;
    }
  }
};
