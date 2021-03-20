import * as WS from 'ws';
import * as Crypto from 'crypto';
import { Data } from './data';
import { Config } from 'config';
import { JSONObject } from 'pine-lib';

enum AuthRecord { USER, PASSWORD_HASH, SALT, SESSION }

/*
When a WS connection is opened, it exists only in a single browser tab and browser session.
This means that authentication is only required when the page is opened.
*/

/** A class for authorizing new websocket connections as valid users. */
export class Auth {
	/** Constructs the class. */
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
	async createUser(data: JSONObject): Promise<void> {
		// Get and validate the user.
		const user = data.user;
		if (typeof user !== 'string') {
			throw new Error(`data.user is not a string`);
		}
		// Get and validate the password.
		const password = data.password;
		if (typeof password !== 'string') {
			throw new Error(`data.password is not a string`);
		}
		// Get the data record.
		const existingDataRecord = await this._data.get({ table: 'auth', id: user });
		if (existingDataRecord !== undefined) {
			throw new Error(`The user "${user}" already exists.`);
		}
		// Create the salt.
		const salt = this._randomDigits(16);
		// Create the hash.
		const hash = Crypto.createHmac('sha512', salt);
		// Create the hashed password.
		const passwordHash = hash.update(password).digest('hex');
		// Create the data record.
		const dataRecord = [user, passwordHash, salt, ''];
		// Set the data and return.
		await this._data.set({ table: 'auth', dataRecords: [dataRecord] });
	}

	/** User login. */
	async login(data: JSONObject, ws: WS): Promise<string> {
		// Get and validate the user.
		const user = data.user;
		if (typeof user !== 'string') {
			throw new Error(`data.user is not a string`);
		}
		// Get and validate the password.
		const password = data.password;
		if (typeof password !== 'string') {
			throw new Error(`data.password is not a string`);
		}
		// Get the data record.
		const dataRecord = await this._data.get({ table: 'auth', id: user });
		if (dataRecord === undefined) {
			throw new Error(`Invalid username or password.`);
		}
		// Get the salt.
		const salt = dataRecord[AuthRecord.SALT] as string;
		// Create the hash.
		const hash = Crypto.createHmac('sha512', salt);
		// Create the hashed password.
		const passwordHash = hash.update(password).digest('hex');
		if (passwordHash !== dataRecord[AuthRecord.PASSWORD_HASH]) {
			throw new Error(`Invalid username or password.`);
		}
		// Create the session id.
		const session = this._randomDigits(16);
		dataRecord[AuthRecord.SESSION] = session;
		await this._data.set({ table: 'auth', dataRecords: [dataRecord] });
		// Add it to the sessions arrays.
		this._unauthenticatedSessions.delete(ws);
		this._authenticatedSessions.add(ws);
		// Return the session id.
		return session;
	}

	/** Authenticates a web socket from a username and session token. */
	async authenticate(data: JSONObject, ws: WS): Promise<boolean> {
		// Get and validate the user.
		const user = data.user;
		if (typeof user !== 'string') {
			throw new Error(`data.user is not a string`);
		}
		// Get and validate the session.
		const session = data.session;
		if (typeof session !== 'string') {
			throw new Error(`data.session is not a string`);
		}
		// Get the data record.
		const dataRecord = await this._data.get({ table: 'auth', id: user });
		if (dataRecord === undefined) {
			return false;
		}
		// If it is a valid session,
		if (session !== dataRecord[AuthRecord.SESSION]) {
			// They didn't match, so remove it to the unauthenticated sessions.
			this._authenticatedSessions.delete(ws);
			this._unauthenticatedSessions.add(ws);
			return false;
		}
		this._unauthenticatedSessions.delete(ws);
		this._authenticatedSessions.add(ws);
		return true;
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

	/** Creates some cryptographically secure random digits of the given length. */
	private _randomDigits(length: number): string {
		return Crypto.randomBytes(Math.ceil(length / 2))
			.toString('hex') // Convert to hexadecimal format.
			.slice(0, length); // Return required number of characters.
	}

	/** A reference to the data class. */
	private _data: Data;

	/** The list of websocket connections that have been authenticated. */
	private _authenticatedSessions: Set<WS> = new Set();

	/** The list of websocket connections that have not yet been authenticated. */
	private _unauthenticatedSessions: Set<WS> = new Set();
}
