import { Config } from 'config';
import * as fs from 'fs';
import { JSONType, JSONValidation } from 'elm-app';

export class Data {
	constructor(config: Config, folder: string) {
		this._config = config;
		this._dataFolder = folder;

		// Create the data folder if it doesn't exist.
		this._readyPromise = this.initialize();
		if (!fs.existsSync(this._dataFolder)) {
			fs.mkdirSync(this._dataFolder);
		}

		// Get the users data for permissions checking.
		const buffer = fs.readFileSync(this._dataFolder);

		// Setup a timeout to check if the cache data needs to be saved.
		setInterval(() => {
			const now = Date.now();
			for (const entries of this._caches) {
				const filename = entries[0];
				const cache = entries[1];
				if (cache.dirty && now - cache.lastSave > 1000) {
					this._saveCache(filename, cache);
				}
			}
		}, 5000);
	}

	async initialize(): Promise<void> {
		// Create the data folder if it doesn't already exist.
		try {
			await fs.promises.stat(this._dataFolder);
		}
		catch {
			await fs.promises.mkdir(this._dataFolder);
		}
	
		// Create the users file if it doesn't already exist.
		const usersFilePath = `${this._dataFolder}/users.json`;
		try {
			await fs.promises.stat(usersFilePath);
		}
		catch {
			await fs.promises.writeFile(usersFilePath, '{}');
		}

		// Load the users file.
		const usersCacheFile = new CacheFile(usersFilePath);
		await usersCacheFile.loadingPromise;
		this._cache.set('users', usersCacheFile);
	}

