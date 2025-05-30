// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract DecentralizedFinance is ERC20 {
    address public owner;
    struct Loan {
        uint deadline;
        uint256 amount;
        address lender;
        address borrower;
        bool isBasedNFT;
        IERC721 nftContract;
        uint256 nftId;
    }

    uint public maxLoanDuration;
    uint public dexSwapRate;
    uint public balance;

    uint private rate;
    uint private periodicity;
    uint private interest;
    uint private termination;

    uint256 public loanCount; // TODO: Criei para dar set do ID da loan, podemos retirar depois idk
    uint256 public nftCount; // TODO: Criei para dar set do ID da loan, podemos retirar depois idk

    uint256 public dex_lock_in = 0; // TODO: Check
    
    // --------------------- Mapping ---------------------
    mapping(uint256 => Loan) public loans;

    // --------------------- Events ---------------------
    // event buyDex(address indexed buyer, uint256 amount);
    // event sellDex(address indexed seller, uint256 amount);
    event loanCreated(address indexed borrower, uint256 amount, uint256 deadline);
    // event returnLoan(address indexed borrower, uint256 amount, uint256 loanId);

    constructor(uint256 _rate, uint256 _periodicity, uint256 _interest, uint256 _termination) ERC20("DEX", "DEX") {
        require(_rate > 0, "Rate must be greater than 0");
        require(_periodicity > 0, "Periodicity must be greater than 0");
        require(_interest > 0, "Interest must be greater than 0");
        require(_termination > 0, "Termination fee must be greater than 0");
        
        _mint(address(this), 10**24);
        owner = msg.sender;
        rate = _rate;
        periodicity = _periodicity;
        interest = _interest;
        termination = _termination;

        maxLoanDuration = 30 days;
        dexSwapRate = 1000;
        loanCount = 0;
    }

    function buyDex() external payable {
        require(msg.value > 0, "Value must be greater than 0");
        
        uint256 dexAmount = msg.value * dexSwapRate;
        require(balanceOf(address(this)) >= dexAmount, "Insufficient DEX tokens in contract");
        
        _transfer(address(this), msg.sender, dexAmount);
    }

    function sellDex(uint256 dexAmount) external {
        require(balanceOf(msg.sender) >= dexAmount, "Insufficient DEX balance");
        require(address(this).balance >= dexAmount / dexSwapRate, "Insufficient ETH balance in contract"); //TODO: SUS VERIRICR DEPOIS 
        
        uint256 ethAmount = (dexAmount / dexSwapRate); // Convert DEX amount to ETH amount based on swap rate
        _transfer(msg.sender, address(this), dexAmount);
        payable(msg.sender).transfer(ethAmount);
    }

    function loan(uint256 dexAmount, uint256 deadline) external returns (uint256){
        require(dexAmount > 0, "DEX amount must be greater than 0");
        require(balanceOf(msg.sender) >= dexAmount, "Insufficient DEX balance");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(deadline <= block.timestamp + maxLoanDuration, "Deadline exceeds max loan duration");

        uint256 ethAmount = dexAmount / dexSwapRate;
        require(address(this).balance >= ethAmount, "Insufficient ETH in contract");

        _transfer(msg.sender, address(this), dexAmount);
        
        uint256 loanId = uint256(loanCount);

        loans[loanId] = Loan({
            deadline: deadline,
            amount: ethAmount,
            lender: address(this),
            borrower: msg.sender,
            isBasedNFT: false,
            nftContract: IERC721(address(0)), 
            nftId: loanCount 
        });

        payable(msg.sender).transfer(ethAmount);

        loanCount++;

        emit loanCreated(msg.sender, ethAmount, deadline);
        dex_lock_in += dexAmount;
        return loanId;
    }

    function makePayment(uint256 loanId) external payable {
        Loan storage loan = loans[loanId];
        require(loan.borrower == msg.sender, "Not the borrower");
        require(loan.termination == 0, "Loan already terminated");
        require(!loan.isBasedNFT, "Use NFT payment function for NFT loans"); // TODO: Verificar se podemos pagar com NFT
        require(block.timestamp <= loan.deadline, "Loan deadline has passed");

        // Calculate duration in years (assuming deadline and periodicity are in seconds)
        uint256 totalDuration = loan.deadline - block.timestamp; // seconds left
        uint256 totalLoanDuration = loan.deadline - (block.timestamp - (block.timestamp % loan.periodicity)); // total seconds for the loan
        uint256 paymentsCount = totalLoanDuration / loan.periodicity;
        if (paymentsCount == 0) paymentsCount = 1; // avoid division by zero

        // Convert periodicity to years (e.g., if periodicity is 30 days: 30*24*60*60)
        uint256 periodicityInYears = loan.periodicity * 1e18 / 365 days; // scale to avoid decimals

        // Calculate interest payment for this cycle
        uint256 interestPayment = uint256(loan.amount) * loan.interestRate * periodicityInYears / 1e18;

        // Last payment: must pay principal + interest
        bool isLastPayment = (block.timestamp + loan.periodicity >= loan.deadline);
        uint256 totalPayment = interestPayment;
        if (isLastPayment) {
            totalPayment += uint256(loan.amount); // add principal
        }

        require(msg.value >= totalPayment, "Insufficient payment");

        // Forward payment to lender (the contract)
        payable(loan.lender).transfer(totalPayment);

        // Mark loan as terminated if last payment
        if (isLastPayment) {
            loan.termination = block.timestamp;
            // Return DEX collateral
            _transfer(address(this), msg.sender, uint256(loan.amount) * dexSwapRate);
        }

        // Refund any excess payment
        if (msg.value > totalPayment) {
            payable(msg.sender).transfer(msg.value - totalPayment);
        }
    }

    function returnLoan(uint256 loanId) external payable { //TODO: Correção do enunciado
        Loan storage loan = loans[loanId];
        require(loan.borrower == msg.sender, "Not the borrower");
        require(!loan.isBasedNFT, "NFT-based loans must use a different function");
        require(loan.termination == 0, "Loan already terminated");
        require(msg.value >= uint256(loan.amount), "Insufficient repayment amount");

        // TODO: FALTA A FEE

        uint256 refund = uint256(loan.amount); // TOOD: nao sei se é preciso adicionar fee

        loan.termination = block.timestamp;

        _transfer(address(this), msg.sender, refund * dexSwapRate);
        
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function getDexBalance() public view returns (uint256) {
        return balanceOf(address(this));
    }

    function makeLoanRequestByNft(IERC721 nftContract, uint256 nftId, uint256 loanAmount, uint256 deadline) external {
        require(nftContract.ownerOf(nftId) == msg.sender, "You do not own this NFT");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(deadline <= block.timestamp + maxLoanDuration, "Deadline exceeds max loan duration");
        require(loanAmount > 0, "Loan amount must be greater than 0"); // TODO: Não sei se é preciso

        nftContract.transferFrom(msg.sender, address(this), nftId);

        uint256 loanId = uint256(keccak256(abi.encodePacked(msg.sender, block.timestamp, loanAmount)));

        loanCount++;

        loans[loanId] = Loan({
            deadline: deadline,
            amount: int256(loanAmount),
            periodicity: 0, // TODO: IDK esses valores
            interestRate: 0,
            termination: 0,
            lender: address(this),
            borrower: msg.sender,
            isBasedNFT: true,
            nftContract: nftContract,
            nftId: nftId
        });

        emit loanCreated(msg.sender, loanAmount, deadline);
    }

    function cancelLoanRequestByNft(IERC721 nftContract, uint256 nftId) external {
        require(nftContract.ownerOf(nftId) == msg.sender, "You do not own this NFT");
        
        uint256 loanId = uint256(keccak256(abi.encodePacked(msg.sender, block.timestamp, nftId)));

        Loan storage loan = loans[loanId];
        require(loan.termination == 0, "Loan already terminated or does not exist");

        // Transfer NFT back to the owner
        nftContract.transferFrom(address(this), msg.sender, nftId); // TODO: Como pagar de volta o loan? idk

        loan.termination = block.timestamp; // Mark as cancelled
    }

    function loanByNft(IERC721 nftContract, uint256 nftId) external {
        uint256 loanId = nftToLoanId[address(nftContract)][nftId];
        Loan storage loan = loans[loanId];
        require(loan.isBasedNFT, "Loan is not NFT-based");
        require(loan.lender == address(0), "Loan already has a lender");
        require(loan.termination == 0, "Loan already terminated");

        uint256 dexToLock = uint256(loan.amount) * dexSwapRate;
        require(balanceOf(msg.sender) >= dexToLock, "Insufficient DEX balance to lend");
        _transfer(msg.sender, address(this), dexToLock);
        loan.lender = msg.sender;

        emit loanCreated(loan.borrower, uint256(loan.amount), loan.deadline);
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