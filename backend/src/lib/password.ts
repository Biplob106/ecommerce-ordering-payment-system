import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/**
 * Password hashing.
 *
 * We never store raw passwords. bcrypt applies a deliberately slow, salted hash
 * so that even if the database leaks, brute-forcing a password is expensive.
 * The cost factor (salt rounds) is configurable; higher is slower and safer.
 */
export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);

/**
 * Compares a plaintext attempt against a stored hash in constant time.
 * Returns true only if they match.
 */
export const verifyPassword = (
  plain: string,
  hash: string,
): Promise<boolean> => bcrypt.compare(plain, hash);
