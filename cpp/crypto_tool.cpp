#include <windows.h>
#include <bcrypt.h>
#include <wincrypt.h>
#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <sstream>
#include <iomanip>

// Link-time check error helper
#ifndef STATUS_SUCCESS
#define STATUS_SUCCESS ((NTSTATUS)0x00000000L)
#endif

// Base64 encoding/decoding using Windows Crypt32
std::string base64_encode(const std::vector<BYTE>& data) {
    if (data.empty()) return "";
    DWORD out_len = 0;
    CryptBinaryToStringA(data.data(), data.size(), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, NULL, &out_len);
    std::string result(out_len, '\0');
    CryptBinaryToStringA(data.data(), data.size(), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, &result[0], &out_len);
    while (!result.empty() && (result.back() == '\0' || result.back() == '\n' || result.back() == '\r')) {
        result.pop_back();
    }
    return result;
}

std::vector<BYTE> base64_decode(const std::string& b64) {
    if (b64.empty()) return {};
    DWORD out_len = 0;
    CryptStringToBinaryA(b64.c_str(), b64.size(), CRYPT_STRING_BASE64, NULL, &out_len, NULL, NULL);
    std::vector<BYTE> result(out_len);
    CryptStringToBinaryA(b64.c_str(), b64.size(), CRYPT_STRING_BASE64, result.data(), &out_len, NULL, NULL);
    result.resize(out_len);
    return result;
}

std::string read_input(const std::string& arg) {
    if (arg == "-") {
        std::stringstream ss;
        ss << std::cin.rdbuf();
        return ss.str();
    }
    return arg;
}

bool write_file(const std::string& path, const std::string& data) {
    std::ofstream out(path, std::ios::binary);
    if (!out) return false;
    out.write(data.data(), data.size());
    return true;
}

std::string read_file(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return "";
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

// SHA-256 Hashing helper
std::vector<BYTE> sha256_hash_raw(const std::vector<BYTE>& data) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0);
    
    DWORD cbHashObject = 0, cbHash = 0, cbData = 0;
    BCryptGetProperty(hAlg, BCRYPT_OBJECT_LENGTH, (PBYTE)&cbHashObject, sizeof(DWORD), &cbData, 0);
    BCryptGetProperty(hAlg, BCRYPT_HASH_LENGTH, (PBYTE)&cbHash, sizeof(DWORD), &cbData, 0);
    
    std::vector<BYTE> hashObject(cbHashObject);
    std::vector<BYTE> hash(cbHash);
    
    BCRYPT_HASH_HANDLE hHash = NULL;
    BCryptCreateHash(hAlg, &hHash, hashObject.data(), cbHashObject, NULL, 0, 0);
    BCryptHashData(hHash, (PBYTE)data.data(), data.size(), 0);
    BCryptFinishHash(hHash, hash.data(), cbHash, 0);
    
    BCryptDestroyHash(hHash);
    BCryptCloseAlgorithmProvider(hAlg, 0);
    return hash;
}

std::string sha256_hash_hex(const std::vector<BYTE>& data) {
    std::vector<BYTE> hash = sha256_hash_raw(data);
    std::stringstream ss;
    for (BYTE b : hash) {
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)b;
    }
    return ss.str();
}

