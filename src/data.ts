import { Config, FieldType } from './config';
import * as fs from 'fs';

export class Data {
	constructor(config: Config, folder: string) {
		this._config = config;
		this._folder = folder;

		for (const tableName in this._config.tables) {
			const table = this._config.tables[tableName];
			let binningFunction: (id: string) => string;
			// If it has a binning function, use it.
			if (table.binningFunctionBody !== undefined) {
				binningFunction = Function('id', table.binningFunctionBody) as (id: string) => string;
			}
			// If it doesn't have a binning function, default to 'data'.
			else {
				binningFunction = (): string => 'data.json';
			}
			this._binningFunctions.set(tableName, binningFunction);
		}

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

	/** Gets a data record. Accepts a callback that takes the data record when it is loaded. */
	get(table: string, id: FieldType, callback: (dataRecord: DataRecord | undefined) => void): void {
		this._getRecordIndex(table, id, false, (cache: Cache, index: number, found: boolean) => {
			if (found) {
				callback(cache.dataRecords[index]);
			}
			else {
				callback(undefined);
			}
		});
	}

	/** Sets fields of a record. */
	set(table: string, dataRecords: DataRecord[], callback: (error: string | undefined) => void): void {
		// Verify that the table exists.
		if (this._config.tables[table] !== undefined) {
			const tableConfig = this._config.tables[table];
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
				this._getRecordIndex(table, dataRecord[indexOfId], true, (cache: Cache, index: number, found: boolean) => {
					console.log('Setting ' + dataRecords[indexOfId] + ' ' + found);
					if (found) {
						cache.dataRecords[index] = dataRecord;
					}
					else {
						cache.dataRecords.splice(index, 0, dataRecord);
					}
					cache.dirty = true;
				});
			}
		}
		else {
			callback(`Invalid table "${table}".`);
		}
	}

	private delete(table: string, ids: FieldType[], callback: (error: string | undefined) => void): void {
		// Verify that the table exists.
		if (this._config.tables[table] !== undefined) {
			// For each data record,
			for (let i = 0, l = ids.length; i < l; i++) {
				const id = ids[i];
				this._getRecordIndex(table, id, true, (cache: Cache, index: number, found: boolean) => {
					console.log('Deleting ' + id + ' ' + found);
					if (found) {
						cache.dataRecords.splice(index, 1);
						cache.dirty = true;
					}
				});
			}
		}
		else {
			callback(`Invalid table "${table}".`);
		}
	}

	/** Gets the index in a cache where the record is. */
	private _getRecordIndex(table: string, id: FieldType, createIfNotFound: boolean, callback: (cache: Cache | undefined, index: number, found: boolean) => void): void {
		this._loadCache(table, id, createIfNotFound, (cache: Cache | undefined) => {
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
				callback(cache, low, cache.dataRecords[low][indexOfId] === id);
			}
			else {
				callback(undefined, 0, false);
			}
		});
	}

	/** Loads a data file into the cache. Accepts a callback that takes the cache, when the cache is loaded. */
	private _loadCache(table: string, id: FieldType, createIfNotFound: boolean, callback: (cache: Cache | undefined) => void): void {
		// Get the filename from the table and sort field.
		const binningFunction = this._binningFunctions.get(table);
		const filename = this._folder + '/' + table + '/' + (binningFunction ? binningFunction(id) : '');
		// Get the file from the cache.
		const cache = this._caches.get(filename);
		// If the file is in the cache,
		if (cache !== undefined) {
			// And it is still loading,
			if (cache.status === 'loading') {
				// Add the callback to be called when it loads.
				cache.loadingCallbacks.push(callback);
			}
			// Otherwise it was loaded or failed,
			else {
				// Call the callback immediately.
				callback(cache);
			}
		}
		// Else the file isn't in the cache, so load it.
		else {
			// Create the new cache object.
			const newCache = new Cache();
			newCache.loadingCallbacks.push(callback);
			this._caches.set(filename, newCache);
			// Load the data into the cache.
			console.log(`Loading into cache "${filename}".`);
			fs.readFile(filename, (err: NodeJS.ErrnoException | null, data: Buffer) => {
				// If it loaded correctly,
				if (err === null) {
					newCache.dataRecords = JSON.parse(data.toString('utf-8'));
					newCache.lastSave = Date.now();
					newCache.status = 'loaded';
				}
				// If it failed loading,
				else {
					if (createIfNotFound) {
						newCache.lastSave = Date.now();
						newCache.status = 'loaded';
					}
					else {
						console.log(`Could not load data file from cache. "${filename}". ${err.message}`);
						newCache.status = 'failed';
					}
				}
				// Call of the callbacks.
				for (let i = 0, l = newCache.loadingCallbacks.length; i < l; i++) {
					newCache.loadingCallbacks[i](newCache);
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

	private _config: Config;
	private _folder: string;
	private _binningFunctions: Map<string, (id: FieldType) => string> = new Map();
	private _caches: Map<string, Cache> = new Map();
}

/** A data record. */
export type DataRecord = FieldType[];

class Cache {
	/** The fields in the cache. */
	dataRecords: DataRecord[] = [];

	/** The status of the cache. */
	status: 'loading' | 'loaded' | 'failed' = 'loading';

	/** Callbacks to be called when the cache is loaded. */
	loadingCallbacks: ((cache: Cache) => void)[] = [];

	/** The last time the cache was saved. */
	lastSave: number = 0;

	/** True if the cache has been written to but not been saved. */
	dirty: boolean = false;
}
