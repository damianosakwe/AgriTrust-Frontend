/**
 * Tests for Soroban simulator service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  simulateTransaction,
  calculateResourceUsage,
  getUsageColor,
  SOROBAN_LIMITS,
  type SimulationResult,
} from '@/src/services/sorobanSimulator';

describe('sorobanSimulator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('simulateTransaction', () => {
    it('should successfully simulate a transaction', async () => {
      const mockResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          cost: {
            minResourceFee: '1000000',
            cpuInsns: '5000000',
          },
          footprint: {
            readBytes: 1024,
            writeBytes: 512,
            readEntries: 5,
            writeEntries: 3,
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await simulateTransaction({
        contractId: 'CA123',
        functionName: 'deposit',
        args: ['100'],
      });

      expect(result).toEqual({
        minResourceFee: 1000000n,
        instructions: 5000000,
        cpuInstructions: 5000000,
        readBytes: 1024,
        writeBytes: 512,
        ledgerEntryReads: 5,
        ledgerEntryWrites: 3,
      });
    });

    it('should handle timeout error', async () => {
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 10000);
          })
      );

      const promise = simulateTransaction(
        {
          contractId: 'CA123',
          functionName: 'deposit',
          args: ['100'],
        },
        'https://rpc.stellar.org',
        100 // 100ms timeout
      );

      // Advance timers to trigger timeout
      await vi.advanceTimersByTimeAsync(101);

      await expect(promise).rejects.toMatchObject({
        code: 'TIMEOUT',
        message: expect.stringContaining('timed out'),
      });
    }, 10000); // Increase test timeout

    it('should handle RPC errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: 'CONTRACT_ERROR',
            message: 'Contract execution failed',
          },
        }),
      });

      await expect(
        simulateTransaction({
          contractId: 'CA123',
          functionName: 'deposit',
          args: ['100'],
        })
      ).rejects.toMatchObject({
        code: 'CONTRACT_ERROR',
        message: 'Contract execution failed',
      });
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        simulateTransaction({
          contractId: 'CA123',
          functionName: 'deposit',
          args: ['100'],
        })
      ).rejects.toMatchObject({
        code: 'RPC_ERROR',
        message: expect.stringContaining('status 500'),
      });
    });

    it('should handle missing result in response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
        }),
      });

      await expect(
        simulateTransaction({
          contractId: 'CA123',
          functionName: 'deposit',
          args: ['100'],
        })
      ).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
        message: 'Invalid response from RPC',
      });
    });
  });

  describe('calculateResourceUsage', () => {
    it('should calculate correct percentages', () => {
      const result: SimulationResult = {
        minResourceFee: 1000000n,
        instructions: 50_000_000, // 50% of 100M
        cpuInstructions: 50_000_000,
        readBytes: 100_000, // 50% of 200KB
        writeBytes: 50_000, // 50% of 100KB
        ledgerEntryReads: 20, // 50% of 40
        ledgerEntryWrites: 12, // 48% of 25
      };

      const usage = calculateResourceUsage(result);

      expect(usage.cpuPercent).toBe(50);
      expect(usage.readBytesPercent).toBe(50);
      expect(usage.writeBytesPercent).toBe(50);
      expect(usage.readEntriesPercent).toBe(50);
      expect(usage.writeEntriesPercent).toBe(48);
    });

    it('should handle zero values', () => {
      const result: SimulationResult = {
        minResourceFee: 0n,
        instructions: 0,
        cpuInstructions: 0,
        readBytes: 0,
        writeBytes: 0,
        ledgerEntryReads: 0,
        ledgerEntryWrites: 0,
      };

      const usage = calculateResourceUsage(result);

      expect(usage.cpuPercent).toBe(0);
      expect(usage.readBytesPercent).toBe(0);
      expect(usage.writeBytesPercent).toBe(0);
      expect(usage.readEntriesPercent).toBe(0);
      expect(usage.writeEntriesPercent).toBe(0);
    });

    it('should handle maximum values', () => {
      const result: SimulationResult = {
        minResourceFee: 1000000n,
        instructions: SOROBAN_LIMITS.maxInstructions,
        cpuInstructions: SOROBAN_LIMITS.maxInstructions,
        readBytes: SOROBAN_LIMITS.maxReadBytes,
        writeBytes: SOROBAN_LIMITS.maxWriteBytes,
        ledgerEntryReads: SOROBAN_LIMITS.maxLedgerEntryReads,
        ledgerEntryWrites: SOROBAN_LIMITS.maxLedgerEntryWrites,
      };

      const usage = calculateResourceUsage(result);

      expect(usage.cpuPercent).toBe(100);
      expect(usage.readBytesPercent).toBe(100);
      expect(usage.writeBytesPercent).toBe(100);
      expect(usage.readEntriesPercent).toBe(100);
      expect(usage.writeEntriesPercent).toBe(100);
    });
  });

  describe('getUsageColor', () => {
    it('should return green for usage < 50%', () => {
      expect(getUsageColor(0)).toBe('green');
      expect(getUsageColor(25)).toBe('green');
      expect(getUsageColor(49.9)).toBe('green');
    });

    it('should return yellow for usage 50-79%', () => {
      expect(getUsageColor(50)).toBe('yellow');
      expect(getUsageColor(65)).toBe('yellow');
      expect(getUsageColor(79.9)).toBe('yellow');
    });

    it('should return red for usage >= 80%', () => {
      expect(getUsageColor(80)).toBe('red');
      expect(getUsageColor(90)).toBe('red');
      expect(getUsageColor(100)).toBe('red');
    });
  });
});
