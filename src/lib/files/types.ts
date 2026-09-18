export interface StoredFileMeta {
  contentType: string;
  filename: string;
}

export interface FileStore {
  init(): Promise<void>;
  /** Store bytes under a key (e.g. "orders/SC-.../abcd-art.zip"). */
  upload(key: string, buffer: Buffer, meta: StoredFileMeta): Promise<void>;
  /** A URL that downloads the file and expires after ttlSeconds. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
}
