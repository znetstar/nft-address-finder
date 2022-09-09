export type SignatureResult = {
  signature: string;
  err: unknown;
  blockTime: number;
};

export interface FindNFTAddressesResponse {
  printAddresses: string[];
  masterAddress: string;
  metadataProgramAddress?: string;
  mintTransactionIds: Record<string, string>;
}

export interface FindNFTAddressesCreatedByResponse {
  addresses: string[];
}

export interface GetConfirmedTransactionResponse {
  meta: {
    postTokenBalances: { accountIndex: number; mint: string }[];
  };
  transaction: {
    message: {
      accountKeys: { pubkey: string }[];
      instructions: {
        data: string;
        accounts: string[];
        programId: string;
        parsed: {
          type: string;
          info: {
            mintAuthority?: string;
            mint?: string;
            source?: string;
          };
        };
      }[];
    };
  };
}

export interface TransactionResultsCache {
  /**
   * Given a query (such as an NFT Address) this should store all `SignatureResults` in persistent storage.
   * @param query
   * @param results
   */
  insert: (query: string, results: SignatureResult[]) => Promise<void>;
  /**
   * Given a query (such as an NFT Address) and a signature, this should return all `SignatureResults`s **after** a the
   * provided signature (inclusive) in **descending order**.
   * @param query
   * @param signature
   */
  getAllAfterSignatureDescending: (
    query: string,
    signature: SignatureResult
  ) => Promise<SignatureResult[]>;
  /**
   * Given a query (such as an NFT Address), this should return the oldest signature in persistent storage.
   * @param query
   */
  getOldestSignatureResult: (query: string) => Promise<SignatureResult | null>;
}

export type FindNFTAddressOptions = {
  /**
   * The maximum number of recursive iterations through the blockchain to find transactions (going back in time)
   */
  maxHops: number;
  /**
   * The maximum number of requests to get full transaction data made in parallel
   */
  transactionDataBatchSize: number;
  /**
   * An optional cache to store transaction data. It's up to you to implement the caching mechanism.
   */
  cache?: TransactionCache;
  /**
   * An optional cache to store transaction results (lists of signatures). It's up to you to implement the caching mechanism.
   */
  resultsCache?: TransactionResultsCache;
};

export interface TransactionCache {
  set: (
    signature: string,
    transaction: GetConfirmedTransactionResponse
  ) => Promise<void>;
  get: (signature: string) => Promise<GetConfirmedTransactionResponse | null>;
}
