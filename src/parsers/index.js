module.exports = {
  createAccount: require("./createAccount"),
  post: require("./post"),

  updateAccount: require("./ignore"),
  reply: require("./ignore"),
  share: require("./ignore"),
  saveBatch: require("./ignore"),
  tip: require("./ignore"),

  unFollow: require("./ignore"),
  setIsActive: require("./ignore"),
  follow: require("./ignore"),
  changeName: require("./ignore"),
  setNewAddress: require("./ignore"),
  newAddress: require("./ignore"),
  transferAccount: require("./ignore"),

  cashout: require("./ignore"),
  setMinSiteTipPercentage: require("./ignore"),
  lockMinSiteTipPercentage: require("./ignore"),
  transferOwnership: require("./ignore")
};
