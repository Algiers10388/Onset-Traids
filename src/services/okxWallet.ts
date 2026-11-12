/**
 * OKX Web3 Wallet Connector & Multi-Chain Service
 * Direct integration with window.okxwallet / OKX Multi-Chain Web3 Extension & Mobile App
 */

export interface OkxChainConfig {
  chainIdHex: string;
  chainIdDec: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrl: string;
  blockExplorer: string;
  icon: string;
}

export const OKX_SUPPORTED_CHAINS: Record<string, OkxChainConfig> = {
  '0x1': {
    chainIdHex: '0x1',
    chainIdDec: 1,
    name: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://ethereum.publicnode.com',
    blockExplorer: 'https://www.okx.com/web3/explorer/eth',
    icon: '⟠',
  },
  '0xc4': {
    chainIdHex: '0xc4',
    chainIdDec: 196,
    name: 'OKX X Layer (ZK-L2)',
    nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
    rpcUrl: 'https://rpc.xlayer.tech',
    blockExplorer: 'https://www.okx.com/web3/explorer/xlayer',
    icon: '⬛',
  },
  '0xa4b1': {
    chainIdHex: '0xa4b1',
    chainIdDec: 42161,
    name: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    blockExplorer: 'https://www.okx.com/web3/explorer/arbitrum',
    icon: '🔵',
  },
  '0x89': {
    chainIdHex: '0x89',
    chainIdDec: 137,
    name: 'Polygon',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorer: 'https://www.okx.com/web3/explorer/polygon',
    icon: '🟣',
  },
  '0x2105': {
    chainIdHex: '0x2105',
    chainIdDec: 8453,
    name: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://www.okx.com/web3/explorer/base',
    icon: '🟡',
  },
  '0xa': {
    chainIdHex: '0xa',
    chainIdDec: 10,
    name: 'Optimism Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrl: 'https://mainnet.optimism.io',
    blockExplorer: 'https://optimistic.etherscan.io',
    icon: '🔴',
  },
};

export function isOkxWalletInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return Boolean(w.okxwallet || w.ethereum?.isOkxWallet);
}

export function getOkxProvider(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (w.okxwallet) return w.okxwallet;
  if (w.ethereum?.isOkxWallet) return w.ethereum;
  return w.ethereum || null;
}

export async function connectOkxWallet(): Promise<{
  address: string;
  chainId: string;
  networkName: string;
  balanceEth: number;
}> {
  const provider = getOkxProvider();

  if (!provider) {
    // If not detected in browser, throw informative error for UI prompt
    throw new Error('OKX_WALLET_NOT_INSTALLED');
  }

  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts authorized from OKX Wallet');
    }

    const address = accounts[0];
    const chainIdHex = (await provider.request({ method: 'eth_chainId' })) || '0x1';
    const chainConfig = OKX_SUPPORTED_CHAINS[chainIdHex] || {
      name: `Chain ${parseInt(chainIdHex, 16)}`,
    };

    let balanceEth = 0;
    try {
      const balHex = await provider.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      if (balHex) {
        balanceEth = Number(BigInt(balHex)) / 1e18;
      }
    } catch (e) {
      console.warn('Failed to query balance directly from OKX provider:', e);
    }

    // Cache connected address
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('apex_okx_wallet_address', address);
      localStorage.setItem('apex_okx_wallet_chain', chainIdHex);
    }

    return {
      address,
      chainId: chainIdHex,
      networkName: chainConfig.name,
      balanceEth,
    };
  } catch (err: any) {
    if (err.code === 4001) {
      throw new Error('Connection request was rejected by user in OKX Wallet.');
    }
    throw err;
  }
}

export async function switchOkxChain(chainIdHex: string): Promise<boolean> {
  const provider = getOkxProvider();
  if (!provider) throw new Error('OKX Wallet provider not available');

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
    return true;
  } catch (err: any) {
    // If chain not yet added to OKX Wallet (error code 4902), attempt to add it
    if (err.code === 4902 && OKX_SUPPORTED_CHAINS[chainIdHex]) {
      const cfg = OKX_SUPPORTED_CHAINS[chainIdHex];
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: cfg.chainIdHex,
            chainName: cfg.name,
            nativeCurrency: cfg.nativeCurrency,
            rpcUrls: [cfg.rpcUrl],
            blockExplorerUrls: [cfg.blockExplorer],
          },
        ],
      });
      return true;
    }
    throw err;
  }
}

export async function signOkxMessage(message: string, address: string): Promise<string> {
  const provider = getOkxProvider();
  if (!provider) throw new Error('OKX Wallet not available');

  const signature = await provider.request({
    method: 'personal_sign',
    params: [message, address],
  });
  return signature;
}

export function getCachedOkxAddress(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('apex_okx_wallet_address');
}

export function clearCachedOkxWallet(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('apex_okx_wallet_address');
    localStorage.removeItem('apex_okx_wallet_chain');
  }
}

export async function getConnectedChainId(): Promise<string | null> {
  const provider = getOkxProvider();
  if (!provider) return null;
  try {
    return (await provider.request({ method: 'eth_chainId' })) || null;
  } catch {
    return null;
  }
}

export async function sendOkxTransaction(tx: {
  to?: string;
  from?: string;
  value?: string;
  data?: string;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}): Promise<string> {
  const provider = getOkxProvider();
  if (!provider) throw new Error('Web3 / OKX Wallet provider not available. Please connect your wallet.');
  return await provider.request({
    method: 'eth_sendTransaction',
    params: [tx],
  });
}

/**
 * Polls JSON-RPC for a transaction receipt and extracts status and contractAddress
 */
export async function waitForTxReceipt(
  txHash: string,
  rpcUrl: string,
  maxAttempts = 35,
  intervalMs = 1500
): Promise<{ status: number; contractAddress?: string | null; blockNumber?: number } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now() + i,
          method: 'eth_getTransactionReceipt',
          params: [txHash],
        }),
      });
      const data = await res.json();
      if (data?.result) {
        const receipt = data.result;
        return {
          status: parseInt(receipt.status, 16),
          contractAddress: receipt.contractAddress || null,
          blockNumber: receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : undefined,
        };
      }
    } catch {
      // transient network glitch, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

export function registerWalletListeners(
  onAccounts: (accounts: string[]) => void,
  onChain: (chainId: string) => void
): () => void {
  const provider = getOkxProvider();
  if (!provider || !provider.on) return () => {};

  const handleAccounts = (accounts: string[]) => onAccounts(accounts);
  const handleChain = (chainId: string) => onChain(chainId);

  provider.on('accountsChanged', handleAccounts);
  provider.on('chainChanged', handleChain);

  return () => {
    if (provider.removeListener) {
      provider.removeListener('accountsChanged', handleAccounts);
      provider.removeListener('chainChanged', handleChain);
    }
  };
}
