const logger = require("../logger");

module.exports = (data) =>{
    return new Promise((resolve,reject)=>{
        logger.info('createAccount parser with data %j',data);
        resolve();
    });
}