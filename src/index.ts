import * as uuid from 'uuid';
import axios from 'axios';

async function rpcInvoke<T>(
  method: string,
  params: unknown[],
  rpcUrl: string
): Promise<T> {
  const resp = await axios.post(
    rpcUrl,
    {
      jsonrpc: '2.0',
      method,
      params,
      id: uuid.v4()
    },
    { responseType: 'json' }
  );

  if (resp.data.error) {
    throw resp.data.error;
  } else {
    return resp.data.result as T;
  }
}

interface FindNFTAddressesResponse {
  printAddresses: string[];
  masterAddress: string;
}

interface GetConfirmedTransactionResponse {
  transaction: { message: { accountKeys: string[], instructions: { data: string, accounts: number[] }[] } };
}

/**
 * Returns the Solana addresses for a master NFT and all of its minted prints
 * @param nftAddress - Any address associated with the NFT, such as a print's address or a token association account address
 * @param rpcUrl - URL to the Solana RPC endpoint
 */
export async function findNftAddresses(nftAddress: string, rpcUrl: string = 'https://explorer-api.mainnet-beta.solana.com/'): Promise<FindNFTAddressesResponse> {
  const signatures = await rpcInvoke<{ signature: string }[]>(
    'getConfirmedSignaturesForAddress2',
    [nftAddress],
    rpcUrl
  );
  const { signature: lastSignature } = signatures.slice(-1)[0];

  const transaction = await rpcInvoke<GetConfirmedTransactionResponse>('getConfirmedTransaction', [lastSignature], rpcUrl);

  const accounts = await transaction?.transaction?.message?.accountKeys;
  const indexOfIndexInstruction = transaction.transaction.message.instructions.map(i => i.data).indexOf('6AuM4xMCPFhR');
  const instructionAfterIndex = transaction.transaction.message.instructions[indexOfIndexInstruction + 1];
  const indexAddress = accounts[instructionAfterIndex.accounts.length > 9 ? instructionAfterIndex.accounts[8] : transaction.transaction.message.instructions[indexOfIndexInstruction].accounts[1]];

  const tokenSignatures = await rpcInvoke<{ signature: string }[]>(
    'getConfirmedSignaturesForAddress2',
    [indexAddress],
    rpcUrl
  );

  const addresses = await Promise.all(
    tokenSignatures.map(async ({ signature }) => {
      const transaction = await rpcInvoke<GetConfirmedTransactionResponse>('getConfirmedTransaction', [signature], rpcUrl);

      return transaction?.transaction?.message?.accountKeys[1];
    })
  );


  return {
    masterAddress: addresses.pop(),
    printAddresses: addresses
  }
}
