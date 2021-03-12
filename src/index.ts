import * as fs from 'fs';
import * as WS from 'ws';
import * as https from 'https';
import { JSONType } from 'elm-app';
import { Config } from './config';
import { Data, DataRecord } from './data';
import { Auth } from './auth';

export class Server {
	constructor() {
		// Get the command-line parameters.
		const args: string[] = process.argv.slice(2);
		if (args.length < 2) {
			throw new Error('Usage: node . <config file path> <data folder path>.');
		}
		const configFilePath = args[0];
		const dataFolderPath = args[1];

		console.log('Starting up...');
		console.log();

		// Get the config.
		const configFileData = fs.readFileSync(configFilePath);
		const config: Config = JSON.parse(configFileData.toString('utf-8'));

		// Print the config.
		console.log('The configuration is:');
		console.log(JSON.stringify(config));
		console.log();

		// Setup the auth table for use with authorizations.
		if (config.tables.auth !== undefined) {
			throw new Error('Cannot define table "auth" in the configuration.');
		}
		Auth.setAuthTable(config);

		// Startup the data object.
		this._data = new Data(config, dataFolderPath);

		// Setup authentication.
		this._auth = new Auth(this._data);

		// Start the HTTPS and WebSocket servers.
		const key  = fs.readFileSync('key.pem', 'utf8');
		const cert = fs.readFileSync('cert.pem', 'utf8');
		const server = https.createServer({ key, cert });
		const webSocketServer = new WS.Server({ server });

		// Setup the WebSocket connection and message callbacks.
		webSocketServer.on('connection', (ws: WS) => {
			console.log('Accepted a new connection.');
			console.log();
			this._auth.connect(ws);
			ws.on('message', (message: WS.Data) => {
				this._processMessage(ws, message.toString());
			});
			ws.on('close', () => {
				console.log('Closed a connection.');
				console.log();
				this._auth.disconnect(ws);
			});
			ws.on('error', () => {
				console.log('Error in connection.');
			});
		});

		// Start the HTTPS server listening.
		server.listen(8081);
		console.log(`The server has started on port 8081.`);
		console.log();
	}

	/** Process a message from the client. */
	private async _processMessage(ws: WS, message: string): Promise<void> {
		try {
			// Get the request as the message string in JSON.
			let request: JSONType;
			try {
				request = JSON.parse(message);
			}
			catch (error) {
				throw new Error('Request must be valid JSON. ' + error);
			}
			if (typeof request !== 'object' || request === null || Array.isArray(request)) {
				throw new Error('Request must be an object.');
			}

			// Get the id of the request.
			const id = request.id;
			if (typeof id !== 'number') {
				throw new Error('Request.id must be a number.');
			}

			// Get the data of the request.
			const data = request.data;
			if (typeof data !== 'object' || data === null || Array.isArray(data)) {
				throw new Error('Request.data must be an object.');
			}

			// Get the command of the request data.
			const command = data.command;
			if (typeof command !== 'string') {
				throw new Error('Request.data.command must be a string.');
			}

			if (command === 'list') {
				if (data === undefined) {
					throw new Error('Get command has no data.');
				}
				const table = data.table;
				if (typeof table !== 'string') {
					throw new Error('Set command data.table must be a string.');
				}
			}
			else if (command === 'get') {
				if (data === undefined) {
					throw new Error('Get command has no data.');
				}
				const table = data.table;
				if (typeof table !== 'string') {
					throw new Error('Set command data.table must be a string.');
				}
				const record = data.record;
				if (typeof record !== 'string') {
					throw new Error('Set command data.record must be a string.');
				}
				this._data.get(table, record).then((DataRecord: DataRecord | undefined) => {
					if (DataRecord === undefined) {
						this.sendResponse({
							success: false,
							error: 'data record not found.'
						}, id, ws);
					}
					else {
						this.sendResponse({
							success: true,
							data: DataRecord
						}, id, ws);
					}
				});
			}
			else if (command === 'set') {
				if (data === undefined) {
					throw new Error('Set command has no data.');
				}
				const table = data.table;
				if (typeof table !== 'string') {
					throw new Error('Set command data.table must be a string.');
				}
				const records = data.records;
				if (!Array.isArray(records)) {
					throw new Error('Set command data.records must be an array.');
				}
				this._data.set(table, records as DataRecord[]).then(() => {
					this.sendResponse({
						success: true
					}, id, ws);
				}).catch((error: Error) => {
					this.sendResponse({
						success: false,
						error: error.message
					}, id, ws);
				});
			}
			else if (command === 'delete') {
				// data.delete();
				// success = true;
			}
			else if (command === 'has') {
				// data.has();
				// success = true;
			}
			else if (command === 'size') {
				// data.size();
				// success = true;
			}
			else if (command === 'create user') {
				if (data === undefined) {
					throw new Error('Create user command has no data.');
				}
				const user = data.user;
				const password = data.password;
				if (typeof user !== 'string') {
					throw new Error('Create user command data.user must be a string.');
				}
				if (typeof password !== 'string') {
					throw new Error('Create user command data.password must be a string.');
				}
				this._auth.createUser(user, password).then((result) => {
					if (result.success) {
						this.sendResponse({
							success: true
						}, id, ws);
					}
					else {
						this.sendResponse({
							success: false,
							error: 'Could not create user: ' + result.error
						}, id, ws);
					}
				});
			}
			else if (command === 'login') {
				if (data === undefined) {
					throw new Error('Create user command has no data.');
				}
				const user = data.user;
				const password = data.password;
				if (typeof user !== 'string') {
					throw new Error('Create user command data.user must be a string.');
				}
				if (typeof password !== 'string') {
					throw new Error('Create user command data.password must be a string.');
				}
				this._auth.login(user, password, ws).then((result) => {
					if (result.success) {
						this.sendResponse({
							success: true,
							session: result.session
						}, id, ws);
					}
					else {
						this.sendResponse({
							success: false,
							error: 'Could not login: ' + result.error
						}, id, ws);
					}
				});
			}
			else if (command === 'authenticate') {
				if (data === undefined) {
					throw new Error('Create user command has no data.');
				}
				const user = data.user;
				const session = data.session;
				if (typeof user !== 'string') {
					throw new Error('Create user command data.user must be a string.');
				}
				if (typeof session !== 'string') {
					throw new Error('Create user command data.session must be a string.');
				}
				this._auth.authenticate(user, session, ws).then((result) => {
					if (result.success) {
						this.sendResponse({
							success: true
						}, id, ws);
					}
					else {
						this.sendResponse({
							success: false,
							error: 'Please login again.'
						}, id, ws);
					}
				});
			}
			else {
				throw new Error('Invalid command "' + command + '".');
			}
		}
		catch (error) {
			console.log('Error while receiving websocket message.');
			console.log('  Message: ' + message);
			console.log('  Error: ' + error);
			console.log();
		}
	}

	/** Send a response. */
	sendResponse(data: ResponseData, id: number, ws: WS): void {
		ws.send(JSON.stringify({
			id,
			data
		}));
	}

	private _data: Data;
	private _auth: Auth;
}

interface ResponseData {
	success: boolean;
	error?: string;
	data?: JSONType;
	[x: string]: any;
}

try {
	new Server();
}
catch (error) {
	console.log();
	console.log('ERROR --- ' + error);
	console.log();
	throw error;
}
