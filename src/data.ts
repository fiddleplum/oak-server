import { Config, FieldType } from './config';
import * as fs from 'fs';

export class Data {
	constructor(config: Config, folder: string) {
		this._config = config;
		this._folder = folder;

		// Create the data folder if it doesn't exist.
		if (!fs.existsSync(this._folder)) {
			fs.mkdirSync(this._folder);
		}

		for (const tableName in this._config.tables) {
			// Create the data folder if it doesn't exist.
			if (!fs.existsSync(this._folder + '/' + tableName)) {
				try {
					fs.mkdirSync(this._folder + '/' + tableName);
				}
				catch (error) {
					throw new Error(`Could not create new table folder at "${this._folder + '/' + tableName}".`);
				}
			}

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

	/** Gets a data record.
	 * Returns a promise that resolves with the data record when it is loaded,
	 * or undefined if the data record was not found. */
	async get(table: string, id: FieldType): Promise<DataRecord | undefined> {
		return this._getRecordIndex(table, id, false).then((result) => {
			if (result.cache !== undefined && result.found) {
				return result.cache.dataRecords[result.index];
			}
			else {
				return undefined;
			}
		});
	}

	/** Sets fields of a record. */
	async set(table: string, dataRecords: DataRecord[]): Promise<void[]> {
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
		const filename = this._folder + '/' + table + '/' + binningFunction(id);
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

	/** A promise that exists while the cache is loading. */
	loadingPromise: Promise<Cache> | undefined = undefined;

	// /** Callbacks to be called when the cache is loaded. */
	// loadingCallbacks: ((cache: Cache) => void)[] = [];

	/** The last time the cache was saved. */
	lastSave: number = 0;

	/** True if the cache has been written to but not been saved. */
	dirty: boolean = false;
}
