const metaData = require("./metadata");
const abiDecoder = require("abi-decoder");
const logger = require("./logger");
const ThrottledIPFS = require("./ThrottledIPFS");
const ipfsAPI = require("ipfs-api");
//const web3 = require("./web3");

class Peepin {
  /**
   * Constructs the object.
   *
   * @param      {string}  ipfshost       The ipfs-api host
   * @param      {string}  ipfsport       The ipfs-api port
   * @param      {string}  web3socketurl  The Web3 socketurl to use
   */
  constructor(ipfshost, ipfsport, web3socketurl) {
    // this.ipfshost = ipfshost;
    // this.ipfsport = ipfsport;
    //this.web3socketurl = web3socketurl;
    this.web3 = require("./web3")(web3socketurl);

    const ipfs = ipfsAPI({
      host: ipfshost,
      port: ipfsport,
      protocol: "http"
    });

    this.throttledIPFS = new ThrottledIPFS({
      ipfs: ipfs,
      logger: logger
    });
  }

  /**
   * Bootstrap
   *
   */
  go() {
    logger.info(
      "Starting Peepeth pinner on %s ( from block %s)",
      metaData.contract,
      metaData.startblock
    );
    this.contract = new this.web3.eth.Contract(metaData.abi, metaData.contract);

    abiDecoder.addABI(metaData.abi);

    this.lastReadBlock = parseInt(metaData.startblock);
    this.eventCount = 0;
    this.pinCount = 0;
    this.picHashes = [];

    // subscribe to new blocks appearing on the chain to update
    this.web3.eth
      .subscribe("newBlockHeaders", (error, result) => {
        if (!error) {
          logger.info("subscribed to newBlockHeaders");
          return;
        }
        logger.error(error);
      })
      .on("data", blockHeader => {
        logger.info("new blockheight %d", blockHeader.number);
        if (!this.readingEvents) {
          logger.info("waking up event reader");
          this.readingEvents = true;
          this.readEvents(this.lastReadBlock);
        }
      })
      .on("error", console.error);

    // read range from creation of contract till  current blocknumber
    this.web3.eth.getBlockNumber().then(blockNr => {
      logger.info("blockchain is at block %d", blockNr);
      this.highestBlock = parseInt(blockNr);
      this.readingEvents = true;
      this.readEvents(this.lastReadBlock);
    });
  }

  readEvents(fromBlock) {
    if (this.highestBlock <= fromBlock) {
      logger.info("event reader going to sleep");
      this.readingEvents = false;
      return;
    }
    let toBlock = fromBlock + 1000;
    logger.info(
      "Reading block-range %d -> %d (%d remaining)",
      fromBlock,
      toBlock,
      this.highestBlock - fromBlock
    );
    this.contract.getPastEvents(
      "PeepethEvent",
      {
        fromBlock: fromBlock,
        toBlock: toBlock
      },
      (error, events) => {
        this.lastReadBlock = toBlock;
        logger.info("done..");
        events.map(this.parseEvent.bind(this));
        //        console.log(JSON.stringify(event));
        this.readEvents(toBlock);
      }
    );
  }

