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
        bool active;
        uint256 numberOfPayments;
        uint256 startTime;
        bool isBasedNFT;
        IERC721 nftContract;
        uint256 nftId;
    }

    // TODO: MUDAR PARA PRIVADO SE NECESSÁRIO
    uint public maxLoanDuration;
    uint public dexSwapRate;
    uint public balance;

    // --------------------- Loan Parameters ---------------------
    uint public periodicity; // payment interval
    uint public interest;
    uint public termination; // fee

    uint256 public loanCount; 
    uint256 public nftCount;
    uint256 public dex_lock_in = 0; // Value of DEX to lock in for loans when they are payed on its totality and the colateral needs to be returned
    
    // --------------------- Mapping ---------------------
    mapping(uint256 => Loan) public loans; // loanId => Loan
    mapping(uint256 => bool) public used_nft; // nftId => bool, to check if the NFT is already used in a loan request

    // --------------------- Events ---------------------
    event loanCreated(uint256 loanId);

    constructor(uint256 _rate, uint256 _periodicity, uint256 _interest, uint256 _termination) ERC20("DEX", "DEX") {
        require(_rate > 0, "Rate must be greater than 0");
        require(_periodicity > 0, "Periodicity must be greater than 0");
        require(_interest > 0, "Interest must be greater than 0");
        require(_termination > 0, "Termination fee must be greater than 0");
        
        _mint(address(this), 10**24);
        owner = msg.sender;   
        dexSwapRate = _rate;
        periodicity = _periodicity * 1 days;
        interest = _interest;
        termination = _termination;
        maxLoanDuration = 5 * 365 days;
        loanCount = 0;
    }

    function buyDex() external payable {
        require(msg.value > 0, "Value must be greater than 0");
        uint256 dexAmount = msg.value * dexSwapRate;
        require((balanceOf(address(this)) - dex_lock_in) >= dexAmount, "Insufficient DEX tokens in contract");
        _transfer(address(this), msg.sender, dexAmount);
    }

    function sellDex(uint256 dexAmount) external {
        require(balanceOf(msg.sender) >= dexAmount, "Insufficient DEX balance");
        require(address(this).balance >= dexAmount / dexSwapRate, "Insufficient ETH balance in contract");
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
        _transfer(msg.sender, address(this), dexAmount); // Transfer DEX tokens from borrower to contract
        uint256 loanId = uint256(loanCount);

        loans[loanId] = Loan({
            deadline: deadline, 
            amount: ethAmount,
            lender: address(this),
            borrower: msg.sender,
            active: true,
            numberOfPayments: 0,
            startTime: block.timestamp,
            isBasedNFT: false,
            nftContract: IERC721(address(0)), 
            nftId: 0 
        });

        payable(msg.sender).transfer(ethAmount); // Transfer ETH to the borrower
        loanCount++;
        emit loanCreated(loanId);
        dex_lock_in += dexAmount;
        return loanId;
    }

    // Declare event at contract level
    event Debug(uint256 duration, uint256 interestPayment, uint256 value, uint256 time);

    function makePayment(uint256 loanId) external payable {
        Loan storage loanPayment = loans[loanId];
        bool checked = checkLoan(loanId);
        
        if (loanPayment.active == false) { // Return money if the loan is not active
            if (msg.value > 0) {
                payable(msg.sender).transfer(msg.value);
            }
            return;
        }

        if (checked) {
            uint256 payment_amount = getPaymentAmount(loanId);
            require(msg.value == payment_amount, "Wrong payment amount");
            loanPayment.numberOfPayments += 1; 
            if (loanPayment.isBasedNFT) { // Foward the payment to the lender and transfer the NFT back to the borrower
                require(loanPayment.lender != address(0), "No lender for this NFT loan, The Loan hasnt been funded yet");
                payable(loanPayment.lender).transfer(payment_amount); // Transfer the payment to the lender
            }
        }
        checked = checkLoan(loanId);
    }

    event Debug2(uint256 loanId, uint256 numberPayments, uint256 timePassed, uint256 currentSupposedPayment, uint256 finished);

    function checkLoan(uint256 loanId) public returns (bool) {
        Loan storage loanCheck = loans[loanId];
        // require(loanCheck.amount > 0, "Loan does not exist or has been terminated");
        require(loanCheck.active, "Loan does not exist or has been terminated");
        if (msg.sender != owner) {
            require(loanCheck.borrower == msg.sender, "Not the borrower");
        }

        uint256 numberPayments = loanCheck.numberOfPayments; // Number of payments made
        uint256 time_passed = block.timestamp - loanCheck.startTime; // Time passed since the loan was created
        uint256 current_suposed_payment = (time_passed / periodicity); // Calculate the current supposed payment based on the periodicity and time passed 

        uint256 full_time = loanCheck.deadline - loanCheck.startTime; // Total time of the loan
        uint256 nToFinish = (loanCheck.deadline - loanCheck.startTime) / periodicity; 
        if ((loanCheck.deadline - loanCheck.startTime) < periodicity) {
            nToFinish = 1; 
        }
        emit Debug2(loanId, numberPayments, time_passed, current_suposed_payment, nToFinish);

        if (numberPayments < current_suposed_payment) {
            if (!loanCheck.isBasedNFT) { // Remove the DEX that was locked for the loan and keep it
                dex_lock_in -= loans[loanId].amount * dexSwapRate;
            } else {
                require(loanCheck.lender != address(0), "No lender for this NFT loan, The Loan hasnt been funded yet");
                loanCheck.nftContract.transferFrom(address(this), loanCheck.lender, loanCheck.nftId);
                dex_lock_in -= loanCheck.amount * dexSwapRate; 
            }

            loanCheck.active = false; // Mark the loan as inactive
            return false;
        } else if (numberPayments == nToFinish) {
            if (loanCheck.isBasedNFT) { // Remove the DEX that was locked for the loan and return it to the borrower
                require(loanCheck.lender != address(0), "No lender for this NFT loan, The Loan hasnt been funded yet");
                loanCheck.nftContract.transferFrom(address(this), loanCheck.borrower, loanCheck.nftId);
            }
            uint256 dexLocked = loanCheck.amount * dexSwapRate;
            _transfer(address(this), msg.sender, dexLocked); // Return the DEX locked for the loan
            dex_lock_in -= dexLocked; // Remove the DEX that was locked for the loan
            loanCheck.active = false; // Mark the loan as inactive
            return false;
        }
        
        return true;
    }

    function terminateLoan(uint256 loanId) external payable {
        Loan storage activeLoan = loans[loanId];

        // require(activeLoan.amount > 0, "Loan already terminated or does not exist");
        require(activeLoan.active, "Loan already terminated or does not exist");
        require(activeLoan.borrower == msg.sender, "Not the borrower");
        require(!activeLoan.isBasedNFT, "NFT-based loans must use a different function");

        uint256 fee = (activeLoan.amount * termination) / 100;
        uint256 total = activeLoan.amount + fee;
        require(msg.value >= total, "Insufficient repayment amount including fee");

        uint256 dexLocked = activeLoan.amount * dexSwapRate;
        // activeLoan.amount = 0;
        activeLoan.active = false; // Mark the loan as inactive

        _transfer(address(this), msg.sender, dexLocked);

        dex_lock_in -= dexLocked; // Remove the DEX that was locked for the loan

        // Refund the extra value
        if (msg.value > total) {
            payable(msg.sender).transfer(msg.value - total);
        }
    }    

    function makeLoanRequestByNft(IERC721 nftContract, uint256 nftId, uint256 loanAmount, uint256 deadline) external {
        require(loanAmount > 0, "Loan amount must be greater than 0");
        require(nftContract.ownerOf(nftId) == msg.sender, "You do not own this NFT");
        require(nftContract.getApproved(nftId) == address(this) || nftContract.isApprovedForAll(msg.sender, address(this)),"Contract is not approved to transfer this NFT");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(deadline <= block.timestamp + maxLoanDuration, "Deadline exceeds max loan duration");
        require(!used_nft[nftId], "Already exists a loan request for this NFT");
        uint256 loanId = loanCount;

        loans[loanId] = Loan({
            deadline: deadline,
            amount: loanAmount,
            lender: address(0),
            borrower: msg.sender,
            active: true,
            numberOfPayments: 0,
            startTime: block.timestamp,
            isBasedNFT: true,
            nftContract: nftContract, 
            nftId: nftId 
        });

        used_nft[nftId] = true; 
        loanCount++;
        dex_lock_in += loanAmount * dexSwapRate;
        emit loanCreated(loanId);

        nftContract.transferFrom(msg.sender, address(this), nftId); // Transfer NFT to the contract
    }

    function cancelLoanRequestByNft(IERC721 nftContract, uint256 nftId) external {
        uint256 foundLoanId = _findNftLoanId(nftContract, nftId);
        require(foundLoanId != type(uint256).max, "Loan request not found or already funded");

        Loan storage loanCancel = loans[foundLoanId];
        require(loanCancel.borrower == msg.sender, "Caller is not the owner of the NFT");

        // Transfer the NFT back to the borrower
        require(nftContract.ownerOf(nftId) == address(this), "Contract is not the NFT owner");
        nftContract.transferFrom(address(this), msg.sender, nftId);

        // Perform loan cancellation logic
        loanCancel.active = false; // TODO: we dont need ig
        used_nft[nftId] = false;
    }

    function loanByNft(IERC721 nftContract, uint256 nftId) external {
        uint256 foundLoanId = _findNftLoanId(nftContract, nftId);
        require(foundLoanId != type(uint256).max, "Loan request not found or already funded");

        Loan storage loanNft = loans[foundLoanId];
        require(msg.sender != loanNft.borrower, "Borrower cannot be lender");
        uint256 dexToLock = loanNft.amount * dexSwapRate;
        require(balanceOf(msg.sender) >= dexToLock, "Insufficient DEX balance to lend");

        // Transfere DEX do lender para o contrato
        _transfer(msg.sender, address(this), dexToLock);
        loanNft.lender = msg.sender;
        dex_lock_in += dexToLock;

        // Envia ETH para o tomador do empréstimo
        payable(loanNft.borrower).transfer(loanNft.amount);

        emit loanCreated(foundLoanId);
        nftContract.approve(loanNft.lender, loanNft.nftId); // Approve the lender to transfer the NFT
    }

    // Only returns loans that are not funded yet
    function _findNftLoanId(IERC721 nftContract, uint256 nftId) internal view returns (uint256) {
        for (uint256 i = 0; i < loanCount; i++) {
            Loan storage loanToFind = loans[i];
            if (
                loanToFind.isBasedNFT &&
                address(loanToFind.nftContract) == address(nftContract) &&
                loanToFind.nftId == nftId &&
                loanToFind.lender == address(0) &&
                loanToFind.active
            ) {
                return i;
            }
        }
        return type(uint256).max;
    }

    function smart_checkLoan() external {
        require( msg.sender == owner, "Only owner can call this function");
        for (uint256 i = 0; i < loanCount; i++) {
            if (loans[i].active) {
                checkLoan(i);
            }
        }
    }

    // TODO: Rever
    function sumETHamounts() external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < loanCount; i++) {
            if (loans[i].active) {
                total += loans[i].amount;
            }
        }
        return total;
    }

    // --------------------- Getters and Setters ---------------------

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function getDexBalance() public view returns (uint256) {
        return balanceOf(address(this));
    }

    function getDexSwapRate() external view returns (uint256) {
        return dexSwapRate;
    }

    function isHoe() external view returns (bool) {
        return msg.sender == owner;
    }

    function getLoanDetails(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getValueToTerminateLoan(uint256 loanId) external view returns (uint256) {
        Loan storage activeLoan = loans[loanId];
        require(activeLoan.active, "Loan already terminated or does not exist");
        require(activeLoan.borrower == msg.sender, "Not the borrower");
        require(!activeLoan.isBasedNFT, "NFT-based loans must use a different function");

        uint256 fee = (activeLoan.amount * termination) / 100;
        return activeLoan.amount + fee; // Return the total amount to terminate the loan
    }

    function getLoanRequests() external view returns (uint256[] memory, Loan[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < loanCount; i++) {
            if (loans[i].isBasedNFT && loans[i].lender == address(0)) {
                count++;
            }
        }
        uint256[] memory ids = new uint256[](count);
        Loan[] memory result = new Loan[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < loanCount; i++) {
            if (loans[i].isBasedNFT && loans[i].lender == address(0)) {
                ids[idx] = i;
                result[idx] = loans[i];
                idx++;
            }
        }
        return (ids, result);
    }

    function getLoansByBorrower() external view returns (Loan[] memory) {
        uint256 count = 0;

        // First, count how many loans belong to the borrower
        for (uint256 i = 0; i < loanCount; i++) {
            if (loans[i].borrower == msg.sender) {
                count++;
            }
        }

        // Create an array to store the loans
        Loan[] memory borrowerLoans = new Loan[](count);
        uint256 index = 0;

        // Populate the array with the borrower's loans
        for (uint256 i = 0; i < loanCount; i++) {
            if (loans[i].borrower == msg.sender) {
                borrowerLoans[index] = loans[i];
                index++;
            }
        }

        return borrowerLoans;
    }

    function getPaymentAmount (uint256 loanId) public view returns (uint256) {
        Loan storage loanPayment = loans[loanId];
        require(loanPayment.active, "Loan does not exist or has been terminated");
        if (loanPayment.isBasedNFT) {
            require(loanPayment.lender != address(0), "No lender for this NFT loan, The Loan hasnt been funded yet");
        }

        uint256 time = loanPayment.deadline - loanPayment.startTime; 
        uint256 duration = time * 1e18 / (365 * 24 * 60 * 60); 
        uint256 interestPayment = (loanPayment.amount * interest * duration) / (100 * 1e18); 

        uint256 normalized_payment = 0;
        uint256 nToFinish = (loanPayment.deadline - loanPayment.startTime) / periodicity; // Number of payments to finish the loan
        
        if (loanPayment.numberOfPayments == (nToFinish - 1)) {
            normalized_payment = loanPayment.amount; 
        }
        return interestPayment + normalized_payment; // Return the total payment amount including interest
    }

    function setDexSwapRate(uint256 newRate) external {
        require(msg.sender == owner, "Only owner can set the DEX swap rate");
        require(newRate > 0, "New rate must be greater than 0");
        dexSwapRate = newRate;
    }
}