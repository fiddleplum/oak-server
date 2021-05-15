import * as fs from 'fs';
import * as WS from 'ws';
import * as https from 'https';
import { JSONType } from 'pine-lib';
import { Data } from './data';

import { Module } from './modules/module';
import { UsersModule } from './modules/users-module';
import { SunAlarmModule } from './modules/sun-alarm-module';
import { CheckListModule } from './modules/check-list-module';

export class Server {
	constructor() {
		// Get the command-line parameters.
		const args: string[] = process.argv.slice(2);
		if (args.length < 1) {
			throw new Error('Usage: node . <data folder path>.');
		}
		const dataFolderPath = args[0];

		console.log('Starting up...');
		console.log();

		// Startup the data object.
		this._data = new Data(dataFolderPath);

		// Setup the modules.
		this._modules.set('users', new UsersModule(this));
		this._modules.set('sun-alarm', new SunAlarmModule(this));
		this._modules.set('check-list', new CheckListModule(this));

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
	get users(): UsersModule {
		return this._modules.get('users') as UsersModule;
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
			this.sendResponse(ws, id, response);
		}
		catch (error) {
			ws.send(JSON.stringify({
				id: typeof id === 'number' ? id : NaN,
				success: false,
				error: error.message
			}));
			console.log(error.message);
		}
	}

	/** Send a message. */
	sendMessage(ws: WS, module: string, data: JSONType | void): void {
		ws.send(JSON.stringify({
			module,
			data
		}));
	}

	/** Send a response. */
	sendResponse(ws: WS, id: number, data: JSONType | void): void {
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
