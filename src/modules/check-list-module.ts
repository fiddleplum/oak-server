import * as WS from 'ws';
import { JSONObject, JSONType } from 'pine-lib';
import { Module } from './module';
import { CheckListData, CheckListListData, CheckListListItem } from 'cedar-desk-types';
import { RandomString } from '../random_string';

/** The Sun Alarm module. */
export class CheckListModule extends Module {
	/** Processes a command. */
	process(command: string, params: JSONObject, ws: WS): Promise<JSONType | void> {
		if (command === 'listCheckLists') {
			return this.listCheckLists(ws);
		}
		else if (command === 'addCheckList') {
			return this.addCheckList(ws, params);
		}
		else if (command === 'editCheckList') {
			return this.editCheckList(ws, params);
		}
		else if (command === 'reinsertCheckList') {
			return this.reinsertCheckList(ws, params);
		}
		else if (command === 'getCheckList') {
			return this.getCheckList(ws, params);
		}
		else if (command === 'removeCheckList') {
			return this.removeCheckList(ws, params);
		}
		else if (command === 'addItem') {
			return this.addItem(ws, params);
		}
		else if (command === 'removeItem') {
			return this.removeItem(ws, params);
		}
		else if (command === 'updateText') {
			return this.updateText(ws, params);
		}
		else if (command === 'updateLevel') {
			return this.updateLevel(ws, params);
		}
		else if (command === 'reinsertItem') {
			return this.reinsertItem(ws, params);
		}
		else {
			throw new Error('Invalid command.');
		}
		return Promise.resolve();
	}

