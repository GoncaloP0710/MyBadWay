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

    constructor() payable ERC721("Simple NFT", "SNFT") Ownable(msg.sender) {}

    event NftMinted(address indexed nftContract, uint256 tokenId);

    function mint(string memory tokenURI) external payable {
        require(msg.value == mintPrice, "Wrong value");

        tokenIdCounter.increment();
        uint256 tokenId = tokenIdCounter.current();
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI);

        emit NftMinted(address(this), tokenId);
    }

    function getNftsByOwner() external view returns (uint256[] memory) {
        uint256 totalTokens = tokenIdCounter.current();
        uint256 count = 0;

        // First, count how many NFTs are owned by msg.sender
        for (uint256 i = 1; i <= totalTokens; i++) {
            if (ownerOf(i) == msg.sender) {
                count++;
            }
        }

        // Create an array to store the token IDs
        uint256[] memory ownedTokens = new uint256[](count);
        uint256 index = 0;

        // Populate the array with the token IDs owned by msg.sender
        for (uint256 i = 1; i <= totalTokens; i++) {
            if (ownerOf(i) == msg.sender) {
                ownedTokens[index] = i;
                index++;
            }
        }

        return ownedTokens;
    }
}