const logger = require("../logger");

module.exports = (data) =>{
    return new Promise((resolve,reject)=>{
        logger.info('ignoring %j',data);
        resolve();
    });
}