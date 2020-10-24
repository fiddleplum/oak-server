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
			this._auth.connect(ws);
			ws.on('message', (message: WS.Data) => {
				this._processMessage(ws, message.toString());
			});
			ws.on('close', () => {
				console.log('Closed a connection.');
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
		const request = JSON.parse(message);
		if (typeof request !== 'object' || request === null || Array.isArray(request)) {
			throw new Error('Invalid request is not an object.');
		}
		if (typeof request.id !== 'number') {
			throw new Error('Invalid request with invalid or no id.');
		}
		if (request.json === undefined) {
			throw new Error('Invalid request with no JSON data.');
		}
		const json: JSONType = request.json;
		console.log(json);
		if (typeof json !== 'object' || json === null || Array.isArray(json)) {
			throw new Error('Invalid request JSON is not an object.');
		}
		if (typeof json.command !== 'string') {
			throw new Error('Invalid request JSON with invalid or no command.');
		}
		const command: string = json.command;
		try {
			if (command === 'get') {
				if (typeof json.table !== 'string' || (typeof json.id !== 'number' && typeof json.id !== 'string' && typeof json.id !== 'boolean')) {
					throw new Error('Invalid request JSON with invalid get command parameters.');
				}
				this._data.get(json.table, json.id).then((dataRecord: DataRecord | undefined) => {
					if (dataRecord === undefined) {
						ws.send(JSON.stringify({
							id: request.id,
							success: false,
							error: 'Data record not found.'
						}));
					}
					else {
						console.log(JSON.stringify(dataRecord));
						ws.send(JSON.stringify({
							id: request.id,
							success: true,
							data: dataRecord
						}));
					}
				});
			}
			else if (command === 'set') {
				if (typeof json.table !== 'string' || !Array.isArray(json.dataRecords)) {
					throw new Error('Invalid request JSON with invalid set command parameters.');
				}
				this._data.set(json.table, json.dataRecords as DataRecord[]).then(() => {
					ws.send(JSON.stringify({
						id: request.id,
						success: true
					}));
				}).catch((error: Error) => {
					ws.send(JSON.stringify({
						id: request.id,
						success: false,
						error: error.message
					}));
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
				const user = json.user;
				const password = json.password;
				if (typeof user !== 'string' || typeof password !== 'string') {
					throw new Error('Invalid request JSON with invalid create user command parameters.');
				}
				this._auth.createUser(user, password).then((result) => {
					if (result.success) {
						ws.send(JSON.stringify({
							id: request.id,
							success: true
						}));
					}
					else {
						ws.send(JSON.stringify({
							id: request.id,
							success: false,
							error: 'Could not create user: ' + result.error
						}));
					}
				});
			}
			// else if (command === 'login') {
			// 	const user = json.user;
			// 	const password = json.password;
			// 	if (typeof user !== 'string' || typeof password !== 'string') {
			// 		throw new Error('Invalid request JSON with invalid login command parameters.');
			// 	}
			// 	this._data.get('users', user).then((userRecord) => {
			// }
			else if (command === 'authenticate') {
				const user = json.user;
				const session = json.session;
				if (typeof user !== 'string' || typeof session !== 'string') {
					throw new Error('Invalid request JSON with invalid authenticate command parameters.');
				}
				this._auth.authenticate(user, session, ws).then((result) => {
					if (result.success) {
						ws.send(JSON.stringify({
							id: request.id,
							success: true
						}));
					}
					else {
						ws.send(JSON.stringify({
							id: request.id,
							success: false,
							error: 'Please login again.'
						}));
					}
				});
			}
			else {
				throw new Error('Invalid command "' + command + '".');
			}
		}
		catch (e) {
			console.log('Error: ' + e.message);
		}
	}

	private _data: Data;
	private _auth: Auth;
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
