import * as fs from 'fs';
import * as WS from 'ws';
import * as https from 'https';
import { JSONType } from 'elm-app';
import { Config } from './config';
import { Data, DataRecord } from './data';

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
			if (typeof json.table !== 'string' || !Array.isArray(json.dataRecords)) {
				throw new Error('Invalid request JSON with invalid set command parameters.');
			}
			data.set(json.table, json.dataRecords as DataRecord[]).then(() => {
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
		else if (command === 'get') {
			if (typeof json.table !== 'string' || (typeof json.id !== 'number' && typeof json.id !== 'string' && typeof json.id !== 'boolean')) {
				throw new Error('Invalid request JSON with invalid get command parameters.');
			}
			data.get(json.table, json.id).then((dataRecord: DataRecord) => {
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
		else if (command === 'has') {
			// data.has();
			// success = true;
		}
		else if (command === 'size') {
			// data.size();
			// success = true;
		}
		else {
			throw new Error('Invalid command "' + command + '".');
		}
	}
	catch (e) {
		console.log('Error: ' + e.message);
	}
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
	console.log(JSON.stringify(config));

	// Startup the data object.
	data = new Data(config, dataFolderPath);

	// Create the data folder if it doesn't exist.
	if (!fs.existsSync(dataFolderPath)) {
		fs.mkdirSync(dataFolderPath);
	}

	// Start the HTTPS and WebSocket servers.
	const key  = fs.readFileSync('key.pem', 'utf8');
	const cert = fs.readFileSync('cert.pem', 'utf8');
	const server = https.createServer({ key, cert });
	const webSocketServer = new WS.Server({ server });

	// Setup the WebSocket connection and message callbacks.
	webSocketServer.on('connection', (ws: WS) => {
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

	// Start the HTTPS server listening.
	server.listen(8081);
	console.log(`The server has started on port 8081.`);
}

const args = process.argv.slice(2);

startServer(args);
