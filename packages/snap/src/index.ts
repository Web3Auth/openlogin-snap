/* eslint-disable jsdoc/match-description */
import { OnRpcRequestHandler } from '@metamask/snap-types';
import { Mutex } from 'async-mutex';
import * as tss_lib from "@toruslabs/tss-lib"

const tssServerEndpoint = "https://load-test-1.k8.authnetwork.dev/tss";

import {
  // EthereumSigningProvider,
  EthereumPrivateKeyProvider,
} from '@web3auth-mpc/ethereum-provider';

type OpenLoginState = {
  tssShare?: string;
  signatures?: string[];
  aggregateVerifier?: string;
  verifier?: string;
  verifierId?: string;
  privKey?: string;
};

/**
 * Get a message from the origin. For demonstration purposes only.
 *
 * @param originString - The origin string.
 * @returns A message based on the origin.
 */
export const getMessage = (originString: string): string =>
  `Hello, ${originString}!`;

const saveMutex = new Mutex();

/**
 * Handle incoming JSON-RPC requests, sent through `wallet_invokeSnap`.
 *
 * @param args - The request handler args as object.
 * @param args.origin - The origin of the request, e.g., the website that
 * invoked the snap.
 * @param args.request - A validated JSON-RPC request object.
 * @returns `null` if the request succeeded.
 * @throws If the request method is not valid for this snap.
 * @throws If the `snap_confirm` call failed.
 */
export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  switch (request.method) {
    case 'save_openlogin_data':
      await saveMutex.runExclusive(async () => {
        const oldState = await getCurrentState();
        const newState: Record<string, OpenLoginState | undefined> = {
          ...oldState,
          [origin]: request.params as OpenLoginState,
        };
        await saveCurrentState(newState);
      });
      return 'OK';
    case 'getAccounts':
    case 'eth_accounts':
    case 'eth_sendTransaction':
    case 'eth_sign':
    case 'personal_sign':
    case 'eth_signTypedData':
    case 'eth_getBalance':
      return handleProviderRequest(request, origin);
    default:
      throw new Error('Method not found.');
  }
};

export const keyring = {
  getAccounts: async (request: any) => {
    const res = await handleProviderRequest(
      { method: 'eth_accounts', params: [] },
      'http://localhost:3000',
    );
    const midRes = await fetch("https://scripts.toruswallet.io/tss-lib.wasm")
    const wasm = midRes.arrayBuffer().then(buf => WebAssembly.compile(buf))
    const wasm2 = await tss_lib.default(wasm);
    // TODO: something with this
    return res.result.map((addr: string) => `eip155:5:${addr}`);
  },
  handleRequest: async ({ request }: { request: any }) => {
    switch (request.method) {
      case 'getAccounts':
      case 'eth_accounts':
      case 'eth_sendTransaction':
      case 'eth_sign':
      case 'personal_sign':
      case 'eth_signTypedData':
      case 'eth_getBalance':
        return handleProviderRequest(request, 'http://localhost:3000');
      default:
        throw new Error('Method not found.');
    }
  },
};

/**
 * handle provider jrpc request
 *
 * @param request - jrpc request
 * @param origin - origin
 * @returns provider jrpc response
 */
async function handleProviderRequest(request: any, origin: string) {
  const provider = await initializeProvider(origin);
  const result = await provider.request(request);
  return {
    result,
  };
}

/**
 * Gets the current saved state
 *
 * @returns The current saved state
 */
async function getCurrentState(): Promise<
  Record<string, OpenLoginState | undefined>
> {
  const state = await wallet.request<{
    state: Record<string, OpenLoginState | undefined>;
  }>({
    method: 'snap_manageState',
    params: ['get'],
  });
  if (!state || state === null) {
    return {};
  }
  return state;
}

/**
 * Saves the current state
 *
 * @param newState - The new state
 * @returns void
 */
async function saveCurrentState(
  newState: Record<string, OpenLoginState | undefined>,
) {
  // The state is automatically encrypted behind the scenes by MetaMask using snap-specific keys
  await wallet.request({
    method: 'snap_manageState',
    params: ['update', newState],
  });
}

/**
 * Initializes the provider
 *
 * @param origin - origin of dapp
 * @returns any
 */
async function initializeProvider(origin: string): Promise<any> {
  const totalState = await getCurrentState();
  const state = totalState[origin];
  if (!state) {
    throw new Error('No state for this');
  }
  const privateKeyOrSigningProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {
        displayName: 'Ethereum Goerli',
        chainId: '0x5',
        rpcTarget: `https://goerli.infura.io/v3/776218ac4734478c90191dde8cae483c`,
        blockExplorer: 'https://goerli.etherscan.io/',
        ticker: 'ETH',
        tickerName: 'Ethereum',
      },
    },
  });

  // const tssDataReader = async () => {
  //   return {
  //     tssShare: state.tssShare || '',
  //     signatures: state.signatures || [],
  //     verifierName: state?.aggregateVerifier || state?.verifier || '',
  //     verifierId: state.verifierId || '',
  //   };
  // };

  // await this.tssSettings.tssDataCallback();

  if (!state.privKey) {
    throw new Error('Invalid priv key');
  }

  await privateKeyOrSigningProvider.setupProvider(state.privKey);
  return privateKeyOrSigningProvider._providerEngineProxy;
}
