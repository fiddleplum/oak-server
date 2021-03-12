export type JSONType = null | boolean | number | string | (JSONType | undefined)[] | { [prop: string]: (JSONType | undefined) };
