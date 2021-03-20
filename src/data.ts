import { Config, FieldType } from './config';
import * as fs from 'fs';
import { JSONObject, Sort } from 'elm-app';

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

	/** Gets a list of data records given filter parameters.
	 *  The first dimension of filters are ORed together and the second dimension are ANDed together.
	 *  So A || (B && C) would be [[A], [B, C]]. It returns a promise that resolves with the array
	 *  when they are loaded, or an empty array if no match was found. The format of each filter is
	 *  described in the Filter interface. The data format is:
	 *  ```
	 *  {
	 *    table: string, // name of the table
	 *    filter: Filter[][] // the filter, [] means get all data records
	 *  }
	 *  ```
	 */
	async list(data: JSONObject): Promise<DataRecord[]> {
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
			throw new Error(`Listing results doesn't work with table ${table}, which has a binning function.`);
		}
		const isDataRecordIdLessBound = this.isDataRecordIdLess.bind(this, tableConfig.indexOfId);
		const isDataRecordValueEqualBound = this.isDataRecordValueEqual.bind(this, tableConfig.indexOfId);
		// Get the data file. Since there is no binning method, any id (0) will do.
		const cache = await this._loadCache(table, 0, false);
		if (cache === undefined) {
			// There are no records, so return nothing.
			return [];
		}
		// Get and validate the filters.
		const filterOrs = data.filter;
		if (!Array.isArray(filterOrs)) {
			throw new Error('data.filter must be an array.');
		}
		// Go through each OR filter set.
		const resultOfOrs: DataRecord[] = [];
		for (let i = 0, l = filterOrs.length; i < l; i++) {
			const filterAnds = filterOrs[i];
			if (!Array.isArray(filterAnds)) {
				throw new Error(`data.filter[${i}] must be any array.`);
			}
			const resultOfAnds = cache.dataRecords.splice(0);
			// Go through each AND filter set.
			for (let j = 0, m = filterAnds.length; j < m; j++) {
				const filter = filterAnds[j];
				if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
					throw new Error(`data.filter[${i}][${j}] must be an object.`);
				}
				// Get the field name.
				const fieldName = filter.fieldName;
				if (typeof fieldName !== 'string') {
					throw new Error(`data.filter[${i}][${j}].fieldName must be a string.`);
				}
				// Get the field index.
				let fieldIndex;
				for (let k = 0, n = tableConfig.fields.length; k < n; k++) {
					if (tableConfig.fields[k]!.name === fieldName) {
						fieldIndex = k;
					}
				}
				if (fieldIndex === undefined) {
					throw new Error(`data.filter[${i}][${j}].fieldName of ${table}.${fieldName} is an invalid field name.`);
				}
				// Get the neg flag.
				let neg = false;
				if (filter.neg !== undefined) {
					if (typeof filter.neg !== 'boolean') {
						throw new Error(`data.filter[${i}][${j}].neg must be a boolean.`);
					}
					neg = filter.neg;
				}
				// Depending on the filter type, filter the AND groups.
				const fieldConfig = tableConfig.fields[fieldIndex]!;
				if (filter.range !== undefined) {
					const range = filter.range;
					if (!Array.isArray(range) || range.length !== 2 || typeof range[0] !== 'number' || typeof range[1] !== 'number') {
						throw new Error(`data.filter[${i}][${j}].range must be an array of two numbers, min and max.`);
					}
					if (fieldConfig.type !== 'number') {
						throw new Error(`data.filter[${i}][${j}].range is used, but ${table}.${fieldName} is not a number.`);
					}
					for (let k = 0, n = resultOfAnds.length; k < n; k++) {
						const dataRecord = resultOfAnds[k];
						const fieldValue = dataRecord[fieldIndex] as number;
						const match = range[0] <= fieldValue && fieldValue <= range[1];
						if (match ? neg : !neg) {
							resultOfAnds.splice(k, 1);
							k--;
						}
					}
				}
				else if (filter.regex !== undefined) {
					const regex = filter.regex;
					if (typeof regex !== 'string') {
						throw new Error(`data.filter[${i}][${j}].regex must be a string.`);
					}
					if (fieldConfig.type !== 'string') {
						throw new Error(`data.filter[${i}][${j}].regex is used, but ${table}.${fieldName} is not a string.`);
					}
					try {
						const regexObject = /${regex}/;
						for (let k = 0, n = resultOfAnds.length; k < n; k++) {
							const dataRecord = resultOfAnds[k];
							const fieldValue = dataRecord[fieldIndex] as string;
							const match = regexObject.test(fieldValue);
							if (match ? neg : !neg) {
								resultOfAnds.splice(k, 1);
								k--;
							}
						}
					}
					catch (error) {
						throw new Error(`data.filter[${i}][${j}].regex is an invalid regular expression: ${error}`);
					}
				}
				else if (filter.flag !== undefined) {
					const flag = filter.flag;
					if (typeof flag !== 'boolean') {
						throw new Error(`data.filter[${i}][${j}].flag must be a boolean.`);
					}
					if (fieldConfig.type !== 'boolean') {
						throw new Error(`data.filter[${i}][${j}].flag is used, but ${table}.${fieldName} is not a boolean.`);
					}
					for (let k = 0, n = resultOfAnds.length; k < n; k++) {
						const dataRecord = resultOfAnds[k];
						const fieldValue = dataRecord[fieldIndex] as boolean;
						const match = fieldValue === flag;
						if (match ? neg : !neg) {
							resultOfAnds.splice(k, 1);
							k--;
						}
					}
				}
			}
			// Union the resultOfAnds to the resultOfOrs.
			for (let j = 0, m = resultOfAnds.length; j < m; j++) {
				Sort.addIfUnique(resultOfAnds[j], resultOfOrs, isDataRecordIdLessBound, isDataRecordValueEqualBound);
			}
		}
		return resultOfOrs;
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
				const index = this.getIndexOfDataRecord(id, cache.dataRecords, indexOfId);
				return {
					cache: cache,
					index: index,
					found: (index < cache.dataRecords.length && cache.dataRecords[index][indexOfId] === id)
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

	/** Gets the least index of the data records that is greater than or equal to the id, or the
	 *  last index if all ids are less. */
	private getIndexOfDataRecord(id: FieldType, dataRecords: DataRecord[], indexOfId: number): number {
		return Sort.getIndex(id, dataRecords, this.isDataRecordIdLess.bind(this, indexOfId));
	}

	/** Returns true if the data record's id is less than the rhs. */
	private isDataRecordIdLess(indexOfId: number, lhs: DataRecord, id: FieldType): boolean {
		return lhs[indexOfId] < id;
	}

	/** Returns true if the data record's id equals the rhs. */
	private isDataRecordValueEqual(indexOfId: number, lhs: DataRecord, rhs: DataRecord): boolean {
		return lhs[indexOfId] === rhs[indexOfId];
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
