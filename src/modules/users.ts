import * as WS from 'ws';
import * as Crypto from 'crypto';
import { JSONObject, JSONType } from 'pine-lib';
import { Module } from './module';

/*
When a WS connection is opened, it exists only in a single browser tab and browser session.
This means that authentication is only required when the page is opened.
*/

interface UserData extends JSONObject {
	passwordHash: string,
	salt: string,
	session: string,
	groups: string[]
}

/** A class for handling everything about users. */
export class Users extends Module {
	/** Processes a command. */
	process(command: string, params: JSONObject, ws: WS): Promise<JSONType | void> {
		if (command === 'createUser') {
			return this.createUser(params, ws);
		}
		else if (command === 'login') {
			return this.login(params, ws);
		}
		else if (command === 'authenticate') {
			return this.authenticate(params, ws);
		}
		else {
			throw new Error(`Invalid ${this.constructor.name} command "${command}".`);
		}
	}

	/** Removes the web socket form all session types. */
	disconnect(ws: WS): void {
		this._authenticatedSessions.delete(ws);
	}

	/** Gets the user, if authenticated from the web socket. */
	getUser(ws: WS): string | undefined {
		return this._authenticatedSessions.get(ws);
	}

	/** Gets the groups that a user is part of. */
	async getGroups(user: string | undefined): Promise<string[]> {
		if (user === undefined) {
			return [];
		}
		const userData = await this.server.data.get(`users/${user}`) as (UserData | undefined);
		if (userData === undefined) {
			return [];
		}
		return userData.groups;
	}

	/** Create a user. */
	async createUser(params: JSONObject, ws: WS): Promise<void> {
		if (!(await this.getGroups(this.getUser(ws))).includes('admins')) {
			throw new Error('You have insufficient permissions to create a user.');
		}
		// Get and validate the user.
		const user = params.user;
		if (typeof user !== 'string') {
			throw new Error(`params.user is not a string.`);
		}
		// Get and validate the password.
		const password = params.password;
		if (typeof password !== 'string') {
			throw new Error(`params.password is not a string.`);
		}
		if (password.length < 8) {
			throw new Error(`The password must be at least 8 characters.`);
		}
		// Get the data record.
		const existingUserData = await this.server.data.get(`users/${user}`);
		if (existingUserData !== undefined) {
			throw new Error(`The user "${user}" already exists.`);
		}
		// Create the salt.
		const salt = this._randomDigits(16);
		// Create the hash.
		const hash = Crypto.createHmac('sha512', salt);
		// Create the hashed password.
		const passwordHash = hash.update(password).digest('hex');
		// Set the user data.
		await this.server.data.set(`users/${user}`, {
			passwordHash: passwordHash,
			salt: salt,
			session: '',
			groups: ['users'] });
	}

	/** User login. */
	async login(params: JSONObject, ws: WS): Promise<string> {
		// Get and validate the user.
		const user = params.user;
		if (typeof user !== 'string') {
			throw new Error(`params.user is not a string`);
		}
		// Get and validate the password.
		const password = params.password;
		if (typeof password !== 'string') {
			throw new Error(`params.password is not a string`);
		}
		// Get the data record.
		const data = await this.server.data.get(`users/${user}`) as UserData | undefined;
		if (data === undefined) {
			throw new Error(`Invalid username or password.`);
		}
		// Create the hash.
		const hash = Crypto.createHmac('sha512', data.salt);
		// Compute the hashed given password.
		const passwordHash = hash.update(password).digest('hex');
		console.log(password + ' ' + passwordHash + ' ' + data.passwordHash);
		if (passwordHash !== data.passwordHash && (password !== '' || data.passwordHash !== '')) {
			throw new Error(`Invalid username or password.`);
		}
		// Create the session id.
		const session = this._randomDigits(16);
		data.session = session;
		await this.server.data.set(`users/${user}`, data);
		// Add it to the sessions arrays.
		this._authenticatedSessions.set(ws, user);
		// Return the session id.
		return session;
	}

	/** Authenticates a web socket from a username and session token. */
	async authenticate(params: JSONObject, ws: WS): Promise<boolean> {
		// Get and validate the user.
		const user = params.user;
		if (typeof user !== 'string') {
			throw new Error(`params.user is not a string.`);
		}
		// Get and validate the session.
		const session = params.session;
		if (typeof session !== 'string') {
			throw new Error(`params.session is not a string.`);
		}
		// Get the data record.
		const userData = await this.server.data.get(`users/${user}`) as UserData | undefined;
		if (userData === undefined) {
			return false;
		}
		// If it is a valid session,
		if (session !== userData.session) {
			// They didn't match, so remove it to the unauthenticated sessions.
			this._authenticatedSessions.delete(ws);
			return false;
		}
		this._authenticatedSessions.set(ws, user);
		return true;
	}

	// /** Returns the user if the web socket has been authenticated, or undefined if the web socket
	//  *  is not authenticated. */
	// getAuthenticatedUser(ws: WS): string | undefined {
	// 	return this._authenticatedSessions.get(ws);
	// }

	// /** Adds the auth table to the config so that the Data class is happy when using the table. */
	// static setAuthTable(config: Config): void {
	// 	if (config.tables.auth !== undefined) {
	// 		throw new Error('Cannot define table "auth" in the configuration.');
	// 	}
	// 	config.tables.auth = {
	// 		'indexOfId': 0,
	// 		'fields': [{
	// 			'name': 'user',
	// 			'type': 'string'
	// 		}, {
	// 			'name': 'passwordHash',
	// 			'type': 'string'
	// 		}, {
	// 			'name': 'session',
	// 			'type': 'string'
	// 		}, {
	// 			'name': 'salt',
	// 			'type': 'string'
	// 		}]
	// 	};
	// }

	/** Creates some cryptographically secure random digits of the given length. */
	private _randomDigits(length: number): string {
		return Crypto.randomBytes(Math.ceil(length / 2))
			.toString('hex') // Convert to hexadecimal format.
			.slice(0, length); // Return required number of characters.
	}

	/** The list of websocket connections and their respective users that have been authenticated. */
	private _authenticatedSessions: Map<WS, string> = new Map();
}
