import { useEffect, useState } from "react";
import { BaseError, type Address } from "viem";
import { millionBlockAbi } from "./abi";
import { useAccount, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { CHAIN, explorer } from "./config";

type TxRequest = {
  address: Address;
  abi: typeof millionBlockAbi;
  functionName: "mint" | "mintAndSetContent" | "setContent" | "list" | "delist" | "buy" | "withdrawProtocol";
  args: readonly unknown[];
  value?: bigint;
};

/** Wraps a contract write with network switching + receipt tracking. */
export function useTx(onDone?: () => void) {
  const { chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending, reset } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const [error, setError] = useState<string>();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  async function send(req: TxRequest) {
    setError(undefined);
    setHash(undefined);
    reset();
    try {
      if (chainId !== CHAIN.id) await switchChainAsync({ chainId: CHAIN.id });
      setHash(await writeContractAsync(req as Parameters<typeof writeContractAsync>[0]));
    } catch (e) {
      setError(e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e));
    }
  }

  const status = isPending
    ? "Confirm in wallet…"
    : hash && receipt.isLoading
      ? "Waiting for confirmation…"
      : receipt.isSuccess
        ? "Confirmed ✓"
        : receipt.isError
          ? "Transaction failed"
          : undefined;

  return { send, busy: isPending || (!!hash && receipt.isLoading), status, error, hash, isConnected };
}

export function TxStatus({ tx }: { tx: ReturnType<typeof useTx> }) {
  if (!tx.status && !tx.error) return null;
  return (
    <div className={`tx-status ${tx.error ? "err" : ""}`}>
      {tx.error ?? tx.status}
      {tx.hash && explorer && (
        <>
          {" "}
          <a href={`${explorer}/tx/${tx.hash}`} target="_blank" rel="noreferrer">
            view tx ↗
          </a>
        </>
      )}
    </div>
  );
}
