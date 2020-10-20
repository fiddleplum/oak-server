import * as fs from 'fs';
import * as WS from 'ws';
import { JSONType } from 'elm-app';
import { Config } from './config';
import { Data } from './data';

let data: Data;

/** Process a message from the client. */
async function processMessage(ws: WS, message: string): Promise<void> {
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
		if (command === 'set') {
			// data.set();
			success = true;
		}
		else if (command === 'delete') {
			// data.delete();
			success = true;
		}
		else if (command === 'get') {
			// data.get();
			success = true;
		}
		else if (command === 'has') {
			// data.has();
			success = true;
		}
		else if (command === 'size') {
			// data.size();
			success = true;
		}
		else {
			throw new Error('Invalid command "' + command + '".');
		}
	}
	catch (e) {
		console.log('Error: ' + e.message);
		// error = e.message;
	}
	// ws.send(JSON.stringify({
	// 	id: request.id,
	// 	success: success,
	// 	error: error,
	// 	data: responseData
	// }));
}

function startServer(args: string[]): void {
	// Get the command-line parameters.
	if (args.length < 2) {
		console.log('Usage: node . <config file path> <data folder path>.');
		return;
	}
	const configFilePath = args[0];
	const dataFolderPath = args[1];

	// Get the config.
	const configFileData = fs.readFileSync(configFilePath);
	const config: Config = JSON.parse(configFileData.toString('utf-8'));

	// Print the config.
	console.log('The configuration is:');
	console.log(config);

	// Startup the data object.
	data = new Data(config, dataFolderPath);

	// Startup the WebSocket server.
	const wss = new WS.Server({
		port: 8081
	});

	if (!fs.existsSync(dataFolderPath)) {
		fs.mkdirSync(dataFolderPath);
	}

	console.log('The server has started on port 8081.');

	wss.on('connection', (ws) => {
		console.log('Accepted a new connection.');
		ws.on('message', (message: WS.Data) => {
			processMessage(ws, message.toString());
		});
		ws.on('close', () => {
			console.log('Closed a connection.');
		});
		ws.on('error', () => {
			console.log('Error in connection.');
		});
	});
}

const args = process.argv.slice(2);

startServer(args);
