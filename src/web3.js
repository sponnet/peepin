const Web3 = require('web3');
let globalweb3;

module.exports = (socketUrl) => {
	if (!globalweb3) {
		globalweb3 = new Web3(new Web3.providers.WebsocketProvider(socketUrl));
	}
	return globalweb3;
};
