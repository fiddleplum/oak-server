import { Config } from './config';

export class Data {
	constructor(config: Config, folder: string) {
		this._config = config;
		this._folder = folder;

		for (let i = 0, l = this._config.tables.length; i < l; i++) {
			const table = this._config.tables[i];
			const binningFunction = Function('sortField', table.binningFunctionBody) as (sortField: string) => string;
			this._binningFunctions.set(table.name, binningFunction);
		}
	}

	set(table: string, sortField: string, field: string, value: 'number' | 'string' | 'boolean'): void {
		const filename = this._folder + '/' + table + '/' + this._binningFunctions.get(table)(sortField);
	}

	private _config: Config;
	private _folder: string;
	private _binningFunctions: Map<string, (sortField: string) => string> = new Map();
}
