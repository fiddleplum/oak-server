import { JSONObject, JSONType } from 'pine-lib';
import * as WS from 'ws';
import { Server } from '../index';

export abstract class Module {
	/** Constructs the class. */
	constructor(server: Server) {
		this.server = server;
	}

	/** Called whenever a command is sent by the user and needs processing. */
	abstract process(command: string, params: JSONObject, ws: WS): Promise<JSONType | void>;

	/** Called whenever a user's websocket newly connected. */
	connect(_ws: WS): void {}

	/** Called whenever a user's websocket is closed. */
	disconnect(_ws: WS): void {}

	/** A reference to the server. */
	protected readonly server: Server;
}
