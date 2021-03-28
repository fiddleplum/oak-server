import * as fs from 'fs';
import * as WS from 'ws';
import * as https from 'https';
import { JSONObject, JSONType } from 'pine-lib';
import { Config } from './config';
import { Data } from './data';
import { Users } from './modules/users';
import { Module } from 'modules/module';

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

		// Startup the data object.
		this._data = new Data(dataFolderPath);

		// Setup the modules.
		this._modules.set('users', new Users(this));

		// Start the HTTPS and WebSocket servers.
		const key  = fs.readFileSync('key.pem', 'utf8');
		const cert = fs.readFileSync('cert.pem', 'utf8');
		const server = https.createServer({ key, cert });
		const webSocketServer = new WS.Server({ server });

		// Setup the WebSocket connection and message callbacks.
		webSocketServer.on('connection', (ws: WS) => {
			console.log('Accepted a new connection.');
			console.log();
			for (const module of this._modules.values()) {
				module.connect(ws);
			}
			ws.on('message', (message: WS.Data) => {
				this._processMessage(ws, message.toString());
			});
			ws.on('close', () => {
				console.log('Closed a connection.');
				console.log();
				for (const module of this._modules.values()) {
					module.disconnect(ws);
				}
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

	/** Gets the data class. */
	get data(): Data {
		return this._data;
	}

	/** Gets the built-in users module. */
	get users(): Users {
		return this._modules.get('users') as Users;
	}

	/** Gets a module by name. */
	getModule(name: string): Module | undefined {
		return this._modules.get(name);
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

			// // Get the user, if any, of the request.
			// const user = this._auth.getAuthenticatedUser(ws);

			// Get the data of the request.
			const data = request.data;
			if (typeof data !== 'object' || data === null || Array.isArray(data)) {
				throw new Error('Request.data must be an object.');
			}

			// Get the module of the request data.
			const moduleName = data.module;
			if (typeof moduleName !== 'string') {
				throw new Error('Request.data.module must be a string.');
			}

			// Get the command of the request data.
			const command = data.command;
			if (typeof command !== 'string') {
				throw new Error('Request.data.command must be a string.');
			}

			// Get the params of the command, if any.
			let params = data.params;
			if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
				throw new Error('Request.data.params must be an object or undefined.');
			}
			if (params === undefined) {
				params = {};
			}

			// Get the module.
			const module = this._modules.get(moduleName);
			if (module === undefined) {
				throw new Error(`Request.data.module "${moduleName}" is an invalid module.`);
			}

			// Process the command.
			const response = await module.process(command, params, ws);
			this.sendResponse(response, ws, id);

			// // Process the different commands.
			// if (command === 'getGroups') { // The the groups of the current user.
			// 	const groups = await this._groups.getGroups(user);
			// 	this.sendResponse({
			// 		success: true,
			// 		data: groups
			// 	}, id, ws);
			// }
			// else if (command === 'get') {
			// 	const dataRecord = await this._data.get(data);
			// 	this.sendResponse({
			// 		success: true,
			// 		data: dataRecord
			// 	}, id, ws);
			// }
			// else if (command === 'list') {
			// 	const dataRecords = await this._data.list(data);
			// 	this.sendResponse({
			// 		success: true,
			// 		data: dataRecords
			// 	}, id, ws);
			// }
			// else if (command === 'set') {
			// 	await this._data.set(data);
			// 	this.sendResponse({
			// 		success: true
			// 	}, id, ws);
			// }
			// else if (command === 'delete') {
			// 	await this._data.delete(data);
			// 	this.sendResponse({
			// 		success: true
			// 	}, id, ws);
			// }
			// else if (command === 'has') {
			// 	// data.has();
			// 	// success = true;
			// }
			// else if (command === 'size') {
			// 	// data.size();
			// 	// success = true;
			// }
			// else {
			// 	throw new Error('Invalid command "' + command + '".');
			// }
		}
		catch (error) {
			ws.send(JSON.stringify({
				id: typeof id === 'number' ? id : NaN,
				success: false,
				error: error + ''
			}));
			console.log(error + '');
		}
	}

	/** Send a response. */
	sendResponse(data: JSONType | void, ws: WS, id: number): void {
		ws.send(JSON.stringify({
			id,
			success: true,
			data
		}));
	}

	private _data: Data;
	private _modules: Map<string, Module> = new Map();
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
