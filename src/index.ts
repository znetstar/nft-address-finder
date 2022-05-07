import * as uuid from 'uuid';
import axios from 'axios';

const MINT_TO = '6AuM4xMCPFhR';
const DEFAULT_MAX_HOPS = 10;
const DEFAULT_TRANSACTION_DATA_BATCH_SIZE = 50;
const DEFAULT_CONFIRMED_SIGNATURE_LIMIT = 1000;
const DEFAULT_RPC_URL = 'https://explorer-api.mainnet-beta.solana.com/';
const SystemAccounts = [
  "11111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "SysvarRent111111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
];

type SignatureResult = { signature: string, err: unknown };


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
    {
      responseType: 'json'
    }
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
 * Returns all the transactions associated with a given address, looping through batches of 1000 until reaching `maxHops`
 * @param nftAddress
 * @param rpcUrl
 */
export async function getAllConfirmedSignaturesForAddress2(nftAddress: string, rpcUrl: string = DEFAULT_RPC_URL, maxHops: number = DEFAULT_MAX_HOPS) {
  let results: SignatureResult[] = [];
  let currentBatch: SignatureResult[]|null = null;

  let currentHop = 0;
  while (currentHop++ < maxHops && (currentBatch === null || currentBatch.length)) {
    currentBatch =  await rpcInvoke<SignatureResult[]>(
      'getConfirmedSignaturesForAddress2',
      [
        nftAddress,
        results.slice(-1)[0]?.signature ? { before: results.slice(-1)[0]?.signature, limit: DEFAULT_CONFIRMED_SIGNATURE_LIMIT } : { limit: DEFAULT_CONFIRMED_SIGNATURE_LIMIT }
      ],
      rpcUrl
    );
    results.push(...currentBatch);
  }

  return results;
}

/**
 * @author https://stackoverflow.com/a/64543086/17835333
 */
async function promiseAllInBatches<T, R>(task: (item: T) => Promise<R>, items: T[], batchSize: number): Promise<R[]> {
  let position = 0;
  let results = [];
  while (position < items.length) {
    const itemsForBatch = items.slice(position, position + batchSize);
    results = [...results, ...await Promise.all(itemsForBatch.map(item => task(item)))];
    position += batchSize;
  }
  return results;
}

export interface TransactionCache {
  set: (signature: string, transaction: GetConfirmedTransactionResponse) => Promise<void>;
  get: (signature: string) => Promise<GetConfirmedTransactionResponse|null>;
}

type FindNFTAddressOptions = {
  /**
   * The maximum number of recursive iterations through the blockchain to find transactions (going back in time)
   */
  maxHops: number,
  /**
   * The maximum number of requests to get full transaction data made in parallel
   */
  transactionDataBatchSize: number,
  /**
   * An optional cache to store transaction data. It's up to you to implement the caching mechanism.
   */
  cache?: TransactionCache
}

/**
 * Returns the Solana addresses for a master NFT and all of its minted prints
 * @param nftAddress - Any address associated with the NFT, such as a print's address or a token association account address
 * @param rpcUrl - URL to the Solana RPC endpoint
 * @param opts - Additional options
 */
export async function findNftAddresses(nftAddress: string, rpcUrl: string = DEFAULT_RPC_URL, opts: FindNFTAddressOptions = { maxHops: DEFAULT_MAX_HOPS, transactionDataBatchSize: DEFAULT_TRANSACTION_DATA_BATCH_SIZE }): Promise<FindNFTAddressesResponse> {
  let lastSignature = nftAddress;

  const { maxHops, transactionDataBatchSize, cache } = opts;

  let getConfirmedTransaction = async (signature: string) => {
    let transaction: GetConfirmedTransactionResponse|null = cache ? await cache.get(signature) : null;
    if (!transaction) {
      transaction = await rpcInvoke<GetConfirmedTransactionResponse>('getConfirmedTransaction', [signature], rpcUrl);
      cache && await cache.set(signature, transaction);
    }
    return transaction as GetConfirmedTransactionResponse;
  }

  // If the input address is an account address we need the oldest signature associated with the account
  if (nftAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
    const signatures = await getAllConfirmedSignaturesForAddress2(nftAddress, rpcUrl, maxHops);
    const {signature} = signatures.slice(-1)[0];
    lastSignature = signature;
  }

  // Get the transaction and the index of the "MintTo" instruction
  const transaction = await getConfirmedTransaction(lastSignature);
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

  const transactionSignaturesToProcess = tokenSignatures.filter((s) => !s.err);

  // Get each full transaction, and return only the second and fourth account inputs
  const addressesKeyValue = new Map<string, string>(await promiseAllInBatches(async ({ signature }) => {
    const transaction = await getConfirmedTransaction(signature);

    return transaction?.transaction?.message?.accountKeys.slice(1, 3) as [ string, string ];
  }, transactionSignaturesToProcess, transactionDataBatchSize));

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
