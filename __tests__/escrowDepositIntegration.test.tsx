/**
 * Integration test for escrow deposit with fee estimation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EscrowDepositExample } from '@/src/components/wallet/EscrowDepositExample';
import { WalletProvider } from '@/components/providers/WalletContext';
import * as sorobanSimulator from '@/src/services/sorobanSimulator';
import * as feeFormatter from '@/src/utils/feeFormatter';

vi.mock('@/src/services/sorobanSimulator');
vi.mock('@/src/utils/feeFormatter');
vi.mock('@/hooks/useWeb3Session', () => ({
  useWeb3Session: () => ({}),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>{children}</WalletProvider>
    </QueryClientProvider>
  );
}

describe('Escrow Deposit Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful simulation by default
    const mockSimulationResult = {
      minResourceFee: BigInt(1000000),
      instructions: 5000000,
      cpuInstructions: 5000000,
      readBytes: 1024,
      writeBytes: 512,
      ledgerEntryReads: 5,
      ledgerEntryWrites: 3,
    };
    
    vi.mocked(sorobanSimulator.simulateTransaction).mockResolvedValue(mockSimulationResult);
    vi.mocked(feeFormatter.fetchExchangeRate).mockResolvedValue(0.12);
    vi.mocked(feeFormatter.formatStroops).mockReturnValue('0.1000000');
    vi.mocked(feeFormatter.formatStroopsDual).mockResolvedValue('0.1000000 XLM ($0.0120)');
    
    // Mock wallet
    if (typeof window !== 'undefined') {
      (window as any).freighter = {
        isConnected: () => true,
        connect: async () => ({ address: 'GABC123' }),
        on: vi.fn(),
        removeListener: vi.fn(),
      };
    }
  });

  it('should show preflight modal when deposit is triggered', async () => {
    // Mock fetch for escrow data
    global.fetch = vi.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/soroban/escrow')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            balance: '100.0000000',
            milestoneStatus: 'active',
            certificationValid: true,
          }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    }) as any;

    render(<EscrowDepositExample />, { wrapper: TestWrapper });

    // Wait for component to load
    await waitFor(() => {
      expect(screen.queryByText('Escrow Deposit')).toBeInTheDocument();
    });

    // Enter deposit amount
    const amountInput = screen.getByPlaceholderText('0.0000000');
    await userEvent.type(amountInput, '10');

    // Click deposit button
    const depositButton = screen.getByText('Deposit to Escrow');
    await userEvent.click(depositButton);

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText('Confirm Escrow Deposit')).toBeInTheDocument();
    });

    // Check that simulation was called
    expect(sorobanSimulator.simulateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: expect.any(String),
        functionName: 'deposit',
        args: ['10'],
      }),
      undefined,
      5000
    );
  });

  it('should complete deposit flow when confirmed', async () => {
    global.fetch = vi.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/soroban/escrow?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            balance: '100.0000000',
            milestoneStatus: 'active',
            certificationValid: true,
          }),
        });
      }
      if (typeof url === 'string' && url.includes('/api/soroban/escrow/deposit')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            txHash: '0xabc123',
            status: 'pending',
          }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    }) as any;

    render(<EscrowDepositExample />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.queryByText('Escrow Deposit')).toBeInTheDocument();
    });

    // Enter amount and trigger deposit
    const amountInput = screen.getByPlaceholderText('0.0000000');
    await userEvent.type(amountInput, '10');

    const depositButton = screen.getByText('Deposit to Escrow');
    await userEvent.click(depositButton);

    // Wait for modal
    await waitFor(() => {
      expect(screen.getByText('Confirm Escrow Deposit')).toBeInTheDocument();
    });

    // Wait for simulation to complete and show results
    await waitFor(() => {
      expect(screen.getByText('Estimated Resource Fee')).toBeInTheDocument();
    });

    // Click confirm
    const confirmButton = screen.getByText('Confirm & Sign');
    await userEvent.click(confirmButton);

    // Modal should close and deposit should proceed
    await waitFor(() => {
      expect(screen.queryByText('Confirm Escrow Deposit')).not.toBeInTheDocument();
    });
  });

  it('should cancel deposit when modal is closed', async () => {
    global.fetch = vi.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/soroban/escrow')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            balance: '100.0000000',
            milestoneStatus: 'active',
            certificationValid: true,
          }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    }) as any;

    render(<EscrowDepositExample />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.queryByText('Escrow Deposit')).toBeInTheDocument();
    });

    // Enter amount and trigger deposit
    const amountInput = screen.getByPlaceholderText('0.0000000');
    await userEvent.type(amountInput, '5');

    const depositButton = screen.getByText('Deposit to Escrow');
    await userEvent.click(depositButton);

    // Wait for modal
    await waitFor(() => {
      expect(screen.getByText('Confirm Escrow Deposit')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByText('Cancel');
    await userEvent.click(cancelButton);

    // Modal should close
    await waitFor(() => {
      expect(screen.queryByText('Confirm Escrow Deposit')).not.toBeInTheDocument();
    });

    // Deposit should not have been submitted
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/soroban/escrow/deposit'),
      expect.anything()
    );
  });

  it('should handle simulation timeout gracefully', async () => {
    // Mock timeout error
    vi.mocked(sorobanSimulator.simulateTransaction).mockRejectedValue({
      code: 'TIMEOUT',
      message: 'Simulation timed out after 5000ms',
    });

    global.fetch = vi.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/soroban/escrow')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            balance: '100.0000000',
            milestoneStatus: 'active',
            certificationValid: true,
          }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    }) as any;

    render(<EscrowDepositExample />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.queryByText('Escrow Deposit')).toBeInTheDocument();
    });

    // Trigger deposit
    const amountInput = screen.getByPlaceholderText('0.0000000');
    await userEvent.type(amountInput, '10');

    const depositButton = screen.getByText('Deposit to Escrow');
    await userEvent.click(depositButton);

    // Wait for timeout state
    await waitFor(() => {
      expect(screen.getByText('Simulation Timed Out')).toBeInTheDocument();
    });

    // User can still proceed
    const proceedButton = screen.getByText('Proceed Anyway');
    expect(proceedButton).toBeInTheDocument();
  });

  it('should validate amount before showing modal', async () => {
    render(<EscrowDepositExample />, { wrapper: TestWrapper });

    await waitFor(() => {
      expect(screen.queryByText('Escrow Deposit')).toBeInTheDocument();
    });

    // Click deposit without entering amount
    const depositButton = screen.getByText('Deposit to Escrow');
    
    // Button should be disabled
    expect(depositButton).toBeDisabled();
  });
});

