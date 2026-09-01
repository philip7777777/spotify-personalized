import { authenticator } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const ISSUER = "Spotify Personalized";
const RECOVERY_CODE_COUNT = 10;

/**
 * Generates a new base32 TOTP secret for a user.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Builds the otpauth:// URI and renders it as a QR code data URL, ready
 * to be shown to the user for scanning with an authenticator app.
 */
export async function generateQrCodeDataUrl(
  username: string,
  secret: string,
): Promise<string> {
  const otpauthUri = authenticator.keyuri(username, ISSUER, secret);
  return QRCode.toDataURL(otpauthUri);
}

/**
 * Verifies a 6-digit TOTP code against the given secret.
 */
export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Generates a batch of human-friendly single-use recovery codes
 * (e.g. "a1b2c-d3e4f"). Returns the plaintext codes — callers are
 * responsible for hashing them before storage and must show the
 * plaintext to the user exactly once.
 */
export function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT,
): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/**
 * Hashes a recovery code for storage (same approach as passwords).
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeRecoveryCode(code), 10);
}

/**
 * Compares a user-entered recovery code against a stored hash.
 */
export async function compareRecoveryCode(
  code: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(normalizeRecoveryCode(code), hash);
}

function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase();
}
