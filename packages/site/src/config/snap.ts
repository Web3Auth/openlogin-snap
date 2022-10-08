/**
 * The snap origin to use.
 * Will default to the local hosted snap if no value is provided in environment.
 */
export const defaultSnapOrigin =
  process.env.REACT_APP_SNAP_ORIGIN ?? `local:http://localhost:8080`;

export type OpenLoginState = {
  tssShare?: string;
  signatures?: string[];
  aggregateVerifier?: string;
  verifier?: string;
  verifierId?: string;
  privKey?: string;
};
