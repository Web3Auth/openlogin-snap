/* eslint-disable camelcase */
import { generatePrivate } from '@toruslabs/eccrypto';
import { Msg } from '@toruslabs/tss-client/dist/types/types';
import BN from 'bn.js';
import keccak256 from 'keccak256';
// import { Socket } from 'socket.io-client';

// TODO: create namespace for globals
if (globalThis.tss_clients === undefined) {
  globalThis.tss_clients = {};
}

if (globalThis.js_read_msg === undefined) {
  globalThis.js_read_msg = async function (
    session: string,
    self_index: number,
    party: number,
    msg_type: string,
  ) {
    // console.log('reading message', msg_type);
    const tss_client = globalThis.tss_clients[session] as Client;
    tss_client.log(`reading msg, ${msg_type}`);
    if (msg_type === 'ga1_worker_support') {
      // runs ga1_array processing on a web worker instead of blocking the main thread
      return 'not supported';
    }
    let mm;
    while (!mm) {
      mm = tss_client.msgQueue.find(
        (m) =>
          m.sender === party &&
          m.recipient === self_index &&
          m.msg_type === msg_type,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // console.log('found message..', mm);
    // if (!mm) {
    //   return new Promise((resolve) => {
    //     tss_client.pendingReads[
    //       `session-${session}:sender-${party}:recipient-${self_index}:msg_type-${msg_type}`
    //     ] = resolve;
    //   });
    // }
    return mm.msg_data;
  };
}

// globalThis.process_ga1 = async (
//   tssImportUrl: string,
//   msg_data: string,
// ): Promise<string> => {
//   const worker = new TssWebWorker(tssImportUrl);
//   const res = worker.work<string>('process_ga1', [msg_data]);
//   return res;
// };

if (globalThis.js_send_msg === undefined) {
  globalThis.js_send_msg = async function (
    session: any,
    self_index: any,
    party: any,
    msg_type: any,
    msg_data: any,
  ) {
    // console.log('sending message', msg_type);
    const tss_client = globalThis.tss_clients[session] as Client;
    tss_client.log(`sending msg, ${msg_type}`);
    // if (msg_type.indexOf('ga1_data_unprocessed') > -1) {
    //   globalThis
    //     .process_ga1(tss_client.tssImportUrl, msg_data)
    //     .then((processed_data: string) => {
    //       const key = `session-${session}:sender-${party}:recipient-${self_index}:msg_type-${session}~ga1_data_processed`;
    //       const pendingRead = tss_client.pendingReads[key];
    //       if (pendingRead) {
    //         pendingRead(processed_data);
    //       } else {
    //         tss_client.msgQueue.push({
    //           session,
    //           sender: party,
    //           recipient: self_index,
    //           msg_type: `${session}~ga1_data_processed`,
    //           msg_data: processed_data,
    //         });
    //       }
    //       return true;
    //     });
    //   return true;
    // }

    // if (tss_client.websocketOnly) {
    //   const socket = tss_client.sockets[party];
    //   if (!socket) {
    //     throw new Error('no socket');
    //   }

    //   socket.send('send_msg', {
    //     session,
    //     sender: self_index,
    //     recipient: party,
    //     msg_type,
    //     msg_data,
    //   });
    // } else {
    const endpoint = tss_client.lookupEndpoint(session, party);
    fetch(`${endpoint}/send`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        session,
        sender: self_index,
        recipient: party,
        msg_type,
        msg_data,
      }),
    });
    // }
    return true;
  };
}

type Log = (msg: string) => void;

export class Client {
  public session: string;

  public index: number;

  public parties: number[];

  public msgQueue: Msg[] = [];

  public pendingReads = {} as any;

  public sockets: (WebSocket | null | undefined)[];

  public endpoints: (string | null | undefined)[];

  public share: string;

  public pubKey: string;

  public precomputes: string[] = [];

  public websocketOnly: boolean;

  public tssImportUrl: string;

  public _startPrecomputeTime = 0;

  public _endPrecomputeTime = 0;

  public _startSignTime = 0;

  public _endSignTime = 0;

  public log: Log;

  public _ready: boolean;

  public _consumed: boolean;

  private _readyResolves = [] as any;

  private _readyPromises = [];

  private _readyPromiseAll: Promise<unknown>;

  private _signer: number | undefined;

  private _rng: number | undefined;

