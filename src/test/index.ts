import {assert} from 'chai';
import {findNftAddresses, findNftAddressesCreatedBy} from "../index";

import {
  Metadata
} from '@metaplex-foundation/mpl-token-metadata';

const prints = [
  "A4tFhL2xaeei16RakryJ6DpmoFHrrwcz3AATGnYQRF3a",
  "9zNEuRSg2j23sKP9Y9uF65P83PqjmAbxSZEYj1vVoCtC",
  "726Kr2AP69kFoZTHNWd87bxi7jkyHDRLcFKztQBf9nho"
]

const master = 'FxMhoCbKMxNpBxmySG4mLe9Dd7gmiJXt4FqNxQGyYhpW';

const sigs = [
  'TaMyHAJYB3min4AAKidWeGfmKjFhwykZKWAzpHC8vZnkCAZzkqADwGKu5BAAsNr5xzoJJhhBAjUJjgm7TYooKRa',
  'Wadz3T7SjEgvTezsXDsgkzkrbX98rXgW6s7gn3iLK7RecUmzhLcXFQYSWsr5rxAVyrMNHLSqSCD6nvYGDsv8o2u'
];

const meta = '9Ea9Bfwdbod6mbjXy1xGks1LLwxtucE9aPTjETX5V2U6';

const creatorAddress = 'DznU28LgherhU2JwC2db3KmAeWPqoF9Yx2aVtNUudW6R';
const createdNfts = [
  'Gaurk757HDrKpTGbmS67uTZr7m4aizWDV7rGycYiwYhq',
  '2cRNvzGrSXrzdqL2HTE4o1ahKvxQpEyhBpy1bXwphuQt',
  '6sdDrrEvqFs5zFHysRqBfNczUVbtHPJ9CnmrWaf7xBFY',
  'FykdHTE6DCdkSXpgvYU7fy9qK1LrVjBGAJ3aNRMrJi49',
  '6uEQoxbH4uDbp6TQEjqTDHft8fGyKwA5Rhaj6WXNVqKZ',
  'GeVi9VyG8WcDtG6XYdFLjjk5KyNFMht7o6gLTP89iiNL',
  'J9QoFrmGNWB49dJKUjx6RFwM3nZJz3cqUi2V5kkpRDKA'
].sort();

describe('nft-address-finder', async function () {
  // this.retries(3);
  this.timeout(60e3);
  describe('findNftAddressesCreatedBy', async function () {

    it("give a creator's wallet address, it should return nfts they have created", async function () {
      const { addresses } = await findNftAddressesCreatedBy(creatorAddress, process.env.SOLANA_RPC_MAINNET_URI)

      assert.deepEqual(addresses.sort(), createdNfts);
    });
  });

  describe('findNftAddresses', async function () {
    it('given a master, should return an object containing an array of prints and a master address', async function () {
      const resp = await findNftAddresses(master, process.env.SOLANA_RPC_MAINNET_URI);
      assert.equal(resp.masterAddress, master);
      assert.deepEqual(resp.printAddresses, prints);
    });

    it(`given a master, should the token's metadata program address`, async function () {
      const resp = await findNftAddresses(master, process.env.SOLANA_RPC_MAINNET_URI);
      const addr = await Metadata.getPDA(resp.masterAddress);
      assert.equal(resp.metadataProgramAddress, addr.toBase58());
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

    it('should be able to process a metaplex candy machine nft address', async function () {
      const resp = await findNftAddresses(createdNfts[0], process.env.SOLANA_RPC_MAINNET_URI);
      assert.equal(resp.masterAddress, createdNfts[0]);
    });
  });
});