	private async listCheckLists(ws: WS): Promise<CheckListListData> {
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
	private async addCheckList(ws: WS, params: JSONObject): Promise<string> {
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

	/** Adds a check list. Returns the id of the check list. */
	private async editCheckList(ws: WS, params: JSONObject): Promise<void> {
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
		// Get the check-list.
		const checkListData = await this.server.data.get(`check-list/lists/${id}`) as CheckListData | undefined;
		if (checkListData === undefined) {
			throw new Error(`The check list with id "${id}" is not found.`);
		}
		// Update the fields.
		checkListData.title = title;
		const oldUsers = checkListData.users;
		checkListData.users = users as string[];
		// Save the check list.
		await this.server.data.set(`check-list/lists/${id}`, checkListData);
		// Remove from any shared users lists no longer being shared.
		for (const oldUser of oldUsers) {
			// If the new user list doesn't have the old user, remove it.
			if (!checkListData.users.includes(oldUser)) {
				// Get the check-list list for the user.
				const checkListListData = await this.server.data.get(`check-list/${oldUser}`) as CheckListListData | undefined;
				if (checkListListData === undefined) {
					continue;
				}
				// Find and remove the entry.
				for (let i = 0; i < checkListListData.length; i++) {
					if (checkListListData[i].id === id) {
						checkListListData.splice(i, 1);
						break;
					}
				}
				// Save the check-list list.
				this.server.data.set(`check-list/${oldUser}`, checkListListData);
			}
		}
		// Add the new list to each shared user's list, if it isn't already there.
		for (const sharedUser of users as string[]) {
			// Get the check-list list for the shared user.
			let checkListListData = await this.server.data.get(`check-list/${sharedUser}`) as CheckListListData | undefined;
			if (checkListListData === undefined) {
				checkListListData = [];
			}
			// Check if the check-list doesn't already exist in the check-list list.
			let found = false;
			for (let i = 0; i < checkListListData.length; i++) {
				if (checkListListData[i].id === id) {
					// Update the title.
					checkListListData[i].title = title;
					// Mark it as found.
					found = true;
					break;
				}
			}
			// If it isn't already in the list, add it.
			if (!found) {
				checkListListData.push({
					id: id,
					title: title
				});
			}
			// Save the check-list list.
			await this.server.data.set(`check-list/${sharedUser}`, checkListListData);
		}
	}

	private async reinsertCheckList(ws: WS, params: JSONObject): Promise<void> {
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
		if (typeof beforeId !== 'string' && beforeId !== undefined) {
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
	private async getCheckList(ws: WS, params: JSONObject): Promise<CheckListData | undefined> {
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
	private async removeCheckList(ws: WS, params: JSONObject): Promise<void> {
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
		// Load the check-list.
		const checkListData = await this.getCheckListFromId(id);
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
			// Save the check-list.
			await this.saveCheckList(id, checkListData);
		}
	}

	/** Adds a check-list item. */
	private async addItem(ws: WS, params: JSONObject): Promise<string> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the check-list id.
		const checkListId = params.checkListId;
		if (typeof checkListId !== 'string') {
			throw new Error('params.checkListId must be a string.');
		}
		// Get the level.
		const level = params.level;
		if (typeof level !== 'number') {
			throw new Error('params.level must be a number.');
		}
		// Get the new text.
		const text = params.text;
		if (typeof text !== 'string') {
			throw new Error('params.text must be a string.');
		}
		// Get the id of the item before this one.
		const beforeId = params.beforeId;
		if (typeof beforeId !== 'string' && beforeId !== undefined) {
			throw new Error('params.beforeId must be a string or not defined.');
		}
		// Get a unique id.
		const id = RandomString.generate(16);
		// Load the check-list.
		const checkListData = await this.getCheckListFromId(checkListId);
		// Create the new item.
		const newItem = {
			id: id,
			level: level,
			text: text
		};
		// Add the new item to the right location.
		const beforeIndex = this.getIndexFromId(beforeId, checkListData);
		if (beforeIndex !== undefined) {
			checkListData.items.splice(beforeIndex, 0, newItem);
		}
		else {
			checkListData.items.push(newItem);
		}
		// Save the check-list.
		await this.saveCheckList(checkListId, checkListData);
		// Return the id.
		return id;
	}

	/** Adds a check-list item. */
	private async removeItem(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the check-list id.
		const checkListId = params.checkListId;
		if (typeof checkListId !== 'string') {
			throw new Error('params.checkListId must be a string.');
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Load the check-list.
		const checkListData = await this.getCheckListFromId(checkListId);
		// Remove the item with the id.
		const index = this.getIndexFromId(id, checkListData);
		if (index === undefined) {
			throw new Error(`Item with id ${id} not found.`);
		}
		checkListData.items.splice(index, 1);
		// Save the check-list.
		await this.saveCheckList(checkListId, checkListData);
	}

	/** Updates a check-list item text. */
	private async updateText(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the check-list id.
		const checkListId = params.checkListId;
		if (typeof checkListId !== 'string') {
			throw new Error('params.checkListId must be a string.');
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the new text.
		const text = params.text;
		if (typeof text !== 'string') {
			throw new Error('params.text must be a string.');
		}
		// Load the check-list.
		const checkListData = await this.getCheckListFromId(checkListId);
		// Update the text of the item.
		const index = this.getIndexFromId(id, checkListData);
		if (index === undefined) {
			throw new Error(`Item with id ${id} not found.`);
		}
		checkListData.items[index].text = text;
		// Save the check-list.
		await this.saveCheckList(checkListId, checkListData);
	}

	/** Updates a check-list item level. */
	private async updateLevel(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the check-list id.
		const checkListId = params.checkListId;
		if (typeof checkListId !== 'string') {
			throw new Error('params.checkListId must be a string.');
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the level.
		const level = params.level;
		if (typeof level !== 'number') {
			throw new Error('params.level must be a number.');
		}
		// Load the check-list.
		const checkListData = await this.getCheckListFromId(checkListId);
		// Get the item.
		const index = this.getIndexFromId(id, checkListData);
		if (index === undefined) {
			throw new Error(`Item with id ${id} not found.`);
		}
		const item = checkListData.items[index];
		// Update the level of all children.
		for (let j = index + 1; j < checkListData.items.length; j++) {
			if (checkListData.items[j].level <= item.level) {
				break;
			}
			checkListData.items[j].level += level - item.level;
		}
		// Update the level.
		item.level = level;
		// Save the check-list.
		await this.saveCheckList(checkListId, checkListData);
	}

	/** Reinserts a check-list item. */
	private async reinsertItem(ws: WS, params: JSONObject): Promise<void> {
		// Get the user.
		const user = this.server.users.getUser(ws);
		if (user === undefined) {
			throw new Error(`The user is not logged in.`);
		}
		// Get the check-list id.
		const checkListId = params.checkListId;
		if (typeof checkListId !== 'string') {
			throw new Error('params.checkListId must be a string.');
		}
		// Get the id.
		const id = params.id;
		if (typeof id !== 'string') {
			throw new Error('params.id must be a string.');
		}
		// Get the id of the item before this one.
		const beforeId = params.beforeId;
		if (typeof beforeId !== 'string' && beforeId !== undefined) {
			throw new Error('params.beforeId must be a string, null, or not defined.');
		}
		// Load the check-list.
		const checkListData = await this.getCheckListFromId(checkListId);
		// Get the item.
		const index = this.getIndexFromId(id, checkListData);
		if (index === undefined) {
			throw new Error(`Item with id ${id} not found.`);
		}
		const item = checkListData.items[index];
		// Get the list of the item and its children.
		const items = [item];
		for (let j = index + 1; j < checkListData.items.length; j++) {
			if (checkListData.items[j].level <= item.level) {
				break;
			}
			items.push(checkListData.items[j]);
		}
		// Remove the item and its children.
		checkListData.items.splice(index, items.length);
		// Get the before item.
		const beforeIndex = this.getIndexFromId(beforeId, checkListData);
		if (beforeIndex !== undefined) {
			// Add the items before the before-item.
			checkListData.items.splice(beforeIndex, 0, ...items);
		}
		else {
			// No before-item, so just add the items to the end.
			checkListData.items.push(...items);
		}
		// Save the check-list.
		await this.saveCheckList(checkListId, checkListData);
	}

	/** Gets a check-list given an id. */
	private async getCheckListFromId(checkListId: string): Promise<CheckListData> {
		// Get the check-list.
		const checkListData = await this.server.data.get(`check-list/lists/${checkListId}`) as CheckListData | undefined;
		if (checkListData === undefined) {
			throw new Error(`The check-list with id "${checkListId}" is not found.`);
		}
		return checkListData;
	}

	/** Save a check-list. */
	private async saveCheckList(checkListId: string, checkListData: CheckListData): Promise<void> {
		await this.server.data.set(`check-list/lists/${checkListId}`, checkListData);
	}

	/** Gets an item given an id. */
	private getIndexFromId(id: string | undefined, checkListData: CheckListData): number | undefined {
		if (id !== undefined) {
			for (let i = 0; i < checkListData.items.length; i++) {
				if (checkListData.items[i].id === id) {
					return i;
				}
			}
		}
		return undefined;
	}
}
