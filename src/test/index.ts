import {assert} from 'chai';
import {findNftAddresses} from "../index";

const prints = [
  'AWtH1hJbyJcaHYCqyQ4nMaXLH7Epa1Ly2euvdTY3g4ii'
];

const master = '5uoXhqy2cWcJv3xpoMgbN8PCpvn3o1RiXaaU5PBcvH2A';

const sigs = [
  '3LvNQ5oqhtXM5Fdi22vJPSub2WfcHfg7RVDZ95d5tpmWKceShnnETeXnmZbp7v6Pvc2ofZJSPqHuFxvgauUEAFBx',
  '5MbZD2ij6a579HmESKA8W6Wxhmix3q5j2ajqacjy6wd5aomFRkvWJyxC18Nq5b5UgVsmkAt1aJBAvCuRaLPuywR3'
];

const meta = '3UisUPU7MKKobcaRFHcPHx83M5M5gyh3uR8uMX6hhNQd';

describe('findNftAddresses', async function () {
  this.retries(1);
  it('given a master, should return an object containing an array of prints and a master address', async function () {
    const resp = await findNftAddresses(master, process.env.SOLANA_RPC_MAINNET_URI);
    assert.equal(resp.masterAddress, master);
    assert.deepEqual(resp.printAddresses, prints);
  });

  it('given any of its prints, should return an object containing an array of prints and a master address', async function () {
    for (const print of prints) {
      const resp = await findNftAddresses(print, process.env.SOLANA_RPC_MAINNET_URI);

      assert.equal(resp.masterAddress, master);
      assert.deepEqual(resp.printAddresses, prints);
    }
  });

  it('should return a master/prints given an associated id', async function () {
    const resp = await findNftAddresses(meta, process.env.SOLANA_RPC_MAINNET_URI);
    assert.equal(resp.masterAddress, master);
    assert.deepEqual(resp.printAddresses, prints);
  });

  it('give a signature of a minting transaction, should return an object containing an array of prints and a master address', async function () {
    for (const sig of sigs) {
      const resp = await findNftAddresses(sig, process.env.SOLANA_RPC_MAINNET_URI);

      assert.equal(resp.masterAddress, master);
      assert.deepEqual(resp.printAddresses, prints);
    }
  });
});
