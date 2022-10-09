// import { ecrecover, pubToAddress } from "@ethereumjs/util";
import { post } from '@toruslabs/http-helpers';
import { safeatob } from '@toruslabs/openlogin-utils';
import { Client } from '@toruslabs/tss-client';
import * as tss from '@toruslabs/tss-lib';
import BN from 'bn.js';
import { ec as EC } from 'elliptic';
import { io, Socket } from 'socket.io-client';

const ec = new EC('secp256k1');

const tssServerEndpoint = 'http://localhost:4000';
const tssWsEndpoint = 'ws://localhost:4001';

const tssImportURL = 'https://scripts.toruswallet.io/tss-lib.wasm';

const clients: { client: any; allocated: boolean }[] = [];

export const wasmObj = {
  wasm: null as any,
};

const createSockets = async (
  wsEndpoints: (string | null | undefined)[],
): Promise<(Socket | null)[]> => {
  console.log('socket 1', wsEndpoints);

  const sockets = wsEndpoints.map((wsEndpoint) => {
    if (wsEndpoint === null || wsEndpoint === undefined) {
      return null;
    }
    // const { origin } = new URL(wsEndpoint);
    // const path = `${new URL(wsEndpoint).pathname}/socket.io/`;
    // return io(origin, { transports: ['websocket'] });
    return io(wsEndpoint);
  });

  console.log('socket 2');

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      console.log('what are the sockets', sockets);
      for (let i = 0; i < sockets.length; i++) {
        const socket = sockets[i];
        if (socket === null) {
          continue;
        }

        if (!socket.id) {
          return;
        }
      }
      clearInterval(timer);
      resolve(true);
    }, 500);
  });

  await new Promise((r) => setTimeout(r, 6000));

  console.log('socket 3');

  return sockets;
};

/**
 * setupTSS - setup TSS
 *
 * @param tssShare
 * @param pubKey
 * @param verifierName
 * @param verifierId
 */
export async function setupTSS(
  tssShare: string,
  pubKey: string,
  verifierName: string,
  verifierId: string,
): Promise<any> {
  const endpoints = [tssServerEndpoint, null];
  const wsEndpoints = [tssWsEndpoint, null];
  // console.log('ere 1');
  // const ws = new WebSocket('ws://localhost:4001');
  // const sockets = [ws, null];
  // console.log('ere 2');
  // await new Promise((resolve) => {
  //   const interval = setInterval(() => {
  //     console.log('waiting for ws');
  //     if (ws.OPEN) {
  //       clearInterval(interval);
  //       resolve(true);
  //     }
  //   }, 500);
  // });

  const sockets = await createSockets(wsEndpoints);

  const parsedTSSShare = {
    share: tssShare.split('-')[0].split(':')[1],
    index: tssShare.split('-')[1].split(':')[1],
  };
  console.log('ere 3');

  const base64Share = Buffer.from(
    parsedTSSShare.share.padStart(64, '0'),
    'hex',
  ).toString('base64');
  // TODO: extend
  const localIndex = 1;
  //   const remoteIndex = 0;
  const parties = [0, 1];

  console.log('ere 4');

  return new Client(
    `${verifierName}~${verifierId}:${Date.now()}`,
    localIndex,
    parties,
    endpoints,
    sockets,
    base64Share,
    pubKey,
    true,
    tssImportURL,
  );
}

let getTSSData: () => Promise<{
  tssShare: string;
  signatures: string[];
  verifierName: string;
  verifierId: string;
}>;

/**
 *
 * @param tssDataReader
 */
export async function tssDataCallback(
  tssDataReader: () => Promise<{
    tssShare: string;
    signatures: string[];
    verifierName: string;
    verifierId: string;
  }>,
) {
  getTSSData = tssDataReader;
}

// MPC related functions
/**
 *
 * @param tssShare
 * @param signatures
 */
