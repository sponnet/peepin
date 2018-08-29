const metaData = require("./metadata");
const abiDecoder = require("abi-decoder");
const logger = require("./logger");
const ThrottledIPFS = require("./ThrottledIPFS");
const ipfsAPI = require("ipfs-api");
const parsers = require("./parsers");
const db = require("./db").db;

class Peepin {
  /**
   * Constructs the object.
   *
   * @param      {string}  ipfshost       The ipfs-api host
   * @param      {string}  ipfsport       The ipfs-api port
   * @param      {string}  web3socketurl  The Web3 socketurl to use
   */
  constructor(ipfshost, ipfsport, web3socketurl) {
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
    this.dumpPeeps().then(headHash => {
      logger.info("dump peeps done. head hash=%s", headHash);
      this.go2();
    });
    //    this.go2();
  }

  go2() {
    logger.info(
      "Starting Peepeth pinner on %s ( from block %d)",
      metaData.contract,
      metaData.startblock
    );
    this.contract = new this.web3.eth.Contract(metaData.abi, metaData.contract);

    abiDecoder.addABI(metaData.abi);

    //this.lastReadBlock = metaData.startblock;
    this.eventCount = 0;
    this.pinCount = 0;
    this.picHashes = [];

    // subscribe to new blocks appearing on the chain to update
    this.web3.eth
      .subscribe("newBlockHeaders")
      .on("data", blockHeader => {
        logger.info("new blockheight %d", blockHeader.number);
        this.highestBlock = blockHeader.number;
        this.readEvents();
        logger.info("ipfs stats: %j", this.throttledIPFS.getStats());
      })
      .on("error", console.error);

    // read range from creation of contract till  current blocknumber
    this.web3.eth.getBlockNumber().then(blockNr => {
      logger.info("blockchain is at block %d", blockNr);
      this.highestBlock = parseInt(blockNr);
      db.get("lastreadblock", (err, lastReadBlock) => {
        this.readEvents(lastReadBlock || metaData.startblock);
      });
    });
  }

