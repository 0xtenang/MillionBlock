const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const PRICE = ethers.parseEther("0.0004");
const TREASURY = "0x3c8A4d94B3219F6633F2cC94094f4765b30c691C";
const id = (x, y) => y * 1000 + x;

describe("MillionBlock", function () {
  async function deploy() {
    const [owner, alice, bob, carol] = await ethers.getSigners();
    const MB = await ethers.getContractFactory("MillionBlock");
    const mb = await MB.deploy();
    return { mb, owner, alice, bob, carol };
  }

  describe("primary mint", function () {
    it("mints a rectangle at 0.0004 ETH per block", async function () {
      const { mb, alice } = await loadFixture(deploy);
      await expect(mb.connect(alice).mint(10, 20, 3, 2, { value: PRICE * 6n }))
        .to.emit(mb, "BlocksMinted")
        .withArgs(alice.address, 10, 20, 3, 2, PRICE * 6n);
      expect(await mb.balanceOf(alice.address)).to.equal(6);
      expect(await mb.ownerOf(id(12, 21))).to.equal(alice.address);
      expect(await mb.totalMinted()).to.equal(6);
      expect(await mb.protocolBalance()).to.equal(PRICE * 6n);
    });

    it("rejects wrong payment, overlaps, bounds and oversize", async function () {
      const { mb, alice, bob } = await loadFixture(deploy);
      await expect(mb.connect(alice).mint(0, 0, 2, 2, { value: PRICE })).to.be.revertedWithCustomError(mb, "WrongPayment");
      await mb.connect(alice).mint(0, 0, 2, 2, { value: PRICE * 4n });
      await expect(mb.connect(bob).mint(1, 1, 2, 2, { value: PRICE * 4n })).to.be.revertedWithCustomError(mb, "ERC721InvalidSender");
      await expect(mb.connect(bob).mint(999, 0, 2, 1, { value: PRICE * 2n })).to.be.revertedWithCustomError(mb, "OutOfBounds");
      await expect(mb.connect(bob).mint(100, 100, 21, 20, { value: PRICE * 420n })).to.be.revertedWithCustomError(mb, "InvalidSize");
      await expect(mb.connect(bob).mint(100, 100, 0, 20, { value: 0 })).to.be.revertedWithCustomError(mb, "InvalidSize");
    });

    it("can mint the max batch (20x20) in one tx", async function () {
      const { mb, alice } = await loadFixture(deploy);
      const tx = await mb.connect(alice).mintAndSetContent(980, 980, 20, 20, "ipfs://img", "https://x.io", "Corner", ethers.ZeroAddress, { value: PRICE * 400n });
      const r = await tx.wait();
      console.log("      gas for 400-block mint+content:", r.gasUsed.toString());
      expect(await mb.ownerOf(id(999, 999))).to.equal(alice.address);
      expect(await mb.contentIdOf(id(999, 999))).to.equal(1);
    });
  });

  describe("content", function () {
    it("publishes content for owned rectangles only", async function () {
      const { mb, alice, bob } = await loadFixture(deploy);
      await mb.connect(alice).mint(0, 0, 4, 4, { value: PRICE * 16n });
      const token = "0x000000000000000000000000000000000000dEaD";
      await expect(mb.connect(alice).setContent(0, 0, 4, 4, "https://i/img.png", "https://site", "Hood", token))
        .to.emit(mb, "ContentSet")
        .withArgs(1, alice.address, 0, 0, 4, 4, "https://i/img.png", "https://site", "Hood", token);
      expect(await mb.contentIdOf(id(3, 3))).to.equal(1);
      expect(await mb.contentIdOf(id(4, 3))).to.equal(0);
      const c = await mb.getContent(1);
      expect(c.title).to.equal("Hood");
      expect(c.token).to.equal(token);

      await expect(mb.connect(bob).setContent(0, 0, 1, 1, "", "", "", ethers.ZeroAddress)).to.be.revertedWithCustomError(mb, "NotBlockOwner");
      // sub-rectangle override
      await mb.connect(alice).setContent(1, 1, 2, 2, "b", "", "", ethers.ZeroAddress);
      expect(await mb.contentIdOf(id(1, 1))).to.equal(2);
      expect(await mb.contentIdOf(id(0, 0))).to.equal(1);
      expect(await mb.contentCount()).to.equal(2);
    });

    it("packs content ids independently per block", async function () {
      const { mb, alice } = await loadFixture(deploy);
      await mb.connect(alice).mint(0, 0, 10, 1, { value: PRICE * 10n });
      for (let x = 0; x < 10; x++) await mb.connect(alice).setContent(x, 0, 1, 1, `i${x}`, "", "", ethers.ZeroAddress);
      for (let x = 0; x < 10; x++) expect(await mb.contentIdOf(x)).to.equal(x + 1);
    });

    it("tokenURI returns valid on-chain JSON with escaped text", async function () {
      const { mb, alice } = await loadFixture(deploy);
      await mb.connect(alice).mintAndSetContent(5, 7, 1, 1, "https://img", "https://site", 'He said "gm"\\', ethers.ZeroAddress, { value: PRICE });
      const uri = await mb.tokenURI(id(5, 7));
      const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
      expect(json.name).to.equal("MillionBlock (5,7)");
      expect(json.image).to.equal("https://img");
      expect(json.attributes.find((a) => a.trait_type === "title").value).to.equal('He said "gm"\\');
    });

    it("owner can moderate content", async function () {
      const { mb, owner, alice } = await loadFixture(deploy);
      await mb.connect(alice).mintAndSetContent(0, 0, 1, 1, "https://bad", "", "", ethers.ZeroAddress, { value: PRICE });
      await expect(mb.connect(alice).moderate(1, true)).to.be.revertedWithCustomError(mb, "OwnableUnauthorizedAccount");
      await mb.connect(owner).moderate(1, true);
      const json = JSON.parse(Buffer.from((await mb.tokenURI(0)).split(",")[1], "base64").toString());
      expect(json.image.startsWith("data:image/svg+xml")).to.equal(true);
    });
  });

  describe("secondary market", function () {
    it("lists and sells with a 2% protocol fee", async function () {
      const { mb, alice, bob } = await loadFixture(deploy);
      await mb.connect(alice).mint(0, 0, 2, 1, { value: PRICE * 2n });
      const p = ethers.parseEther("0.01");
      await expect(mb.connect(alice).list([0, 1], [p, p * 2n])).to.emit(mb, "Listed").withArgs(0, alice.address, p);

      const before = await ethers.provider.getBalance(alice.address);
      const bobBefore = await ethers.provider.getBalance(bob.address);
      const tx = await mb.connect(bob).buy([0, 1], { value: p * 3n + 12345n }); // overpay -> refund
      const r = await tx.wait();
      await expect(tx).to.emit(mb, "Sale").withArgs(0, alice.address, bob.address, p, p / 50n);

      const fee = (p * 3n) / 50n;
      expect(await ethers.provider.getBalance(alice.address)).to.equal(before + p * 3n - fee);
      expect(await ethers.provider.getBalance(bob.address)).to.equal(bobBefore - p * 3n - r.gasUsed * r.gasPrice);
      expect(await mb.ownerOf(0)).to.equal(bob.address);
      expect(await mb.listPrice(0)).to.equal(0);
      expect(await mb.lastPrice(1)).to.equal(p * 2n);
      expect(await mb.protocolBalance()).to.equal(PRICE * 2n + fee);
      expect(await mb.totalVolume()).to.equal(p * 3n);
      expect(await mb.totalSales()).to.equal(2);
    });

    it("rejects underpayment, unlisted, self-buy and foreign listing", async function () {
      const { mb, alice, bob } = await loadFixture(deploy);
      await mb.connect(alice).mint(0, 0, 1, 1, { value: PRICE });
      await expect(mb.connect(bob).list([0], [1])).to.be.revertedWithCustomError(mb, "NotBlockOwner");
      await expect(mb.connect(bob).buy([0], { value: 1 })).to.be.revertedWithCustomError(mb, "NotListed");
      await mb.connect(alice).list([0], [1000]);
      await expect(mb.connect(alice).buy([0], { value: 1000 })).to.be.revertedWithCustomError(mb, "SelfPurchase");
      await expect(mb.connect(bob).buy([0], { value: 999 })).to.be.revertedWithCustomError(mb, "WrongPayment");
      await expect(mb.connect(alice).list([0], [0])).to.be.revertedWithCustomError(mb, "ZeroPrice");
    });

    it("clears listing on external transfer and delist", async function () {
      const { mb, alice, bob, carol } = await loadFixture(deploy);
      await mb.connect(alice).mint(0, 0, 2, 1, { value: PRICE * 2n });
      await mb.connect(alice).list([0, 1], [100, 100]);
      await mb.connect(alice).transferFrom(alice.address, carol.address, 0);
      await expect(mb.connect(bob).buy([0], { value: 100 })).to.be.revertedWithCustomError(mb, "NotListed");
      await mb.connect(alice).delist([1]);
      expect(await mb.listPrice(1)).to.equal(0);
    });

    it("credits sellers that reject ETH instead of blocking the sale", async function () {
      const { mb, alice, bob } = await loadFixture(deploy);
      const Rej = await ethers.getContractFactory("RejectingSeller");
      const rej = await Rej.deploy(await mb.getAddress());
      await rej.mintAndList(PRICE, 5000n, { value: PRICE });
      await mb.connect(bob).buy([0], { value: 5000n });
      expect(await mb.pendingWithdrawals(await rej.getAddress())).to.equal(4900n);
      expect(await mb.ownerOf(0)).to.equal(bob.address);
    });
  });

  describe("protocol", function () {
    it("deployer is owner and revenue goes to the hardcoded treasury", async function () {
      const { mb, owner, alice } = await loadFixture(deploy);
      expect(await mb.owner()).to.equal(owner.address);
      expect(await mb.treasury()).to.equal(TREASURY);

      await mb.connect(alice).mint(0, 0, 5, 5, { value: PRICE * 25n });
      const before = await ethers.provider.getBalance(TREASURY);
      await mb.connect(alice).withdrawProtocol(); // anyone can trigger, funds only go to treasury
      expect(await ethers.provider.getBalance(TREASURY)).to.equal(before + PRICE * 25n);
      expect(await mb.protocolBalance()).to.equal(0);

      const [recv, amt] = await mb.royaltyInfo(0, 10000);
      expect(recv).to.equal(TREASURY);
      expect(amt).to.equal(200);

      await expect(mb.connect(alice).setTreasury(alice.address)).to.be.revertedWithCustomError(mb, "OwnableUnauthorizedAccount");
      await mb.connect(owner).setTreasury(alice.address);
      expect(await mb.treasury()).to.equal(alice.address);
    });

    it("getBlocks reports state for minted and unminted blocks", async function () {
      const { mb, alice } = await loadFixture(deploy);
      await mb.connect(alice).mintAndSetContent(0, 0, 1, 1, "i", "", "", ethers.ZeroAddress, { value: PRICE });
      await mb.connect(alice).list([0], [777]);
      const [a, b] = await mb.getBlocks([0, 1]);
      expect(a.owner).to.equal(alice.address);
      expect(a.contentId).to.equal(1);
      expect(a.listPrice).to.equal(777);
      expect(a.lastPrice).to.equal(PRICE);
      expect(b.owner).to.equal(ethers.ZeroAddress);
      expect(b.lastPrice).to.equal(0);
    });
  });
});
