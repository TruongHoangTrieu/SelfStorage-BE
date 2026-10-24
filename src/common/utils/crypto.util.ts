import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const SECRET_SEED = process.env.CCCD_ENCRYPTION_KEY || 'selfstorage-vietnam-secure-cccd-key-2026';
const ENCRYPTION_KEY = crypto.scryptSync(SECRET_SEED, 'selfstorage_salt', 32);
const IV_LENGTH = 16;

/**
 * Mã hóa AES-256 số định danh / CCCD trước khi lưu vào Database
 */
export function encryptCccd(plainText?: string | null): string | null {
  if (!plainText) return null;
  const trimmed = plainText.trim();
  if (!trimmed) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(trimmed, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return trimmed;
  }
}

/**
 * Giải mã AES-256 số định danh / CCCD khi cần hiển thị cho nhân viên có thẩm quyền
 */
export function decryptCccd(cipherText?: string | null): string {
  if (!cipherText) return '';
  if (!cipherText.includes(':')) return cipherText;
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
export function maskCccd(rawOrCipher?: string | null): string {
  if (!rawOrCipher) return '';
  const plain = rawOrCipher.includes(':') ? decryptCccd(rawOrCipher) : rawOrCipher;
  const clean = plain.replace(/\s+/g, '');
  if (clean.length <= 4) return clean;
  if (clean.length < 8) return `${clean.slice(0, 2)}****${clean.slice(-2)}`;
  return `${clean.slice(0, 3)}******${clean.slice(-3)}`;
}

/**
 * Băm HMAC-SHA256 để tìm kiếm chính xác mà không cần giải mã toàn bộ dữ liệu
 */
export function hashCccd(plainText?: string | null): string | null {
  if (!plainText) return null;
  const trimmed = plainText.trim();
  if (!trimmed) return null;
  return crypto.createHmac('sha256', SECRET_SEED).update(trimmed).digest('hex');
}
