export type CipherBlobV1 = {
  v: 1;
  alg: 'AES-256-GCM';
  iv: string;
  tag: string;
  ct: string;
  edk: string;
  ctx?: Record<string, string>;
  aad?: string;
};
