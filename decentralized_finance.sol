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
    uint public interest; // payment
    uint public termination; // fee

    uint256 public loanCount; // TODO: Criei para dar set do ID da loan, podemos retirar depois idk
    uint256 public nftCount; // TODO: Criei para dar set do ID da loan, podemos retirar depois idk

    uint256 public dex_lock_in = 0; // TODO: Check
    
    // --------------------- Mapping ---------------------
    mapping(uint256 => Loan) public loans; // loanId => Loan
    mapping(uint256 => uint256) public lastPaymentTime; // loanId => timestamp

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
        dexSwapRate = _rate;
        periodicity = _periodicity;
        interest = _interest;
        termination = _termination;

        // TODO: ADICIONAR BALANCE COM ETH

        maxLoanDuration = 30 days;
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
            nftId: 0 
        });

        lastPaymentTime[loanId] = block.timestamp; // Marca o primeiro pagamento como agora

        payable(msg.sender).transfer(ethAmount);

        loanCount++;

        emit loanCreated(msg.sender, ethAmount, deadline);
        dex_lock_in += dexAmount;
        return loanId;
    }

    function makePayment(uint256 loanId) external payable {
        Loan storage loanPayment = loans[loanId];

        require(loanPayment.amount > 0, "Loan does not exist or has been terminated");
        require(loanPayment.borrower == msg.sender, "Not the borrower");

        if (checkLoan(loanId)) {
            uint256 durationInYears = (periodicity * 1e18) / 365 days;
            uint256 interestPayment = (loanPayment.amount * interest * durationInYears) / (100 * 1e18);

            if (msg.value < interestPayment) {
                revert("Insufficient payment amount");
            }

            loanPayment.amount -= interestPayment;
            if (loanPayment.amount <= 0) {
                loanPayment.amount = 0;
                delete lastPaymentTime[loanId]; 
            } else {
                lastPaymentTime[loanId] = block.timestamp; 
            }

            // Refund the extra value if any
            if (msg.value > interestPayment) {
                payable(msg.sender).transfer(msg.value - interestPayment);
            }
        }
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
        
        delete lastPaymentTime[loanId]; 

        require(balanceOf(address(this)) >= dexLocked, "Insufficient DEX balance");
        _transfer(address(this), msg.sender, dexLocked);

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

    function checkLoan(uint256 loanId) external returns (bool) { //TODO
        Loan storage loanCheck = loans[loanId];
        require(loanCheck.amount > 0, "Loan does not exist or has been terminated");
        require(loanCheck.borrower == msg.sender, "Not the borrower");

        uint256 timeSinceLastPayment = block.timestamp - lastPaymentTime[loanId];

        if (timeSinceLastPayment > periodicity || block.timestamp > loanCheck.deadline) {
            if (!loanCheck.isBasedNFT) {
                // punish
            } else {
                // punish
            }

            loanCheck.amount = 0; // Terminate the loan
            delete lastPaymentTime[loanId];
            return false;
        } 
        return true;
    }
}