import * as WS from 'ws';
import { JSONObject, JSONType } from 'pine-lib';
import { Module } from './module';
import { CheckListData, CheckListListData, CheckListListItem } from 'cedar-desk-types';
import { RandomString } from 'random_string';

/** The Sun Alarm module. */
export class CheckListModule extends Module {
	/** Processes a command. */
	process(command: string, params: JSONObject, ws: WS): Promise<JSONType | void> {
		if (command === 'listCheckLists') {
			return this._listCheckLists(ws);
		}
		else if (command === 'addCheckList') {
			return this._addCheckList(ws, params);
		}
		else if (command === 'reinsertCheckList') {
			return this._reinsertCheckList(ws, params);
		}
		else if (command === 'getCheckList') {
			return this._getCheckList(ws, params);
		}
		else if (command === 'removeCheckList') {
			return this._removeCheckList(ws, params);
		}
		// else if (command === 'update') {
		// 	return this._update(ws, params);
		// }
		// else if (command === 'set-enabled') {
		// 	return this._setEnabled(ws, params);
		// }
		// else if (command === 'remove') {
		// 	return this._remove(ws, params);
		// }
		return Promise.resolve();
	}

	private async _listCheckLists(ws: WS): Promise<CheckListListData> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the check list list for the user.
		const checkListData = await this.server.data.get(`check-list/${user}`) as CheckListListData | undefined;
		if (checkListData === undefined) {
			return [];
		}
		else {
			return checkListData;
		}
	}

	/** Adds a check list. Returns the id of the check list. */
	private async _addCheckList(ws: WS, params: JSONObject): Promise<string> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the title.
		const title = params.title;
		if (typeof title !== 'string') {
			throw new Error('params.title must be a string.');
		}
		// Get the shared users.
		const users = params.users;
		if (!Array.isArray(users)) {
			throw new Error('params.users must be an array of strings.');
		}
		for (let i = 0; i < users.length; i++) {
			if (typeof users[i] !== 'string') {
				throw new Error('params.users must be an array of strings.');
			}
		}
		// Add this user to the shared users, if it isn't already there.
		if (!users.includes(user)) {
			users.push(user);
		}
		// Get a unique id.
		const id = RandomString.generate(16);
		// Create the check list data.
		await this.server.data.set(`check-list/lists/${id}`, {
			id: id,
			title: title,
			users: users,
			items: []
		});
		// Add the new list to each shared user's list.
		for (const sharedUser of users as string[]) {
			let checkListListData = await this.server.data.get(`check-list/${sharedUser}`) as CheckListListData | undefined;
			if (checkListListData === undefined) {
				checkListListData = [];
			}
			checkListListData.push({
				id: id,
				title: title
			});
			await this.server.data.set(`check-list/${sharedUser}`, checkListListData);
		}
		// Return the id of the check-list.
		return id;
	}

	private async _reinsertCheckList(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the before-id.
		const beforeId = params.beforeId;
		if (beforeId !== undefined && typeof beforeId !== 'string') {
			throw new Error('params.beforeId must be a string or undefined.');
		}
		// Get the check-list list data.
		let checkListListData = await this.server.data.get(`check-list/${user}`) as CheckListListData | undefined;
		if (checkListListData === undefined) {
			checkListListData = [];
		}
		// Find the right check list item in the checkListListData.
		let checkListListItem: CheckListListItem | undefined;
		let beforeCheckListIndex: number | undefined;
		for (let i = 0; i < checkListListData.length; i++) {
			if (checkListListData[i].id === id) {
				checkListListItem = checkListListData.splice(i, 1)[0];
				i -= 1;
			}
			else if (checkListListData[i].id === beforeId) {
				beforeCheckListIndex = i;
			}
		}
		if (checkListListItem === undefined) {
			throw new Error(`The check list with id ${id} was not found.`);
		}
		// Insert the check list into the right location.
		if (beforeCheckListIndex !== undefined) {
			checkListListData.splice(beforeCheckListIndex, 0, checkListListItem);
		}
		else {
			checkListListData.push(checkListListItem);
		}
		// Save the data.
		await this.server.data.set(`check-list/${user}`, checkListListData);
	}

	/** Gets a check list. */
	private async _getCheckList(ws: WS, params: JSONObject): Promise<CheckListData | undefined> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the check-list.
		return await this.server.data.get(`check-list/lists/${id}`) as CheckListData | undefined;
	}

	/** Gets a check list. */
	private async _removeCheckList(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the check-list list.
		const checkListListData = await this.server.data.get(`check-list/${user}`) as CheckListListData | undefined;
		if (checkListListData === undefined) {
			return;
		}
		// Remove it from the check-list list.
		for (let i = 0; i < checkListListData.length; i++) {
			if (checkListListData[i].id === id) {
				checkListListData.splice(i, 1);
				break;
			}
		}
		// Save the check-list list.
		await this.server.data.set(`check-list/${user}`, checkListListData);
		// Get the check-list.
		const checkListData = await this.server.data.get(`check-list/lists/${id}`) as CheckListData | undefined;
		if (checkListData === undefined) {
			return;
		}
		// Remove the user from the list of users.
		for (let i = 0; i < checkListData.users.length; i++) {
			if (checkListData.users[i] === user) {
				checkListData.users.splice(i, 1);
				break;
			}
		}
		// If the user is the last shared user, remove it. Otherwise, save it.
		if (checkListData.users.length === 0) {
			await this.server.data.delete(`check-list/lists/${id}`);
		}
		else {
			await this.server.data.set(`check-list/lists/${id}`, checkListData);
		}
	}

}
