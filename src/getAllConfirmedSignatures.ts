/** *
 * Returns all the transactions associated with a given address, looping through batches of 1000 until reaching `maxHops`
 * optionally caching results.
 * @param nftAddress
 * @param rpcUrl
 */
import {
  DEFAULT_GET_TRANSACTION_OPTIONS,
  promiseAllInBatches,
  rpcInvoke,
} from './utils';
import {
  CANDY_ID,
  DEFAULT_CONFIRMED_SIGNATURE_LIMIT,
  DEFAULT_MAX_HOPS,
  DEFAULT_RPC_URL,
  DEFAULT_TRANSACTION_DATA_BATCH_SIZE,
  METADATA_ID,
} from './defaults';
import {
  FindNFTAddressesCreatedByResponse,
  FindNFTAddressOptions,
  GetConfirmedTransactionResponse,
  SignatureResult,
  TransactionCache,
  TransactionResultsCache,
} from './interfaces';

export async function getAllConfirmedSignaturesForAddress2(
  nftAddress: string,
  rpcUrl: string = DEFAULT_RPC_URL,
  maxHops: number = DEFAULT_MAX_HOPS,
  resultsCache?: TransactionResultsCache
) {
  const results: SignatureResult[] = [];
  let currentBatch: SignatureResult[] | null = null;

  let currentHop = 0;

  const until: SignatureResult | null = resultsCache
    ? await resultsCache.getOldestSignatureResult(nftAddress)
    : null;
  const sigs: Set<string> = new Set();
  while (
    currentHop++ < maxHops &&
    (currentBatch === null || currentBatch.length)
  ) {
    const opts: { limit?: number; until?: string; before?: string } = {
      limit: DEFAULT_CONFIRMED_SIGNATURE_LIMIT,
    };

    if (results.slice(-1)[0]?.signature)
      opts.before = results.slice(-1)[0]?.signature;
    if (until) opts.until = until.signature;

    currentBatch = await rpcInvoke<SignatureResult[]>(
      'getConfirmedSignaturesForAddress2',
      [nftAddress, opts],
      rpcUrl
    );

    for (const result of currentBatch) {
      sigs.add(result.signature);
      results.push(result);
    }
  }

  if (resultsCache && results.length) {
    await resultsCache.insert(nftAddress, results);
  }

  if (until) {
    const remainingResults = await resultsCache.getAllAfterSignatureDescending(
      nftAddress,
      until
    );
    let result: SignatureResult;
    while ((result = remainingResults.shift())) {
      if (!sigs.has(result.signature)) {
        results.push(result);
      }
    }
  }

  return results;
}

/**
 * Gets full transaction data given a signature, optionally pulling from a cache
 * @param signature
 * @param rpcUrl
 * @param cache
 */
export async function getConfirmedTransaction(
  signature: string,
  rpcUrl: string,
  cache?: TransactionCache
) {
  let transaction: GetConfirmedTransactionResponse | null = cache
    ? await cache.get(signature)
    : null;
  if (!transaction) {
    transaction = await rpcInvoke<GetConfirmedTransactionResponse>(
      'getConfirmedTransaction',
      [signature, DEFAULT_GET_TRANSACTION_OPTIONS],
      rpcUrl
    );
    cache && (await cache.set(signature, transaction));
  }
  return transaction as GetConfirmedTransactionResponse;
}

/**
 * Gets the oldest transaction associated with an address, by searching backward in time up to `opts.maxHops`
 * @param nftAddress
 * @param rpcUrl
 * @param opts
 */
export async function getOldestTransaction(
  nftAddress: string,
  rpcUrl: string,
  opts: FindNFTAddressOptions
) {
  let lastSignature = nftAddress;

  const { maxHops, cache, resultsCache } = opts;

  // If the input address is an account address we need the oldest signature associated with the account
  if (nftAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
    const signatures = await getAllConfirmedSignaturesForAddress2(
      nftAddress,
      rpcUrl,
      maxHops,
      resultsCache
    );
    const { signature } = signatures.slice(-1)[0];
    lastSignature = signature;
  }

  const transaction = await getConfirmedTransaction(
    lastSignature,
    rpcUrl,
    cache
  );

  return transaction;
}

/**
 * Returns all NFT addresses ever created by a given address
 * @param nftAddress - Any address associated with the NFT, such as a print's address or a token association account address
 * @param rpcUrl - URL to the Solana RPC endpoint
 * @param opts - Additional options
 */
export async function findNftAddressesCreatedBy(
  nftAddress: string,
  rpcUrl: string = DEFAULT_RPC_URL,
  opts: FindNFTAddressOptions = {
    maxHops: DEFAULT_MAX_HOPS,
    transactionDataBatchSize: DEFAULT_TRANSACTION_DATA_BATCH_SIZE,
  }
): Promise<FindNFTAddressesCreatedByResponse> {
  const tokenSignatures = await getAllConfirmedSignaturesForAddress2(
    nftAddress,
    rpcUrl,
    opts?.maxHops,
    opts.resultsCache
  );

  const transactionSignaturesToProcess = tokenSignatures.filter((s) => !s.err);

  const addresses = (
    await promiseAllInBatches(
      async ({ signature }) => {
        const transaction = await getConfirmedTransaction(
          signature,
          rpcUrl,
          opts?.cache
        );

        const mintAddress =
          transaction?.transaction?.message?.instructions.filter(
            (i) => i.parsed?.type === 'initializeMint'
          )[0]?.parsed.info.mint;

        // To exclude tokens which aren't NFTs
        const metadataAddress =
          transaction?.transaction?.message?.instructions.filter(
            (i) => i.programId === METADATA_ID || i.programId === CANDY_ID
          )[0];

        return metadataAddress ? mintAddress : null;
      },
      transactionSignaturesToProcess,
      opts?.transactionDataBatchSize
    )
  ).filter(Boolean);

  return {
    addresses,
  };
}