	/** Checks the permissions of json given the user and whether or not they want to edit or just view the file. */
	checkPermissions(json: FileFormat, user: string, edit: boolean) {
		if (edit) {
			if (json.permissions.edit.users.includes(user)) {
				return true;
			}

			if (json.permissions.edit.groups
		}
		else {
		}
		if (json === null || typeof json !== 'object') {
			return false;
		}
		if ('permissions' in json) {
			const permissionsJson = json.permissions;
			if (permissionsJson === null || typeof permissionsJson !== 'object') {
				return false;
			}
			if (edit) {
				if ('edit' in permissionsJson) {
					const editJson = permissionsJson.edit;
					if (editJson === null || typeof editJson !== 'object') {
						return false;
					}
					if ('users' in editJson) {
						const usersJson = editJson.users;
						if (!Array.isArray(usersJson)) {
							return false;
						}
						if (usersJson.includes(user)) {
							return true;
						}
					}
					if ('groups' in editJson) {
						const groupsJson = editJson.groups;
						if (!Array.isArray(groupsJson)) {
							return false;
						}
						const groups = this._cache.get('users')!.json[user];
					}
				}
			}
			else {
			}
		}
		else {
			return false;
		}
		return false;
	}

	/** Gets a file. Returns a promise that resolves with the file data when it is loaded,
	 * or undefined if the file was not found or the view permissions were not satisfied. */
	async get(user: string, key: string): Promise<JSONType | undefined> {
		let allowed = false;
		for (const permission of this._config.permissions) {
			if (permission.patternRegEx.test(key)) {
				if () {
				}
			}
		}

		let cacheFile = this._cache.get(key);
		if (cacheFile !== undefined) {
			if (cacheFile.status === 'loaded' || cacheFile.status === 'saving') {
				return cacheFile.json;
			}
		}
		else {
			cacheFile = new CacheFile(key);
			this._cache.set(key, cacheFile);
		}
		if (cacheFile.loadingPromise !== undefined) {
			await cacheFile.loadingPromise;
			return cacheFile.json;
		}
		else {
			return undefined;
		}
	}

	/** Sets fields of a record. */
	async set(table: string, dataRecords: DataRecord[]): Promise<void[]> {
		// Create the data folder if it doesn't exist.
		if (!fs.existsSync(this._dataFolder + '/' + tableName)) {
			try {
				fs.mkdirSync(this._dataFolder + '/' + tableName);
			}
			catch (error) {
				throw new Error(`Could not create new table folder at "${this._dataFolder + '/' + tableName}".`);
			}
		}



		// Verify that the table exists.
		if (this._config.tables[table] !== undefined) {
			const tableConfig = this._config.tables[table];
			const promises: Promise<void>[] = [];
			// For each data record,
			for (let i = 0, l = dataRecords.length; i < l; i++) {
				const dataRecord = dataRecords[i];
				// Verify that the data record fields are correct.
				if (dataRecord.length !== tableConfig.fields.length) {
					throw new Error(`The data record has ${dataRecord.length} fields, but it should have ${tableConfig.fields.length}`);
				}
				for (let i = 0, l = dataRecord.length; i < l; i++) {
					if (typeof dataRecord[i] !== tableConfig.fields[i].type) {
						throw new Error(`Field ${i} has type ${typeof dataRecord[i]}, but it should be ${tableConfig.fields[i].type}`);
					}
				}
				const indexOfId = this._config.tables[table].indexOfId;
				promises.push(this._getRecordIndex(table, dataRecord[indexOfId], true).then((result) => {
					console.log('Setting ' + dataRecords[indexOfId] + ' ' + result.found);
					if (result.cache !== undefined) {
						if (result.found) {
							result.cache.dataRecords[result.index] = dataRecord;
						}
						else {
							result.cache.dataRecords.splice(result.index, 0, dataRecord);
						}
						result.cache.dirty = true;
					}
					else {
						throw new Error(`Failed to set record ${dataRecord[indexOfId]}. Cache could not be loaded.`);
					}
				}));
			}
			return Promise.all(promises);
		}
		else {
			throw new Error(`Invalid table "${table}".`);
		}
	}

	async delete(table: string, ids: FieldType[]): Promise<void> {
		// Verify that the table exists.
		if (this._config.tables[table] !== undefined) {
			// For each data record,
			for (let i = 0, l = ids.length; i < l; i++) {
				const id = ids[i];
				return this._getRecordIndex(table, id, false).then((result) => {
					console.log('Deleting ' + id + ' ' + result.found);
					if (result.cache !== undefined && result.found) {
						result.cache.dataRecords.splice(result.index, 1);
						result.cache.dirty = true;
					}
				});
			}
		}
	}

	/** Gets the index in a cache where the record is. */
	private async _getRecordIndex(table: string, id: FieldType, createIfNotFound: boolean): Promise<{ cache: Cache | undefined, index: number, found: boolean }> {
		return this._loadCache(table, id, createIfNotFound).then((cache: Cache | undefined) => {
			if (cache !== undefined) {
				const indexOfId = this._config.tables[table].indexOfId;
				let low = 0;
				let high = cache.dataRecords.length;
				while (low < high) {
					const mid = (low + high) >>> 1;
					if (cache.dataRecords[mid][indexOfId] < id) {
						low = mid + 1;
					}
					else {
						high = mid;
					}
				}
				return {
					cache: cache,
					index: low,
					found: (low < cache.dataRecords.length && cache.dataRecords[low][indexOfId] === id)
				};
			}
			else {
				return {
					cache: undefined,
					index: 0,
					found: false
				};
			}
		});
	}

	/** Loads a data file into the cache. Accepts a callback that takes the cache, when the cache is loaded. */
	private async _loadCache(table: string, id: FieldType, createIfNotFound: boolean): Promise<Cache | undefined> {
		// Get the filename from the table and sort field.
		const binningFunction = this._binningFunctions.get(table);
		if (binningFunction === undefined) {
			return undefined;
		}
		const filename = this._dataFolder + '/' + table + '/' + binningFunction(id);
		// Get the file from the cache.
		const cache = this._caches.get(filename);
		// If the file is in the cache,
		if (cache !== undefined) {
			// And it is still loading,
			if (cache.loadingPromise !== undefined) {
				// Return the loading promise.
				return cache.loadingPromise;
			}
			// Otherwise it was loaded or failed,
			else {
				// Return a resolved promise.
				return Promise.resolve(cache);
			}
		}
		// Else the file isn't in the cache, so load it.
		else {
			// Create the new cache object.
			const newCache = new Cache();
			// Load the data into the cache.
			console.log(`Loading into cache "${filename}".`);
			return fs.promises.readFile(filename).then((data: Buffer) => {
				// If it loaded correctly,
				this._caches.set(filename, newCache);
				newCache.dataRecords = JSON.parse(data.toString('utf-8'));
				newCache.lastSave = Date.now();
				newCache.status = 'loaded';
				return newCache;
			}).catch(() => {
				if (createIfNotFound) {
					this._caches.set(filename, newCache);
					newCache.lastSave = Date.now();
					newCache.status = 'loaded';
					return newCache;
				}
				else {
					return undefined;
				}
			});
		}
	}

	_saveCache(filename: string, cache: Cache): void {
		console.log(`Saving cache "${filename}".`);
		fs.writeFile(filename, JSON.stringify(cache.dataRecords), (err: NodeJS.ErrnoException | null) => {
			if (err === null) {
				cache.dirty = false;
				cache.lastSave = Date.now();
			}
			else {
				console.log(`Could not save data file from cache. "${filename}". ${err.message}`);
			}
		});
	}

	/** The description the data configuration. */
	private _config: Config;

	/** The folder where the data is stored. */
	private _dataFolder: string;

	/** A promise that resolves when the data system is ready. */
	private _readyPromise: Promise<void> | undefined = undefined;

	/** The files that are in the cache. */
	private _cache: Map<string, CacheFile> = new Map();
}

interface FileFormat {
	permissions: {
		edit: {
			groups: string[],
			users: string[]
		},
		view: {
			groups: string[],
			users: string[]
		}
	},
	data: JSONType
}

class CacheFile {
	constructor(key: string): void {
		console.log(`Loading into cache "${key}".`);
		this.key = key;
		this.status = 'loading';
		this.loadingPromise = fs.promises.readFile(`${key}.json`).then((data: Buffer) => {
			this.json = this.validate(JSON.parse(data.toString('utf-8')) as JSONType);
			this.lastSave = Date.now();
			this.status = 'loaded';
		}).catch((error: Error) => {
			this.status = 'failed';
			this.loadingPromise = undefined;
			console.log(`Could not load from "${key}.json". ${error.message}`);
		});
	}

