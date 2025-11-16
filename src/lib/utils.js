const crypto = require('crypto')

function generateAccessCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    const randomValues = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
        code += chars[randomValues[i] % chars.length];
    }
    return code;
}

function _snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function snakeToCamel(param) {
    if (param === null || param === undefined) return param;

    if (Array.isArray(param)) {
        return param.map(snakeToCamel);
    }

    if (typeof param === 'object' && param.constructor === Object) {
        return Object.keys(param).reduce((acc, key) => {
            const newKey = _snakeToCamel(key);
            acc[newKey] = snakeToCamel(param[key]);
            return acc;
        }, {});
    }

    if (typeof param === 'string') {
        return _snakeToCamel(param);
    }

    return param;
}

module.exports = { generateAccessCode, snakeToCamel }
