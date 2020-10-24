import * as WS from 'ws';
import * as Crypto from 'crypto';
import { Data } from './data';
import { Config } from 'config';

enum AuthRecord { USER, PASSWORD_HASH, SALT, SESSION }

/*
When a WS connection is opened, it exists only in a single browser tab and session.
This means that authentication is only required at the beginning.

*/

export class Auth {
	constructor(data: Data) {
		this._data = data;
	}

	/** Adds the web socket to the unauthenticated sessions to be authenticated later. */
	connect(ws: WS): void {
		this._unauthenticatedSessions.add(ws);
	}

	/** Removes the web socket form all session types. */
	disconnect(ws: WS): void {
		this._authenticatedSessions.delete(ws);
		this._unauthenticatedSessions.delete(ws);
	}

	/** Create user. */
	async createUser(user: string, password: string): Promise<{ success: boolean, error?: string }> {
		return this._data.get('auth', user).then((dataRecord) => {
			if (dataRecord !== undefined) {
				return {
					success: false,
					error: 'The user "' + user + '" already exists.'
				};
			}
			// Create the salt.
			const salt = this._randomDigits(16);
			// Create the hash.
			const hash = Crypto.createHmac('sha512', salt);
			// Create the hashed password.
			const passwordHash = hash.update(password).digest('hex');
			// Set the data and return.
			return this._data.set('auth', [[user, passwordHash, salt, '']]).then(() => {
				return {
					success: true
				};
			});
		});
	}

	/** User login. */
	async login(user: string, password: string, ws: WS): Promise<{ success: boolean, error?: string, session?: string }> {
		return this._data.get('auth', user).then((dataRecord) => {
			if (dataRecord !== undefined && dataRecord.length >= 3) {
				const salt = dataRecord[2];
				if (typeof salt === 'string') {
					// Create the hash.
					const hash = Crypto.createHmac('sha512', salt);
					// Create the hashed password.
					const passwordHash = hash.update(password).digest('hex');
					if (passwordHash === dataRecord[1]) {
						const session = this._randomDigits(16);
						dataRecord[AuthRecord.SESSION] = session;
						return this._data.set('auth', [dataRecord]).then(() => {
							this._unauthenticatedSessions.delete(ws);
							this._authenticatedSessions.add(ws);
							return {
								success: true,
								session: session
							};
						});
					}
				}
			}
			return {
				success: false,
				error: 'Invalid username or password.'
			};
		});
	}

	/** Authenticates a web socket from a username and session token. */
	async authenticate(user: string, session: string, ws: WS): Promise<{ success: boolean, error?: string }> {
		return this._data.get('auth', user).then((dataRecord) => {
			// If it is a valid session,
			if (dataRecord !== undefined && session === dataRecord[AuthRecord.SESSION]) {
				this._unauthenticatedSessions.delete(ws);
				this._authenticatedSessions.add(ws);
				return {
					success: true
				};
			}
			else {
				// They didn't match, so remove it to the unauthenticated sessions.
				this._authenticatedSessions.delete(ws);
				this._unauthenticatedSessions.add(ws);
				return {
					success: false,
					error: 'Invalid session.'
				};
			}
		});
	}

	/** Checks if the web socket has been authenticated. This is called by every get/set request. */
	isAuthenticated(ws: WS): boolean {
		return this._authenticatedSessions.has(ws);
	}

	/** Adds the auth table to the config so that the Data class is happy when using the table. */
	static setAuthTable(config: Config): void {
		config.tables.auth = {
			'indexOfId': 0,
			'fields': [{
				'name': 'user',
				'type': 'string'
			}, {
				'name': 'passwordHash',
				'type': 'string'
			}, {
				'name': 'session',
				'type': 'string'
			}, {
				'name': 'salt',
				'type': 'string'
			}]
		};
	}

	private _randomDigits(length: number): string {
		return Crypto.randomBytes(Math.ceil(length / 2))
			.toString('hex') // Convert to hexadecimal format.
			.slice(0, length); // Return required number of characters.
	}

	private _data: Data;
	private _authenticatedSessions: Set<WS> = new Set();
	private _unauthenticatedSessions: Set<WS> = new Set();
}
