import * as WS from 'ws';
import * as Crypto from 'crypto';
import { JSONObject, JSONType } from 'pine-lib';
import { Module } from './module';
import { Server } from '../index';
import { RandomString } from 'random_string';

/*
When a WS connection is opened, it exists only in a single browser tab and browser session.
This means that authentication is only required when the page is opened.
*/

/** The format of the data. */
interface UserData extends JSONObject {
	passwordHash: string,
	salt: string,
	session: string,
	groups: string[]
}

/** A class for handling everything about users. */
export class UsersModule extends Module {
	constructor(server: Server) {
		super(server);

		server.data.get('users/admin').then((value) => {
			if (value === undefined) {
				server.data.set('users/admin', {
					passwordHash: '',
					salt: '',
					session: '',
					groups: ['admins'] });
			}
		});
	}

	/** Processes a command. */
	process(command: string, params: JSONObject, ws: WS): Promise<JSONType | void> {
		if (command === 'createUserAdmin') {
			return this.createUserAdmin(params, ws);
		}
		else if (command === 'deleteUserAdmin') {
			return this.deleteUserAdmin(params, ws);
		}
		else if (command === 'changePasswordAdmin') {
			return this.changePasswordAdmin(params, ws);
		}
		else if (command === 'listUsers') {
			return this.listUsers();
		}
		else if (command === 'deleteUser') {
			return this.deleteUser(params, ws);
		}
		else if (command === 'changePassword') {
			return this.changePassword(params, ws);
		}
		else if (command === 'login') {
			return this.login(params, ws);
		}
		else if (command === 'logout') {
			return this.logout(ws);
		}
		else if (command === 'authenticate') {
			return this.authenticate(params, ws);
		}
		else if (command === 'getGroups') {
			return this.getGroups(ws);
		}
		else {
			throw new Error(`Invalid ${this.constructor.name} command "${command}".`);
		}
	}

	/** Removes the web socket form all session types. */
	disconnect(ws: WS): void {
		const user = this._authenticatedSessions.get(ws);
		if (user !== undefined) {
			this._authenticatedSessions.delete(ws);
			const userWebSockets = this._usersToWebSockets.get(user);
			if (userWebSockets !== undefined) {
				userWebSockets.delete(ws);
				if (userWebSockets.size === 0) {
					this._usersToWebSockets.delete(user);
				}
			}
		}
	}

	/** Gets the user, if authenticated from the web socket. */
	getUser(ws: WS): string | undefined {
		return this._authenticatedSessions.get(ws);
	}

	/** Gets the websockets of a user. */
	getWS(user: string): Set<WS> | undefined {
		return this._usersToWebSockets.get(user);
	}

	/** Creates a user with admin permissions. */
	async createUserAdmin(params: JSONObject, ws: WS): Promise<void> {
		// Verify that the self is admin.
		if (!(await this.getGroups(ws)).includes('admins')) {
			throw new Error(`You have insufficient permissions to create a user.`);
		}
		// Get and validate the user.
		const user = params.user;
		if (typeof user !== 'string') {
			throw new Error(`params.user is not a string.`);
		}
		if (user === '') {
			throw new Error(`The user field is empty.`);
		}
		// Get and validate the password.
		const password = params.password;
		if (typeof password !== 'string') {
			throw new Error(`params.password is not a string.`);
		}
		if (password.length < 8) {
			throw new Error(`The password must be at least 8 characters.`);
		}
		// Get the groups.
		const groups = params.groups;
		if (!Array.isArray(groups)) {
			throw new Error(`params.groups is not an array.`);
		}
		for (let i = 0, l = groups.length; i < l; i++) {
			if (typeof groups[i] !== 'string') {
				throw new Error(`params.groups[${i}] is not a string.`);
			}
		}
		// Get the data record.
		const existingUserData = await this.server.data.get(`users/${user}`);
		if (existingUserData !== undefined) {
			throw new Error(`The user "${user}" already exists.`);
		}
		// Create the salt.
		const salt = RandomString.generate(16);
		// Create the hash.
		const hash = Crypto.createHmac('sha512', salt);
		// Create the hashed password.
		const passwordHash = hash.update(password).digest('hex');
		// Set the user data.
		await this.server.data.set(`users/${user}`, {
			passwordHash: passwordHash,
			salt: salt,
			session: '',
			groups: groups });
	}

