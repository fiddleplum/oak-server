import * as Crypto from 'crypto';

export class RandomString {
	/** Generates a random string of the given length. */
	static generate(length: number): string {
		return Crypto.randomBytes(Math.ceil(length / 2))
			.toString('hex') // Convert to hexadecimal format.
			.slice(0, length); // Return required number of characters.
	}
}
