import * as Path from 'path';
import * as FS from 'fs';
import { JSONType } from 'pine-lib';

export class Data {
	constructor(folder: string) {
		this._folder = folder;

		// Create the data folder if it doesn't exist.
		if (!FS.existsSync(this._folder)) {
			FS.mkdirSync(this._folder);
		}

		// Setup a timeout to check if the cache data needs to be saved.
		setInterval(() => {
			const now = Date.now();
			for (const entries of this._caches) {
				const path = entries[0];
				const cache = entries[1];
				// Delete any caches that haven't been used in the last minute.
				if (now - cache.lastAccess > 60000) {
					this._caches.delete(path);
					continue;
				}
				// Save any caches that are dirty and haven't been saved in the last 5 seconds.
				if (cache.dirty && now - cache.lastSave > 5000) {
					this._saveCache(path, cache);
				}
			}
		}, 1000);
	}

	/** Gets data from a path. */
	async get(path: string): Promise<JSONType | undefined> {
		// Clean the path.
		path = this._cleanPath(path);
		// Try and get it from the cache,
		let cache = this._caches.get(path);
		if (cache === undefined) { // It's not in the cache.
			// Create the new cache object.
			cache = new Cache();
			cache.status = 'loading';
			this._caches.set(path, cache);
			// Load the data into the cache.
			console.log(`Loading into cache "${path}".`);
			cache.loadingPromise = FS.promises.readFile(`${this._folder}/${path}.json`).then((data: Buffer) => {
				cache!.data = JSON.parse(data.toString('utf-8'));
				cache!.lastSave = Date.now();
				cache!.status = 'loaded';
			}).catch(() => {
				this._caches.delete(path);
			});
		}
		// Wait until it is loaded and return the data.
		cache.lastAccess = Date.now();
		await cache.loadingPromise;
		return cache.data;
	}

	/** Lists the names at the path. Non recursive. */
	async list(path: string): Promise<string[]> {
		const filenames = await FS.promises.readdir(`${this._folder}/${path}`);
		const paths: string[] = [];
		for (const filename of filenames) {
			paths.push(Path.basename(filename, '.json'));
		}
		return paths;
	}

	/** Sets data to a path. */
	async set(path: string, data: JSONType): Promise<void> {
		// Clean the path.
		path = this._cleanPath(path);
		// Try and get it from the cache,
		let cache = this._caches.get(path);
		if (cache === undefined) { // It's not in the cache.
			// Create the new cache object.
			cache = new Cache();
			cache.loadingPromise = Promise.resolve();
			cache.status = 'loaded';
			this._caches.set(path, cache);
		}
		else if (cache.status === 'loading') {
			await cache.loadingPromise;
		}
		cache.lastAccess = Date.now();
		cache.data = JSON.parse(JSON.stringify(data));
		cache.dirty = true;
		// Needs to be saved immediately because the list path may need this file name.
		this._saveCache(path, cache);
	}

	/** Deletes the data at a path. */
	async delete(path: string): Promise<void> {
		// Clean the path.
		path = this._cleanPath(path);
		// Try and get it from the cache,
		const cache = this._caches.get(path);
		if (cache !== undefined) { // It's in the cache.
			if (cache.status === 'loading') {
				await cache.loadingPromise;
			}
			// Delete it from the cache.
			this._caches.delete(path);
		}
		// Delete it from the file system.
		const filename = `${this._folder}/${path}.json`;
		try {
			await FS.promises.unlink(filename);
		}
		catch {
			throw new Error(`Could not delete ${path}.`);
		}
		// Go through any empty parent folders and delete them until the top.
		let dir = Path.dirname(filename);
		while (true) {
			if (dir === this._folder) {
				break;
			}
			const files = await FS.promises.readdir(dir);
			if (files.length !== 0) {
				break;
			}
			await FS.promises.rmdir(dir);
			dir = Path.dirname(dir);
		}
	}

	// Sanitize the screen so that it works with file paths.
	// Removes multiple '/'s, beginning and ending '/' and anything that isn't alpha-numeric or '-' or '/'.
	private _cleanPath(path: string): string {
		return path.replace(/[^0-9a-zA-Z/-]/g, '').replace(/\/+/, '/').replace(/(^\/)|(\/$)/g, '');
	}

	/** Saves the cache and marks it as clean. */
	private async _saveCache(path: string, cache: Cache): Promise<void> {
		console.log(`Saving cache "${path}".`);
		const filename = `${this._folder}/${path}.json`;
		try {
			await FS.promises.mkdir(Path.dirname(filename), { recursive: true });
			await FS.promises.writeFile(filename, JSON.stringify(cache.data));
			cache.dirty = false;
			cache.lastSave = Date.now();
		}
		catch (error) {
			console.log(`Could not save data file from cache. "${filename}": ${error}`);
		}
	}

	/** The folder where the data resides. */
	private _folder: string;

	/** The currently loaded files. */
	private _caches: Map<string, Cache> = new Map();
}

/** A cached data file that is loading or has been loaded in memory. */
class Cache {
	/** The actual data from the file. */
	data: JSONType | undefined;

	/** The status of the cache. */
	status: 'loading' | 'loaded' = 'loading';

	/** A promise that exists while the cache is loading. */
	loadingPromise: Promise<void> = Promise.resolve();

	/** The last time the cache was saved. */
	lastSave: number = Number.NEGATIVE_INFINITY;

	/** The last time the cache was accessed. */
	lastAccess: number = Date.now();

	/** True if the cache has been written to but not been saved. */
	dirty: boolean = false;
}
