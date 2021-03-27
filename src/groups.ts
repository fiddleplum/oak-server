// import { Data } from './data';
// import { Config } from './config';

// enum GroupRecord { USER, GROUPS }

// export class Groups {
// 	/** Constructs the class. */
// 	constructor(data: Data) {
// 		this._data = data;
// 	}

// 	/** Gets the groups of the current user. */
// 	async getGroups(user: string | undefined): Promise<string[]> {
// 		if (user === undefined) {
// 			return [];
// 		}
// 		const dataRecord = await this._data.get({
// 			table: 'groups',
// 			id: user
// 		});
// 		if (dataRecord !== undefined) {
// 			return (dataRecord[GroupRecord.GROUPS] as string).split(',');
// 		}
// 		else {
// 			return [];
// 		}
// 	}

// 	/** Adds the groups table to the config so that the Data class is happy when using the table. */
// 	static setGroupsTable(config: Config): void {
// 		if (config.tables.groups !== undefined) {
// 			throw new Error('Cannot define table "groups" in the configuration.');
// 		}
// 		config.tables.groups = {
// 			'indexOfId': 0,
// 			'fields': [{
// 				'name': 'user',
// 				'type': 'string'
// 			}, {
// 				'name': 'groups',
// 				'type': 'string'
// 			}]
// 		};
// 	}

// 	/** A reference to the data class. */
// 	private _data: Data;
// }
