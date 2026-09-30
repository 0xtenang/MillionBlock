import type { Rect } from "./utils";

/**
 * Image permanence for blocks.
 *
 *   user picks image → resized in the browser → /api/upload pins it to IPFS
 *   → ipfs://<CID> is written on-chain in the block's content
 *   → tokenURI (fully on-chain JSON) points at ipfs://<CID>
 *
 * The contract and the CID survive even if this website disappears; any IPFS
 * gateway or node can serve the image as long as at least one node pins it.
 */

const MAX_SIDE = 1024;
const MAX_UPLOAD = 1024 * 1024;

export type Permanence = { kind: "ipfs" | "arweave" | "onchain" | "hosted"; label: string; permanent: boolean };

export function permanenceOf(uri: string): Permanence | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return { kind: "ipfs", label: "📌 IPFS: content-addressed, survives this website", permanent: true };
  if (uri.startsWith("ar://")) return { kind: "arweave", label: "♾️ Arweave: paid once, stored permanently", permanent: true };
  if (uri.startsWith("data:")) return { kind: "onchain", label: "⛓️ Fully on-chain", permanent: true };
  return { kind: "hosted", label: "⚠️ Hosted link: breaks if that server goes away", permanent: false };
}

/**
 * Downscale to fit the block rectangle's aspect (max 1024px on the long side)
 * and re-encode as WebP. Small GIFs are kept as-is so animations survive.
 */
export async function prepareImage(file: File, rect: Rect): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  if (file.type === "image/gif" && file.size <= MAX_UPLOAD) return file;

  const bitmap = await createImageBitmap(file);
  const aspect = rect.w / rect.h;
  // Cover-crop to the rectangle's aspect ratio so the image fills the blocks exactly.
  let sw = bitmap.width, sh = bitmap.height;
  if (sw / sh > aspect) sw = Math.round(sh * aspect);
  else sh = Math.round(sw / aspect);
  const sx = (bitmap.width - sw) / 2, sy = (bitmap.height - sh) / 2;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.9, 0.8, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
    if (blob && blob.size <= MAX_UPLOAD) return blob;
  }
  throw new Error("Image is too detailed to fit in 1 MB, try a simpler image");
}

export async function uploadToIpfs(blob: Blob): Promise<string> {
  const res = await fetch("/api/upload", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: blob });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) throw new Error("Upload service not available here. Paste an ipfs:// link instead.");
    throw new Error(j.error || `Upload failed (${res.status})`);
  }
  return j.uri as string;
}