  // Note: create sockets externally before passing it in in the constructor to allow socket reuse
  constructor(
    _session: string,
    _index: number,
    _parties: number[],
    _endpoints: (string | null | undefined)[],
    _sockets: (WebSocket | null | undefined)[],
    _share: string,
    _pubKey: string,
    _websocketOnly: boolean,
    _tssImportUrl: string,
  ) {
    if (_parties.length !== _sockets.length) {
      throw new Error(
        'parties and sockets length must be equal, fill with nulls if necessary',
      );
    }

    if (_parties.length !== _endpoints.length) {
      throw new Error(
        'parties and endpoints length must be equal, fill with nulls if necessary',
      );
    }

    this.session = _session;
    this.index = _index;
    this.parties = _parties;
    this.endpoints = _endpoints;
    this.sockets = _sockets;
    this.share = _share;
    this.pubKey = _pubKey;
    this.websocketOnly = _websocketOnly;
    this.tssImportUrl = _tssImportUrl;
    // this.log = console.log;
    this._ready = false;
    this._consumed = false;

    _sockets.map((socket) => {
      if (socket === undefined || socket === null) {
        let clientResolve;
        this._readyPromises.push(new Promise((r) => (clientResolve = r)));
        this._readyResolves.push(clientResolve);
        return null;
      }

      //   if (socket.hasListeners('send')) {
      //     socket.off('send');
      //   }

      // create pending promises for each server that resolves when precompute for that server is complete
      let resolve = null as any;
      this._readyPromises.push(new Promise((r) => (resolve = r)));
      this._readyResolves.push(resolve);
      // debugger;

      setInterval(async () => {
        const res = await fetch('http://localhost:4000/message').then((a) =>
          a.json(),
        );
        if (!res.message) {
          return;
        }
        const { ev, data } = res.message;
        if (ev === 'send') {
          const { session, sender, recipient, msg_type, msg_data } = data;
          if (session !== this.session) {
            this.log(
              `ignoring message for a different session... client session: ${this.session}, message session: ${session}`,
            );
          }
          const pendingRead =
            this.pendingReads[
              `session-${session}:sender-${sender}:recipient-${recipient}:msg_type-${msg_type}`
            ];
          if (pendingRead) {
            // globalThis.total_incoming += msg_data.length;
            // globalThis.total_incoming_msg.push(msg_data);
            pendingRead(msg_data);
          } else {
            this.msgQueue.push({
              session,
              sender,
              recipient,
              msg_type,
              msg_data,
            });
          }
        } else if (ev === 'precompute_complete') {
          // console.log('GETTING PRECOMPUTE COMPLETE');
          const { session, party } = data;
          if (session !== this.session) {
            this.log(
              `ignoring message for a different session... client session: ${this.session}, message session: ${session}`,
            );
          }
          this.precomputes[this.parties.indexOf(party)] = 'precompute_complete';
          resolve();
        }
      }, 200);

      // Add listener for incoming messages
      socket.addEventListener('message', async (event) => {
        // console.log(event);
        let ev, data;
        if (event.data) {
          ev = JSON.parse(event.data).ev;
          data = JSON.parse(event.data).data;
          // console.log('socket event HAS data!!');
        } else {
          console.error('socket event but no data');
          return;
          // debugger;
        }

        if (ev === 'send') {
          const { session, sender, recipient, msg_type, msg_data } = data;
          if (session !== this.session) {
            this.log(
              `ignoring message for a different session... client session: ${this.session}, message session: ${session}`,
            );
          }
          const pendingRead =
            this.pendingReads[
              `session-${session}:sender-${sender}:recipient-${recipient}:msg_type-${msg_type}`
            ];
          if (pendingRead) {
            // globalThis.total_incoming += msg_data.length;
            // globalThis.total_incoming_msg.push(msg_data);
            pendingRead(msg_data);
          } else {
            this.msgQueue.push({
              session,
              sender,
              recipient,
              msg_type,
              msg_data,
            });
          }
        } else if (ev === 'precompute_complete') {
          const { session, party } = data;
          if (session !== this.session) {
            this.log(
              `ignoring message for a different session... client session: ${this.session}, message session: ${session}`,
            );
          }
          this.precomputes[this.parties.indexOf(party)] = 'precompute_complete';
          resolve();
        }
      });
      return socket;
    });

    this._readyPromiseAll = Promise.all(this._readyPromises).then(() => {
      this._ready = true;
      this._endPrecomputeTime = Date.now();
      return null;
    });
    globalThis.tss_clients[this.session] = this;
  }

  async ready() {
    await this._readyPromiseAll;
  }

