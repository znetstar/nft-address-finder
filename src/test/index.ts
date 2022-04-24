import {assert} from 'chai';
import {findNftAddresses} from "../index";

const prints = [
  'GGjvuJHpHVr2p4E194we2FFJbipv5snbTzsV7fyECidA',
  '7V7ALnEVAqgBmy9rUdvBQLQgY4MTL193RwFXKHCjyPVL',
  '4i5nKhjTfuddPLEr2w8bNvUC8VoxT4Lfu4dEsVbsRRzf'
];

const master = '6vCYMSFkpH9oD2f1zFxXTodWnCvPfnt3NofyhbUrZU97';

describe('findNftAddresses', async function () {
  this.retries(5);
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
    const resp = await findNftAddresses('6APj2qGFJx5NDHnP5XVKJbrgK5CyCe4HesCTpSDtztMi', process.env.SOLANA_RPC_MAINNET_URI);
    assert.equal(resp.masterAddress, 'FaFoebQQPQLgvJZUPQym9YL1WgUrJQnoJBZksjAgUCnL');
    assert.deepEqual(resp.printAddresses, ['7tPRGNHzMkUYFUtKxrNGaRrSUgu4eLKtavrB8Ddpy1SP']);
  });
});
