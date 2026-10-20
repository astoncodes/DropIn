import assert from 'node:assert/strict';
import { authenticatorCode } from '../admin-mfa.mjs';

// RFC 6238 appendix B. The SHA-1 key "12345678901234567890" in base32, with the
// last six digits of each eight-digit reference code.
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
for (const [seconds, code] of [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
]) {
  assert.equal(authenticatorCode(SECRET, seconds * 1000), code, `the code at ${seconds} s`);
}

// Setup keys are sometimes shown in lower case or padded; the code is the same.
assert.equal(authenticatorCode(`${SECRET.toLowerCase()}====`, 59_000), '287082');
assert.throws(() => authenticatorCode('not a setup key!', 0), /base32/);

console.log('PASS: authenticator codes match the RFC 6238 reference values.');