  precompute(tss: any, additionalParams?: Record<string, unknown>) {
    // console.log('precompute 1');
    this._startPrecomputeTime = Date.now();
    // console.log(
    //   'precompute 2',
    //   this.session,
    //   this.index,
    //   this.parties.length,
    //   this.parties.length,
    //   this.share,
    //   this.pubKey,
    // );

    // console.log('can get batch size', tss.batch_size());

    // this._signer = tss.threshold_signer_hack(
    //   this.session,
    //   `n${this.index}`,
    //   `n${this.parties.length}`,
    //   `n${this.parties.length}`,
    //   this.share,
    //   this.pubKey,
    // );
    // console.log('precompute 3');

    // this._rng = tss.random_generator(
    //   Buffer.from(generatePrivate()).toString('base64'),
    // );

    // console.log('precompute 4');

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < this.parties.length; i++) {
      const party = this.parties[i];
      if (party !== this.index) {
        fetch(`${this.lookupEndpoint(this.session, party)}/precompute`, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          method: 'post',
          body: JSON.stringify({
            endpoints: this.endpoints.map((endpoint, j) => {
              if (j !== this.index) {
                return endpoint;
              }
              // pass in different id for websocket connection for each server so that the server can communicate back
              return `websocket:0`;
            }),
            session: this.session,
            parties: this.parties,
            player_index: party,
            threshold: this.parties.length,
            pubkey: this.pubKey,
            notifyWebsocketId: 0,
            sendWebsocket: 0,
            ...additionalParams,
          }),
        });
      }
    }

    // console.log('precompute 5');
    tss
      .everything(
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        this.session,
        `n${this.index}`,
        `n${this.parties.length}`,
        `n${this.parties.length}`,
        this.share,
        this.pubKey,
        new Uint8Array(this.parties),
      )
      .then((precompute: any) => {
        // console.log('precompute 6');

        this.precomputes[this.parties.indexOf(this.index)] = precompute;
        this._readyResolves[this.parties.indexOf(this.index)]();
        return null;
      });
  }

  async sign(
    tss: any,
    msg: string,
    hash_only: boolean,
    original_message: string,
    hash_algo: string,
    additionalParams?: Record<string, unknown>,
  ): Promise<{ r: BN; s: BN; recoveryParam: number }> {
    if (!this._ready) {
      throw new Error('client is not ready');
    }
    // console.log('sign 1');
    if (this._consumed) {
      throw new Error(
        'this instance has already signed a message and cannot be reused',
      );
    } else {
      this._consumed = true;
    }
    // console.log('sign 2');

    if (this.precomputes.length !== this.parties.length) {
      throw new Error('insufficient precomputes');
    }
    // console.log('sign 3');

    // check message hashing
    if (!hash_only) {
      if (hash_algo === 'keccak256') {
        if (keccak256(original_message).toString('base64') !== msg) {
          throw new Error('hash of original message does not match msg');
        }
      } else {
        throw new Error(`hash algo ${hash_algo} not supported`);
      }
    }
    // console.log('sign 4');

    this._startSignTime = Date.now();
    const sigFragmentsPromises = [];
    // console.log('sign 5');

    for (let i = 0; i < this.precomputes.length; i++) {
      const precompute = this.precomputes[i];
      const party = i;
      if (precompute === 'precompute_complete') {
        // console.log('sign 6');

        const endpoint = this.lookupEndpoint(this.session, party);
        sigFragmentsPromises.push(
          fetch(`${endpoint}/sign`, {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            method: 'POST',
            body: JSON.stringify({
              session: this.session,
              sender: this.index,
              recipient: party,
              msg,
              hash_only,
              original_message,
              hash_algo,
              ...additionalParams,
            }),
          })
            .then((res) => res.json())
            .then((res) => {
              // console.log('sign 7', res);

              return res.sig;
            }),
        );
      } else {
        // console.log('sign 8');

        sigFragmentsPromises.push(
          Promise.resolve(tss.local_sign(msg, hash_only, precompute)),
        );
      }
    }
    // console.log('sign 9');

    const sigFragments = await Promise.all(sigFragmentsPromises);

    const R = tss.get_r_from_precompute(
      this.precomputes[this.parties.indexOf(this.index)],
    );
    const sig = tss.local_verify(msg, hash_only, R, sigFragments, this.pubKey);
    const sigHex = Buffer.from(sig, 'base64').toString('hex');
    const r = new BN(sigHex.slice(0, 64), 16);
    const s = new BN(sigHex.slice(64), 16);
    const recoveryParam = Buffer.from(R, 'base64')[63] % 2;
    this._endSignTime = Date.now();
    // console.log('sign 10');

    return { r, s, recoveryParam };
  }

  lookupEndpoint(session: string, party: number): string {
    if (session !== this.session) {
      throw new Error('incorrect session when looking up endpoint');
    }
    const endpoint = this.endpoints[party];
    if (!endpoint) {
      throw new Error('endpoint not found');
    }
    return endpoint;
  }

  async cleanup(tss: any, additionalParams?: Record<string, any>) {
    // free rust objects
    if (this._rng && this._signer) {
      tss.random_generator_free(this._rng);
      tss.threshold_signer_free(this._signer);
    }

    // remove references
    delete globalThis.tss_clients[this.session];

    await Promise.all(
      this.parties.map((party) => {
        if (party !== this.index) {
          return fetch(`${this.lookupEndpoint(this.session, party)}/cleanup`, {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            method: 'POST',
            body: JSON.stringify({
              session: this.session,
              ...additionalParams,
            }),
          });
        }
        return Promise.resolve(true);
      }),
    );
  }
}
