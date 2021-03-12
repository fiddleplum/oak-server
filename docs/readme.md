# Data Architecture

## Config

When the server is started, it is passed a config JSON file which contains many of the settings.

## Basic Format

Data is stored in JSON files, in the `data/` folder. A server can issue a `get` command like this:

```
{
	"command": "get"
	"location": "tasks/my-project/124"
}
```

It will grab the file at `tasks/my-project/124.json`.

## Permissions

Every data file may have a `permissions` object field like this:

```
{
	"permissions": {
		"edit": {
			"groups": ["coders", "testers"],
			"users": ["bob"]
		},
		"view": {
			"groups": ["managers"],
			"users": ["stakholder-bob"]
		}
	}
	data: any json
}
```

It describes the users and groups that have permission to either edit or view the file.

Additionally, there is a folder-level settings file `settings.json`:

```
{
	"permissions": {
		...
	}
	...
}
```

Any user that accesses a file must be allowed in the file list as well as every folder's permissions settings up to the `data/` folder.

There is a built-in group `admins` that is the only group allowed to modify the `settings.json` files in any folder. They are also allowed to modify any other files, regardless of permissions.

## Cache

Whenever a file is loaded, it is added to a cache. This includes if the file doesn't exist, in which case an entry is made with an undefined value, so that future existence checking is not necessary.

Whenever a file is saved, it is first saved to the cache and then saved to the disk, so that the cache is always up-to-date.
