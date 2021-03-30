import * as WS from 'ws';
import { JSONObject, JSONType } from 'pine-lib';
import { Module } from './module';

/*
When a WS connection is opened, it exists only in a single browser tab and browser session.
This means that authentication is only required when the page is opened.
*/

interface Alarm extends JSONObject {
	longitude: number, // Longitude for calcing the sun position.
	latitude: number, // Latitude for calcing the sun position.
	relativeTo: 'sunrise' | 'sunset', // The reference point for calcing the alarm time.
	degreesOffset: number, // The number of degrees relative to the sunrise or sunset.
	timeOffset: number, // A time offset in seconds added on after everything.
	sound: string, // The sound the play.
	daysOfWeek: number[],
	enabled: boolean
}

/** The format of the data. Its keys are unique ids mapped to alarms. */
type SunAlarmData = { [key: string]: Alarm };

/** The Sun Alarm module. */
export class SunAlarm extends Module {
	/** Processes a command. */
	process(command: string, params: JSONObject, ws: WS): Promise<JSONType | void> {
		if (command === 'list') { // List the alarms.
			return this._list(ws);
		}
		else if (command === 'get') { // Get an alarm by id.
		}
		else if (command === 'add') { // Add an alarm.
		}
		else if (command === 'update') { // Update an alarm.
		}
		else if (command === 'remove') { // Remove an alarm.
		}
	}

	private async _list(ws: WS): Promise<SunAlarmData> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`User not logged in.`);
		}
		const sunAlarmData = await this.server.data.get(`sun-alarm/${user}.json`) as SunAlarmData | undefined;
		if (sunAlarmData === undefined) {
			return {};
		}
		else {
			return sunAlarmData;
		}
	}
}
