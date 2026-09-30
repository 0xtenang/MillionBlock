// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title MillionBlock
 * @notice The Million Dollar Homepage, crypto-native, on Robinhood Chain.
 *
 * A 1000 x 1000 grid = 1,000,000 blocks. Every block is an ERC-721 token
 * (tokenId = y * 1000 + x). Blocks are bought from the protocol at a fixed
 * primary price, then traded peer-to-peer through the built-in marketplace,
 * which takes a 2% protocol fee on every secondary sale.
 *
 * Owners attach content (image, website, title, token/project address) to a
 * rectangle of blocks they own. The content is stored once and every block in
 * the rectangle points to it, so the whole grid becomes a living on-chain map
 * of the Robinhood Chain ecosystem.
 */
contract MillionBlock is ERC721, ERC2981, Ownable, ReentrancyGuard {
    using Strings for uint256;
    using Strings for address;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint256 public constant GRID_SIZE = 1000;
    uint256 public constant MAX_BLOCKS = GRID_SIZE * GRID_SIZE; // 1,000,000
    uint256 public constant PRIMARY_PRICE = 0.0004 ether;
    uint96 public constant FEE_BPS = 200; // 2%
    uint256 private constant BPS = 10_000;

    /// @notice Max blocks per mint / setContent call, keeps a tx well under the L2 gas limit.
    uint256 public constant MAX_BLOCKS_PER_TX = 400;
    /// @notice Max blocks per list / buy call.
    uint256 public constant MAX_TRADE_BATCH = 200;

    // Special positions. Fixed forever by position; nobody can add, remove or re-tier blocks.
    /// @notice Genesis blocks: token ids #1..#100 (top row, next to the top-left corner).
    uint256 public constant GENESIS_FIRST = 1;
    uint256 public constant GENESIS_LAST = 100;
    /// @notice Center blocks: the middle 100x100 square, x and y in [450, 549].
    uint256 public constant CENTER_MIN = 450;
    uint256 public constant CENTER_MAX = 549;
    // Corner blocks: (0,0) #0, (999,0) #999, (0,999) #999000, (999,999) #999999.

    uint256 private constant MAX_TEXT = 256;
    uint256 private constant MAX_URI = 2048;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Scarcity tier of a block, derived purely from its position (see tierOf).
    enum Tier {
        Standard,
        Genesis,
        Center,
        Corner
    }

    struct Content {
        address creator; // owner who published it
        uint16 x;
        uint16 y;
        uint16 w;
        uint16 h;
        bool hidden; // moderation flag
        address token; // optional token / project contract on Robinhood Chain
        string image; // https:// or ipfs:// or data: URI
        string url; // website
        string title; // name / tagline
    }

    struct BlockInfo {
        address owner; // address(0) = not minted yet
        uint32 contentId; // 0 = no content
        uint256 listPrice; // 0 = not listed
        uint256 lastPrice; // last price paid (primary or secondary)
        Tier tier;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public treasury;

    uint256 public totalMinted;
    uint256 public totalSales; // secondary sales count
    uint256 public totalVolume; // secondary volume (wei)
    uint256 public protocolBalance; // primary revenue + fees, withdrawable by treasury

    /// @dev Credits owed to sellers whose ETH push failed (pull fallback).
    mapping(address => uint256) public pendingWithdrawals;

    /// @dev contentId -> Content. Index 0 is a sentinel ("no content").
    Content[] private _contents;

    /// @dev contentId per block, packed 8 x uint32 per slot (row-major ids share slots).
    mapping(uint256 => uint256) private _contentSlots;

    mapping(uint256 => uint256) public listPrice;
    mapping(uint256 => uint256) public lastPrice;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event BlocksMinted(address indexed buyer, uint16 x, uint16 y, uint16 w, uint16 h, uint256 paid);
    event ContentSet(
        uint256 indexed contentId,
        address indexed owner,
        uint16 x,
        uint16 y,
        uint16 w,
        uint16 h,
        string image,
        string url,
        string title,
        address token
    );
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Delisted(uint256 indexed tokenId);
    event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 fee);
    event ContentModerated(uint256 indexed contentId, bool hidden);
    event TreasuryUpdated(address treasury);
    event Withdrawal(address indexed to, uint256 amount);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error OutOfBounds();
    error InvalidSize();
    error WrongPayment(uint256 expected, uint256 sent);
    error NotBlockOwner(uint256 tokenId);
    error NotListed(uint256 tokenId);
    error LengthMismatch();
    error ZeroPrice();
    error SelfPurchase();
    error TextTooLong();
    error NothingToWithdraw();
    error TransferFailed();
    error ZeroAddress();

    /// @dev Protocol treasury at launch: receives primary sales, the 2% marketplace fee and royalties.
    address public constant INITIAL_TREASURY = 0x3c8A4d94B3219F6633F2cC94094f4765b30c691C;

    /// @notice No constructor arguments: the deployer becomes owner, revenue goes to INITIAL_TREASURY.
    constructor() ERC721("MillionBlock", "MBLOCK") Ownable(msg.sender) {
        treasury = INITIAL_TREASURY;
        _setDefaultRoyalty(INITIAL_TREASURY, FEE_BPS);
        _contents.push(); // sentinel id 0
    }

    // ---------------------------------------------------------------------
    // Primary market
    // ---------------------------------------------------------------------

    /// @notice Buy every block of the rectangle (x, y, w, h) from the protocol.
    function mint(uint16 x, uint16 y, uint16 w, uint16 h) external payable nonReentrant {
        _mintRect(x, y, w, h);
    }

    /// @notice Buy a rectangle and publish content on it in one transaction.
    function mintAndSetContent(
        uint16 x,
        uint16 y,
        uint16 w,
        uint16 h,
        string calldata image,
        string calldata url,
        string calldata title,
        address token
    ) external payable nonReentrant {
        _mintRect(x, y, w, h);
        _publish(x, y, w, h, image, url, title, token);
    }

    function _mintRect(uint16 x, uint16 y, uint16 w, uint16 h) internal {
        uint256 count = _checkRect(x, y, w, h);
        uint256 cost = count * PRIMARY_PRICE;
        if (msg.value != cost) revert WrongPayment(cost, msg.value);

        for (uint256 row = y; row < uint256(y) + h; ++row) {
            uint256 base = row * GRID_SIZE;
            for (uint256 col = x; col < uint256(x) + w; ++col) {
                _mint(msg.sender, base + col); // reverts if already minted
            }
        }
        totalMinted += count;
        protocolBalance += cost;
        emit BlocksMinted(msg.sender, x, y, w, h, cost);
    }

    // ---------------------------------------------------------------------
    // Content
    // ---------------------------------------------------------------------

    /// @notice Publish content on a rectangle of blocks the caller fully owns.
    function setContent(
        uint16 x,
        uint16 y,
        uint16 w,
        uint16 h,
        string calldata image,
        string calldata url,
        string calldata title,
        address token
    ) external {
        _checkRect(x, y, w, h);
        for (uint256 row = y; row < uint256(y) + h; ++row) {
            uint256 base = row * GRID_SIZE;
            for (uint256 col = x; col < uint256(x) + w; ++col) {
                if (_ownerOf(base + col) != msg.sender) revert NotBlockOwner(base + col);
            }
        }
        _publish(x, y, w, h, image, url, title, token);
    }

    function _publish(
        uint16 x,
        uint16 y,
        uint16 w,
        uint16 h,
        string calldata image,
        string calldata url,
        string calldata title,
        address token
    ) internal {
        if (bytes(image).length > MAX_URI || bytes(url).length > MAX_URI || bytes(title).length > MAX_TEXT) {
            revert TextTooLong();
        }
        uint256 contentId = _contents.length;
        _contents.push(
            Content({
                creator: msg.sender,
                x: x,
                y: y,
                w: w,
                h: h,
                hidden: false,
                token: token,
                image: image,
                url: url,
                title: title
            })
        );
        for (uint256 row = y; row < uint256(y) + h; ++row) {
            uint256 base = row * GRID_SIZE;
            for (uint256 col = x; col < uint256(x) + w; ++col) {
                _setContentId(base + col, uint32(contentId));
            }
        }
        emit ContentSet(contentId, msg.sender, x, y, w, h, image, url, title, token);
    }

    // ---------------------------------------------------------------------
    // Secondary market (2% protocol fee)
    // ---------------------------------------------------------------------

    /// @notice List blocks for sale. No approval needed; listings are cleared on transfer.
    function list(uint256[] calldata tokenIds, uint256[] calldata prices) external {
        if (tokenIds.length != prices.length) revert LengthMismatch();
        if (tokenIds.length == 0 || tokenIds.length > MAX_TRADE_BATCH) revert InvalidSize();
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 id = tokenIds[i];
            if (_ownerOf(id) != msg.sender) revert NotBlockOwner(id);
            if (prices[i] == 0) revert ZeroPrice();
            listPrice[id] = prices[i];
            emit Listed(id, msg.sender, prices[i]);
        }
    }

    function delist(uint256[] calldata tokenIds) external {
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 id = tokenIds[i];
            if (_ownerOf(id) != msg.sender) revert NotBlockOwner(id);
            delete listPrice[id];
            emit Delisted(id);
        }
    }

    /**
     * @notice Buy listed blocks. msg.value must cover the sum of current list prices;
     * any excess is refunded. Seller receives 98%, protocol keeps 2%.
     */
    function buy(uint256[] calldata tokenIds) external payable nonReentrant {
        if (tokenIds.length == 0 || tokenIds.length > MAX_TRADE_BATCH) revert InvalidSize();

        uint256 n = tokenIds.length;
        address[] memory sellers = new address[](n);
        uint256[] memory payouts = new uint256[](n);
        uint256 total;
        uint256 fees;

        // Effects first: settle every transfer before any ETH leaves the contract.
        for (uint256 i; i < n; ++i) {
            uint256 id = tokenIds[i];
            uint256 price = listPrice[id];
            if (price == 0) revert NotListed(id);
            address seller = _ownerOf(id);
            if (seller == msg.sender) revert SelfPurchase();

            uint256 fee = (price * FEE_BPS) / BPS;
            total += price;
            fees += fee;
            sellers[i] = seller;
            payouts[i] = price - fee;

            _transfer(seller, msg.sender, id); // clears listing in _update
            lastPrice[id] = price;
            emit Sale(id, seller, msg.sender, price, fee);
        }
        if (total > msg.value) revert WrongPayment(total, msg.value);

        protocolBalance += fees;
        totalVolume += total;
        totalSales += n;

        // Interactions.
        for (uint256 i; i < n; ++i) _pay(sellers[i], payouts[i]);
        uint256 refund = msg.value - total;
        if (refund > 0) _pay(msg.sender, refund);
    }

    /// @dev Push ETH; if the recipient rejects it, credit it for later withdrawal.
    function _pay(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) pendingWithdrawals[to] += amount;
    }

    /// @notice Withdraw ETH credited because a direct payment failed.
    function withdrawPending() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Protocol admin
    // ---------------------------------------------------------------------

    /// @notice Send accumulated primary sales + marketplace fees to the treasury.
    function withdrawProtocol() external nonReentrant {
        uint256 amount = protocolBalance;
        if (amount == 0) revert NothingToWithdraw();
        protocolBalance = 0;
        (bool ok, ) = payable(treasury).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(treasury, amount);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        _setDefaultRoyalty(treasury_, FEE_BPS);
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Hide/unhide abusive content from the official frontend and tokenURI.
    function moderate(uint256 contentId, bool hidden) external onlyOwner {
        if (contentId == 0 || contentId >= _contents.length) revert OutOfBounds();
        _contents[contentId].hidden = hidden;
        emit ContentModerated(contentId, hidden);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function tokenIdOf(uint256 x, uint256 y) public pure returns (uint256) {
        if (x >= GRID_SIZE || y >= GRID_SIZE) revert OutOfBounds();
        return y * GRID_SIZE + x;
    }

    function coordsOf(uint256 tokenId) public pure returns (uint256 x, uint256 y) {
        if (tokenId >= MAX_BLOCKS) revert OutOfBounds();
        return (tokenId % GRID_SIZE, tokenId / GRID_SIZE);
    }

    /**
     * @notice Scarcity tier of a block. Pure function of the token id: the rules are
     * public from day one and cannot be changed by anyone, including the owner.
     * Every tier costs the same PRIMARY_PRICE; scarcity is priced by the market.
     */
    function tierOf(uint256 tokenId) public pure returns (Tier) {
        if (tokenId >= MAX_BLOCKS) revert OutOfBounds();
        uint256 x = tokenId % GRID_SIZE;
        uint256 y = tokenId / GRID_SIZE;
        if ((x == 0 || x == GRID_SIZE - 1) && (y == 0 || y == GRID_SIZE - 1)) return Tier.Corner;
        if (tokenId >= GENESIS_FIRST && tokenId <= GENESIS_LAST) return Tier.Genesis;
        if (x >= CENTER_MIN && x <= CENTER_MAX && y >= CENTER_MIN && y <= CENTER_MAX) return Tier.Center;
        return Tier.Standard;
    }

    function contentCount() external view returns (uint256) {
        return _contents.length - 1;
    }

    function getContent(uint256 contentId) external view returns (Content memory) {
        if (contentId >= _contents.length) revert OutOfBounds();
        return _contents[contentId];
    }

    function contentIdOf(uint256 tokenId) public view returns (uint32) {
        return uint32(_contentSlots[tokenId >> 3] >> ((tokenId & 7) * 32));
    }

    /// @notice Batch read of block state. Unminted blocks return owner = address(0).
    function getBlocks(uint256[] calldata tokenIds) external view returns (BlockInfo[] memory out) {
        out = new BlockInfo[](tokenIds.length);
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 id = tokenIds[i];
            address o = _ownerOf(id);
            out[i] = BlockInfo({
                owner: o,
                contentId: contentIdOf(id),
                listPrice: listPrice[id],
                lastPrice: o == address(0) ? 0 : (lastPrice[id] == 0 ? PRIMARY_PRICE : lastPrice[id]),
                tier: tierOf(id)
            });
        }
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        (uint256 x, uint256 y) = coordsOf(tokenId);
        uint32 cid = contentIdOf(tokenId);
        Content storage c = _contents[cid];
        bool show = cid != 0 && !c.hidden;

        Tier tier = tierOf(tokenId);
        bytes memory head = abi.encodePacked(
            '{"name":"MillionBlock #',
            tokenId.toString(),
            tier == Tier.Standard ? "" : string.concat(" ", _tierName(tier)),
            '","description":"One of 1,000,000 blocks on the MillionBlock homepage, the living map of Robinhood Chain.","image":"',
            _escape(show && bytes(c.image).length > 0 ? c.image : _placeholder(tokenId, x, y, tier)),
            '","external_url":"',
            show ? _escape(c.url) : ""
        );
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(abi.encodePacked(head, _attributes(tokenId, x, y, c, show)))
            )
        );
    }

    function _attributes(uint256 tokenId, uint256 x, uint256 y, Content storage c, bool show)
        internal
        view
        returns (bytes memory)
    {
        uint256 lp = lastPrice[tokenId] == 0 ? PRIMARY_PRICE : lastPrice[tokenId];
        return abi.encodePacked(
            '","attributes":[{"trait_type":"tier","value":"',
            _tierName(tierOf(tokenId)),
            '"},{"trait_type":"x","value":',
            x.toString(),
            '},{"trait_type":"y","value":',
            y.toString(),
            '},{"trait_type":"title","value":"',
            show ? _escape(c.title) : "",
            '"},{"trait_type":"project token","value":"',
            show && c.token != address(0) ? c.token.toHexString() : "",
            '"},{"trait_type":"last price (wei)","display_type":"number","value":',
            lp.toString(),
            "}]}"
        );
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0) && listPrice[tokenId] != 0) {
            delete listPrice[tokenId];
            emit Delisted(tokenId);
        }
    }

    function _checkRect(uint16 x, uint16 y, uint16 w, uint16 h) internal pure returns (uint256 count) {
        if (w == 0 || h == 0) revert InvalidSize();
        if (uint256(x) + w > GRID_SIZE || uint256(y) + h > GRID_SIZE) revert OutOfBounds();
        count = uint256(w) * h;
        if (count > MAX_BLOCKS_PER_TX) revert InvalidSize();
    }

    function _setContentId(uint256 tokenId, uint32 contentId) internal {
        uint256 slot = tokenId >> 3;
        uint256 shift = (tokenId & 7) * 32;
        uint256 v = _contentSlots[slot];
        _contentSlots[slot] = (v & ~(uint256(type(uint32).max) << shift)) | (uint256(contentId) << shift);
    }

    function _tierName(Tier t) internal pure returns (string memory) {
        if (t == Tier.Genesis) return "Genesis";
        if (t == Tier.Center) return "Center";
        if (t == Tier.Corner) return "Corner";
        return "Standard";
    }

    function _placeholder(uint256 tokenId, uint256 x, uint256 y, Tier tier) internal pure returns (string memory) {
        string memory color = tier == Tier.Genesis
            ? "#ffd24a"
            : tier == Tier.Center
                ? "#ff7a1a"
                : tier == Tier.Corner
                    ? "#b18cff"
                    : "#c3f53c";
        bytes memory svg = abi.encodePacked(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#0b0f0c'/>",
            "<rect x='8' y='8' width='84' height='84' fill='none' stroke='",
            color,
            tier == Tier.Standard ? "' stroke-width='3'/>" : "' stroke-width='6'/>",
            "<text x='50' y='46' font-family='monospace' font-size='13' fill='",
            color,
            "' text-anchor='middle'>#",
            tokenId.toString(),
            "</text><text x='50' y='64' font-family='monospace' font-size='9' fill='",
            color,
            "' text-anchor='middle'>",
            tier == Tier.Standard ? string.concat(x.toString(), ",", y.toString()) : _tierName(tier),
            "</text></svg>"
        );
        return string(abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(svg)));
    }

    /// @dev Minimal JSON string escaping for user supplied text.
    function _escape(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 extra;
        for (uint256 i; i < b.length; ++i) {
            if (b[i] == '"' || b[i] == "\\") extra++;
            else if (uint8(b[i]) < 0x20) extra += 5; // \u00XX
        }
        if (extra == 0) return s;
        bytes memory out = new bytes(b.length + extra);
        bytes16 hexChars = "0123456789abcdef";
        uint256 j;
        for (uint256 i; i < b.length; ++i) {
            bytes1 ch = b[i];
            if (ch == '"' || ch == "\\") {
                out[j++] = "\\";
                out[j++] = ch;
            } else if (uint8(ch) < 0x20) {
                out[j++] = "\\";
                out[j++] = "u";
                out[j++] = "0";
                out[j++] = "0";
                out[j++] = hexChars[uint8(ch) >> 4];
                out[j++] = hexChars[uint8(ch) & 0x0f];
            } else {
                out[j++] = ch;
            }
        }
        return string(out);
    }
}
