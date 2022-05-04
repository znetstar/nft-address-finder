import * as uuid from 'uuid';
import axios from 'axios';

const MINT_TO = '6AuM4xMCPFhR';
const DEFAULT_MAX_HOPS = 10;
const DEFAULT_RPC_URL = 'https://explorer-api.mainnet-beta.solana.com/';
const SystemAccounts = [
  "11111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "SysvarRent111111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
];

type SignatureResult = { signature: string };


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
  meta: {
    postTokenBalances: ({ accountIndex: number, mint: string })[]
  },
  transaction: { message: { accountKeys: string[], instructions: { data: string, accounts: number[] }[] } };
}

/***
 * Returns an iterator that returns the transactions associated with a given address in batches of 1000, up to `maxHops`
 * @param nftAddress
 * @param rpcUrl
 * @param maxHops
 */
export async function* getConfirmedSignaturesForAddress2(nftAddress: string, rpcUrl: string = DEFAULT_RPC_URL, maxHops: number = DEFAULT_MAX_HOPS) {
  let signatures: SignatureResult[] = [];
  let last: SignatureResult;
  let load = async () => {
    const arr = await rpcInvoke<SignatureResult[]>(
      'getConfirmedSignaturesForAddress2',
      [nftAddress, { before: last ? last.signature : void(0), limit: 1000 }],
      rpcUrl
    );

    return arr.length ? arr : null;
  }

  let currentHop = 0;
  while (signatures = await load()) {
    let $last: SignatureResult;
    while ($last = signatures.shift()) {
      last = $last;
      yield $last;
    }

    if (currentHop++ > maxHops)
      break;
  }
}

/***
 * Returns all the transactions associated with a given address, looping through batches of 1000 until reaching `maxHops`
 * @param nftAddress
 * @param rpcUrl
 */
export async function getAllConfirmedSignaturesForAddress2(nftAddress: string, rpcUrl: string = DEFAULT_RPC_URL, maxHops: number = DEFAULT_MAX_HOPS) {
  let results: SignatureResult[] = [];

  for await (const result of getConfirmedSignaturesForAddress2(nftAddress, rpcUrl, maxHops)) {
    results.push(result);
  }

  return results;
}

/**
 * Returns the Solana addresses for a master NFT and all of its minted prints
 * @param nftAddress - Any address associated with the NFT, such as a print's address or a token association account address
 * @param rpcUrl - URL to the Solana RPC endpoint
 */
export async function findNftAddresses(nftAddress: string, rpcUrl: string = DEFAULT_RPC_URL, maxHops: number = DEFAULT_MAX_HOPS): Promise<FindNFTAddressesResponse> {
  let lastSignature = nftAddress;

  // If the input address is an account address we need the oldest signature associated with the account
  if (nftAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
    const signatures = await getAllConfirmedSignaturesForAddress2(nftAddress, rpcUrl, maxHops);
    const {signature} = signatures.slice(-1)[0];
    lastSignature = signature;
  }

  // Get the transaction and the index of the "MintTo" instruction
  const transaction = await rpcInvoke<GetConfirmedTransactionResponse>('getConfirmedTransaction', [lastSignature], rpcUrl);
  const accounts = transaction.transaction.message.accountKeys;
  const indexOfIndexMintingInstruction = transaction.transaction.message.instructions.map(i => i.data).indexOf(MINT_TO);

  // Take the instruction after "MintTo" which should interact with "Metaplex Token Metadata"
  const instructionAfterIndex = transaction.transaction.message.instructions[indexOfIndexMintingInstruction + 1];
  let indexAddress: string;

  // If the instruction has at least 9 inputs, we're good to go
  if (instructionAfterIndex.accounts.length >= 9) {
    // We need to find the oldest address that isn't a system address
    for (const addrIndex of instructionAfterIndex.accounts.slice(0).reverse()) {
      const addr = accounts[addrIndex];
      if (!SystemAccounts.includes(addr)) {
        indexAddress = addr;

        break;
      }
    }
  }
  // If there are less than 9 inputs, we'll take the second account of the "MintTo" instruction
  else {
    indexAddress = accounts[transaction.transaction.message.instructions[indexOfIndexMintingInstruction].accounts[1]];
  }

  // Find all transactions related to the "indexAddress"
  // these will be transactions corresponding to minting the master and each individual print
  const tokenSignatures = await getAllConfirmedSignaturesForAddress2(
    indexAddress,
    rpcUrl,
    maxHops
  );

  // Get each full transaction, and return only the second and fourth account inputs
  const addressesKeyValue = new Map<string, string>(await Promise.all(
    tokenSignatures.map(async ({ signature }) => {
      const transaction = await rpcInvoke<GetConfirmedTransactionResponse>('getConfirmedTransaction', [signature], rpcUrl);

      return transaction?.transaction?.message?.accountKeys.slice(1, 3) as [ string, string ];
    })
  ));

  // If the fourth account input is the second account input in any of the transactions
  // then that second account input isn't a token but an associated token account. We'll delete those.
  for (let v of Array.from(addressesKeyValue.values())) {
    addressesKeyValue.delete(v);
  }

  // Return only the second account inputs
  const addresses = Array.from(addressesKeyValue.keys());

  // The oldest of the second account inputs will be the master address, and all others are prints in descending order
  // of their minting
  return {
    masterAddress: addresses.pop(),
    printAddresses: addresses
  }
}