	/** Deletes a user with admin permissions. */
	async deleteUserAdmin(params: JSONObject, ws: WS): Promise<void> {
		// Verify that the self is admin.
		if (!(await this.getGroups(ws)).includes('admins')) {
			throw new Error(`You have insufficient permissions to delete a user.`);
		}
		// Get and validate the user.
		const user = params.user;
		if (typeof user !== 'string') {
			throw new Error(`params.user is not a string.`);
		}
		if (user === '') {
			throw new Error(`The user field is empty.`);
		}
		if (!await this.server.data.has(`users/${user}`)) {
			throw new Error(`The user is not found`);
		}
		// Delete the user.
		await this.server.data.delete(`users/${user}`);
	}

	/** Changes a password with admin permissions. */
	async changePasswordAdmin(params: JSONObject, ws: WS): Promise<void> {
		// Verify that the self is admin.
		if (!(await this.getGroups(ws)).includes('admins')) {
			throw new Error(`You have insufficient permissions to change the password of a user.`);
		}
		// Get and validate the user.
		const user = params.user;
		if (typeof user !== 'string') {
			throw new Error(`params.user is not a string.`);
		}
		if (user === '' || !await this.server.data.has(`users/${user}`)) {
			throw new Error(`The user is not found`);
		}
		// Get and validate the new password.
		const newPassword = params.newPassword;
		if (typeof newPassword !== 'string') {
			throw new Error(`params.newPassword is not a string`);
		}
		if (newPassword.length < 8) {
			throw new Error(`The new password must be at least 8 characters.`);
		}
		// Get the data record.
		const userData = await this.server.data.get(`users/${user}`) as UserData | undefined;
		if (userData === undefined) {
			throw new Error(`No user was found.`);
		}
		// Create the salt.
		const salt = RandomString.generate(16);
		// Create the hash.
		const hash = Crypto.createHmac('sha512', salt);
		// Create the hashed new password.
		const newPasswordHash = hash.update(newPassword).digest('hex');
		// Update the data.
		userData.salt = salt;
		userData.passwordHash = newPasswordHash;
		await this.server.data.set(`users/${user}`, userData);
	}

	/** Lists the users. */
	async listUsers(): Promise<string[]> {
		return this.server.data.list(`users`);
	}

	/** Gets the groups that a user is part of. */
	async getGroups(ws: WS): Promise<string[]> {
		const user = this.getUser(ws);
		if (user === undefined) {
			return [];
		}
		const userData = await this.server.data.get(`users/${user}`) as (UserData | undefined);
		if (userData === undefined) {
			return [];
		}
		return userData.groups;
	}

	/** Deletes a user. */
	async deleteUser(params: JSONObject, ws: WS): Promise<void> {
		// Get and validate the password.
		const password = params.password;
		if (typeof password !== 'string') {
			throw new Error(`params.password is not a string.`);
		}
		// Get and validate the user.
		const user = this.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the data record.
		const userData = await this.server.data.get(`users/${user}`) as UserData | undefined;
		if (userData === undefined) {
			throw new Error(`No user was found.`);
		}
		// Create the hash.
		const hash = Crypto.createHmac('sha512', userData.salt);
		// Compute the hashed given password.
		const passwordHash = hash.update(password).digest('hex');
		// Compare the passwords.
		if (passwordHash !== userData.passwordHash && (password !== '' || userData.passwordHash !== '')) {
			throw new Error(`Invalid password.`);
		}
		// Delete the user.
		await this.server.data.delete(`users/${user}`);
	}

	/** Changes a password. */
	async changePassword(params: JSONObject, ws: WS): Promise<void> {
		// Get and validate the old password.
		const oldPassword = params.oldPassword;
		if (typeof oldPassword !== 'string') {
			throw new Error(`params.oldPassword is not a string`);
		}
		// Get and validate the new password.
		const newPassword = params.newPassword;
		if (typeof newPassword !== 'string') {
			throw new Error(`params.newPassword is not a string`);
		}
		if (newPassword.length < 8) {
			throw new Error(`The new password must be at least 8 characters.`);
		}
		// Get and validate the user.
		const user = this.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the data record.
		const userData = await this.server.data.get(`users/${user}`) as UserData | undefined;
		if (userData === undefined) {
			throw new Error(`No user was found.`);
		}
		// Create the old hash.
		const oldHash = Crypto.createHmac('sha512', userData.salt);
		// Compute the hashed given old password.
		const oldPasswordHash = oldHash.update(oldPassword).digest('hex');
		// Compare the passwords.
		if (oldPasswordHash !== userData.passwordHash && (oldPassword !== '' || userData.passwordHash !== '')) {
			throw new Error(`Invalid old password.`);
		}
		// Create the salt.
		const salt = RandomString.generate(16);
		// Create the hash.
		const hash = Crypto.createHmac('sha512', salt);
		// Create the hashed new password.
		const newPasswordHash = hash.update(newPassword).digest('hex');
		// Update the data.
		userData.salt = salt;
		userData.passwordHash = newPasswordHash;
		await this.server.data.set(`users/${user}`, userData);
	}