export async function getPublicKeyFromTSSShare(
  tssShare: string,
  signatures: string[],
): Promise<string> {
  // check if TSS is available
  if (!tssShare || !Array.isArray(signatures) || signatures.length === 0) {
    throw new Error('tssShare or signatures not available');
  }
  const parsedTSSShare = {
    share: tssShare.split('-')[0].split(':')[1],
    index: tssShare.split('-')[1].split(':')[1],
  };

  const parsedSignatures = signatures.map((s) => JSON.parse(s));
  const chosenSignature =
    parsedSignatures[Math.floor(Math.random() * parsedSignatures.length)];
  const { verifier_name: verifierName, verifier_id: verifierId } = JSON.parse(
    safeatob(chosenSignature.data),
  );
  if (!verifierName || !verifierId) {
    throw new Error('verifier_name and verifier_id must be specified');
  }

  const { share_pub_x: sharePubX, share_pub_y: sharePubY } = await post<{
    share_pub_x: string;

    share_pub_y: string;
  }>(`${tssServerEndpoint}/getOrCreateTSSPub`, {
    verifier_name: verifierName,
    verifier_id: verifierId,
  });

  const getLagrangeCoeff = (partyIndexes: BN[], partyIndex: BN): BN => {
    let upper = new BN(1);
    let lower = new BN(1);
    for (let i = 0; i < partyIndexes.length; i += 1) {
      const otherPartyIndex = partyIndexes[i];
      if (!partyIndex.eq(otherPartyIndex)) {
        upper = upper.mul(otherPartyIndex.neg());
        upper = upper.umod(ec.curve.n);
        let temp = partyIndex.sub(otherPartyIndex);
        temp = temp.umod(ec.curve.n);
        lower = lower.mul(temp).umod(ec.curve.n);
      }
    }

    const delta = upper.mul(lower.invm(ec.curve.n)).umod(ec.curve.n);
    return delta;
  };

  // TODO: extend
  const localIndex = 1;
  const remoteIndex = 0;
  const parties = [0, 1];
  const pubKeyPoint1 = ec
    .keyFromPublic({ x: sharePubX, y: sharePubY })
    .getPublic()
    .mul(
      getLagrangeCoeff(
        parties.map((p) => new BN(p + 1)),
        new BN(remoteIndex + 1),
      ),
    );
  const pubKeyPoint2 = ec
    .keyFromPrivate(Buffer.from(parsedTSSShare.share.padStart(64, '0'), 'hex'))
    .getPublic()
    .mul(
      getLagrangeCoeff(
        parties.map((p) => new BN(p + 1)),
        new BN(localIndex + 1),
      ),
    );
  const pubKeyPoint = pubKeyPoint1.add(pubKeyPoint2);
  const pubKeyX = pubKeyPoint.getX().toString(16, 64);
  const pubKeyY = pubKeyPoint.getY().toString(16, 64);
  const pubKeyHex = `${pubKeyX}${pubKeyY}`;
  const pubKey = Buffer.from(pubKeyHex, 'hex').toString('base64');

  return pubKey;
}

/**
 *
 */
export async function tssGetPublic() {
  if (!getTSSData) {
    throw new Error('tssShare / sigs are undefined');
  }
  const { tssShare, signatures } = await getTSSData();
  const pubKey = await getPublicKeyFromTSSShare(tssShare, signatures);
  return Buffer.from(pubKey, 'base64');
}

/**
 *
 */
export async function generatePrecompute() {
  if (!getTSSData) {
    throw new Error('tssShare and signatures are not defined');
  }
  const { verifierName, verifierId } = await getTSSData();
  if (!verifierName || !verifierId) {
    throw new Error('not logged in, verifier or verifierId undefined');
  }

  console.log('there 1');

  const { tssShare } = await getTSSData();
  const pubKey = (await tssGetPublic()).toString('base64');
  console.log('there 2');

  const client = await setupTSS(tssShare, pubKey, verifierName, verifierId);
  const tssInstance = wasmObj.wasm;
  if (!tssInstance) {
    await tss.default(tssImportURL);
    wasmObj.wasm = tss;
  }
  console.log('there 3');

  client.precompute(wasmObj.wasm as any);
  console.log('there 4');

  await client.ready();
  clients.push({ client, allocated: false });
}

/**
 *
 * @param msgHash
 * @param rawMsg
 */
export async function tssSign(msgHash: Buffer, rawMsg?: Buffer) {
  // eslint-disable-next-line no-console
  console.log('what is rawMsg', rawMsg);
  generatePrecompute();
  console.log('precomputing..?');
  // const finalHash = `0x${msgHash.toString("hex")}`;
  let foundClient = null as any;

  while (!foundClient) {
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];
      if (!client.allocated) {
        client.allocated = true;
        foundClient = client;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('here now 1');
  await foundClient.client.ready();
  console.log('here now 2');
  const tssInstance = wasmObj.wasm;
  if (!tssInstance) {
    await tss.default(tssImportURL);
    wasmObj.wasm = tss;
  }
  const { signatures } = await getTSSData();
  console.log('here now 3');

  let { r, s, recoveryParam } = await foundClient.client.sign(
    wasmObj.wasm as any,
    Buffer.from(msgHash).toString('base64'),
    true,
    '',
    'keccak256',
    {
      signatures,
    },
  );
  console.log('here now 4');

  if (
    new BN(s.toString('hex'), 'hex').gte(
      ec.curve.n.div(new BN(2).add(new BN(1))),
    )
  ) {
    s = s.neg().umod(ec.curve.n);
    recoveryParam ^= 1;
  }
  // const recoveredPub = ecrecover(msgHash, recoveryParam + 27, Buffer.from(r.toString("hex"), "hex"), Buffer.from(s.toString("hex"), "hex"));
  // const recoveredAddr = pubToAddress(Buffer.from(recoveredPub.toString("hex"), "hex"));
  return {
    v: recoveryParam + 27,
    r: Buffer.from(r.toString('hex'), 'hex'),
    s: Buffer.from(s.toString('hex'), 'hex'),
  };
}
