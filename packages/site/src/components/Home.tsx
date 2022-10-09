/* eslint-disable @typescript-eslint/ban-ts-comment */
import { useCallback, useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import OpenLogin from '@toruslabs/openlogin-mpc';
// import { MultiChainProvider } from '@metamask/multichain-provider';
import { MetamaskActions, MetaMaskContext } from '../hooks';
import {
  connectSnap,
  getSnap,
  MultiChainProvider,
  shouldDisplayReconnectButton,
  storeOpenLoginStateIntoSnap,
} from '../utils';
import { OpenLoginState } from '../config/snap';
import {
  ConnectButton,
  InstallFlaskButton,
  LoginWithOpenLoginButton,
  ReconnectButton,
  SendHelloButton,
} from './Buttons';
import { Card } from './Card';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  margin-top: 7.6rem;
  margin-bottom: 7.6rem;
  ${({ theme }) => theme.mediaQueries.small} {
    padding-left: 2.4rem;
    padding-right: 2.4rem;
    margin-top: 2rem;
    margin-bottom: 2rem;
    width: auto;
  }
`;

const Heading = styled.h1`
  margin-top: 0;
  margin-bottom: 2.4rem;
  text-align: center;
`;

const Span = styled.span`
  color: ${(props) => props.theme.colors.primary.default};
`;

const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.large};
  font-weight: 500;
  margin-top: 0;
  margin-bottom: 0;
  ${({ theme }) => theme.mediaQueries.small} {
    font-size: ${({ theme }) => theme.fontSizes.text};
  }
`;

const CardContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 64.8rem;
  width: 100%;
  height: 100%;
  margin-top: 1.5rem;
`;

const Notice = styled.div`
  background-color: ${({ theme }) => theme.colors.background.alternative};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  color: ${({ theme }) => theme.colors.text.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;

  & > * {
    margin: 0;
  }
  ${({ theme }) => theme.mediaQueries.small} {
    margin-top: 1.2rem;
    padding: 1.6rem;
  }
`;

const ErrorMessage = styled.div`
  background-color: ${({ theme }) => theme.colors.error.muted};
  border: 1px solid ${({ theme }) => theme.colors.error.default};
  color: ${({ theme }) => theme.colors.error.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-bottom: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;
  ${({ theme }) => theme.mediaQueries.small} {
    padding: 1.6rem;
    margin-bottom: 1.2rem;
    margin-top: 1.2rem;
    max-width: 100%;
  }
`;

const openLoginInstance = new OpenLogin({
  clientId: 'your_lci',
  network: 'mpc-testnet',
  _iframeUrl: 'https://mpc-beta.openlogin.com',
});

export const Home = () => {
  const [state, dispatch] = useContext(MetaMaskContext);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [openLoginState, setOpenLoginState] = useState<OpenLoginState>({});

  const setOpenLoginInfo = useCallback(async () => {
    const userInfo = await openLoginInstance.getUserInfo();
    const { privKey } = openLoginInstance;
    console.log(userInfo, privKey);
    const { tssShare, signatures } = openLoginInstance.state;
    setOpenLoginState({
      tssShare,
      signatures,
      verifier: userInfo.verifier,
      aggregateVerifier: userInfo.aggregateVerifier,
      verifierId: userInfo.verifierId,
      privKey,
    });
  }, [setOpenLoginState]);

  useEffect(() => {
    async function initOpenLogin() {
      await openLoginInstance.init();
      setIsInitialized(true);
      if (openLoginInstance.privKey) {
        setIsLoggedIn(true);
        await setOpenLoginInfo();
      }
    }
    initOpenLogin();
  }, [setIsInitialized, setIsLoggedIn, setOpenLoginInfo, setOpenLoginState]);

  const handleConnectClick = async () => {
    try {
      await connectSnap();
      const installedSnap = await getSnap();

      dispatch({
        type: MetamaskActions.SetInstalled,
        payload: installedSnap,
      });
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const handleOpenLoginClick = async () => {
    await openLoginInstance.login({
      mfaLevel: 'mandatory',
    });

    setIsLoggedIn(true);
    await setOpenLoginInfo();
  };

  const handleSendHelloClick = async () => {
    try {
      await storeOpenLoginStateIntoSnap(openLoginState);
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  const handleSignMsg = async () => {
    try {
      const provider = new MultiChainProvider();
      console.log('HERE NOW');
      const { approval } = await provider.connect({
        requiredNamespaces: {
          eip155: {
            chains: ['eip155:5'],
            methods: ['eth_accounts', 'eth_sendTransaction'],
          },
        },
      });
      console.log('HERE NOW 2');
      const session = await approval();
      console.log(session, 'got session');
      const accounts = await provider.request({
        chainId: 'eip155:5',
        request: {
          method: 'eth_accounts',
          params: [],
        },
      });
      console.log(accounts, 'found accounts');
    } catch (e) {
      console.error(e);
      dispatch({ type: MetamaskActions.SetError, payload: e });
    }
  };

  return (
    <Container>
      <Heading>
        Welcome to <Span>template-snap</Span>
      </Heading>
      <Subtitle>
        Get started by editing <code>src/index.ts</code>
      </Subtitle>
      <CardContainer>
        {state.error && (
          <ErrorMessage>
            <b>An error happened:</b> {state.error.message}
          </ErrorMessage>
        )}
        <Card
          content={{
            title: 'Login With OpenLogin',
            description: openLoginState.tssShare
              ? 'Logged In'
              : 'Login With MPC version of OpenLogin',
            button: !openLoginState.tssShare && (
              <LoginWithOpenLoginButton
                onClick={handleOpenLoginClick}
                disabled={!isInitialized || isLoggedIn}
              />
            ),
          }}
          fullWidth
        />

        {!state.isFlask && (
          <Card
            content={{
              title: 'Install',
              description:
                'Snaps is pre-release software only available in MetaMask Flask, a canary distribution for developers with access to upcoming features.',
              button: <InstallFlaskButton />,
            }}
            fullWidth
          />
        )}
        {!state.installedSnap && (
          <Card
            content={{
              title: 'Connect',
              description:
                'Get started by connecting to and installing the example snap.',
              button: (
                <ConnectButton
                  onClick={handleConnectClick}
                  disabled={!state.isFlask}
                />
              ),
            }}
            disabled={!state.isFlask}
          />
        )}
        {shouldDisplayReconnectButton(state.installedSnap) && (
          <Card
            content={{
              title: 'Reconnect',
              description:
                'While connected to a local running snap this button will always be displayed in order to update the snap if a change is made.',
              button: (
                <ReconnectButton
                  onClick={handleConnectClick}
                  disabled={!state.installedSnap}
                />
              ),
            }}
            disabled={!state.installedSnap}
          />
        )}
        <Card
          content={{
            title: 'Store OpenLogin State',
            description:
              'Display a custom message within a confirmation screen in MetaMask.',
            button: (
              <SendHelloButton
                onClick={handleSendHelloClick}
                disabled={false}
              />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Card
          content={{
            title: 'Gets Accounts',
            description: 'Gets OpenLogin Accounts',
            button: (
              <SendHelloButton onClick={handleSignMsg} disabled={false} />
            ),
          }}
          disabled={false}
          fullWidth={false}
        />
        <Notice>
          <p>
            Please note that the <b>snap.manifest.json</b> and{' '}
            <b>package.json</b> must be located in the server root directory and
            the bundle must be hosted at the location specified by the location
            field.
          </p>
        </Notice>
      </CardContainer>
    </Container>
  );
};
