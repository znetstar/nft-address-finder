import axios from 'axios';
import { randomUUID } from 'crypto';

/**
 * @author https://stackoverflow.com/a/64543086/17835333
 */
export async function promiseAllInBatches<T, R>(
  task: (item: T) => Promise<R>,
  items: T[],
  batchSize: number
): Promise<R[]> {
  let position = 0;
  let results = [];
  while (position < items.length) {
    const itemsForBatch = items.slice(position, position + batchSize);
    results = [
      ...results,
      ...(await Promise.all(itemsForBatch.map((item) => task(item)))),
    ];
    position += batchSize;
  }
  return results;
}

export const SystemAccounts = [
  '11111111111111111111111111111111',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  'SysvarRent111111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'cndyAnrLdpjq1Ssp1z8xxDsB8dxe7u4HL5Nxi2K5WXZ',
  'p1exdMJcjVao65QdewkaZRUnU6VPSXhus9n2GzWfh98',
  'SysvarC1ock11111111111111111111111111111111',
];
export const DEFAULT_GET_TRANSACTION_OPTIONS = Object.freeze({
  encoding: 'jsonParsed',
  commitment: 'confirmed',
});

export async function rpcInvoke<T>(
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
      id: randomUUID(),
    },
    {
      responseType: 'json',
    }
  );

  if (resp.data.error) {
    throw resp.data.error;
  } else {
    return resp.data.result as T;
  }
}
