import {assert} from 'chai';
import {findNftAddresses} from "../index";

const prints = [
  "A4tFhL2xaeei16RakryJ6DpmoFHrrwcz3AATGnYQRF3a",
  "9zNEuRSg2j23sKP9Y9uF65P83PqjmAbxSZEYj1vVoCtC",
  "BkrS8ZJEXCfXrwN1iSkwWFBSCRKyFJmUcRphSa9hgCo6",
  "726Kr2AP69kFoZTHNWd87bxi7jkyHDRLcFKztQBf9nho"
]

const master = 'FxMhoCbKMxNpBxmySG4mLe9Dd7gmiJXt4FqNxQGyYhpW';

const sigs = [
  'TaMyHAJYB3min4AAKidWeGfmKjFhwykZKWAzpHC8vZnkCAZzkqADwGKu5BAAsNr5xzoJJhhBAjUJjgm7TYooKRa',
  'Wadz3T7SjEgvTezsXDsgkzkrbX98rXgW6s7gn3iLK7RecUmzhLcXFQYSWsr5rxAVyrMNHLSqSCD6nvYGDsv8o2u'
];

const meta = '9Ea9Bfwdbod6mbjXy1xGks1LLwxtucE9aPTjETX5V2U6';

describe('findNftAddresses', async function () {
  this.retries(1);
  this.timeout(60e3);

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
