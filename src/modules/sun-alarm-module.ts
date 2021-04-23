import * as WS from 'ws';
import { JSONObject, JSONType } from 'pine-lib';
import { Module } from './module';
import { SunAlarm } from 'cedar-desk-types';

/** The format of the data. Its keys are unique ids mapped to alarms. */
type SunAlarmData = { [key: string]: SunAlarm | undefined };

/** The Sun Alarm module. */
export class SunAlarmModule extends Module {
	/** Processes a command. */
	process(command: string, params: JSONObject, ws: WS): Promise<JSONType | void> {
		if (command === 'list') { // List the alarms.
			return this._list(ws);
		}
		else if (command === 'get') { // Get an alarm by id.
			return this._get(ws, params);
		}
		else if (command === 'update') { // Add or update an alarm.
			return this._update(ws, params);
		}
		else if (command === 'set-enabled') {
			return this._setEnabled(ws, params);
		}
		else if (command === 'remove') { // Remove an alarm.
			return this._remove(ws, params);
		}
		return Promise.resolve();
	}

	private async _list(ws: WS): Promise<SunAlarmData> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`User not logged in.`);
		}
		const sunAlarmData = await this.server.data.get(`sun-alarm/${user}`) as SunAlarmData | undefined;
		if (sunAlarmData === undefined) {
			return {};
		}
		else {
			return sunAlarmData;
		}
	}

	private async _get(ws: WS, params: JSONObject): Promise<SunAlarm> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error('User not logged in.');
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the data.
		const sunAlarmData = await this.server.data.get(`sun-alarm/${user}`) as SunAlarmData | undefined;
		if (sunAlarmData === undefined) {
			throw new Error(`No alarms found for user ${user}.`);
		}
		// Find the alarm.
		const sunAlarm = sunAlarmData[id];
		if (sunAlarm === undefined) {
			throw new Error(`The alarm with id "${id}" was not found.`);
		}
		return sunAlarm;
	}

	private async _update(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`User not logged in.`);
		}
		// Get the id.
		const id = params.id as string;
		delete params.id;
		// Get the data.
		let sunAlarmData = await this.server.data.get(`sun-alarm/${user}`) as SunAlarmData | undefined;
		if (sunAlarmData === undefined) {
			sunAlarmData = {};
		}
		sunAlarmData[id] = params as SunAlarm;
		await this.server.data.set(`sun-alarm/${user}`, sunAlarmData);
	}

	private async _setEnabled(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error('User not logged in.');
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the enabled param.
		const enabled = params.enabled;
		if (typeof enabled !== 'boolean') {
			throw new Error('params.enabled must be a boolean.');
		}
		// Get the data.
		const sunAlarmData = await this.server.data.get(`sun-alarm/${user}`) as SunAlarmData | undefined;
		if (sunAlarmData === undefined) {
			throw new Error(`No alarms found for user ${user}.`);
		}
		// Find the alarm.
		const sunAlarm = sunAlarmData[id];
		if (sunAlarm === undefined) {
			throw new Error(`The alarm with id "${id}" was not found.`);
		}
		// Set the enabled state.
		sunAlarm.enabled = enabled;
		// Save the data.
		await this.server.data.set(`sun-alarm/${user}`, sunAlarmData);
	}

	private async _remove(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`User not logged in.`);
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the data.
		const sunAlarmData = await this.server.data.get(`sun-alarm/${user}`) as SunAlarmData | undefined;
		if (sunAlarmData === undefined) {
			throw new Error(`No alarms found for user ${user}.`);
		}
		// Find the alarm.
		const sunAlarm = sunAlarmData[id];
		if (sunAlarm === undefined) {
			throw new Error(`The alarm with id "${id}" was not found.`);
		}
		// Delete the alarm.
		delete sunAlarmData[id];
		// Save the data.
		await this.server.data.set(`sun-alarm/${user}`, sunAlarmData);
	}
}
