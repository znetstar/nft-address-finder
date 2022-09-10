import { FindNFTAddressesResponse, FindNFTAddressOptions } from './interfaces';
import {
  AUCTION_ID,
  CANDY_ID,
  DEFAULT_MAX_HOPS,
  DEFAULT_RPC_URL,
  DEFAULT_TRANSACTION_DATA_BATCH_SIZE,
  METADATA_ID,
} from './defaults';
import { promiseAllInBatches, SystemAccounts } from './utils';
import {
  getAllConfirmedSignaturesForAddress2,
  getConfirmedTransaction,
  getOldestTransaction,
} from './getAllConfirmedSignatures';

/**
 * Returns the Solana addresses for a master NFT and all of its minted prints
 * @param nftAddress - Any address associated with the NFT, such as a print's address or a token association account address
 * @param rpcUrl - URL to the Solana RPC endpoint
 * @param opts - Additional options
 */
export async function findNftAddresses(
  nftAddress: string,
  rpcUrl: string = DEFAULT_RPC_URL,
  opts: FindNFTAddressOptions = {
    maxHops: DEFAULT_MAX_HOPS,
    transactionDataBatchSize: DEFAULT_TRANSACTION_DATA_BATCH_SIZE,
  }
): Promise<FindNFTAddressesResponse> {
  const transaction = await getOldestTransaction(nftAddress, rpcUrl, opts);

  const { maxHops, transactionDataBatchSize, cache } = opts;

  const indexInstruction = transaction.transaction.message.instructions.filter(
    (i) => i.programId === METADATA_ID || i.programId === CANDY_ID
  )[0];

  const { accounts } = indexInstruction;

  const mintToAddress: string = transaction.transaction.message.instructions
    .filter((i) => i.parsed?.type === 'mintTo')
    .map((i) => i.parsed?.info?.mint)[0];

  if (accounts[1] !== mintToAddress) accounts.reverse();

  let indexAddress: string;

  for (const addr of accounts) {
    if (!SystemAccounts.includes(addr)) {
      indexAddress = addr;

      break;
    }
  }

  // Find all transactions related to the "indexAddress"
  // these will be transactions corresponding to minting the master and each individual print
  const tokenSignatures = (
    await getAllConfirmedSignaturesForAddress2(
      indexAddress,
      rpcUrl,
      maxHops,
      opts.resultsCache
    )
  ).filter((sig) => !sig.err);

  // Get each full transaction, and return only the second and fourth account inputs
  const addressesKeyValue = new Map<string, { addr: string; txId: string }>(
    (
      await promiseAllInBatches(
        async ({ signature }) => {
          const transaction = await getConfirmedTransaction(
            signature,
            rpcUrl,
            cache
          );

          const mintFromVaultInstruction =
            transaction?.transaction?.message?.instructions?.find(
              (i) => i.programId === AUCTION_ID
            );
          if (mintFromVaultInstruction) {
            const mintId =
              transaction?.transaction?.message?.accountKeys[13]?.pubkey;
            const metadataId =
              transaction?.transaction?.message?.accountKeys[25]?.pubkey;
            if (!metadataId || !mintId) return null;

            return [
              mintId,
              {
                addr: metadataId,
                txId: signature,
              },
            ] as [string, { addr: string; txId: string }];
          }

          const programTypes = new Set(
            transaction?.transaction?.message?.instructions
              .map((m) => m.parsed?.type)
              .filter(Boolean)
          );
          const programIds = new Set(
            transaction?.transaction?.message?.instructions
              .map((m) => m.programId)
              .filter(Boolean)
          );

          if (!programTypes.has('mintTo') && !programIds.has(METADATA_ID))
            return null;

          const keys: any[] = transaction?.transaction?.message?.accountKeys
            .slice(1, 3)
            .map((a) => a.pubkey);

          if (!keys || !keys[1]) return null;

          keys[1] = { addr: keys[1], txId: signature };
          return keys as [string, { addr: string; txId: string }];
        },
        tokenSignatures,
        transactionDataBatchSize
      )
    ).filter(Boolean)
  );

  let metadataProgramAddress: string;
  const mintTransactionIds: Record<string, string> = {};
  for (const [k, { addr: v, txId }] of Array.from(
    addressesKeyValue.entries()
  )) {
    if (v === METADATA_ID) {
      metadataProgramAddress = k;
      addressesKeyValue.delete(k);
    } else if (v === indexAddress) {
      metadataProgramAddress = v;
      mintTransactionIds[k] = txId;
    } else {
      mintTransactionIds[k] = txId;
    }
  }

  // Return only the second account inputs
  const addresses = Array.from(addressesKeyValue.keys());

  // The oldest of the second account inputs will be the master address, and all others are prints in descending order
  // of their minting
  return {
    masterAddress: addresses.pop(),
    printAddresses: addresses,
    metadataProgramAddress,
    mintTransactionIds,
  };
}
