// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract DecentralizedFinance is ERC20 {
    address public owner;
    struct Loan {
        uint deadline;
        int256 amount;
        uint periodicity;
        uint256 interestRate;
        uint256 termination;
        address lender;
        address borrower;
        bool isBasedNFT;
        IERC721 nftContract;
        uint256 nftId;
    }
    uint public maxLoanDuration;
    uint public dexSwapRate;
    uint public balance;

    mapping(uint256 => Loan) public loans;

    uint256 public loanCount; // TODO: Criei para dar set do ID da loan, podemos retirar depois idk

    event loanCreated(address indexed borrower, uint256 amount, uint256 deadline);

    constructor() ERC20("DEX", "DEX") {
        _mint(address(this), 10**18);

    }

    function buyDex() external payable {
        require(msg.value > 0, "Value must be greater than 0");
        uint256 dexAmount = msg.value * dexSwapRate;
        _transfer(address(this), msg.sender, dexAmount);
    }

    function sellDex(uint256 dexAmount) external {
        require(dexAmount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= dexAmount, "Insufficient DEX balance");
        require(address(this).balance >= dexAmount / dexSwapRate, "Insufficient ETH balance in contract"); //TODO: SUS VERIRICR DEPOIS 
        uint256 ethAmount = dexAmount / dexSwapRate;
        _transfer(msg.sender, address(this), dexAmount);
        payable(msg.sender).transfer(ethAmount);
    }

    function loan(uint256 dexAmount, uint256 deadline) external {
        require(dexAmount > 0, "DEX amount must be greater than 0");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(deadline <= block.timestamp + maxLoanDuration, "Deadline exceeds max loan duration");
        require(balanceOf(msg.sender) >= dexAmount, "Insufficient DEX balance");
        require(address(this).balance >= dexAmount / dexSwapRate, "Insufficient ETH in contract");

        _transfer(msg.sender, address(this), dexAmount);
        uint256 ethAmount = dexAmount / dexSwapRate;
        payable(msg.sender).transfer(ethAmount);

        uint256 loanId = uint256(keccak256(abi.encodePacked(msg.sender, block.timestamp, dexAmount)));

        loanCount++;

        loans[loanId] = Loan({
            deadline: deadline,
            amount: int256(ethAmount),
            periodicity: 0, // TODO: IDK esses valores
            interestRate: 0, 
            termination: 0,
            lender: address(this),
            borrower: msg.sender,
            isBasedNFT: false,
            nftContract: IERC721(address(0)),
            nftId: loanCount // TODO: SUS
        });

        emit loanCreated(msg.sender, loanAmount, deadline);
    }

    function returnLoan(uint256 loanId) external { //TODO: Correção do enunciado
        Loan storage loan = loans[loanId];
        require(loan.borrower == msg.sender, "Not the borrower");
        require(!loan.isBasedNFT, "NFT-based loans must use a different function");
        require(loan.termination == 0, "Loan already terminated");
        require(msg.value >= uint256(loan.amount), "Insufficient repayment amount");

        uint256 refund = uint256(loan.amount); // TOOD: nao sei se é preciso adicionar fee

        loan.termination = block.timestamp;

        _transfer(address(this), msg.sender, refund * dexSwapRate);
        
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function setDexSwapRate(uint256 rate) external { // TODO: Nao esta no enunciado
        require(msg.sender == owner, "Only the owner can set the swap rate");
        dexSwapRate = rate;
    }

    function getDexBalance() public view returns (uint256) {
        return balanceOf(address(this));
    }

    function makeLoanRequestByNft(IERC721 nftContract, uint256 nftId, uint256 loanAmount, uint256 deadline) external {
        // TODO: implement this
    }

    function cancelLoanRequestByNft(IERC721 nftContract, uint256 nftId) external {
        // TODO: implement this
    }

    function loanByNft(IERC721 nftContract, uint256 nftId) external {
        // TODO: implement this

        emit loanCreated(msg.sender, loanAmount, deadline);
    }

    function checkLoan(uint256 loanId) external {
        require(msg.sender == owner, "Only the owner can check loan status");
        Loan storage loan = loans[loanId];
        require(loan.termination == 0, "Loan already terminated");

        if (block.timestamp > loan.deadline) {
            // TODO: Implement logic for Punish the loan
            loan.termination = block.timestamp;
        }
    }
}