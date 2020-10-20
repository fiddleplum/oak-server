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

	/** Bin the records by this function, which is applied to the sortField. It will be eval'ed. */
	binningFunction: string;
}

export interface Config {
	/** The tables. */
	tables: Table[];
}
