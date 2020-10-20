import * as fs from 'fs';
import * as WS from 'ws';

/** Process a message from the client. */
async function processMessage(ws: WS, message: string): Promise<void> {
	const request = JSON.parse(message);
	const requestData = request.data;
	let responseData;
	let success = false;
	let error = '';
	console.log('received: %s', JSON.stringify(requestData));

	try {
		// if (requestData.command === 'list accounts') {
		// 	responseData = AccountUtils.list();
		// }
		// else if (requestData.command === 'create account') {
		// 	let name: string = requestData.name;
		// 	let isGroup: boolean = requestData.isGroup;
		// 	let currency: string = requestData.currency;
		// 	let placement: string = requestData.placement;
		// 	responseData = AccountUtils.create(name, currency, placement, isGroup);
		// }
		// else if (requestData.command === 'delete account') {
		// 	let id: string = requestData.id;
		// 	responseData = AccountUtils.delete(id);
		// }
		// else if (requestData.command === 'view account') {
		// 	let id: string = requestData.id;
		// 	responseData = AccountUtils.view(id);
		// }
		// else if (requestData.command === 'rename account') {
		// 	let id = requestData.id;
		// 	let newName = requestData.newName;
		// 	responseData = AccountUtils.rename(id, newName);
		// }
		// else if (requestData.command === 'list transactions') {
		// 	let id: string = requestData.id;
		// 	let startDate: string = requestData.startDate;
		// 	let endDate: string = requestData.endDate;
		// 	let search: string = requestData.search;
		// 	let minAmount: number | undefined = requestData.minAmount;
		// 	let maxAmount: number | undefined = requestData.maxAmount;
		// 	responseData = AccountUtils.listTransactions(id, startDate, endDate, search, minAmount, maxAmount);
		// }
		// else if (requestData.command === 'check duplicate transactions') {
		// 	console.log(requestData);
		// 	let id = requestData.id;
		// 	let transactions = requestData.transactions;
		// 	responseData = AccountUtils.checkDuplicateTransactions(id, transactions);
		// }
		// else if (requestData.command === 'add transactions') {
		// 	let id = requestData.id;
		// 	let transactions = requestData.transactions;
		// 	responseData = AccountUtils.addTransactions(id, transactions);
		// }
		// else if (requestData.command === 'get categories') {
		// 	responseData = CategoryUtils.get();
		// }
		// else if (requestData.command === 'set categories') {
		// 	let categories = requestData.categories;
		// 	responseData = CategoryUtils.set(categories);
		// }
		// else {
		// 	throw new Error('Unknown command.');
		// }
		success = true;
	}
	catch (e) {
		console.log('Error: ' + e.message);
		error = e.message;
	}
	ws.send(JSON.stringify({
		id: request.id,
		success: success,
		error: error,
		data: responseData
	}));
}

function startServer(): void {
	const wss = new WS.Server({
		port: 8081
	});

	if (!fs.existsSync('data/')) {
		fs.mkdirSync('data/');
	}

	// AccountUtils.initialize();

	console.log('The server has started.');

	wss.on('connection', (ws) => {
		console.log('Accepted a new connection.');
		ws.on('message', (message) => {
			processMessage(ws, message.toString());
		});
		ws.on('close', () => {
			console.log('Closed a connection.');
		});
		ws.on('error', () => {
			console.log('Error in connection.');
		});
	});
}

startServer();
