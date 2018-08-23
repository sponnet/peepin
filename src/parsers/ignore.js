const logger = require("../logger");

module.exports = (data) =>{
    return new Promise((resolve,reject)=>{
        logger.info('ignoring Event for function %s',data.name);
        resolve();
    });
}