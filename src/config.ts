export interface Field {
	/** The name of the field. */
	name: string;

	/** The type of the field. */
	type: 'number' | 'string' | 'boolean';
}

export interface Table {
	/** The name of the table. */
	name: string;

	/** The fields. */
	fields: Field[];

	/** Sort the data by this field. */
	sortField: string;

	/** Bin the records by this function body, which uses the parameter sortField and returns a string. */
	binningFunctionBody: string;
}

export interface Config {
	/** The tables. */
	tables: Table[];
}