	/** Logs in a user. */
	async login(params: JSONObject, ws: WS): Promise<string> {
		// Get and validate the user.
		const user = params.user;
		if (typeof user !== 'string') {
			throw new Error(`params.user is not a string`);
		}
		if (user === '') {
			throw new Error(`Invalid username or password.`);
		}
		// Get and validate the password.
		const password = params.password;
		if (typeof password !== 'string') {
			throw new Error(`params.password is not a string`);
		}
		// Get the data record.
		const userData = await this.server.data.get(`users/${user}`) as UserData | undefined;
		if (userData === undefined) {
			throw new Error(`Invalid username or password.`);
		}
		// Create the hash.
		const hash = Crypto.createHmac('sha512', userData.salt);
		// Compute the hashed given password.
		const passwordHash = hash.update(password).digest('hex');
		// Compare the passwords.
		if (passwordHash !== userData.passwordHash && (password !== '' || userData.passwordHash !== '')) {
			throw new Error(`Invalid username or password.`);
		}
		// Get the session id.
		let session = userData.session;
		// If there isn't any session id (the user wasn't logged in anywhere else),
		if (session === '') {
			// Create the session id.
			session = RandomString.generate(16);
			userData.session = session;
			await this.server.data.set(`users/${user}`, userData);
		}
		// Add it to the sessions arrays.
		this._authenticatedSessions.set(ws, user);
		const userWebSockets = this._usersToWebSockets.get(user);
		if (userWebSockets === undefined) {
			this._usersToWebSockets.set(user, new Set([ws]));
		}
		else {
			userWebSockets.add(ws);
		}
		// Return the session id.
		return session;
	}

	/** Logs the user out. */
	async logout(ws: WS): Promise<void> {
		// Get and validate the user.
		const user = this.getUser(ws);
		if (user !== undefined) {
			// Delete all references to the user in the authentication arrays.
			this._usersToWebSockets.delete(user);
			for (const authenticatedSessionEntry of this._authenticatedSessions) {
				if (authenticatedSessionEntry[1] === user) {
					const otherWS = authenticatedSessionEntry[0];
					this.server.sendMessage(otherWS, 'users', {
						command: 'logout'
					});
					this._authenticatedSessions.delete(otherWS);
				}
			}
			// If not, get the data record.
			const userData = await this.server.data.get(`users/${user}`) as UserData | undefined;
			if (userData !== undefined) {
				userData.session = '';
				await this.server.data.set(`users/${user}`, userData);
			}
		}
	}

	/** Authenticates a web socket from a username and session token. */
	async authenticate(params: JSONObject, ws: WS): Promise<void> {
		// Get and validate the session.
		const user = params.user;
		if (typeof user !== 'string') {
			throw new Error(`params.user is not a string.`);
		}
		if (user === '') {
			throw new Error(`The user is not logged in.`);
		}
		// Get and validate the session.
		const session = params.session;
		if (typeof session !== 'string') {
			throw new Error(`params.session is not a string.`);
		}
		// If not, get the data record.
		const userData = await this.server.data.get(`users/${user}`) as UserData | undefined;
		if (userData === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Check if it is a valid session.
		if (session !== userData.session) {
			// They didn't match, so remove it to the unauthenticated sessions.
			this._authenticatedSessions.delete(ws);
			const userWebSockets = this._usersToWebSockets.get(user);
			if (userWebSockets !== undefined) {
				userWebSockets.delete(ws);
				if (userWebSockets.size === 0) {
					this._usersToWebSockets.delete(user);
				}
			}
			throw new Error(`User not logged in`);
		}
		// Add it to the sessions arrays.
		this._authenticatedSessions.set(ws, user);
		const userWebSockets = this._usersToWebSockets.get(user);
		if (userWebSockets === undefined) {
			this._usersToWebSockets.set(user, new Set([ws]));
		}
		else {
			userWebSockets.add(ws);
		}
	}

	/** The list of websocket connections and their respective users that have been authenticated. */
	private _authenticatedSessions: Map<WS, string> = new Map();

	/** A reverse mapping of the authenticated sessions. */
	private _usersToWebSockets: Map<string, Set<WS>> = new Map();
}