  parseEvent(result) {
    logger.info("Parse event");
    this.web3.eth
      .getTransaction(result.transactionHash)
      .then(transaction => {
        if (transaction.blockNumber > this.highestBlock) {
          this.highestBlock = transaction.blockNumber;
        }
        if (!transaction.input) {
          return logger.error(new Error("no transaction input found"));
        }
        let decodedData;
        try {
          decodedData = abiDecoder.decodeMethod(transaction.input);
        } catch (e) {
          return logger.error(e);
        }
        this.eventCount++;

        if (!decodedData || !decodedData.name) {
          return logger.error(new Error("error decoding method"));
        }

        logger.info("decoded event=%s", decodedData.name);

        switch (decodedData.name) {
          case "createAccount":
          case "updateAccount":
          case "tip":
            var found = decodedData.params.find(function(element) {
              return element.name === "_ipfsHash";
            });
            logger.info("%s - IPFS=%s", decodedData.name, found.value);
            // options.pinner
            //   .pin(metaData.contract, found.value, this.defaultTtl)
            //   .then(() => {
            //     this.pinCount++;
            //   })
            //   .catch(e => {
            //     logger.warn("Error pinning: %s", e.message);
            //   });
            break;
          case "post":
          case "reply":
            var found = decodedData.params.find(function(element) {
              return element.name === "_ipfsHash";
            });
            this.parsePeep(found.value);
            break;
          case "saveBatch":
            var found = decodedData.params.find(function(element) {
              return element.name === "_ipfsHash";
            });
            this.throttledIPFS.cat(found.value).then(file => {
              const s = JSON.parse(file.toString());
              if (s.batchSaveJSON && Array.isArray(s.batchSaveJSON)) {
                s.batchSaveJSON.forEach(batchItem => {
                  const command = Object.keys(batchItem)[0];
                  switch (command) {
                    case "follow":
                    case "unfollow":
                    case "changeName":
                      break;
                    case "peep":
                      if (batchItem[command].ipfs) {
                        this.parsePeep(batchItem[command].ipfs);
                      }
                      break;
                    case "love":
                      if (batchItem[command].messageID) {
                        this.parsePeep(batchItem[command].messageID);
                      }
                      break;
                    default:
                      logger.warn("unknown function %s %j", command, batchItem);
                      process.exit();
                      break;
                  }
                });
              }
            });
            break;
          case "share":
            var found = decodedData.params.find(function(element) {
              return element.name === "_ipfsHash";
            });
            // options.pinner
            //   .pin(metaData.contract, found.value, this.defaultTtl)
            //   .then(() => {
            //     this.pinCount++;
            //   })
            //   .catch(e => {
            //     logger.warn("Error pinning: %s", e.message);
            //   });
            this.throttledIPFS.cat(found.value).then(file => {
              const s = JSON.parse(file.toString());
              if (s.pic && s.pic != "") {
                this.picHashes.push(s.pic);
                // options.pinner
                //   .pin(metaData.contract, s.pic, this.defaultTtl)
                //   .then(() => {
                //     this.pinCount++;
                //   })
                //   .catch(e => {
                //     logger.warn("Error pinning: %s", e.message);
                //   });
              }
              if (s.shareID && s.shareID != "") {
                // options.pinner
                //   .pin(metaData.contract, s.shareID, this.defaultTtl)
                //   .then(() => {
                //     this.pinCount++;
                //   })
                //   .catch(e => {
                //     logger.warn("Error pinning: %s", e);
                //   });
              }
            });
            break;
          case "love":
            var found = decodedData.params.find(function(element) {
              return element.name === "messageID";
            });
            // options.pinner
            //   .pin(metaData.contract, found.value, this.defaultTtl)
            //   .then(() => {
            //     this.pinCount++;
            //   })
            //   .catch(e => {
            //     logger.warn("Error pinning: %s", e.message);
            //   });
            break;
          case "follow":
          case "unfollow":
          case "changeName":
            // no IPFS involved here..
            break;
          default:
            logger.warn(
              "unknown function %s (%j)",
              decodedData.name,
              decodedData
            );
            break;
        }
      })
      .catch(e => {
        logger.error(e);
      });
  }

  parsePeep(ipfsHash) {
    this.throttledIPFS
      .cat(ipfsHash)
      .then(file => {
        try {
          const s = JSON.parse(file.toString());
          if (s.pic && s.pic != "") {
            this.picHashes.push(s.pic);
            // this.options.pinner
            //   .pin(metaData.contract, s.pic, this.defaultTtl)
            //   .then(() => {
            //     this.pinCount++;
            //   })
            //   .catch(e => {
            //     logger.warn("Error pinning: %s", e.message);
            //   });
          }
        } catch (e) {
          logger.error("Cannot parse peep %j", e);
        }
      })
      .catch(e => {
        logger.error("throttledIPFS.cat failed ! %j", e);
      });
  }

  getStats() {
    if (!this.options) {
      return;
    }
    this.pushManifest();
    return {
      eventCount: this.eventCount,
      pinCount: this.pinCount,
      highestBlock: this.highestBlock,
      manifest: this.manifestHash,
      picHashes: this.picHashes.length
    };
  }

  pushManifest() {
    if (this.picHashes.length === 0) {
      return;
    }

    let manifest = JSON.stringify({
      type: "peepeth-image-manifest",
      highestBlock: this.highestBlock,
      picHashes: this.picHashes
    });

    this.options.ipfs
      .add(Buffer.from(manifest, "utf8"))
      .then(result => {
        logger.info("manifest saved %s", result[0].hash);
        this.manifestHash = result[0].hash;
      })
      .catch(e => {
        logger.error("manifest save failed %j", e);
      });
  }
}

module.exports = Peepin;
