// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract SimpleNFT is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    uint256 public mintPrice = 1000 wei;
    Counters.Counter public tokenIdCounter;

    constructor() payable ERC721("Simple NFT", "SNFT") Ownable() {}

    event NftMinted(address indexed nftContract, uint256 tokenId);

    function mint(string memory tokenURI) external payable {
        require(msg.value == mintPrice, "Wrong value");

        tokenIdCounter.increment();
        uint256 tokenId = tokenIdCounter.current();
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI);

        emit NftMinted(address(this), tokenId);
    }

    // Example function to interact with IERC721
    function getOwnerOfToken(address nftContractAddress, uint256 tokenId) external view returns (address) {
        IERC721 nft = IERC721(nftContractAddress); // Cast address to IERC721
        return nft.ownerOf(tokenId); // Call IERC721 function
    }
}