// Key Generation
bool cmd_genkeys(const std::string& pub_path, const std::string& priv_path) {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    if (BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_RSA_ALGORITHM, NULL, 0) != STATUS_SUCCESS) return false;
    
    BCRYPT_KEY_HANDLE hKey = NULL;
    if (BCryptGenerateKeyPair(hAlg, &hKey, 2048, 0) != STATUS_SUCCESS) {
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return false;
    }
    
    if (BCryptFinalizeKeyPair(hKey, 0) != STATUS_SUCCESS) {
        BCryptDestroyKey(hKey);
        BCryptCloseAlgorithmProvider(hAlg, 0);
        return false;
    }
    
    // Export Public Key
    DWORD pubLen = 0;
    BCryptExportKey(hKey, NULL, BCRYPT_RSAPUBLIC_BLOB, NULL, 0, &pubLen, 0);
    std::vector<BYTE> pubBlob(pubLen);
    BCryptExportKey(hKey, NULL, BCRYPT_RSAPUBLIC_BLOB, pubBlob.data(), pubLen, &pubLen, 0);
    
    // Export Private Key
    DWORD privLen = 0;
    BCryptExportKey(hKey, NULL, BCRYPT_RSAPRIVATE_BLOB, NULL, 0, &privLen, 0);
    std::vector<BYTE> privBlob(privLen);
    BCryptExportKey(hKey, NULL, BCRYPT_RSAPRIVATE_BLOB, privBlob.data(), privLen, &privLen, 0);
    
    BCryptDestroyKey(hKey);
    BCryptCloseAlgorithmProvider(hAlg, 0);
    
    std::string pub_b64 = base64_encode(pubBlob);
    std::string priv_b64 = base64_encode(privBlob);
    
    if (!write_file(pub_path, pub_b64) || !write_file(priv_path, priv_b64)) {
        return false;
    }
    
    std::cout << "SUCCESS: Generated 2048-bit RSA keypair." << std::endl;
    return true;
}

