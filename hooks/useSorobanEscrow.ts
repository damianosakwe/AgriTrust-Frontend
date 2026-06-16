import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/components/providers/WalletContext";

interface EscrowData {
  balance: string;
  milestoneStatus: string;
  certificationValid: boolean;
}

async function fetchEscrowData(account: string): Promise<EscrowData> {
  const response = await fetch(
    `/api/soroban/escrow?account=${encodeURIComponent(account)}`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch escrow data");
  }
  return response.json();
}

export function useSorobanEscrow() {
  const { account, isSwitching } = useWallet();

  const query = useQuery<EscrowData>({
    queryKey: ["soroban", "escrow", account],
    queryFn: () => fetchEscrowData(account!),
    enabled: !!account && !isSwitching,
  });

  return {
    escrowData: query.data,
    isLoading: query.isLoading || isSwitching,
    error: query.error,
  };
}
