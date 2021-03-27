# Conclusions

I will have regular JSON files and a cache. It will all be handled in a single "data" class.

I will have several built-in modules on top of this: auth, search, etc. The user app will be able to create custom modules in addition. Each command will also have a "module" property which tells which module should process the data.

There will be no permissions configs, but the permissions will be handled by the modules. Each module will have access to the other modules as well. The modules for cedardesk will be things like "sun-alarm", "recipes", etc.

The auth module will stay as is, but with some modifications.

The search module will need to be reworked. It will likely be module-specific and so won't need to be implemented until I do those modules (finance and tasks).

# Sun Alarm Use Case

There are multiple users. Each user has their own set of alarms.

The alarms have the following properties:
* longitude
* latitude 
* relative sunrise, sunset, astronomical dawn, nautical dawn, civil dawn, and same for dusk
* offset in seconds relative to the origin
* sound to play
* days of week to alarm

Each user has their own table: alarms/<user>.json
Only that user is allowed to view or edit their own table.
Editing their table implies creating a new table.

How should the permissions be set for the table then? Maybe just "alarms/<user>" with edit permission of "$1"?

# Recipe Use Case

There are three lists of things: tools, ingredients, and instructions. There is also a serving size and notes section.

If I have just data records, then I will have to have a number of tables, each one in a separate file. One for the array of tools, one for the array of ingredients [amount: number, unit: string, type: string], one for the array of instructions.

With the three arrays, would there have to be a separate table just to hold the serving size and any other one-time things (title, author, etc).

The problem is that although the data record approach can do this, it is very inefficient, since each table is a separate file. This is why I'm leaning toward more generic JSON files. I would rather have all of the data in a single file, with just one GET from the client.

# Notes

## Array or JSON?

I need to change from purely an array of records to a more abstract JSON object.
The reason is because each user will have a list of alarms, and each alarm will have a variety of settings.
If an alarm has a sunrise setting, it will have an offset, 

I think I *can* keep the pure array method, since that is how databases work. It is very efficient and I need to make it work with my needs.

I would like to have three extra types: array of strings, numbers, and booleans. They wouldn't be filterable, but I've already seen two use cases now: "user groups" and "days of week to alarm". I could implement them via a string, but what if I wanted a list of days in a month, as an array of numbers? I could only do it as a comma-split string and then convert each item to numbers, which is tedious.

## Permissions

### The Real Issue

The real problem with the permissions system is that there is no way server-side to ensure that certain value restrictions are met. For instance, in the "day of week", the user should only be able to put in 0-6, but any number is allowed on the server-side.

This means that the server data must be completely suspect just like the server-side user input. So all checking must be done on the client-side, since no checking of the data, except for type, can be done server-side. What problems can this cause?

I can't think of any unsolvable problems right now. It only seems that the client requires more checks, and nothing more.

### Is There Any Need To Have Permissions In The Tables Themselves?



### Other Notes on Permissions

Who creates the users? Is it a user of the admin group? Or can anyone create their own usernames?

Make the permissions be in the config, with patterns like $1, $2.

In the permissions, there should be path like "alarms/<user>" that means a user may create a database at that path, and it will have edit/view permissions of that user to start out.

For project names, there should be permissions path like "projects/<*>" that allows the edit users to create databases of any name, with certain permissions.

This means there should be a separate "create db" command that create a db with specific permissions. The permissions path above tells who can create the db at that path. *not sure about this one*

Example in the server config json permissions:
"permissions": {
	"alarms/<user>": {
		"edit": {
			"users": ["<user>"]
		}
	},
	"tasks/<project>/settings": {
		"edit": {
			"groups": ["<project>_devs"]
		}
	},
	"tasks/<project>/issues": {
		"edit": {
			"groups": ["<project>_devs"]
		},
		"view": {
			"groups": ["<project>_managers"]
		}
	}
}

Each table should have the format:
{
	"permissions": {
		"edit": {
			"users": [],
			"groups": []
		},
		"view": {
			"users": [],
			"groups": []
		}
	}
	"dataRecords": [[], [], []]
}
