import { useEffect, useRef } from "react";
import { useWallet } from "@/components/providers/WalletContext";

interface SubscriptionHandle {
  unsubscribe: () => void;
}

function createSorobanSubscription(account: string): SubscriptionHandle {
  const interval = setInterval(() => {
    if (typeof window !== "undefined" && window.sorobanEvents) {
      window.sorobanEvents(account);
    }
  }, 15_000);

  return {
    unsubscribe: () => clearInterval(interval),
  };
}

export function useContractEvents() {
  const { account } = useWallet();
  const subscriptionRef = useRef<SubscriptionHandle | null>(null);

  useEffect(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }

    if (account) {
      subscriptionRef.current = createSorobanSubscription(account);
    }

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
      }
    };
  }, [account]);
}
