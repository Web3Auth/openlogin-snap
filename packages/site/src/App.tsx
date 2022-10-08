import { useEffect, useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { Footer, Header, Home } from './components';
import { MetaMaskProvider } from './hooks';

import { light, dark, GlobalStyle } from './config/theme';
import {
  setLocalStorage,
  getThemePreference,
  MultiChainProvider,
} from './utils';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  max-width: 100vw;
`;

function App() {
  const [darkTheme, setDarkTheme] = useState(getThemePreference());

  const toggleTheme = () => {
    setLocalStorage('theme', darkTheme ? 'light' : 'dark');
    setDarkTheme(!darkTheme);
  };

  useEffect(() => {
    const provider = new MultiChainProvider();
    (window as any).multichainProvider = provider;
    provider
      .connect({
        requiredNamespaces: {
          eip155: {
            chains: ['eip155:5'],
            methods: [
              'eth_accounts',
              'eth_sendTransaction',
              'gnosis_watchSafe',
              'gnosis_createSafe',
            ],
          },
        },
      })
      .then(({ approval }) => {
        return approval();
      })
      .then((session) => {
        console.log('session', session);
      });
  });

  return (
    <ThemeProvider theme={darkTheme ? dark : light}>
      <MetaMaskProvider>
        <GlobalStyle />
        <Wrapper>
          <Header handleToggleClick={toggleTheme} />
          <Home />
          <Footer />
        </Wrapper>
      </MetaMaskProvider>
    </ThemeProvider>
  );
}

export default App;
