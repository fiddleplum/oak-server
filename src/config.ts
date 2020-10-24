export type FieldType = number | string | boolean;

export interface Field {
	/** The name of the field. */
	name: string;

	/** The type of the field. */
	type: 'number' | 'string' | 'boolean';
}

export interface Table {
	/** The fields. */
	fields: Field[];

	/** The index of the field on which the data is sorted and binned. It should be unique per record. */
	indexOfId: number;

	/** Bin the records by this function body, which uses the parameter id and returns a string. */
	binningFunctionBody?: string;
}

export interface Config {
	/** The tables. */
	tables: { [prop: string]: Table };
}
