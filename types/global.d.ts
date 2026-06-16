/// <reference types="vite/client" />

interface FreighterProvider {
  isConnected: () => boolean;
  connect: () => Promise<{ address: string }>;
  on: (event: string, handler: () => void) => void;
  removeListener?: (event: string, handler: () => void) => void;
}

interface EthereumProvider {
  isMetaMask?: boolean;
  isWalletConnect?: boolean;
  selectedAddress?: string;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (
    event: string,
    handler: (...args: unknown[]) => void
  ) => void;
}

interface Window {
  ethereum?: EthereumProvider;
  freighter?: FreighterProvider;
  sorobanEvents?: (account: string) => void;
}
