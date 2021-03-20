import { Config, FieldType } from './config';
import * as fs from 'fs';
import { JSONObject } from 'elm-app';

export class Data {
	constructor(config: Config, folder: string) {
		this._config = config;
		this._folder = folder;

		// Create the data folder if it doesn't exist.
		if (!fs.existsSync(this._folder)) {
			fs.mkdirSync(this._folder);
		}

		// For each table in the config,
		for (const tableName in this._config.tables) {
			// Create the data folder if it doesn't exist.
			if (!fs.existsSync(this._folder + '/' + tableName)) {
				try {
					fs.mkdirSync(this._folder + '/' + tableName);
				}
				catch (error) {
					throw new Error(`Could not create new table folder at "${this._folder + '/' + tableName}": ${error}`);
				}
			}

			// Setup the binning function.
			const table = this._config.tables[tableName]!;
			let binningFunction: (id: string) => string;
			// If it has a binning function, use it.
			if (table.binningFunctionBody !== undefined) {
				binningFunction = Function('id', table.binningFunctionBody) as (id: string) => string;
			}
			// If it doesn't have a binning function, default to 'data'.
			else {
				binningFunction = (): string => 'data';
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

	/** Gets a list of data records given the filter parameters.
	 *  The first dimension of filters are ORed together and the second dimension are ANDed together.
	 *  So A || (B && C) would be [[A], [B, C]].
	 *  Returns a promise that resolves with the array when they are loaded,
	 *  or an empty array if no match was found. */
	async getFiltered(data: JSONObject, _filters: Filter[][]): Promise<DataRecord[]> {
		// Get and validate the table.
		const table = data.table;
		if (typeof table !== 'string') {
			throw new Error('data.table must be a string.');
		}
		// Get the table configuration.
		const tableConfig = this._config.tables[table];
		if (tableConfig === undefined) {
			throw new Error(`Invalid table "${table}".`);
		}
		// Make sure the table isn't binned.
		if (tableConfig.binningFunctionBody !== undefined) {
			throw new Error(`Getting filtered results doesn't work with table ${table}, which has a binning function.`);
		}
		// Get the data file. Since there is no binning method, any id (0) will do.
		const results: DataRecord[] = [];
		const cache = await this._loadCache(table, 0, false);
		if (cache === undefined) {
			return results;
		}
		// for (let i = 0, l = cache.dataRecords.length; i < l; i++) {
		// }
		return results;
	}

	/** Gets a data record. Returns a promise that resolves with the data record when it is loaded,
	 *  or undefined if the data record was not found. It rejects if the data format is incorrect.
	 *  The data format is:
	 *  ```
	 *  {
	 *    table: string, // name of the table
	 *    id: string | number | boolean // id of the field
	 *  }
	 *  ```
	 */
	async get(data: JSONObject): Promise<DataRecord | undefined> {
		// Get and validate the table.
		const table = data.table;
		if (typeof table !== 'string') {
			throw new Error('data.table must be a string.');
		}
		// Get and validate the id.
		const id = data.id;
		if (typeof id !== 'string' && typeof id !== 'number' && typeof id !== 'boolean') {
			throw new Error('data.id must be a string, number, or boolean.');
		}
		// Get the data record.
		return this._getDataRecordCacheAndIndex(table, id, false).then((result) => {
			if (result.cache !== undefined && result.found) {
				return result.cache.dataRecords[result.index];
			}
			else {
				throw new Error(`The data record with id ${id} was not found in table ${table}.`);
			}
		});
	}

	/** Sets fields of a record. It returns a promise that resolves when complete and rejects if
	 *  the data format is incorrect or if the table is not found. The data format is:
	 *  ```
	 *  {
	 *    table: string, // name of the table
	 *    dataRecords: (string | number | boolean)[][] // a list of data records, each being a list of fields
	 *  }
	 *  ```*/
	async set(data: JSONObject): Promise<void[]> {
		// Get and validate the table.
		const table = data.table;
		if (typeof table !== 'string') {
			throw new Error('data.table must be a string.');
		}
		// Get and validate the data.dataRecord.
		const dataRecords = data.dataRecords;
		if (!Array.isArray(dataRecords)) {
			throw new Error('data.dataRecords must be an array.');
		}
		// Get the table configuration.
		const tableConfig = this._config.tables[table];
		if (tableConfig === undefined) {
			throw new Error(`Invalid table "${table}".`);
		}
		// For each data record in the given list...
		const promises: Promise<void>[] = [];
		for (let i = 0, l = dataRecords.length; i < l; i++) {
			const dataRecord = dataRecords[i]!;
			if (!Array.isArray(dataRecord)) {
				throw new Error(`The data record ${i} is not an array.`);
			}
			// Verify that the data record fields match the configuration.
			if (dataRecord.length !== tableConfig.fields.length) {
				throw new Error(`The data record ${i} has ${dataRecord.length} fields, but it should have ${tableConfig.fields.length}`);
			}
			for (let i = 0, l = dataRecord.length; i < l; i++) {
				if (typeof dataRecord[i] !== tableConfig.fields[i]!.type) {
					throw new Error(`Field ${i} has type ${typeof dataRecord[i]}, but it should be ${tableConfig.fields[i]!.type}`);
				}
			}
			// Get the cache and index given the data record's id field.
			const indexOfId = tableConfig.indexOfId;
			promises.push(this._getDataRecordCacheAndIndex(table, dataRecord[indexOfId] as FieldType, true).then((result) => {
				console.log(`Setting ${dataRecords[indexOfId]} ${result.found}`);
				if (result.cache !== undefined) {
					// Set or insert the data record in the cache and mark the cache as dirty.
					if (result.found) {
						result.cache.dataRecords[result.index] = dataRecord as DataRecord;
					}
					else {
						result.cache.dataRecords.splice(result.index, 0, dataRecord as DataRecord);
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

	/** Deletes records from a table given their ids. Resolves when complete, and rejects if the
	 *  table is not found or the data format is incorrect. If any record is not found, it still
	 *  resolves. The data format is:
	 *  ```
	 *  {
	 *    table: string, // the name of the table
	 *    ids: string[] // the ids of the records to delete
	 *  }
	 *  ```
	 */
	async delete(data: JSONObject): Promise<void> {
		// Get and validate the table.
		const table = data.table;
		if (typeof table !== 'string') {
			throw new Error('data.table must be a string.');
		}
		// Get and validate the ids.
		const ids = data.ids;
		if (!Array.isArray(ids)) {
			throw new Error('data.ids must be an array.');
		}
		// For each given id...
		for (let i = 0, l = ids.length; i < l; i++) {
			// Get and validate the id.
			const id = ids[i];
			if (typeof id !== 'string' && typeof id !== 'number' && typeof id !== 'boolean') {
				throw new Error(`Each id at index ${i} must be a string, number, or boolean.`);
			}
			// Get the cache and index given the id.
			return this._getDataRecordCacheAndIndex(table, id, false).then((result) => {
				// Delete the data record at the index and mark the cache as dirty.
				console.log('Deleting ' + id + ' ' + result.found);
				if (result.cache !== undefined && result.found) {
					result.cache.dataRecords.splice(result.index, 1);
					result.cache.dirty = true;
				}
			});
		}
	}

	/** Gets the index in a cache where the record is. If it doesn't exist, it returns where it
	 *  would be inserted if it did exist. */
	private async _getDataRecordCacheAndIndex(table: string, id: FieldType, createCacheIfNotFound: boolean): Promise<{ cache: Cache | undefined, index: number, found: boolean }> {
		// Get the table configuration.
		const tableConfig = this._config.tables[table];
		if (tableConfig === undefined) {
			throw new Error(`Invalid table "${table}".`);
		}
		const indexOfId = tableConfig.indexOfId;
		if (tableConfig.fields[indexOfId]!.type !== typeof id) {
			throw new Error(`The id ${id} does not match the type of the config of table ${table}.`);
		}
		return this._loadCache(table, id, createCacheIfNotFound).then((cache: Cache | undefined) => {
			if (cache !== undefined) {
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

	/** Loads a data file into the cache. Returns a promise that resolves with the cache when
	 *  loaded, or undefined if it is not found or created. */
	private async _loadCache(table: string, id: FieldType, createIfNotFound: boolean): Promise<Cache | undefined> {
		// Get the filename from the table and sort field.
		const binningFunction = this._binningFunctions.get(table);
		if (binningFunction === undefined) {
			return undefined;
		}
		const filename = `${this._folder}/${table}/${binningFunction(id)}.json`;
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

	/** Saves the cache and marks it as clean. */
	async _saveCache(filename: string, cache: Cache): Promise<void> {
		console.log(`Saving cache "${filename}".`);
		try {
			await fs.promises.writeFile(filename, JSON.stringify(cache.dataRecords));
			cache.dirty = false;
			cache.lastSave = Date.now();
		}
		catch (error) {
			console.log(`Could not save data file from cache. "${filename}". ${error}`);
		}
	}

	/** The configuration given by the app that describes the tables and field formats. */
	private _config: Config;

	/** The folder where the data resides. */
	private _folder: string;

	/** The binning functions of each table. */
	private _binningFunctions: Map<string, (id: FieldType) => string> = new Map();

	/** The currently loaded files. */
	private _caches: Map<string, Cache> = new Map();
}

/** A data record. */
export type DataRecord = FieldType[];

/** A cached data file that is loading or has been loaded in memory. */
class Cache {
	/** The fields in the cache. */
	dataRecords: DataRecord[] = [];

	/** The status of the cache. */
	status: 'loading' | 'loaded' | 'failed' = 'loading';

	/** A promise that exists while the cache is loading. */
	loadingPromise: Promise<Cache> | undefined = undefined;

	/** The last time the cache was saved. */
	lastSave: number = 0;

	/** True if the cache has been written to but not been saved. */
	dirty: boolean = false;
}

/** A filter option. */
interface Filter {
	/** The name of the field to be checked. */
	fieldName: string;

	/** If the field is a number, the range of numbers that match. */
	range?: [number, number];

	/** If the field is a string, the regular expression that matches. */
	regex?: string;

	/** If the field is a boolean, the value that matches. */
	flag?: boolean;

	/** If true, if any of the above match, then the filter does not match. */
	neg?: boolean;
}
