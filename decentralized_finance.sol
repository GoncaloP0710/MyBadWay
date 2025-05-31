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
    mapping(uint256 => uint256) public numberOfPayments; // loanId => number of payments made
    mapping(uint256 => uint256) public loanStartTime; // loanId => number of payments made

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
        periodicity = _periodicity * 1 days; // In seconds
        interest = _interest;
        termination = _termination;
        maxLoanDuration = 30 days;
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
            nftId: 0 
        });

        numberOfPayments[loanId] = 0; // Initialize the number of payments made for this loan
        loanStartTime[loanId] = block.timestamp; // Store the start time of the loan
        
        payable(msg.sender).transfer(ethAmount);
        loanCount++;
        emit loanCreated(loanId);
        dex_lock_in += dexAmount;
        return loanId;
    }

    // Declare event at contract level
    event Debug(uint256 duration, uint256 interestPayment, uint256 value, uint256 time);

    function makePayment(uint256 loanId) external payable {
        if (loanCheck.amount == 0) {
            if (msg.value > 0) {
                payable(msg.sender).transfer(msg.value);
            }
            return; 
        }
        
        Loan storage loanPayment = loans[loanId];
        bool checked = checkLoan(loanId);
        if (checked) {
            uint256 time = loanPayment.deadline - loanStartTime[loanId];
            uint256 duration = (loanPayment.deadline - loanStartTime[loanId]) * 1e18 / (365 * 24 * 60 * 60);
            uint256 interestPayment = (loanPayment.amount * interest * duration) / (100 * 1e18);
            uint256 value = msg.value;

            // "Print" values to Remix log
            emit Debug(duration, interestPayment, value, time);

            require(msg.value >= interestPayment, "Insufficient payment amount");
            numberOfPayments[loanId]++;

            if (msg.value > interestPayment) {
                payable(msg.sender).transfer(msg.value - interestPayment);
            }
        } 
    }

    event Debug2(uint256 loanId, uint256 numberPayments, uint256 timePassed, uint256 currentSupposedPayment, uint256 finished);

    function checkLoan(uint256 loanId) public returns (bool) {
        Loan storage loanCheck = loans[loanId];
        require(loanCheck.amount > 0, "Loan does not exist or has been terminated");
        require(loanCheck.borrower == msg.sender, "Not the borrower");

        uint256 numberPayments = numberOfPayments[loanId]; // Number of payments made
        uint256 time_passed = block.timestamp - loanStartTime[loanId]; // Time passed since the loan was created
        uint256 current_suposed_payment = (time_passed / periodicity); // Calculate the current supposed payment based on the periodicity and time passed 

        uint256 finished = (loanCheck.deadline - loanStartTime[loanId]) / periodicity;
        if ((loanCheck.deadline - loanStartTime[loanId]) < periodicity) {
            finished = 1; 
        }
        emit Debug2(loanId, numberPayments, time_passed, current_suposed_payment, finished);

        if (numberPayments < current_suposed_payment) {
            if (!loanCheck.isBasedNFT) { // Remove the DEX that was locked for the loan and keep it
                dex_lock_in -= loans[loanId].amount * dexSwapRate;
            } else {
                // punish
            }

            loanCheck.amount = 0; // Terminate the loan
            return false;
        } else if (numberPayments == finished) {
            uint256 dexLocked = loanCheck.amount * dexSwapRate;
            _transfer(address(this), msg.sender, dexLocked); // Return the DEX locked for the loan
            dex_lock_in -= dexLocked; // Remove the DEX that was locked for the loan
            loanCheck.amount = 0; // Terminate the loan
            return false;
        }
        
        return true;
    }

    function getLoanDetails(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function terminateLoan(uint256 loanId) external payable {
        Loan storage activeLoan = loans[loanId];

        require(activeLoan.amount > 0, "Loan already terminated or does not exist");
        require(activeLoan.borrower == msg.sender, "Not the borrower");
        require(!activeLoan.isBasedNFT, "NFT-based loans must use a different function");

        uint256 fee = (activeLoan.amount * termination) / 100;
        uint256 total = activeLoan.amount + fee;
        require(msg.value >= total, "Insufficient repayment amount including fee");

        uint256 dexLocked = activeLoan.amount * dexSwapRate;
        activeLoan.amount = 0;

        _transfer(address(this), msg.sender, dexLocked);

        dex_lock_in -= dexLocked; // Remove the DEX that was locked for the loan

        // Refund the extra value
        if (msg.value > total) {
            payable(msg.sender).transfer(msg.value - total);
        }
    }


    function getBalance() public view returns (uint256) {
        return address(this).balance; //TODO: MUDOU O ENUNCIADO, AGORA PERDE ETH EM WEI
    }

    function getDexBalance() public view returns (uint256) {
        return balanceOf(address(this));
    }

    // function makeLoanRequestByNft(IERC721 nftContract, uint256 nftId, uint256 loanAmount, uint256 deadline) external {
    //     require(nftContract.ownerOf(nftId) == msg.sender, "You do not own this NFT");
    //     require(deadline > block.timestamp, "Deadline must be in the future");
    //     require(deadline <= block.timestamp + maxLoanDuration, "Deadline exceeds max loan duration");
    //     require(loanAmount > 0, "Loan amount must be greater than 0"); // TODO: Não sei se é preciso

    //     nftContract.transferFrom(msg.sender, address(this), nftId);

    //     uint256 loanId = uint256(keccak256(abi.encodePacked(msg.sender, block.timestamp, loanAmount)));

    //     loanCount++;

    //     loans[loanId] = Loan({
    //         deadline: deadline,
    //         amount: int256(loanAmount),
    //         periodicity: 0, // TODO: IDK esses valores
    //         interestRate: 0,
    //         termination: 0,
    //         lender: address(this),
    //         borrower: msg.sender,
    //         isBasedNFT: true,
    //         nftContract: nftContract,
    //         nftId: nftId
    //     });

    //     emit loanCreated(msg.sender, loanAmount, deadline);
    // }

    // function cancelLoanRequestByNft(IERC721 nftContract, uint256 nftId) external {
    //     require(nftContract.ownerOf(nftId) == msg.sender, "You do not own this NFT");
        
    //     uint256 loanId = uint256(keccak256(abi.encodePacked(msg.sender, block.timestamp, nftId)));

    //     Loan storage loan = loans[loanId];
    //     require(loan.termination == 0, "Loan already terminated or does not exist");

    //     // Transfer NFT back to the owner
    //     nftContract.transferFrom(address(this), msg.sender, nftId); // TODO: Como pagar de volta o loan? idk

    //     loan.termination = block.timestamp; // Mark as cancelled
    // }

    // function loanByNft(IERC721 nftContract, uint256 nftId) external {
    //     uint256 loanId = nftToLoanId[address(nftContract)][nftId];
    //     Loan storage loan = loans[loanId];
    //     require(loan.isBasedNFT, "Loan is not NFT-based");
    //     require(loan.lender == address(0), "Loan already has a lender");
    //     require(loan.termination == 0, "Loan already terminated");

    //     uint256 dexToLock = uint256(loan.amount) * dexSwapRate;
    //     require(balanceOf(msg.sender) >= dexToLock, "Insufficient DEX balance to lend");
    //     _transfer(msg.sender, address(this), dexToLock);
    //     loan.lender = msg.sender;

    //     emit loanCreated(loan.borrower, uint256(loan.amount), loan.deadline);
    // }
}