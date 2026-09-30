// Vercel serverless function: POST /api/upload
// Pins one image to IPFS through Pinata and returns its CID.
// The Pinata key stays on the server (env PINATA_JWT); the browser never sees it.
// The CID is then written on-chain by the user as `ipfs://<cid>` in their block's content.

const MAX_BYTES = 1024 * 1024; // 1 MB, images are compressed in the browser first

// Magic bytes of the formats we accept (never trust the client's content-type).
const FORMATS = [
  { type: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", ext: "gif", test: (b) => b.subarray(0, 4).toString("ascii") === "GIF8" },
  {
    type: "image/webp",
    ext: "webp",
    test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw Object.assign(new Error("Image too large (max 1 MB)"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return res.status(501).json({ error: "Uploads are not configured on this deployment (PINATA_JWT missing)." });

  try {
    const body = await readBody(req);
    if (body.length < 16) return res.status(400).json({ error: "Empty file" });
    const format = FORMATS.find((f) => f.test(body));
    if (!format) return res.status(415).json({ error: "Only PNG, JPEG, GIF or WebP images are accepted" });

    const form = new FormData();
    form.append("file", new Blob([body], { type: format.type }), `millionblock.${format.ext}`);
    form.append("pinataMetadata", JSON.stringify({ name: `millionblock-${Date.now()}.${format.ext}` }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const pin = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    if (!pin.ok) {
      console.error("Pinata error", pin.status, await pin.text().catch(() => ""));
      return res.status(502).json({ error: "Pinning service rejected the upload" });
    }
    const { IpfsHash } = await pin.json();
    return res.status(200).json({ cid: IpfsHash, uri: `ipfs://${IpfsHash}` });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.status ? e.message : "Upload failed" });
  }
}
