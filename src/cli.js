'use strict';

/**
 * the processor for the command line interface
 *
 */
class CLI {
	/**
	 * construtor
	 *
	 */
	constructor() {
		this.stdout = process.stdout;
	}

	/**
	 * Creates the ipfsconsortium class
	 * Sets up the options from ENV, .ENV file or commandline
	 * Starts the Proxy.
	 *
	 * @param      {Object}  argv    command line parameter set
	 */
	go(argv) {
		// mixin the environment variables defined in .env
		require('dotenv').config({
			path: '.env',
		});

		const tool = require('command-line-tool');
		const cliData = require('./cli-data');
		const Peepin = require('./peepin.js');

		const cli = tool.getCli(cliData.definitions, cliData.usageSections, argv);
		const options = cli.options;


		let proxyOptions = {
			IPFSAPIHOST: options.ipfsapihost || process.env.IPFSAPIHOST,
			IPFSAPIPORT: options.ipfsapiport || process.env.IPFSAPIPORT,
			WEB3HOSTWS: options.web3hostws || process.env.WEB3HOSTWS,
		};

		if (!proxyOptions.IPFSAPIHOST ||
			!proxyOptions.IPFSAPIPORT ||
			!proxyOptions.WEB3HOSTWS
		) {
			options.help = true;
		}

		if (options.help) {
			const os = require('os');
			this.stdout.write(cli.usage + os.EOL);
			return;
		}

		const proxy = new Peepin(
			proxyOptions.IPFSAPIHOST,
			proxyOptions.IPFSAPIPORT,
			proxyOptions.WEB3HOSTWS);
		
		proxy.go();
	}
}

module.exports = CLI;
