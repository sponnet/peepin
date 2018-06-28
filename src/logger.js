const {
	createLogger,
	format,
	transports,
} = require('winston');

const winstonFormat = format.printf((info) => {
	let level = info.level.toUpperCase();
	let message = info.message;
	let filteredInfo = Object.assign({}, info, {
		'level': undefined,
		'message': undefined,
		'splat': undefined,
		'timestamp': undefined,
	});
	let append = JSON.stringify(filteredInfo, null, 4);
	if (append != '{}') {
		message = message + ' ' + append;
	}
	return `${info.timestamp} ${level} : ${message}`;
});

let logger = createLogger({
	level: 'info',
	format: format.combine(
		format.splat(),
		format.timestamp(),
		winstonFormat
	),
	transports: [new transports.Console()],
});

module.exports = logger;
