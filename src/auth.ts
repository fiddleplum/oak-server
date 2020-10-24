import * as WS from 'ws';
import * as Crypto from 'crypto';
import { Data } from './data';
import { Config } from 'config';

enum UserRecord { USER, PASSWORD_HASH, SESSION, SALT }

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
			const saltLengthInHexDigits = 16;
			const salt = Crypto.randomBytes(Math.ceil(saltLengthInHexDigits / 2))
				.toString('hex') // Convert to hexadecimal format.
				.slice(0, saltLengthInHexDigits); // Return required number of characters.
			// Create the hash.
			const hash = Crypto.createHmac('sha512', salt);
			// Create the hashed password.
			const passwordHash = hash.update(password).digest('hex');
			// Set the data and return.
			return this._data.set('auth', [[user, passwordHash, '', salt]]).then(() => {
				return {
					success: true
				};
			});
		});
	}

	/** Authenticates a web socket from a username and session token. */
	async authenticate(user: string, session: string, ws: WS): Promise<{ success: boolean, error?: string }> {
		return this._data.get('auth', user).then((dataRecord) => {
			// If it is a valid session,
			if (dataRecord !== undefined && session === dataRecord[UserRecord.SESSION]) {
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

	private _data: Data;
	private _authenticatedSessions: Set<WS> = new Set();
	private _unauthenticatedSessions: Set<WS> = new Set();
}