  // Recursively reads events from a certain startBlock up to the highest block known
  readEvents(lastReadBlock, checkSemaphore) {
    let fromBlock = lastReadBlock;
    let toBlock = fromBlock + 10000;
    if (toBlock > this.highestBlock) {
      toBlock = this.highestBlock;
    }
    if (!checkSemaphore) {
      if (this.readingEvents === true) {
        return;
      }
      this.readingEvents = true;
    }
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
        events.map(this.parseEvent.bind(this));
        logger.info("done..");
        db.put("lastreadblock", toBlock, err => {
          if (this.highestBlock > toBlock) {
            this.readEvents(true);
          } else {
            logger.info(
              "fromBlock %d - lastReadBlock %d - highestBlock %d",
              fromBlock,
              toBlock,
              this.highestBlock
            );
            logger.info("event reader going to sleep");
            this.dumpUsers();
            this.readingEvents = false;
          }
        });
      }
    );
  }

  // dump the local cache with all users to IPFS
  dumpUsers() {
    let users = {};
    db.createReadStream()
      .on("data", data => {
        if (data.key.startsWith("user-")) {
          users[data.key] = JSON.parse(data.value);
        }
      })
      .on("error", err => {
        console.log("Oh my!", err);
      })
      .on("end", () => {
        console.log("Stream ended");
        this.throttledIPFS.ipfs.add(
          Buffer.from(JSON.stringify(users)),
          function(err, files) {
            if (!err && files && files[0]) {
              logger.info("saved users on IPFS %s", files[0].hash);
            } else {
              logger.error(err);
            }
          }
        );
      });
  }

  // dump the local cache with all users to IPFS
  dumpPeeps() {
    let headPeep = "";
    return new Promise(resolve => {
      let orderedpeeps = {};
      db.createReadStream()
        .on("data", data => {
          if (data.key.startsWith("peep-")) {
            let peep = JSON.parse(data.value);
            orderedpeeps[peep.ipfsData.untrustedTimestamp] = peep.ipfsHash;
          }
        })
        .on("error", err => {
          console.log("Oh my!", err);
        })
        .on("end", () => {
          let peepkeys = Object.keys(orderedpeeps);
          if (peepkeys.length === 0) {
            // no peeps yet to index.
            return resolve(null);
          }
          console.log("Stream ended. %d peeps", peepkeys.length);
          peepkeys.sort();
          peepkeys = peepkeys.reverse();
          if (!headPeep) {
            headPeep = orderedpeeps[peepkeys[peepkeys.length - 2]];
          }

          db.get("currenthead", (err, currentHead) => {
            logger.info("current head peep=", currentHead);
            this.chainPeeps(peepkeys, orderedpeeps, currentHead).then(
              headHash => {
                logger.info("chain finished. New head=%s", headHash);
                db.put("currenthead", headHash, err => {
                  return resolve(headHash);
                });
              }
            );
          });

          // this.chainPeeps(peepkeys).then(key => {
          //   resolve(orderedpeeps[key]);
          // });

          // this.throttledIPFS.ipfs.add(
          //   Buffer.from(JSON.stringify(users)),
          //   function(err, files) {
          //     if (!err && files && files[0]) {
          //       logger.info("saved users on IPFS %s", files[0].hash);
          //     } else {
          //       logger.error(err);
          //     }
          //   }
          // );
        });
    });
  }

  chainPeeps(peepkeys, peepkeymap, parentHash) {
    return new Promise(resolve => {
      if (peepkeys.length === 0) {
        return resolve(parentHash);
      } else {
        logger.info("%d peeps remaining", peepkeys.length);
      }
      let key = peepkeys.pop();
      logger.info("fetching peep %s", peepkeymap[key]);
      db.get("peep-" + peepkeymap[key], (err, value) => {
        if (err) {
          if (err.notFound) {
            return;
          }
        }
        value = JSON.parse(value);
        //debugger;
        logger.info(
          "peep found. %s date %s",
          value.ipfsHash,
          new Date(value.ipfsData.untrustedTimestamp * 1000).toString()
        );
        //value.parentHash = null;
        //debugger;
        if (!value.parentHash) {
          //debugger;
          value.parentHash = parentHash; //peepkeymap[peepkeys[peepkeys.length-1]];
          this.throttledIPFS.ipfs.add(
            Buffer.from(JSON.stringify(value)),
            (err, files) => {
              if (!err && files && files[0]) {
                db.put("peep-" + key, JSON.stringify(value), err => {
                  if (err) {
                    logger.error(err);
                  }
                  logger.info(
                    "saved peep. metadata-hash=%s -> parent=%s",
                    files[0].hash,
                    value.parentHash
                  );
                  return resolve(
                    this.chainPeeps(peepkeys, peepkeymap, files[0].hash)
                  );
                });
              } else {
                logger.error(err);
              }
            }
          );
        } else {
          logger.info("found link => %s, skip.", value.parentHash);
          return resolve(
            this.chainPeeps(peepkeys, peepkeymap, value.parentHash)
          );
        }
      });
    });
  }

  // Decodes blockchain event data and feeds each event to the parser
  parseEvent(event) {
    //logger.info("Parse event %j", event);
    this.web3.eth
      .getTransaction(event.transactionHash)
      .then(transaction => {
        if (transaction.blockNumber > this.highestBlock) {
          this.lastReadBlock = transaction.blockNumber;
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

        let eventData = {
          event: event,
          transaction: transaction,
          function: decodedData
        };

        switch (decodedData.name) {
          case "updateAccount":
          case "reply":
          case "share":
          case "saveBatch":
          case "post":
          case "createAccount":
          case "tip":
            // these are functions that have an IPFS payload that needs to be resolved
            eventData.ipfsHash = decodedData.params.find(function(element) {
              return element.name === "_ipfsHash";
            }).value;
            if (!eventData.ipfsHash) {
              //              logger.error("peep expected IPFS hash - none given %j", eventData);
              if (parsers[decodedData.name]) {
                parsers[decodedData.name](
                  {
                    throttledIPFS: this.throttledIPFS,
                    web3: this.web3
                  },
                  eventData
                );
              } else {
                logger.warn("No parser for function %s", decodedData.name);
                process.exit();
              }
            } else {
              this.throttledIPFS.cat(eventData.ipfsHash).then(ipfsData => {
                eventData.ipfsData = JSON.parse(ipfsData.toString());
                if (parsers[decodedData.name]) {
                  parsers[decodedData.name](
                    {
                      throttledIPFS: this.throttledIPFS,
                      web3: this.web3
                    },
                    eventData
                  );
                } else {
                  logger.warn("No parser for function %s", decodedData.name);
                  process.exit();
                }
              });
            }
            break;

          case "unFollow":
          case "setIsActive":
          case "follow":
          case "changeName":
          case "setNewAddress":
          case "newAddress":
          case "transferAccount":
            if (parsers[decodedData.name]) {
              parsers[decodedData.name](
                {
                  throttledIPFS: this.throttledIPFS,
                  web3: this.web3
                },
                eventData
              );
            } else {
              logger.warn("No parser for function %s", decodedData.name);
              process.exit();
            }
            break;

          case "cashout":
          case "setMinSiteTipPercentage":
          case "lockMinSiteTipPercentage":
          case "transferOwnership":
            // ignore these
            break;

          //   case "post":
          //   case "reply":
          //     var hash = decodedData.params.find(function(element) {
          //       return element.name === "_ipfsHash";
          //     }).value;
          //     this.throttledIPFS.cat(hash).then(ipfsData => {
          //       logger.info("command=%s - Data=%s", decodedData.name, ipfsData);
          //     });
          //     //            this.parsePeep(found.value);
          //     break;
          //   case "saveBatch":
          //     var hash = decodedData.params.find(function(element) {
          //       return element.name === "_ipfsHash";
          //     }).value;
          //     this.throttledIPFS.cat(hash).then(ipfsData => {
          //       logger.info("command=%s - Data=%s", decodedData.name, ipfsData);
          //       const s = JSON.parse(ipfsData.toString());
          //       if (s.batchSaveJSON && Array.isArray(s.batchSaveJSON)) {
          //         s.batchSaveJSON.forEach(batchItem => {
          //           const command = Object.keys(batchItem)[0];
          //           switch (command) {
          //             case "follow":
          //             case "unfollow":
          //             case "changeName":
          //               break;
          //             case "peep":
          //               if (batchItem[command].ipfs) {
          //                 this.parsePeep(batchItem[command].ipfs);
          //               }
          //               break;
          //             case "love":
          //               if (batchItem[command].messageID) {
          //                 this.parsePeep(batchItem[command].messageID);
          //               }
          //               break;
          //             default:
          //               logger.warn("unknown function %s %j", command, batchItem);
          //               process.exit();
          //               break;
          //           }
          //         });
          //       }
          //     });
          //     break;
          //   case "share":
          //     var hash = decodedData.params.find(function(element) {
          //       return element.name === "_ipfsHash";
          //     }).value;
          //     this.throttledIPFS.cat(hash).then(ipfsData => {
          //       logger.info("command=%s - Data=%s", decodedData.name, ipfsData);
          //     });
          //     // options.pinner
          //     //   .pin(metaData.contract, found.value, this.defaultTtl)
          //     //   .then(() => {
          //     //     this.pinCount++;
          //     //   })
          //     //   .catch(e => {
          //     //     logger.warn("Error pinning: %s", e.message);
          //     //   });
          //     // this.throttledIPFS.cat(hash).then(ipfsData => {
          //     //   const s = JSON.parse(ipfsData.toString());
          //     //   if (s.pic && s.pic != "") {
          //     //     this.picHashes.push(s.pic);
          //     //     // options.pinner
          //     //     //   .pin(metaData.contract, s.pic, this.defaultTtl)
          //     //     //   .then(() => {
          //     //     //     this.pinCount++;
          //     //     //   })
          //     //     //   .catch(e => {
          //     //     //     logger.warn("Error pinning: %s", e.message);
          //     //     //   });
          //     //   }
          //     //   if (s.shareID && s.shareID != "") {
          //     //     // options.pinner
          //     //     //   .pin(metaData.contract, s.shareID, this.defaultTtl)
          //     //     //   .then(() => {
          //     //     //     this.pinCount++;
          //     //     //   })
          //     //     //   .catch(e => {
          //     //     //     logger.warn("Error pinning: %s", e);
          //     //     //   });
          //     //   }
          //     // });
          //     break;
          //   case "love":
          //     var found = decodedData.params.find(function(element) {
          //       return element.name === "messageID";
          //     });
          //     // options.pinner
          //     //   .pin(metaData.contract, found.value, this.defaultTtl)
          //     //   .then(() => {
          //     //     this.pinCount++;
          //     //   })
          //     //   .catch(e => {
          //     //     logger.warn("Error pinning: %s", e.message);
          //     //   });
          //     break;
          //   case "follow":
          //   case "unFollow":
          //   case "changeName":
          //     // no IPFS involved here..
          //     break;
          default:
            logger.warn("unknown function %s", decodedData.name);
            process.exit();
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
