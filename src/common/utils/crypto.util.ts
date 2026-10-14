import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
// Derive 32-byte key for AES-256
const SECRET_SEED = process.env.CCCD_ENCRYPTION_KEY || 'selfstorage-vietnam-secure-cccd-key-2026';
const ENCRYPTION_KEY = crypto.scryptSync(SECRET_SEED, 'selfstorage_salt', 32);
const IV_LENGTH = 16;

/**
 * Mã hóa AES-256 số CCCD trước khi lưu vào Database
 */
export function encryptCccd(plainText: string): string {
  if (!plainText) return plainText;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return plainText;
  }
}

/**
 * Giải mã AES-256 số CCCD khi trả về cho lễ tân có thẩm quyền
 */
export function decryptCccd(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return cipherText;
  try {
    const [ivHex, encrypted] = cipherText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return cipherText;
  }
}

/**
 * Che mờ số CCCD trên giao diện người dùng (chỉ giữ 3 số đầu và 3 số cuối)
 * Ví dụ: 079095012345 -> 079******345
 */
export function maskCccd(cccd: string): string {
  if (!cccd) return '';
  const clean = cccd.replace(/\s+/g, '');
  if (clean.length < 6) return clean;
  return `${clean.slice(0, 3)}******${clean.slice(-3)}`;
}
