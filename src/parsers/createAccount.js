const logger = require("../logger");
const https = require("https");
const url = require("url");
const db = require("../db").db;

module.exports = (helpers, eventData) => {
  return new Promise((resolve, reject) => {
    logger.info('createAccount parser %s',eventData.ipfsHash);
    // add username from function call to IPFS payload
    let nameValueHex = eventData.function.params.find(function(element) {
      return element.name === "_name";
    }).value;

    eventData.ipfsData._name = helpers.web3.utils.hexToUtf8(nameValueHex);
    //eventData.ipfsData.transaction = transaction;

    //    eventData.ipfsData._from =
    // add image links from website (S3) to IPFS & add them to IPFS payload
    //
    // S3 links for the profile pics are located at
    //
    // "avatarUrl": "peepeth:bECcUGZh:jpg",
    // https://peepeth.s3-us-west-1.amazonaws.com/images/avatars/bECcUGZh/medium.jpg
    //
    // "backgroundUrl": "peepeth:vbbfAvi2:jpg",
    // https://peepeth.s3-us-west-1.amazonaws.com/images/backgrounds/vbbfAvi2/large.jpg
    // these should be stored on IPFS too to be independent of peepeth's poor S3 servers..

    let promises = [];
    if (eventData.ipfsData.avatarUrl) {
      promises.push(
        new Promise((resolve, reject) => {
          // download avatarUrl and throw it on IPFS too...
          let avatarKey = eventData.ipfsData.avatarUrl.split(":")[1];
          let avatarUrl =
            "https://peepeth.s3-us-west-1.amazonaws.com/images/avatars/" +
            avatarKey +
            "/medium.jpg";
          https.get(url.parse(avatarUrl), function(res) {
            var chunks = [];
            res
              .on("data", function(chunk) {
                chunks.push(chunk);
              })
              .on("end", function() {
                var buffer = Buffer.concat(chunks);
                helpers.throttledIPFS.ipfs.add(buffer, function(err, files) {
                  if (!err && files && files[0]) {
                    logger.info("saved avatar on IPFS %s", files[0].hash);
                    eventData.ipfsData.avatarIPFSHash = files[0].hash;
                    return resolve();
                  } else {
                    return reject();
                  }
                });
              });
          });
        })
      );
    }

    if (eventData.ipfsData.backgroundUrl) {
      promises.push(
        new Promise((resolve, reject) => {
          // download backgroundUrl and throw it on IPFS too...
          let avatarKey = eventData.ipfsData.backgroundUrl.split(":")[1];
          let backgroundUrl =
            "https://peepeth.s3-us-west-1.amazonaws.com/images/avatars/" +
            avatarKey +
            "/medium.jpg";
          https.get(url.parse(backgroundUrl), function(res) {
            var chunks = [];
            res
              .on("data", function(chunk) {
                chunks.push(chunk);
              })
              .on("end", function() {
                var buffer = Buffer.concat(chunks);
                helpers.throttledIPFS.ipfs.add(buffer, function(err, files) {
                  if (!err && files && files[0]) {
                    logger.info("saved avatar on IPFS %s", files[0].hash);
                    eventData.ipfsData.backgroundIPFSHash = files[0].hash;
                    return resolve();
                  } else {
                    return reject();
                  }
                });
              });
          });
        })
      );
    }

    Promise.all(promises).then(() => {
      const key = "user-" + eventData.transaction.from;
      logger.info("createAccount parsed. Account %s added", key);

      db.put(key, JSON.stringify(eventData), function(err) {
        if (err) {
          logger.error(err);
          reject(err);
        }
        resolve();
      });
    });
  });
};
