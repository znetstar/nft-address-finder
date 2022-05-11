import * as uuid from 'uuid';
import axios from 'axios';

const METADATA_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const CANDY_ID = 'cndyAnrLdpjq1Ssp1z8xxDsB8dxe7u4HL5Nxi2K5WXZ';
const DEFAULT_MAX_HOPS = 10;
const DEFAULT_TRANSACTION_DATA_BATCH_SIZE = 50;
const DEFAULT_CONFIRMED_SIGNATURE_LIMIT = 1000;
const DEFAULT_RPC_URL = 'https://explorer-api.mainnet-beta.solana.com/';
const SystemAccounts = [
  "11111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  "SysvarRent111111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "cndyAnrLdpjq1Ssp1z8xxDsB8dxe7u4HL5Nxi2K5WXZ",
  "SysvarC1ock11111111111111111111111111111111"
];
const DEFAULT_GET_TRANSACTION_OPTIONS = Object.freeze({
  "encoding": "jsonParsed",
  "commitment": "confirmed"
});

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
  metadataProgramAddress?: string;
}

interface FindNFTAddressesCreatedByResponse {
  addresses: string[];
}

interface GetConfirmedTransactionResponse {
  meta: {
    postTokenBalances: ({ accountIndex: number, mint: string })[]
  },
  transaction: {
    message: {
      accountKeys: { pubkey: string }[],
      instructions: {
        data: string,
        accounts: string[],
        programId: string,
        parsed: {
          type: string;
          info: {
            mintAuthority?: string;
            mint?: string;
            source?: string;
          }
        }
      }[]
    }
  };
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
 * Gets full transaction data given a signature, optionally pulling from a cache
 * @param signature
 * @param rpcUrl
 * @param cache
 */
async function getConfirmedTransaction(signature: string, rpcUrl: string, cache?: TransactionCache) {
  let transaction: GetConfirmedTransactionResponse|null = cache ? await cache.get(signature) : null;
  if (!transaction) {
    transaction = await rpcInvoke<GetConfirmedTransactionResponse>('getConfirmedTransaction', [signature, DEFAULT_GET_TRANSACTION_OPTIONS], rpcUrl);
    cache && await cache.set(signature, transaction);
  }
  return transaction as GetConfirmedTransactionResponse;
}

/**
 * Gets the oldest transaction associated with an address, by searching backward in time up to `opts.maxHops`
 * @param nftAddress
 * @param rpcUrl
 * @param opts
 */
async function getOldestTransaction(nftAddress: string, rpcUrl: string, opts: FindNFTAddressOptions) {
  let lastSignature = nftAddress;

  const { maxHops, transactionDataBatchSize, cache } = opts;

  // If the input address is an account address we need the oldest signature associated with the account
  if (nftAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
    const signatures = await getAllConfirmedSignaturesForAddress2(nftAddress, rpcUrl, maxHops);
    const {signature} = signatures.slice(-1)[0];
    lastSignature = signature;
  }

  const transaction = await getConfirmedTransaction(lastSignature, rpcUrl, cache);

  return transaction;
}

/**
 * Returns all NFT addresses ever created by a given address
 * @param nftAddress - Any address associated with the NFT, such as a print's address or a token association account address
 * @param rpcUrl - URL to the Solana RPC endpoint
 * @param opts - Additional options
 */
export async function findNftAddressesCreatedBy(nftAddress: string, rpcUrl: string = DEFAULT_RPC_URL, opts: FindNFTAddressOptions = { maxHops: DEFAULT_MAX_HOPS, transactionDataBatchSize: DEFAULT_TRANSACTION_DATA_BATCH_SIZE }): Promise<FindNFTAddressesCreatedByResponse> {
  const tokenSignatures = await getAllConfirmedSignaturesForAddress2(nftAddress, rpcUrl, opts?.maxHops);

  const transactionSignaturesToProcess = tokenSignatures.filter((s) => !s.err);

  const addresses = ((await promiseAllInBatches(async ({ signature }) => {
    const transaction = await getConfirmedTransaction(signature, rpcUrl, opts?.cache);

    const mintAddress = transaction?.transaction?.message?.instructions
      .filter((i) => i.parsed?.type === 'initializeMint')[0]?.parsed.info.mint;

    // To exclude tokens which aren't NFTs
    const metadataAddress = transaction?.transaction?.message?.instructions
      .filter((i) => i.programId === METADATA_ID || i.programId === CANDY_ID)[0];

    return metadataAddress ? mintAddress : null;
  }, transactionSignaturesToProcess, opts?.transactionDataBatchSize)).filter(Boolean));

  return {
    addresses
  };
}


/**
 * Returns the Solana addresses for a master NFT and all of its minted prints
 * @param nftAddress - Any address associated with the NFT, such as a print's address or a token association account address
 * @param rpcUrl - URL to the Solana RPC endpoint
 * @param opts - Additional options
 */
export async function findNftAddresses(nftAddress: string, rpcUrl: string = DEFAULT_RPC_URL, opts: FindNFTAddressOptions = { maxHops: DEFAULT_MAX_HOPS, transactionDataBatchSize: DEFAULT_TRANSACTION_DATA_BATCH_SIZE }): Promise<FindNFTAddressesResponse> {
  const transaction = await getOldestTransaction(nftAddress, rpcUrl, opts);

  const { maxHops, transactionDataBatchSize, cache } = opts;

  const indexInstruction = transaction.transaction.message.instructions
    .filter((i) => i.programId === METADATA_ID || i.programId === CANDY_ID)[0];

  const { accounts } = indexInstruction;

  const mintToAddress: string = transaction.transaction.message.instructions.filter(i => i.parsed?.type === 'mintTo').map(i => i.parsed?.info?.mint)[0];

  if (accounts[1] !== mintToAddress)
    accounts.reverse();

  let indexAddress: string;

  for (const addr of accounts) {
    if (!SystemAccounts.includes(addr)) {
      indexAddress = addr;

      break;
    }
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
  const addressesKeyValue = new Map<string, string>((await promiseAllInBatches(async ({ signature }) => {
    const transaction = await getConfirmedTransaction(signature, rpcUrl, cache);

    return transaction?.transaction?.message?.accountKeys.slice(1, 3).map(a => a.pubkey) as [ string, string ];
  }, transactionSignaturesToProcess, transactionDataBatchSize)).filter(Boolean));

  let metadataProgramAddress: string;
  for (let [ k, v ] of Array.from(addressesKeyValue.entries())) {
    if (v === METADATA_ID) {
      metadataProgramAddress = k;
      addressesKeyValue.delete(k);
    }
  }

  // Return only the second account inputs
  const addresses = Array.from(addressesKeyValue.keys());

  // The oldest of the second account inputs will be the master address, and all others are prints in descending order
  // of their minting
  return {
    masterAddress: addresses.pop(),
    printAddresses: addresses,
    metadataProgramAddress
  }
}
