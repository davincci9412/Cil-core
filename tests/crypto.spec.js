const {describe, it} = require('mocha');
const {assert} = require('chai');

const Crypto = require('../crypto/crypto');
const {prepareForStringifyObject} = require('../utils');

describe('Crypto library', () => {
    before(async function() {
        this.timeout(15000);
    });

    after(async function() {
        this.timeout(15000);
    });

    it('create KeyPair from private key (hex)', async () => {
        const strPrivKey = 'b7760a01705490e5e153a6ef7732369a72dbf9aaafb5c482cdfd960546909ec1';
        const strPublicKey = '03ee7b7818bdc27be0030c2edf44ec1cce20c1f7561fc8412e467320b77e20f716';
        const address = '6e2a3a4b77e682b6b9dda5a889304a9d80e4a9c7';
        const keyPair = Crypto.keyPairFromPrivate(strPrivKey, 'hex');

        assert.equal(strPrivKey, keyPair.getPrivate());
        assert.equal(address, Crypto.getAddress(keyPair.publicKey));
        assert.equal(strPublicKey, keyPair.getPublic());
    });

    it('should create signature', async () => {
        const strPrivKey = 'b7760a01705490e5e153a6ef7732369a72dbf9aaafb5c482cdfd960546909ec1';
        const keyPair = Crypto.keyPairFromPrivate(strPrivKey, 'hex');

        const buffSignature1 = Crypto.sign('string', keyPair.getPrivate(), 'hex');
        assert.isOk(Buffer.isBuffer(buffSignature1));
        assert.equal(buffSignature1.length, 65);
    });

    it('sign & verify string', async () => {
        const keyPair = Crypto.createKeyPair();

        const buffSignature = Crypto.sign('string', keyPair.getPrivate(), 'hex');
        assert.isOk(Crypto.verify('string', buffSignature, keyPair.getPublic(), 'hex'));
    });

    it('encrypt/decrypt key (pbkdf2)', async () => {
        const keyPair = Crypto.createKeyPair();
        const strPrivKey = keyPair.getPrivate();
        const objEncryptedKey = await Crypto.encrypt(
            '234',
            Buffer.from(strPrivKey, 'hex'),
            'pbkdf2'
        );

        console.log(strPrivKey);
        console.dir(prepareForStringifyObject(objEncryptedKey), {colors: true, depth: null});

        {
            // from object
            const decryptedKey = await Crypto.decrypt('234', objEncryptedKey);
            assert.equal(strPrivKey, decryptedKey.toString('hex'));
        }
        {
            // from stringifyed options
            const decryptedKey = await Crypto.decrypt('234', prepareForStringifyObject(objEncryptedKey));
            assert.equal(strPrivKey, decryptedKey.toString('hex'));
        }
    });

    it('encrypt/decrypt key (scrypt)', async function() {
        this.timeout(10000);
        const keyPair = Crypto.createKeyPair();
        const strPrivKey = keyPair.getPrivate();
        const objEncryptedKey = await Crypto.encrypt(
            '234',
            Buffer.from(strPrivKey, 'hex'),
            'scrypt'
        );

        {
            // from object
            const decryptedKey = await Crypto.decrypt('234', objEncryptedKey);
            assert.equal(strPrivKey, decryptedKey.toString('hex'));
        }
        {
            // from stringified options
            const decryptedKey = await Crypto.decrypt('234', prepareForStringifyObject(objEncryptedKey));
            assert.equal(strPrivKey, decryptedKey.toString('hex'));
        }
    });

    it('Decrypt wrong key (wrong password)', async function() {
        this.timeout(15000);
        const keyPair = Crypto.createKeyPair();
        const strPrivKey = keyPair.getPrivate();
        const objEncryptedKey = await Crypto.encrypt(
            '234',
            Buffer.from(strPrivKey, 'hex')
        );

        const decryptedKey = await Crypto.decrypt('111', objEncryptedKey);
        assert.isNotOk(decryptedKey.equals(Buffer.from(strPrivKey, 'hex')));
    });

    it('Fail to decrypt (padded data + wrong password)', async function() {
        this.timeout(15000);
        const strPrivKey = 'Some key';
        const objEncryptedKey = await Crypto.encrypt(
            '234',
            Buffer.from(strPrivKey)
        );

        const decryptedKey = await Crypto.decrypt('111', objEncryptedKey);
        assert.isNotOk(decryptedKey);
    });

    it('should recover public key from signature buffer', async () => {
        const keyPair = Crypto.createKeyPair();

        msg = 'string';
        const buffSignature = Crypto.sign(msg, keyPair.getPrivate(), 'hex');
        const pubKey = Crypto.recoverPubKey(msg, buffSignature);
        assert.isOk(pubKey);
        assert.isOk(typeof pubKey === 'string');
        assert.equal(keyPair.getPublic(), pubKey);
    });

    it('should get ADDRESS', async () => {
        const keyPair = Crypto.createKeyPair();

        assert.isOk(Buffer.isBuffer(keyPair.getAddress()));
        assert.isOk(typeof keyPair.address === 'string');

        assert.equal(keyPair.address, Crypto.getAddress(keyPair.publicKey, false));
    });
});