// Encrypt
bool cmd_encrypt(const std::string& pub_path, const std::string& plaintext) {
    std::string pub_b64 = read_file(pub_path);
    if (pub_b64.empty()) {
        pub_b64 = pub_path; // Fallback to raw key string if file doesn't exist
    }
    std::vector<BYTE> pubBlob = base64_decode(pub_b64);
    if (pubBlob.empty()) {
        std::cerr << "ERROR: Failed to load public key." << std::endl;
        return false;
    }
    
    BCRYPT_ALG_HANDLE hRsaAlg = NULL;
    BCryptOpenAlgorithmProvider(&hRsaAlg, BCRYPT_RSA_ALGORITHM, NULL, 0);
    BCRYPT_KEY_HANDLE hRsaKey = NULL;
    if (BCryptImportKeyPair(hRsaAlg, NULL, BCRYPT_RSAPUBLIC_BLOB, &hRsaKey, pubBlob.data(), pubBlob.size(), 0) != STATUS_SUCCESS) {
        std::cerr << "ERROR: Failed to import public key." << std::endl;
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    // Generate AES key (256-bit = 32 bytes)
    std::vector<BYTE> aesKey(32);
    BCryptGenRandom(NULL, aesKey.data(), aesKey.size(), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
    
    // Generate IV (12 bytes)
    std::vector<BYTE> iv(12);
    BCryptGenRandom(NULL, iv.data(), iv.size(), BCRYPT_USE_SYSTEM_PREFERRED_RNG);
    
    // AES-GCM Encrypt
    BCRYPT_ALG_HANDLE hAesAlg = NULL;
    BCryptOpenAlgorithmProvider(&hAesAlg, BCRYPT_AES_ALGORITHM, NULL, 0);
    BCryptSetProperty(hAesAlg, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0);
    
    BCRYPT_KEY_HANDLE hAesKey = NULL;
    BCryptGenerateSymmetricKey(hAesAlg, &hAesKey, NULL, 0, aesKey.data(), aesKey.size(), 0);
    
    std::vector<BYTE> tag(16);
    BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO authInfo;
    BCRYPT_INIT_AUTH_MODE_INFO(authInfo);
    authInfo.pbNonce = iv.data();
    authInfo.cbNonce = iv.size();
    authInfo.pbTag = tag.data();
    authInfo.cbTag = tag.size();
    
    std::vector<BYTE> plainBytes(plaintext.begin(), plaintext.end());
    DWORD cbCipher = 0;
    BCryptEncrypt(hAesKey, plainBytes.data(), plainBytes.size(), &authInfo, NULL, 0, NULL, 0, &cbCipher, 0);
    std::vector<BYTE> cipherBytes(cbCipher);
    if (BCryptEncrypt(hAesKey, plainBytes.data(), plainBytes.size(), &authInfo, NULL, 0, cipherBytes.data(), cbCipher, &cbCipher, 0) != STATUS_SUCCESS) {
        std::cerr << "ERROR: AES encryption failed." << std::endl;
        BCryptDestroyKey(hAesKey);
        BCryptCloseAlgorithmProvider(hAesAlg, 0);
        BCryptDestroyKey(hRsaKey);
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    // RSA-OAEP encrypt AES key
    BCRYPT_OAEP_PADDING_INFO padInfo;
    padInfo.pszAlgId = BCRYPT_SHA256_ALGORITHM;
    padInfo.pbLabel = NULL;
    padInfo.cbLabel = 0;
    
    DWORD cbEncAesKey = 0;
    BCryptEncrypt(hRsaKey, aesKey.data(), aesKey.size(), &padInfo, NULL, 0, NULL, 0, &cbEncAesKey, BCRYPT_PAD_OAEP);
    std::vector<BYTE> encAesKey(cbEncAesKey);
    if (BCryptEncrypt(hRsaKey, aesKey.data(), aesKey.size(), &padInfo, NULL, 0, encAesKey.data(), cbEncAesKey, &cbEncAesKey, BCRYPT_PAD_OAEP) != STATUS_SUCCESS) {
        std::cerr << "ERROR: RSA encryption failed." << std::endl;
        BCryptDestroyKey(hAesKey);
        BCryptCloseAlgorithmProvider(hAesAlg, 0);
        BCryptDestroyKey(hRsaKey);
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    // Pack: [256 bytes RSA key][12 bytes IV][ciphertext][16 bytes GCM tag]
    std::vector<BYTE> packet;
    packet.insert(packet.end(), encAesKey.begin(), encAesKey.end());
    packet.insert(packet.end(), iv.begin(), iv.end());
    packet.insert(packet.end(), cipherBytes.begin(), cipherBytes.end());
    packet.insert(packet.end(), tag.begin(), tag.end());
    
    std::cout << base64_encode(packet) << std::endl;
    
    BCryptDestroyKey(hAesKey);
    BCryptCloseAlgorithmProvider(hAesAlg, 0);
    BCryptDestroyKey(hRsaKey);
    BCryptCloseAlgorithmProvider(hRsaAlg, 0);
    return true;
}

// Decrypt
bool cmd_decrypt(const std::string& priv_path, const std::string& b64_ciphertext) {
    std::string priv_b64 = read_file(priv_path);
    if (priv_b64.empty()) {
        priv_b64 = priv_path; // Fallback to raw key string if file doesn't exist
    }
    std::vector<BYTE> privBlob = base64_decode(priv_b64);
    if (privBlob.empty()) {
        std::cerr << "ERROR: Failed to load private key." << std::endl;
        return false;
    }
    
    BCRYPT_ALG_HANDLE hRsaAlg = NULL;
    BCryptOpenAlgorithmProvider(&hRsaAlg, BCRYPT_RSA_ALGORITHM, NULL, 0);
    BCRYPT_KEY_HANDLE hRsaKey = NULL;
    if (BCryptImportKeyPair(hRsaAlg, NULL, BCRYPT_RSAPRIVATE_BLOB, &hRsaKey, privBlob.data(), privBlob.size(), 0) != STATUS_SUCCESS) {
        std::cerr << "ERROR: Failed to import private key." << std::endl;
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    std::vector<BYTE> packet = base64_decode(b64_ciphertext);
    const size_t RSA_ENC_KEY_LEN = 256;
    const size_t GCM_IV_LEN = 12;
    const size_t GCM_TAG_LEN = 16;
    
    if (packet.size() < RSA_ENC_KEY_LEN + GCM_IV_LEN + GCM_TAG_LEN) {
        std::cerr << "ERROR: Ciphertext packet is too short." << std::endl;
        BCryptDestroyKey(hRsaKey);
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    // Unpack
    std::vector<BYTE> encAesKey(packet.begin(), packet.begin() + RSA_ENC_KEY_LEN);
    std::vector<BYTE> iv(packet.begin() + RSA_ENC_KEY_LEN, packet.begin() + RSA_ENC_KEY_LEN + GCM_IV_LEN);
    std::vector<BYTE> cipherBytes(packet.begin() + RSA_ENC_KEY_LEN + GCM_IV_LEN, packet.end() - GCM_TAG_LEN);
    std::vector<BYTE> tag(packet.end() - GCM_TAG_LEN, packet.end());
    
    // RSA-OAEP decrypt AES key
    BCRYPT_OAEP_PADDING_INFO padInfo;
    padInfo.pszAlgId = BCRYPT_SHA256_ALGORITHM;
    padInfo.pbLabel = NULL;
    padInfo.cbLabel = 0;
    
    DWORD cbAesKey = 0;
    BCryptDecrypt(hRsaKey, encAesKey.data(), encAesKey.size(), &padInfo, NULL, 0, NULL, 0, &cbAesKey, BCRYPT_PAD_OAEP);
    std::vector<BYTE> aesKey(cbAesKey);
    if (BCryptDecrypt(hRsaKey, encAesKey.data(), encAesKey.size(), &padInfo, NULL, 0, aesKey.data(), cbAesKey, &cbAesKey, BCRYPT_PAD_OAEP) != STATUS_SUCCESS) {
        std::cerr << "ERROR: RSA decryption failed." << std::endl;
        BCryptDestroyKey(hRsaKey);
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    // AES-GCM Decrypt
    BCRYPT_ALG_HANDLE hAesAlg = NULL;
    BCryptOpenAlgorithmProvider(&hAesAlg, BCRYPT_AES_ALGORITHM, NULL, 0);
    BCryptSetProperty(hAesAlg, BCRYPT_CHAINING_MODE, (PUCHAR)BCRYPT_CHAIN_MODE_GCM, sizeof(BCRYPT_CHAIN_MODE_GCM), 0);
    
    BCRYPT_KEY_HANDLE hAesKey = NULL;
    BCryptGenerateSymmetricKey(hAesAlg, &hAesKey, NULL, 0, aesKey.data(), aesKey.size(), 0);
    
    BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO authInfo;
    BCRYPT_INIT_AUTH_MODE_INFO(authInfo);
    authInfo.pbNonce = iv.data();
    authInfo.cbNonce = iv.size();
    authInfo.pbTag = tag.data();
    authInfo.cbTag = tag.size();
    
    DWORD cbPlain = 0;
    BCryptDecrypt(hAesKey, cipherBytes.data(), cipherBytes.size(), &authInfo, NULL, 0, NULL, 0, &cbPlain, 0);
    std::vector<BYTE> plainBytes(cbPlain);
    if (BCryptDecrypt(hAesKey, cipherBytes.data(), cipherBytes.size(), &authInfo, NULL, 0, plainBytes.data(), cbPlain, &cbPlain, 0) != STATUS_SUCCESS) {
        std::cerr << "ERROR: AES decryption / tag verification failed." << std::endl;
        BCryptDestroyKey(hAesKey);
        BCryptCloseAlgorithmProvider(hAesAlg, 0);
        BCryptDestroyKey(hRsaKey);
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    std::string plaintext(plainBytes.begin(), plainBytes.end());
    std::cout << plaintext << std::endl;
    
    BCryptDestroyKey(hAesKey);
    BCryptCloseAlgorithmProvider(hAesAlg, 0);
    BCryptDestroyKey(hRsaKey);
    BCryptCloseAlgorithmProvider(hRsaAlg, 0);
    return true;
}

// Hashing
bool cmd_hash(const std::string& b64_ciphertext) {
    std::vector<BYTE> data = base64_decode(b64_ciphertext);
    if (data.empty()) {
        std::cerr << "ERROR: Empty data for hash." << std::endl;
        return false;
    }
    std::cout << sha256_hash_hex(data) << std::endl;
    return true;
}

// Sign Data
bool cmd_sign(const std::string& priv_path, const std::string& plaintext) {
    std::string priv_b64 = read_file(priv_path);
    if (priv_b64.empty()) {
        priv_b64 = priv_path; // Fallback to raw key string if file doesn't exist
    }
    std::vector<BYTE> privBlob = base64_decode(priv_b64);
    if (privBlob.empty()) {
        std::cerr << "ERROR: Failed to load private key." << std::endl;
        return false;
    }
    
    BCRYPT_ALG_HANDLE hRsaAlg = NULL;
    BCryptOpenAlgorithmProvider(&hRsaAlg, BCRYPT_RSA_ALGORITHM, NULL, 0);
    BCRYPT_KEY_HANDLE hRsaKey = NULL;
    if (BCryptImportKeyPair(hRsaAlg, NULL, BCRYPT_RSAPRIVATE_BLOB, &hRsaKey, privBlob.data(), privBlob.size(), 0) != STATUS_SUCCESS) {
        std::cerr << "ERROR: Failed to import private key." << std::endl;
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    // Hash the data first
    std::vector<BYTE> dataBytes(plaintext.begin(), plaintext.end());
    std::vector<BYTE> hash = sha256_hash_raw(dataBytes);
    
    // Sign the hash
    BCRYPT_PKCS1_PADDING_INFO padInfo;
    padInfo.pszAlgId = BCRYPT_SHA256_ALGORITHM;
    
    DWORD cbSig = 0;
    BCryptSignHash(hRsaKey, &padInfo, hash.data(), hash.size(), NULL, 0, &cbSig, BCRYPT_PAD_PKCS1);
    std::vector<BYTE> sig(cbSig);
    if (BCryptSignHash(hRsaKey, &padInfo, hash.data(), hash.size(), sig.data(), cbSig, &cbSig, BCRYPT_PAD_PKCS1) != STATUS_SUCCESS) {
        std::cerr << "ERROR: Signing failed." << std::endl;
        BCryptDestroyKey(hRsaKey);
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    std::cout << base64_encode(sig) << std::endl;
    
    BCryptDestroyKey(hRsaKey);
    BCryptCloseAlgorithmProvider(hRsaAlg, 0);
    return true;
}

// Verify Signature
bool cmd_verify(const std::string& pub_path, const std::string& plaintext, const std::string& b64_sig) {
    std::string pub_b64 = read_file(pub_path);
    if (pub_b64.empty()) {
        pub_b64 = pub_path; // Fallback to raw key string if file doesn't exist
    }
    std::vector<BYTE> pubBlob = base64_decode(pub_b64);
    if (pubBlob.empty()) {
        std::cerr << "ERROR: Failed to load public key." << std::endl;
        return false;
    }
    
    BCRYPT_ALG_HANDLE hRsaAlg = NULL;
    BCryptOpenAlgorithmProvider(&hRsaAlg, BCRYPT_RSA_ALGORITHM, NULL, 0);
    BCRYPT_KEY_HANDLE hRsaKey = NULL;
    if (BCryptImportKeyPair(hRsaAlg, NULL, BCRYPT_RSAPUBLIC_BLOB, &hRsaKey, pubBlob.data(), pubBlob.size(), 0) != STATUS_SUCCESS) {
        std::cerr << "ERROR: Failed to import public key." << std::endl;
        BCryptCloseAlgorithmProvider(hRsaAlg, 0);
        return false;
    }
    
    std::vector<BYTE> dataBytes(plaintext.begin(), plaintext.end());
    std::vector<BYTE> hash = sha256_hash_raw(dataBytes);
    
    std::vector<BYTE> sig = base64_decode(b64_sig);
    
    BCRYPT_PKCS1_PADDING_INFO padInfo;
    padInfo.pszAlgId = BCRYPT_SHA256_ALGORITHM;
    
    NTSTATUS status = BCryptVerifySignature(hRsaKey, &padInfo, hash.data(), hash.size(), sig.data(), sig.size(), BCRYPT_PAD_PKCS1);
    
    BCryptDestroyKey(hRsaKey);
    BCryptCloseAlgorithmProvider(hRsaAlg, 0);
    
    if (status == STATUS_SUCCESS) {
        std::cout << "VALID" << std::endl;
        return true;
    } else {
        std::cout << "INVALID" << std::endl;
        return false;
    }
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: crypto_tool <command> [args]" << std::endl;
        std::cerr << "Commands:" << std::endl;
        std::cerr << "  genkeys <pub_file> <priv_file>" << std::endl;
        std::cerr << "  encrypt <pub_file> <plaintext | ->" << std::endl;
        std::cerr << "  decrypt <priv_file> <ciphertext_base64 | ->" << std::endl;
        std::cerr << "  hash <ciphertext_base64 | ->" << std::endl;
        std::cerr << "  sign <priv_file> <data | ->" << std::endl;
        std::cerr << "  verify <pub_file> <data | -> <signature_base64>" << std::endl;
        return 1;
    }
    
    std::string cmd = argv[1];
    
    if (cmd == "genkeys") {
        if (argc < 4) {
            std::cerr << "Usage: crypto_tool genkeys <pub_file> <priv_file>" << std::endl;
            return 1;
        }
        return cmd_genkeys(argv[2], argv[3]) ? 0 : 1;
    } 
    else if (cmd == "encrypt") {
        if (argc < 4) {
            std::cerr << "Usage: crypto_tool encrypt <pub_file> <plaintext | ->" << std::endl;
            return 1;
        }
        std::string plaintext = read_input(argv[3]);
        return cmd_encrypt(argv[2], plaintext) ? 0 : 1;
    } 
    else if (cmd == "decrypt") {
        if (argc < 4) {
            std::cerr << "Usage: crypto_tool decrypt <priv_file> <ciphertext_base64 | ->" << std::endl;
            return 1;
        }
        std::string ciphertext = read_input(argv[3]);
        while (!ciphertext.empty() && (ciphertext.back() == '\n' || ciphertext.back() == '\r' || ciphertext.back() == ' ')) {
            ciphertext.pop_back();
        }
        return cmd_decrypt(argv[2], ciphertext) ? 0 : 1;
    } 
    else if (cmd == "hash") {
        if (argc < 3) {
            std::cerr << "Usage: crypto_tool hash <ciphertext_base64 | ->" << std::endl;
            return 1;
        }
        std::string ciphertext = read_input(argv[2]);
        while (!ciphertext.empty() && (ciphertext.back() == '\n' || ciphertext.back() == '\r' || ciphertext.back() == ' ')) {
            ciphertext.pop_back();
        }
        return cmd_hash(ciphertext) ? 0 : 1;
    } 
    else if (cmd == "sign") {
        if (argc < 4) {
            std::cerr << "Usage: crypto_tool sign <priv_file> <data | ->" << std::endl;
            return 1;
        }
        std::string data = read_input(argv[3]);
        return cmd_sign(argv[2], data) ? 0 : 1;
    } 
    else if (cmd == "verify") {
        if (argc < 5) {
            std::cerr << "Usage: crypto_tool verify <pub_file> <data | -> <signature_base64>" << std::endl;
            return 1;
        }
        std::string data = read_input(argv[3]);
        std::string sig = argv[4];
        return cmd_verify(argv[2], data, sig) ? 0 : 1;
    }
    else {
        std::cerr << "Unknown command: " << cmd << std::endl;
        return 1;
    }
}
