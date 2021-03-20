import * as fs from 'fs';
import * as WS from 'ws';
import * as https from 'https';
import { JSONType } from 'elm-app';
import { Config } from './config';
import { Data } from './data';
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
		let id: JSONType | undefined;
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
			id = request.id;
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

			// Process the different commands.
			if (command === 'get') {
				const dataRecord = await this._data.get(data);
				this.sendResponse({
					success: true,
					data: dataRecord
				}, id, ws);
			}
			else if (command === 'set') {
				await this._data.set(data);
				this.sendResponse({
					success: true
				}, id, ws);
			}
			else if (command === 'delete') {
				await this._data.delete(data);
				this.sendResponse({
					success: true
				}, id, ws);
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
				await this._auth.createUser(data);
				this.sendResponse({
					success: true
				}, id, ws);
			}
			else if (command === 'login') {
				const session = await this._auth.login(data, ws);
				this.sendResponse({
					success: true,
					session: session
				}, id, ws);
			}
			else if (command === 'authenticate') {
				await this._auth.authenticate(data, ws);
				this.sendResponse({
					success: true
				}, id, ws);
			}
			else {
				throw new Error('Invalid command "' + command + '".');
			}
		}
		catch (error) {
			this.sendResponse({
				success: false,
				error: `${error}`
			}, typeof id === 'number' ? id : NaN, ws);
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
