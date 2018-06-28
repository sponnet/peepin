const metaData = require('./metadata');
const abiDecoder = require('abi-decoder');
const logger = require('./logger');
const web3 = require('./web3');

class Peepin {
	/**
	 * Constructs the object.
	 *
	 * @param      {string}  ipfshost       The ipfs-api host
	 * @param      {string}  ipfsport       The ipfs-api port
	 * @param      {string}  web3socketurl  The Web3 socketurl to use
	 */
	constructor(ipfshost,ipfsport,web3socketurl){
		this.ipfshost = ipfshost;
		this.ipfsport = ipfsport;
		this.web3socketurl = web3socketurl;
	}
	
	/**
	 * Bootstrap
	 *
	 */
	go() {

		const web3 = require('./web3')(this.web3socketurl);		
		
		logger.info('Starting Peepeth pinner on %s ( from block %s)', metaData.contract, metaData.startblock);
		const contract = new web3.eth.Contract(metaData.abi, metaData.contract);

		abiDecoder.addABI(metaData.abi);

		this.highestBlock = 0;
		this.eventCount = 0;
		this.pinCount = 0;
		this.picHashes = [];
		this.defaultTtl = 60 * 60 * 24 * 365 * 10; // 10 years

		contract.events.allEvents({
			fromBlock: metaData.startblock,
		}, (error, result) => {
			if (error == null) {
				web3.eth.getTransaction(result.transactionHash).then((transaction) => {
					if (transaction.blockNumber > this.highestBlock) {
						this.highestBlock = transaction.blockNumber;
					}
					if (!transaction.input) {
						debugger;
					}
					let decodedData;
					try {
						decodedData = abiDecoder.decodeMethod(transaction.input);
					} catch (e) {
						debugger;
					}
					this.eventCount++;

					if (!decodedData || !decodedData.name) {
						debugger;
					}

					switch (decodedData.name) {
						case 'createAccount':
						case 'updateAccount':
						case 'tip':
							var found = decodedData.params.find(function(element) {
								return element.name === '_ipfsHash';
							});
							logger.info('%s - IPFS=%s', decodedData.name, found.value);
							options.pinner.pin(metaData.contract, found.value, this.defaultTtl).then(() => {
								this.pinCount++;
							}).catch((e) => {
								logger.warn('Error pinning: %s', e.message);
							});
							break;
						case 'post':
						case 'reply':
							var found = decodedData.params.find(function(element) {
								return element.name === '_ipfsHash';
							});
							this.parsePeep(found.value);
							break;
						case 'saveBatch':
							var found = decodedData.params.find(function(element) {
								return element.name === '_ipfsHash';
							});
							options.throttledIPFS.cat(found.value).then((file) => {
								const s = JSON.parse(file.toString());
								if (s.batchSaveJSON && Array.isArray(s.batchSaveJSON)) {
									s.batchSaveJSON.forEach((batchItem) => {
										const command = Object.keys(batchItem)[0];
										switch (command) {
											case 'follow':
											case 'unfollow':
											case 'changeName':
												break;
											case 'peep':
												if (batchItem[command].ipfs) {
													this.parsePeep(batchItem[command].ipfs);
												}
												break;
											case 'love':
												if (batchItem[command].messageID) {
													this.parsePeep(batchItem[command].messageID);
												}
												break;
											default:
												logger.warn('unknown function %s %j', command, batchItem);
												process.exit();
												break;
										}
									});
								}
							});
							break;
						case 'share':
							var found = decodedData.params.find(function(element) {
								return element.name === '_ipfsHash';
							});
							options.pinner.pin(metaData.contract, found.value, this.defaultTtl).then(() => {
								this.pinCount++;
							}).catch((e) => {
								logger.warn('Error pinning: %s', e.message);
							});
							options.throttledIPFS.cat(found.value).then((file) => {
								const s = JSON.parse(file.toString());
								if (s.pic && s.pic != "") {
									this.picHashes.push(s.pic);
									options.pinner.pin(metaData.contract, s.pic, this.defaultTtl).then(() => {
										this.pinCount++;
									}).catch((e) => {
										logger.warn('Error pinning: %s', e.message);
									});
								}
								if (s.shareID && s.shareID != "") {
									options.pinner.pin(metaData.contract, s.shareID, this.defaultTtl).then(() => {
										this.pinCount++;
									}).catch((e) => {
										logger.warn('Error pinning: %s', e);
									});
								}
							});
							break;
						case 'love':
							var found = decodedData.params.find(function(element) {
								return element.name === 'messageID';
							});
							options.pinner.pin(metaData.contract, found.value, this.defaultTtl).then(() => {
								this.pinCount++;
							}).catch((e) => {
								logger.warn('Error pinning: %s', e.message);
							});
							break;
						case 'follow':
						case 'unfollow':
						case 'changeName':
							// no IPFS involved here..
							break;
						default:
							logger.warn('unknown function %s (%j)', decodedData.name, decodedData);
							break;
					}
				}).catch((e) => {
					debugger;
				});
			} else {
				logger.error('Error reading event: %s', error.message);
			}
		}).on('error', (e) => {
			logger.error('Error reading event: %s', e.message);
		});
	}



	parsePeep(ipfsHash) {
		this.options.pinner.pin(metaData.contract, ipfsHash, this.defaultTtl)
			.then(() => {})
			.catch((e) => {
				logger.error('pin failed %j', e);
			});
		this.options.throttledIPFS.cat(ipfsHash).then((file) => {
			try {
				const s = JSON.parse(file.toString());
				if (s.pic && s.pic != "") {
					this.picHashes.push(s.pic);
					this.options.pinner.pin(metaData.contract, s.pic, this.defaultTtl).then(() => {
						this.pinCount++;
					}).catch((e) => {
						logger.warn('Error pinning: %s', e.message);
					});
				}
			} catch (e) {
				logger.error('Cannot parse peep %j', e);
			}
		}).catch((e) => {
			logger.error('throttledIPFS.cat failed ! %j', e);
		});
	}

	getStats() {
		if (!this.options) {
			return;
		}
		this.pushManifest();
		return ({
			eventCount: this.eventCount,
			pinCount: this.pinCount,
			highestBlock: this.highestBlock,
			manifest: this.manifestHash,
			picHashes: this.picHashes.length,
		});
	}

	pushManifest() {

		if (this.picHashes.length === 0) {
			return;
		}

		let manifest = JSON.stringify({
			type: 'peepeth-image-manifest',
			highestBlock: this.highestBlock,
			picHashes: this.picHashes,
		});

		this.options.ipfs.add(Buffer.from(manifest, 'utf8')).then((result) => {
			logger.info('manifest saved %s', result[0].hash);
			this.manifestHash = result[0].hash;
		}).catch((e) => {
			logger.error('manifest save failed %j', e);

		});
	}
}

module.exports = Peepin;
