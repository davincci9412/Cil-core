// part of protobuff
const Long = require('long');
const readline = require('readline');
const fs = require('fs');
const commandLineArgs = require('command-line-args');
const v8 = require('v8');

const deepCloneObject = (objToClone) => {
    return v8.deserialize(v8.serialize(objToClone));
};

const arrayIntersection = (array1, array2) => {
    const cache = new Set(array1);
    const result = [];
    for (let elem of array2) if (cache.has(elem)) result.push(elem);
    return result;
};

const prepareForStringifyObject = (obj) => {
    if (!(obj instanceof Object)) return obj;

    if (Buffer.isBuffer(obj)) return obj.toString('hex');
    if (Array.isArray(obj)) return obj.map(elem => prepareForStringifyObject(elem));

    const resultObject = {};
    for (let key of Object.keys(obj)) {
        if (typeof obj[key] === 'function' || typeof obj[key] === 'undefined') continue;

        if (Buffer.isBuffer(obj[key])) {
            resultObject[key] = obj[key].toString('hex');
        } else if (Array.isArray(obj[key])) {
            resultObject[key] = prepareForStringifyObject(obj[key]);
        } else if (Long.isLong(obj[key])) {
            resultObject[key] = obj[key].toNumber();
        } else if (obj[key] instanceof Object) {
            resultObject[key] = prepareForStringifyObject(obj[key]);
        } else {
            resultObject[key] = obj[key];
        }
    }
    return resultObject;
};

/**
 * Duplicates are possible!
 *
 * @param {Array} arrMaps of Maps
 * @return {Array} keys
 */
const getMapsKeys = (...arrMaps) => {
    let arrResultKeys = [];
    for (let map of arrMaps) {
        arrResultKeys = arrResultKeys.concat(Array.from(map.keys()));
    }
    return arrResultKeys;
};

function questionAsync(prompt, password = false) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(prompt, answer => {
            rl.close();
            if (password) {
                if (process.stdout.moveCursor) process.stdout.moveCursor(0, -1);
                if (process.stdout.clearLine) process.stdout.clearLine();
            }
            resolve(answer.trim());
        });
    });
}

function decryptPkFileContent(Crypto, fileContent, password) {
    let objEncodedData;
    let encoding = 'hex';

    try {
        objEncodedData = JSON.parse(fileContent);
    } catch (e) {

        // V1: concatenated salt, iv, base64Encoded
        const salt = fileContent.substr(0, 32);
        const iv = fileContent.substr(32, 32);
        const encrypted = Buffer.from(fileContent.substring(64), 'base64');

        objEncodedData = {
            iv,
            encrypted,
            salt,
            hashOptions: {iterations: 100},
            keyAlgo: 'pbkdf2'
        };

        // decrypted value will be neither 32 byte length buffer, nor hex String of length 64, but 64 byte length Buffer
        encoding = undefined;
    }

    return Crypto.decrypt(password, objEncodedData).toString(encoding);
}

module.exports = {
    sleep: (delay) => {
        return new Promise(resolve => {
            setTimeout(resolve, delay);
        });
    },
    arrayIntersection,

    // order is not guaranteed! only equality of content
    arrayEquals: (array1, array2) => {
        return array1.length === array2.length && arrayIntersection(array1, array2).length === array1.length;
    },

    mergeSets: (set1, set2) => {
        return new Set([...set1, ...set2]);
    },

    getMapsKeys,

    getMapsKeysUnique: (...arrMaps) => {
        let tempSet = new Set(getMapsKeys(...arrMaps));
        return Array.from(tempSet.keys());
    },

    timestamp: () => {
        return parseInt(Date.now() / 1000);
    },

    asyncRPC: fn => (arg, opt, cb) => {
        fn(arg, opt)
            .then(result => cb(null, result))
            .catch(cb);
    },

    readCmdLineOptions: () => {
        const optionDefinitions = [
            {name: "listenAddr", type: String, multiple: false},
            {name: "port", type: Number, multiple: false},
            {name: "seedAddr", type: String, multiple: false},
            {name: "rpcUser", type: String, multiple: false},
            {name: "rpcPass", type: String, multiple: false},
            {name: "rpcPort", type: Number, multiple: false},
            {name: "rpcAddress", type: String, multiple: false},
            {name: "genesisHash", type: String, multiple: false},
            {name: "conciliumDefContract", type: String, multiple: false},
            {name: "privateKey", type: String, multiple: false},
            {name: "dbPath", type: String, multiple: false},
            {name: "seed", type: Boolean, multiple: false},
            {name: "strictAddresses", type: Boolean, multiple: false},
            {name: "txIndex", type: Boolean, multiple: false},
            {name: "watchAddress", type: String, multiple: true},
            {name: "reIndexWallet", type: Boolean, multiple: false},
            {name: "walletSupport", type: Boolean, multiple: false},
            {name: "listWallets", type: Boolean, multiple: false},
            {name: "localDevNode", type: Boolean, multiple: false}
        ];
        return commandLineArgs(optionDefinitions, {camelCase: true});
    },

    prepareForStringifyObject,

    questionAsync,
    deepCloneObject,

    pick(obj, keys) {
        return keys.map(k => k in obj ? {[k]: obj[k]} : {})
            .reduce((res, o) => Object.assign(res, o), {});
    },

    stripAddressPrefix(Constants, strAddr) {
        return strAddr.substring(0, 2) === Constants.ADDRESS_PREFIX ?
            strAddr.substring(Constants.ADDRESS_PREFIX.length)
            : strAddr;
    },

    async readPrivateKeyFromFile(Crypto, path) {
        const encodedContent = fs.readFileSync(path, 'utf8');

        let password;
        if (typeof process.env.PK_PASSWORD !== 'string') {

            // TODO suppress echo
            password = await questionAsync('Enter password to decrypt private key: ', true);
        } else {
            password = process.env.PK_PASSWORD.trim();
        }

        return decryptPkFileContent(Crypto, encodedContent, password);
    },

    decryptPkFileContent
};
