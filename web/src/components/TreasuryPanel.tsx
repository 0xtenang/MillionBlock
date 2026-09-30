import { useAccount, useBalance, useReadContracts } from "wagmi";
import { millionBlockAbi } from "../abi";
import { CONTRACT, explorer } from "../config";
import { TxStatus, useTx } from "../tx";
import { eth, short } from "../utils";

/**
 * Protocol revenue panel, shown only to the contract owner or treasury wallet.
 * withdrawProtocol() always sends to the treasury address, whoever calls it.
 */
export function TreasuryPanel() {
  const { address } = useAccount();
  const contract = { address: CONTRACT!, abi: millionBlockAbi } as const;
  const reads = useReadContracts({
    contracts: [
      { ...contract, functionName: "protocolBalance" },
      { ...contract, functionName: "treasury" },
      { ...contract, functionName: "owner" },
      { ...contract, functionName: "totalMinted" },
      { ...contract, functionName: "totalVolume" },
    ],
    query: { enabled: !!CONTRACT, refetchInterval: 15_000 },
  });
  const [balance, treasury, owner, minted, volume] = reads.data?.map((r) => r.result) ?? [];
  const treasuryBal = useBalance({ address: treasury as `0x${string}` | undefined, query: { enabled: !!treasury } });
  const tx = useTx(() => {
    reads.refetch();
    treasuryBal.refetch();
  });

  const me = address?.toLowerCase();
  if (!CONTRACT || !me || (me !== String(owner).toLowerCase() && me !== String(treasury).toLowerCase())) return null;

  const claimable = (balance as bigint | undefined) ?? 0n;
  return (
    <section className="treasury">
      <div className="row-between">
        <div>
          <div className="eyebrow">Protocol revenue · visible to owner/treasury only</div>
          <div className="kpi-value">{eth(claimable, 6)} Ξ <span className="muted small">claimable</span></div>
        </div>
        <button
          className="primary"
          disabled={claimable === 0n || tx.busy}
          onClick={() => tx.send({ ...contract, functionName: "withdrawProtocol", args: [] })}
        >
          {claimable === 0n ? "Nothing to claim" : `Claim ${eth(claimable, 6)} Ξ`}
        </button>
      </div>
      <div className="muted small">
        Mint revenue + 2% marketplace fees accumulate in the contract. Claiming sends them to the treasury{" "}
        {explorer && treasury ? (
          <a href={`${explorer}/address/${treasury}`} target="_blank" rel="noreferrer">{short(String(treasury))}</a>
        ) : null}
        {treasuryBal.data ? ` (wallet balance ${eth(treasuryBal.data.value, 5)} Ξ)` : ""}.
        {" "}Blocks minted: {minted !== undefined ? Number(minted).toLocaleString() : "…"} · Secondary volume: {eth(volume as bigint | undefined, 4)} Ξ
      </div>
      <TxStatus tx={tx} />
    </section>
  );
}