	save(key: string) {
		if (this.status !== 'loaded') {
			console.log(`Cannot save cache "${key}". It is not loaded.`);
			return;
		}
		console.log(`Saving cache "${key}".`);
		this.status = 'saving';
		this.savingPromise = fs.promises.writeFile(`${key}.json`, JSON.stringify(this.json)).then(() => {
			this.status = 'loaded';
			this.dirty = false;
			this.lastSave = Date.now();
		}).catch((error: Error) => {
			this.status = 'loaded';
			console.log(`Could not save to "${key}.json". ${error.message}`);
		});
	}

	validate(json: JSONType): FileFormat {
		if (!JSONValidation.isObject(json)) {
			json = {};
		}
		if (!JSONValidation.isObject(json.permissions)) {
			json.permissions = {};
		}
		if (!JSONValidation.isObject(json.permissions.edit)) {
			json.permissions.edit = {};
		}
		if (!JSONValidation.isArray(json.permissions.edit.groups)) {
			json.permissions.edit.groups = [];
		}
		if (!JSONValidation.isArray(json.permissions.edit.users)) {
			json.permissions.edit.users = [];
		}
		if (!JSONValidation.isObject(json.permissions.view)) {
			json.permissions.view = {};
		}
		if (!JSONValidation.isArray(json.permissions.edit.groups)) {
			json.permissions.view.groups = [];
		}
		if (!JSONValidation.isArray(json.permissions.edit.users)) {
			json.permissions.view.users = [];
		}
		return json as FileFormat;
	}

	/** The key for the cache file. */
	key: string = '';

	/** The fields in the cache. */
	json!: FileFormat;

	/** The status of the cache. */
	status: 'loading' | 'saving' | 'loaded' | 'failed' = 'loading';

	/** A promise that exists while the cache is loading. */
	loadingPromise: Promise<void> | undefined = undefined;

	/** A promise that exists while the cache is saving. */
	savingPromise: Promise<void> | undefined = undefined;

	/** The last time the cache was saved. */
	lastSave: number = 0;

	/** True if the cache has been written to but not been saved. */
	dirty: boolean = false;
}
