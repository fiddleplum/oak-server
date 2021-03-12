/** The allowed groups and users for a given access type. */
export interface AllowPermissions {
	/** The allowed groups. */
	groups: string[];

	/** The allowed users. */
	users: string[];
}

/** The patterns and associated permissions for different access types. */
export interface Permissions {
	/** The pattern to match. */
	pattern: string;

	/** The pattern to match. */
	patternRegEx: RegExp;

	/** The allowed edit groups and users. */
	edit: AllowPermissions;

	/** The allowed view groups and users. */
	view: AllowPermissions;
}

export interface Config {
	permissions: Permissions[];
}
