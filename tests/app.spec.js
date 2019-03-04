'use strict';

const {describe, it} = require('mocha');
const {assert} = require('chai');
const sinon = require('sinon').createSandbox();
const debug = require('debug')('application:test');

const factory = require('./testFactory');
const {pseudoRandomBuffer, generateAddress} = require('./testUtil');

const createGenesis = (factory, utxoHash) => {
    const patch = new factory.PatchDB(0);
    const keyPair = factory.Crypto.createKeyPair();
    const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

    // create "genesis"
    const coins = new factory.Coins(100000, buffAddress);
    patch.createCoins(utxoHash, 12, coins);
    patch.createCoins(utxoHash, 0, coins);
    patch.createCoins(utxoHash, 80, coins);

    const storage = new factory.Storage();
    storage.applyPatch(patch);

    return {storage, keyPair};
};

describe('Application layer', () => {
    before(async function() {
        this.timeout(15000);
        await factory.asyncLoad();
    });

    after(async function() {
        this.timeout(15000);
    });

    it('should create instance', async () => {
        new factory.Application();
    });

    it('should processTxInputs', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenesis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 12);
        tx.addInput(utxoHash, 0);
        tx.addInput(utxoHash, 80);
        tx.addReceiver(1000, buffAddress);
        tx.sign(0, keyPair.privateKey);
        tx.sign(1, keyPair.privateKey);
        tx.sign(2, keyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const patch = await storage.getUtxosPatch(tx.utxos);

        await app.processTxInputs(tx, patch);
    });

    it('should process TX', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenesis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 12);
        tx.addInput(utxoHash, 0);
        tx.addInput(utxoHash, 80);
        tx.addReceiver(1000, buffAddress);
        tx.sign(0, keyPair.privateKey);
        tx.sign(1, keyPair.privateKey);
        tx.sign(2, keyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const patchUtxos = await storage.getUtxosPatch(tx.utxos);

        const {patch} = app.processTxInputs(tx, patchUtxos);
        app.processPayments(tx, patch);
    });

    it('should throw (wrong UTXO index -> no coins)', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenesis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 17);
        tx.addReceiver(1000, buffAddress);
        tx.sign(0, keyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const patchUtxos = await storage.getUtxosPatch(tx.utxos);

        try {
            app.processTxInputs(tx, patchUtxos);
        } catch (e) {
            debug(e);
            assert.equal(e.message, `Output #17 of Tx ${utxoHash} already spent!`);
            return;
        }
        throw new Error('Unexpected success');
    });

    it('should throw (bad claim)', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenesis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);
        const anotherKeyPair = factory.Crypto.createKeyPair();

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 12);
        tx.addReceiver(100000, buffAddress);
        tx.sign(0, anotherKeyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const patchUtxos = await storage.getUtxosPatch(tx.utxos);

        try {
            app.processTxInputs(tx, patchUtxos);
        } catch (e) {
            debug(e);
            assert.equal(e.message, 'Claim failed!');
            return;
        }
        throw new Error('Unexpected success');
    });

    it('should process TX from GENESIS block', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenesis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);
        const anotherKeyPair = factory.Crypto.createKeyPair();

        // create tx
        const tx = new factory.Transaction();
        tx.addReceiver(100000, buffAddress);
        tx.sign(0, anotherKeyPair.privateKey);

        const patch = new factory.PatchDB(0);

        app.processPayments(tx, patch);

        assert.equal(patch.getCoins().size, 1);
        const utxo = patch.getUtxo(tx.hash());
        assert.isOk(utxo);
        assert.isNotOk(utxo.isEmpty());
    });

    it('should NOT process TX (bad 2nd input)', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenesis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 12);
        tx.addInput(utxoHash, 12);
        tx.addReceiver(1000, buffAddress);
        tx.sign(0, keyPair.privateKey);
        tx.sign(1, keyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const patchUtxos = await storage.getUtxosPatch([utxoHash]);

        try {
            app.processTxInputs(tx, patchUtxos);
        } catch (e) {
            debug(e);
            assert.equal(e.message, `Tx ${utxoHash} index 12 already deleted!`);
            return;
        }
        throw new Error('Unexpected success');
    });

    it('should NOT process 2nd TX (simulate block exec)', async () => {
        const app = new factory.Application();

        const utxoHash = pseudoRandomBuffer().toString('hex');
        const {storage, keyPair} = createGenesis(factory, utxoHash);
        const buffAddress = factory.Crypto.getAddress(keyPair.publicKey, true);

        // create tx
        const tx = new factory.Transaction();
        tx.addInput(utxoHash, 12);
        tx.addReceiver(1000, buffAddress);
        tx.sign(0, keyPair.privateKey);

        // get utxos from storage, and form object for app.processTx
        const patchUtxos = await storage.getUtxosPatch(tx.utxos);
        const {patch} = app.processTxInputs(tx, patchUtxos);
        app.processPayments(tx, patch);

        // create tx
        const keyPair2 = factory.Crypto.createKeyPair();
        const buffAddress2 = factory.Crypto.getAddress(keyPair2.publicKey, true);
        const tx2 = new factory.Transaction();
        tx2.addInput(utxoHash, 12);
        tx2.addReceiver(1000, buffAddress2);
        tx2.sign(0, keyPair.privateKey);

        const patchUtxos2 = await storage.getUtxosPatch(tx2.utxos);

        try {
            const patchMerged = patch.merge(patchUtxos2);
            app.processTxInputs(tx2, patchMerged);
        } catch (e) {
            debug(e);
            assert.equal(e.message, `Output #12 of Tx ${utxoHash} already spent!`);
            return;
        }
        throw new Error('Unexpected success');
    });

    it('should create contract', async () => {
        const app = new factory.Application();
        const strGetDataCode = `getData(){
                return this._data;
            }`;
        const strFunc2Code = `getAnother(){
                return this._data;
            }`;
        const strCode = `
            class A extends Base{
                constructor(param){
                    super();
                    this._data=param;
                    this._contractAddr=contractAddr;
                }
                
                ${strGetDataCode}
                ${strFunc2Code}
                
                set data(value){
                    return this._data=value;
                }
                
                get data(){
                    return this._data;
                }
            };
            
            exports=new A(10);
            `;
        const tx = factory.Transaction.createContract(strCode, 100000, generateAddress());
        const env = {
            contractTx: tx.hash(),
            contractAddr: factory.Crypto.getAddress(tx.hash())
        };
        const {receipt, contract} = app.createContract(1e5, tx.getContractCode(), env);

        assert.equal(receipt.getStatus(), factory.Constants.TX_STATUS_OK);
        assert.equal(receipt.getCoinsUsed(), factory.Constants.MIN_CONTRACT_FEE);
//        assert.isOk(Array.isArray(receipt.getInternalTxns()));
//        assert.equal(receipt.getInternalTxns().length, 1);
        assert.deepEqual(contract.getData(), {_data: 10, _contractAddr: contract.getStoredAddress()});

        const resultCode = [strGetDataCode, strFunc2Code]
            .join(factory.Constants.CONTRACT_METHOD_SEPARATOR);
        assert.equal(contract.getCode(), resultCode);
    });

    it('should run contract', async () => {
        const groupId = 10;
        const contract = new factory.Contract({
            contractData: {value: 100},
            contractCode: 'add(a){this.value+=a;}',
            groupId
        });
        const app = new factory.Application();

        const receipt = await app.runContract(1e5, 'add(10)', contract, {});

        assert.equal(receipt.getStatus(), factory.Constants.TX_STATUS_OK);
        assert.equal(receipt.getCoinsUsed(), factory.Constants.MIN_CONTRACT_FEE);
        assert.deepEqual(contract.getData(), {value: 110});
    });

    it('should throw (unknown method)', async () => {
        const groupId = 10;
        const contract = new factory.Contract({
            contractData: {value: 100},
            contractCode: 'add(a){this.value+=a;}',
            groupId
        });
        const app = new factory.Application();

        const receipt = await app.runContract(1e5, 'subtract(10)', contract, {});
        assert.equal(receipt.getStatus(), factory.Constants.TX_STATUS_FAILED);
        assert.equal(receipt.getCoinsUsed(), factory.Constants.MIN_CONTRACT_FEE);
        assert.deepEqual(contract.getData(), {value: 100});
    });

    it('should throw (no default function)', async () => {
        const groupId = 10;
        const contract = new factory.Contract({
            contractData: {value: 100},
            contractCode: 'add(a){this.value+=a;}',
            groupId
        });
        const app = new factory.Application();

        const receipt = await app.runContract(1e5, '', contract, {});
        assert.equal(receipt.getStatus(), factory.Constants.TX_STATUS_FAILED);
        assert.equal(receipt.getCoinsUsed(), factory.Constants.MIN_CONTRACT_FEE);
        assert.deepEqual(contract.getData(), {value: 100});
    });

    it('should call default function', async () => {
        const groupId = 10;
        const contract = new factory.Contract({
            contractData: {value: 100},
            contractCode: '_default(){this.value+=17;}',
            groupId
        });
        const app = new factory.Application();

        const receipt = await app.runContract(1e5, '', contract, {});
        assert.equal(receipt.getStatus(), factory.Constants.TX_STATUS_OK);
        assert.equal(receipt.getCoinsUsed(), factory.Constants.MIN_CONTRACT_FEE);
        assert.deepEqual(contract.getData(), {value: 117});
    });
});
