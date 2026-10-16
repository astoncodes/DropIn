import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(secret) {
  let bits = '';
  for (const character of secret.replace(/[\s=]/g, '').toUpperCase()) {
    const value = BASE32.indexOf(character);
    if (value < 0) throw new Error('An authenticator setup key is base32.');
    bits += value.toString(2).padStart(5, '0');
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
}

/**
 * The six-digit code an authenticator app shows for a setup key at a moment:
 * RFC 6238 with SHA-1 and 30-second steps, the settings Supabase Auth issues.
 */
export function authenticatorCode(secret, now = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Takes a signed-in admin without an authenticator through the admin website's
 * setup step the way a person does: reveal the setup key, type the current
 * code, verify. The website then holds a second-factor (AAL2) session.
 */
export async function setUpAdminAuthenticator(page) {
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  await page.getByText('Enter setup key manually', { exact: true }).click();
  const secret = await page.locator('details code').textContent();
  await page.getByLabel('Six-digit code').fill(authenticatorCode(secret));
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
}
