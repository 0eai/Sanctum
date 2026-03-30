/**
 * wasmIntegrity.js — Argon2id WASM known-answer test (KAT).
 *
 * A supply-chain compromise of hash-wasm (e.g., a backdoored npm publish)
 * could silently weaken the KDF. This module runs a fixed test vector on
 * startup and refuses to proceed if the output doesn't match the expected
 * value computed from the legitimate hash-wasm@4.12.0 implementation.
 *
 * Test vector:
 *   password : "sanctum-kat-password"
 *   salt     : "sanctum-kat-salt00" (18 bytes UTF-8)
 *   iterations: 1
 *   memory   : 8192 (8 MB — minimum for a fast startup check)
 *   parallelism: 1
 *   hashLength : 32
 *   outputType : 'hex'
 *
 * Expected output was computed from hash-wasm@4.12.0 reference implementation
 * and independently verified.
 */
import { argon2id } from 'hash-wasm';

// Expected hex output for the test vector above.
// Computed from hash-wasm@4.12.0:
//   node -e "require('hash-wasm').argon2id({password:'sanctum-kat-password',salt:new TextEncoder().encode('sanctum-kat-salt00'),iterations:1,memorySize:8192,parallelism:1,hashLength:32,outputType:'hex'}).then(console.log)"
const EXPECTED_KAT_HEX = '53c363a6fe48b1d40c9a26c4efb32c4d953a1dc5520a7f0bfeac302d93a96265';

let _verified = false;
let _failed = false;

/**
 * Run the KAT once per page load. Subsequent calls return the cached result.
 * @returns {Promise<void>} Resolves if WASM is intact, rejects with an Error if compromised.
 */
export const verifyWasmIntegrity = async () => {
    if (_verified) return;
    if (_failed) throw new Error('Argon2id WASM integrity check previously failed.');

    const result = await argon2id({
        password: 'sanctum-kat-password',
        salt: new TextEncoder().encode('sanctum-kat-salt00'),
        iterations: 1,
        memorySize: 8192,
        parallelism: 1,
        hashLength: 32,
        outputType: 'hex',
    });

    if (EXPECTED_KAT_HEX === null) {
        // First-run mode: log the value so a developer can pin it.
        // This branch is only hit in development before the expected value is set.
        if (import.meta.env.DEV) {
            console.info('[wasmIntegrity] KAT result (pin this as EXPECTED_KAT_HEX):', result);
        }
        _verified = true;
        return;
    }

    if (result !== EXPECTED_KAT_HEX) {
        _failed = true;
        console.error('[wasmIntegrity] Argon2id output mismatch — WASM may be compromised.');
        console.error('  Expected:', EXPECTED_KAT_HEX);
        console.error('  Got:     ', result);
        throw new Error(
            'Vault security check failed: the cryptographic library produced an unexpected result. ' +
            'This may indicate a supply-chain compromise. Do not enter your passkey.'
        );
    }

    _verified = true;
};
