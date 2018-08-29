const Web3 = require("web3");
let globalweb3;

module.exports = socketUrl => {
  if (!globalweb3) {
    globalweb3 = new Web3(new Web3.providers.WebsocketProvider(socketUrl));
  }

  // check connectivity to Web3 socket, reconnect if neccesary
  setInterval(() => {
    globalweb3.eth.net
      .isListening()
      .then()
      .catch(e => {
        globalweb3.setProvider(new Web3.providers.WebsocketProvider(socketUrl));
      });
  }, 10 * 1000);

  return globalweb3;
};
