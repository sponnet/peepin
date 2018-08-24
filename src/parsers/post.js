const logger = require("../logger");
const https = require("https");
const url = require("url");
const db = require("../db").db;

module.exports = (helpers, data, transaction) => {
  return new Promise((resolve, reject) => {
  
    if (!data.ipfsData.untrustedTimestamp){
        return resolve();
    }

    data.ipfsData.transaction = transaction;

    const key = "peep-" + data.ipfsData.untrustedTimestamp + '-' + transaction.hash;
    db.put(key, JSON.stringify(data.ipfsData), function(err) {
      if (err) {
        logger.error(err);
        reject(err);
      }
      resolve();
    });
  });
};
