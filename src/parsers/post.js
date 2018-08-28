const logger = require("../logger");
const https = require("https");
const url = require("url");
const db = require("../db").db;

module.exports = (helpers, eventData) => {
  return new Promise((resolve, reject) => {
    logger.info('peep parser %s',eventData.ipfsHash);

    if (!eventData.ipfsData.untrustedTimestamp){
        return resolve();
    }

    // the primary key of a eventData is its IPFS hash
    // as referred to in other payloads.
    const key = "peep-" + eventData.ipfsHash;
    db.put(key, JSON.stringify(eventData), function(err) {
      if (err) {
        logger.error(err);
        reject(err);
      }
      logger.info('peep saved in DB %s',eventData.ipfsHash);

      resolve();
    });
  });
};
