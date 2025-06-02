const web3_ganache = new Web3(new Web3.providers.WebsocketProvider('ws://127.0.0.1:8545'));
const defi_contractAddress = "0x460D9d4E969e842655Dc409432c0008E1cE69F8D";
import { defi_abi } from "./abi_decentralized_finance.js";
const defi_contract = new web3_ganache.eth.Contract(defi_abi, defi_contractAddress);

const nft_contractAddress = "0x75BeE6D52F84f22644eb1377818d67468e2FD330";
import { nft_abi } from "./abi_nft.js";
const nft_contract = new web3_ganache.eth.Contract(nft_abi, nft_contractAddress);

const loan_dict = {};
const nft_dict = {};

const paymentLoanDropdownDict = {};
const nftDropdownDict = {};
const loanCancelDropdownDict = {};

async function initializeApp() {
    try {
        // Dictionary fetching
        await fetchAndPopulateLoans();
        await fetchAndPopulateNfts();

        // Dropdown Menus fetching
        await populatePaymentDropdown();
        await populateNftDropdown();
        await populateLoanCancelDropdownNew();
        await populateLoanByNftDropdown();

        // Fetch initial balances and rates
        getEthBalance();
        getUserDexBalance();
        getDexBalance();
        getRateEthToDex();

        console.log("App initialized successfully.");
    } catch (error) {
        console.error("Error initializing app:", error);
    }
}

// Call the initialization function
initializeApp();

web3_ganache.currentProvider.on('connect', () => {
    console.log("WebSocket connected");
});
web3_ganache.currentProvider.on('error', (error) => {
    console.error("WebSocket error:", error);
});

async function connectMetaMask() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({
                method: "eth_requestAccounts",
            });
            console.log("Connected account:", accounts[0]);
        } catch (error) {
            console.error("Error connecting to MetaMask:", error);
        }
    } else {
        console.error("MetaMask not found. Please install the MetaMask extension.");
    }
}

// ========================================= DEX Operations =========================================

async function buyDex(ethAmount) {
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];
    try {
        console.log("Buying DEX tokens for account:", account);
        console.log("Using contract address:", defi_contractAddress);
        console.log("Sending value:", web3_ganache.utils.toWei("1", "ether"));
        const buyResult = await defi_contract.methods.buyDex().send({
            from: account,
            value: web3_ganache.utils.toWei(ethAmount.toString(), "ether") // Sending 1 ETH
        });        
        console.log("DEX tokens bought successfully:", buyResult);
        getEthBalance();
        getUserDexBalance();
        getDexBalance();
        return buyResult;
    } catch (error) {
        console.error("Error buying DEX tokens:", error);
        throw error;
    }
}

async function sellDex(dexAmount) {
    const dexAmountWei = web3_ganache.utils.toWei(dexAmount.toString(), "ether");
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];
    try {
        console.log("Selling DEX tokens for account:", account);
        const sellResult = await defi_contract.methods.sellDex(dexAmountWei).send({ 
            from: account, 
        });
        console.log("DEX tokens sold successfully:", sellResult);
        getEthBalance();
        getUserDexBalance();
        getDexBalance();
        return sellResult;
    } catch (error) {
        console.error("Error selling DEX tokens:", error);
        throw error;
    }
}

async function setDexSwapRate() {
    console.log("setDexSwapRate function called...");
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];

    const newRate = prompt("Enter the new DEX swap rate:");
    if (!newRate || isNaN(newRate) || Number(newRate) <= 0) {
        alert("Invalid swap rate. Please enter a positive number.");
        return;
    }

    try {
        console.log("Setting new DEX swap rate:", newRate);
        const result = await defi_contract.methods.setDexSwapRate(newRate).send({
            from: account,
            gas: 300000, // Adjust gas limit as needed
        });
        console.log("DEX swap rate updated successfully:", result);
        getRateEthToDex(); // Refresh the rate display
        alert("DEX swap rate updated successfully!");
    } catch (error) {
        console.error("Error setting DEX swap rate:", error);
        alert("Error setting DEX swap rate. Check the console for details.");
    }
}

// ========================================= Loan Operations =========================================

async function loan(dexAmount, deadlineMinutes) {
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];

    // Converte o valor de DEX para wei (18 casas decimais)
    const dexAmountWei = web3_ganache.utils.toWei(dexAmount.toString(), "ether");

    // Calcula o deadline como timestamp atual + minutos informados
    const now = Math.floor(Date.now() / 1000);
    const deadline = now + (parseInt(deadlineMinutes) * 60);

    if (isNaN(dexAmountWei) || BigInt(dexAmountWei) <= 0n) {
        console.error("Invalid DEX amount:", dexAmountWei);
        throw new Error("Invalid DEX amount");
    }

    if (isNaN(deadline) || deadline <= now) {
        console.error("Invalid deadline:", deadline);
        throw new Error("Invalid deadline");
    }

    try {
        console.log("Requesting loan for account:", account, "with amount:", dexAmountWei, "and deadline:", deadline);
        const loanResult = await defi_contract.methods.loan(dexAmountWei, deadline).send({
            from: account,
            gas: 300000, // Ajuste o limite de gás conforme necessário
        });

        // Access the loanId from the transaction receipt
        const loanId = loanResult.events.loanCreated.returnValues.loanId;
        console.log("Loan requested successfully. Loan ID:", loanId);

        console.log("Loan requested successfully:", loanResult);
        getEthBalance();
        getUserDexBalance();
        getDexBalance();
        return loanResult;
    } catch (error) {
        console.error("Error requesting loan:", error);
        throw error;
    }
}

async function checkLoanStatus(loan) {
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];
    try {
        console.log("Checking loan status for loan:", loan);
        console.log(loan_dict[loan]);

        const loanStatus = await defi_contract.methods.checkLoan(loan_dict[loan]).send({ 
            from: account, 
        });

        console.log("Loan status:", loanStatus);
        return loanStatus;
    } catch (error) {
        console.error("Error checking loan status:", error);
        throw error;
    }
}  

async function makePayment(loanId, paymentAmount) {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = accounts[0];

    if (!loanId || !paymentLoanDropdownDict[loanId]) {
        alert("Invalid loan selected.");
        return;
    }

    try {
        console.log("Making payment for loan:", paymentLoanDropdownDict[loanId], "with amount:", paymentAmount);
        const paymentResult = await defi_contract.methods.makePayment(loanId).send({
            from: account,
            value: web3_ganache.utils.toWei(paymentAmount.toString(), "ether"),
            gas: 3000000, // Adjust gas limit as needed
        });
        console.log("Payment made successfully:", paymentResult);
        getEthBalance();
        getUserDexBalance();
        getDexBalance();
        return paymentResult;
    } catch (error) {
        console.error("Error making payment:", error);
        throw error;
    }
}

async function terminateLoan(loanId) {
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];

    try {
        // Fetch the repayment value from the contract
        const repayAmountWei = await defi_contract.methods.getValueToTerminateLoan(loanId).call({ from: account });
        const repayAmountEth = web3_ganache.utils.fromWei(repayAmountWei, "ether");
        console.log(`Repayment amount for loan ID ${loanId}: ${repayAmountEth} ETH`);

        // Confirm with the user before proceeding
        const confirmTermination = confirm(`The total repayment amount is ${repayAmountEth} ETH. Do you want to proceed?`);
        if (!confirmTermination) {
            alert("Loan termination canceled.");
            return;
        }

        // Terminate the loan
        console.log("Terminating loan with ID:", loanId, "and value:", repayAmountWei);
        const terminateResult = await defi_contract.methods.terminateLoan(loanId).send({
            from: account,
            value: repayAmountWei,
            gas: 3000000, // Adjust gas limit as needed
        });

        console.log("Loan terminated successfully:", terminateResult);
        alert("Loan terminated successfully!");

        // Update balances
        getEthBalance();
        getUserDexBalance();
        getDexBalance();

        return terminateResult;
    } catch (error) {
        console.error("Error terminating loan:", error);
        alert("Error terminating loan. Check the console for details.");
        throw error;
    }
}

// ========================================= NFT Operations =========================================

async function makeLoanRequestByNft() {
    console.log("Making loan request by NFT...");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = accounts[0];

    const nftDropdown = document.getElementById("nftDropdown");
    const nftId = nftDropdown.value;
    const loanAmount = prompt("Enter the loan amount (ETH):");
    const deadlineMinutes = prompt("Enter the loan deadline in minutes:");

    await nft_contract.methods.approve(defi_contractAddress, nftId).send({ from: account });

    if (!nftId || !loanAmount || !deadlineMinutes || isNaN(loanAmount) || isNaN(deadlineMinutes)) {
        alert("Invalid input. Please provide valid NFT, loan amount, and deadline.");
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    const deadline = now + (parseInt(deadlineMinutes) * 60);

    try {
        console.log("Requesting loan with NFT:", nftId, "Loan amount:", loanAmount, "Deadline:", deadline);

        const loanAmountWei = web3_ganache.utils.toWei(loanAmount.toString(), "ether");
        const nftContractAddress = nft_contractAddress; // Address of the NFT contract
        console.log("NFT Contract Address:", nftContractAddress);

        const result = await defi_contract.methods
            .makeLoanRequestByNft(nftContractAddress, nftId, loanAmountWei, deadline)
            .send({
                from: account,
                gas: 3000000, // Adjust gas limit as needed
            });

        console.log("Loan request with NFT successful:", result);
        alert("Loan request with NFT submitted successfully!");

        // Remove the selected NFT from the dropdown
        const selectedOption = nftDropdown.querySelector(`option[value="${nftId}"]`);
        if (selectedOption) {
            selectedOption.remove();
            console.log(`NFT #${nftId} removed from dropdown.`);
        }

        updateLoanDictList(); // Refresh the loan list
        await populateLoanCancelDropdownNew(); // Refresh the loan cancel dropdown
    } catch (error) {
        console.error("Error requesting loan with NFT:", error);
        alert("Error requesting loan with NFT. Check the console for details.");
    }
}

async function cancelLoan() {
    const loanDropdown = document.getElementById("loanCancelDropdown");
    const selectedLoanId = loanDropdown.value;

    if (!selectedLoanId) {
        alert("Please select a loan to cancel.");
        return;
    }

    const loan = loan_dict[selectedLoanId];
    if (!loan || !loan.isBasedNFT) {
        alert("The selected loan is not based on an NFT or does not exist.");
        return;
    }

    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const account = accounts[0];

        console.log(`Canceling loan with ID ${selectedLoanId}...`);
        const nftContractAddress = loan.nftContract;
        const nftId = loan.nftId;
        console.log("NFT Contract Address:", nftContractAddress);
        console.log("NFT ID:", nftId);

        // Call the cancelLoanRequestByNft function in the contract
        const result = await defi_contract.methods.cancelLoanRequestByNft(nftContractAddress, nftId).send({
            from: account,
            gas: 300000, // Adjust gas limit as needed
        });

        console.log("Loan canceled successfully:", result);
        alert("Loan canceled successfully!");

        // Update the UI
        await populateLoanCancelDropdownNew(); // Refresh the dropdown
        updateLoanDictList(); // Refresh the loan list
    } catch (error) {
        console.error("Error canceling loan:", error);
        alert("Error canceling loan. Check the console for details.");
    }
}

async function loanByNft(loanId) {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = accounts[0];

    if (!loanId || !loan_dict[loanId] || !loan_dict[loanId].isBasedNFT) {
        alert("Invalid loan selected.");
        return;
    }

    const loan = loan_dict[loanId];
    const nftContractAddress = loan.nftContract;
    const nftId = loan.nftId;

    try {
        console.log("Requesting loan by NFT for account:", account, "with NFT ID:", nftId);
        const result = await defi_contract.methods.loanByNft(nftContractAddress, nftId).send({
            from: account,
            gas: 3000000, // Adjust gas limit as needed
        });

        console.log("Loan by NFT requested successfully:", result);
        alert("Loan by NFT requested successfully!");

        // Update the UI
        updateLoanDictList(); // Refresh the loan list
        await populateLoanCancelDropdownNew(); // Refresh the loan cancel dropdown
    } catch (error) {
        console.error("Error requesting loan by NFT:", error);
        alert("Error requesting loan by NFT. Check the console for details.");
    }
    

}

async function mintNFT() {
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];

    const tokenURI = prompt("Enter the token URI for the NFT:");
    if (!tokenURI) {
        alert("Token URI is required to mint an NFT.");
        return;
    }

    const mintPrice = "1000"; 
    try {
        console.log("Minting NFT for account:", account, "with token URI:", tokenURI);
        const mintResult = await nft_contract.methods.mint(tokenURI).send({
            from: account,
            value: web3_ganache.utils.toWei(mintPrice, "wei"), // Ensure the mint price is sent
            gas: 3000000, // Adjust gas limit as needed
        });
        console.log("NFT minted successfully:", mintResult);
        alert("NFT minted successfully!");
        return mintResult;
    } catch (error) {
        console.error("Error minting NFT:", error);
        alert("Error minting NFT. Check the console for details.");
        throw error;
    }
}

// ==================================== Getters for balances ====================================

async function getDexBalance() {
    try {
        const dexBalance = await defi_contract.methods.getDexBalance().call();
        document.getElementById("dexBalanceOutput").innerText = 
            `DEX tokens held by the contract: ${web3_ganache.utils.fromWei(dexBalance, "ether")} DEX`;
        return dexBalance;
    } catch (error) {
        document.getElementById("dexBalanceOutput").innerText = "Error fetching DEX balance.";
        console.error("Error fetching DEX balance:", error);
    }
}

async function getEthBalance() {
    try {
        const ethBalance = await defi_contract.methods.getBalance().call();
        document.getElementById("ethBalanceOutput").innerText = 
            `Ether held by the contract: ${web3_ganache.utils.fromWei(ethBalance, "ether")} ETH`;
        return ethBalance;
    } catch (error) {
        document.getElementById("ethBalanceOutput").innerText = "Error fetching ETH balance.";
        console.error("Error fetching ETH balance:", error);
    }
}

async function getUserDexBalance() {
    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const account = accounts[0];
        const dexBalance = await defi_contract.methods.balanceOf(account).call();
        document.getElementById("dexUserBalanceOutput").innerText =
            `DEX tokens held by the user's account: ${web3_ganache.utils.fromWei(dexBalance, "ether")} DEX`;
        return dexBalance;
    } catch (error) {
        document.getElementById("dexUserBalanceOutput").innerText = "Error fetching your DEX balance.";
        console.error("Error fetching user's DEX balance:", error);
    }
}

async function getRateEthToDex() {
    try {
        const rate = await defi_contract.methods.getDexSwapRate().call();
        document.getElementById("rateEthToDexOutput").innerText = 
            `Rate ETH to DEX: ${rate} DEX per ETH`;
        return rate;
    } catch (error) {
        document.getElementById("rateEthToDexOutput").innerText = "Error fetching rate.";
        console.error("Error fetching Rate ETH to DEX:", error);
    }
}

// ============================================ Event Listeners ====================================

async function listenToLoanCreation() {
    defi_contract.events.loanCreated()
        .on('data', async (event) => {
            console.log("Loan created event received:", event.returnValues);

            const loanId = event.returnValues.loanId; // Extract the loanId correctly
            if (!loanId) {
                console.error("Invalid loanId received in event:", event.returnValues);
                return;
            }

            try {
                const loan = await defi_contract.methods.getLoanDetails(loanId).call(); // Fetch loan details
                console.log("Loan details fetched:", loan);

                loan_dict[loanId] = loan; // Add the new loan to the dictionary
                console.log("New loan added to loan_dict:", loanId, loan);

                // Update the UI
                await populatePaymentDropdown();
                updateLoanDictList();
            } catch (error) {
                console.error("Error fetching loan details for loanId:", loanId, error);
            }
        })
        .on('error', (error) => {
            console.error("Error listening to loanCreated event:", error);
        });
}

async function listenToNftMinting() {
    nft_contract.events.NftMinted()
        .on('data', (event) => {
            console.log("NFT Minted event received:", event.returnValues);

            const { nftContract, tokenId } = event.returnValues;
            nft_dict[tokenId] = { nftContract };
            updateNftDictList();
            populateNftDropdown();
            console.log("New NFT added to nft_dict:", tokenId, nft_dict[tokenId]);
        })
        .on('error', (error) => {
            console.error("Error listening to NftMinted event:", error);
        });
}

// ============================================ UI Functions ====================================

async function fetchAndPopulateLoans() {
    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const account = accounts[0];

        console.log("Fetching loans for account:", account);

        // Call the contract function to get all loans for the user
        const loans = await defi_contract.methods.getLoansByBorrower().call({ from: account });

        // Populate the loan_dict with the fetched loans
        loans.forEach((loan, index) => {
            loan_dict[index] = loan; // Use the index as the key
        });

        console.log("Fetched loans:", loan_dict);

        // Update the UI
        await populatePaymentDropdown();
        updateLoanDictList();
    } catch (error) {
        console.error("Error fetching loans:", error);
    }
}

async function fetchAndPopulateNfts() {
    try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        const account = accounts[0];

        console.log("Fetching NFTs for account:", account);

        // Call the contract function to get all NFTs owned by the user
        const nfts = await nft_contract.methods.getNftsByOwner().call({ from: account });

        // Populate the nft_dict with the fetched NFTs
        nfts.forEach((tokenId) => {
            nft_dict[tokenId] = { owner: account }; // Store the owner information
        });

        console.log("Fetched NFTs:", nft_dict);

        // Update the UI
        updateNftDictList();
        await populateNftDropdown();
    } catch (error) {
        console.error("Error fetching NFTs:", error);
    }
}

async function populatePaymentDropdown() {
    const dropdown = document.getElementById("paymentLoanDropdown");
    dropdown.innerHTML = ""; // Clear existing options
    Object.keys(paymentLoanDropdownDict).forEach((key) => delete paymentLoanDropdownDict[key]); // Clear dictionary

    for (const key in loan_dict) {
        const option = document.createElement("option");
        option.value = key; // Use the key as the value
        option.textContent = `Loan ID: ${key}`;
        dropdown.appendChild(option);

        // Add to dictionary
        paymentLoanDropdownDict[key] = `Loan ID: ${key}`;
    }
}

async function populateNftDropdown() {
    const nftDropdown = document.getElementById("nftDropdown");
    nftDropdown.innerHTML = ""; // Clear existing options
    Object.keys(nftDropdownDict).forEach((key) => delete nftDropdownDict[key]); // Clear dictionary

    for (const tokenId in nft_dict) {
        let isInUse = false;

        // Check if the NFT is in use by any active loan
        for (const loanId in loan_dict) {
            const loan = loan_dict[loanId];
            if (loan.isBasedNFT && loan.nftId === tokenId && loan.active) {
                isInUse = true;
                break;
            }
        }

        // Add the NFT to the dropdown only if it's not in use
        if (!isInUse) {
            const option = document.createElement("option");
            option.value = tokenId;
            option.textContent = `NFT #${tokenId}`;
            nftDropdown.appendChild(option);

            // Add to dictionary
            nftDropdownDict[tokenId] = `NFT #${tokenId}`;
        }
    }

    if (nftDropdown.options.length === 0) {
        const noNftsOption = document.createElement("option");
        noNftsOption.value = "";
        noNftsOption.textContent = "No NFTs available";
        nftDropdown.appendChild(noNftsOption);
    }
}

async function populateLoanCancelDropdownNew() {
    const loanCancelDropdown = document.getElementById("loanCancelDropdown");
    loanCancelDropdown.innerHTML = ""; // Clear existing options
    Object.keys(loanCancelDropdownDict).forEach((key) => delete loanCancelDropdownDict[key]); // Clear dictionary

    for (const loanCancelId in loan_dict) {
        const loanCancel = loan_dict[loanCancelId];
        if (loanCancel.isBasedNFT) { // Only include loans that are based on NFTs
            const option = document.createElement("option");
            option.value = loanCancelId;
            option.textContent = `Loan ID: ${loanCancelId} - NFT ID: ${loanCancel.nftId}`;
            loanCancelDropdown.appendChild(option);

            // Add to dictionary
            loanCancelDropdownDict[loanCancelId] = `Loan ID: ${loanCancelId} - NFT ID: ${loanCancel.nftId}`;
        }
    }

    if (loanCancelDropdown.options.length === 0) {
        const noLoansOption = document.createElement("option");
        noLoansOption.value = "";
        noLoansOption.textContent = "No NFT-based loans available";
        loanCancelDropdown.appendChild(noLoansOption);
    }
}

async function populateLoanByNftDropdown() {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = accounts[0].toLowerCase();

    // Use a função do contrato que retorna apenas os pedidos NFT ainda não financiados
    const loanRequests = await defi_contract.methods.getLoanRequests().call();

    const loanByNftDropdown = document.getElementById("loanByNftDropdown");
    loanByNftDropdown.innerHTML = ""; // Clear existing options
    Object.keys(nftDropdownDict).forEach((key) => delete nftDropdownDict[key]); // Clear dictionary

    loanRequests.forEach((loan, index) => {
        // Verifica se o usuário conectado NÃO é o borrower
        if (
            loan.isBasedNFT &&
            loan.borrower &&
            loan.borrower.toLowerCase() !== account
        ) {
            const option = document.createElement("option"); 
            option.value = index; // Use the index as the value
            option.textContent = `Loan ID: ${index} - NFT ID: ${loan.nftId} - Amount: ${web3_ganache.utils.fromWei(loan.amount, "ether")} ETH`;
            loanByNftDropdown.appendChild(option);

            nftDropdownDict[index] = `Loan ID: ${index} - NFT ID: ${loan.nftId} - Amount: ${web3_ganache.utils.fromWei(loan.amount, "ether")} ETH`;
        }
    });

    if (loanByNftDropdown.options.length === 0) {
        const noLoansOption = document.createElement("option");
        noLoansOption.value = "";
        noLoansOption.textContent = "No Requests available";
        loanByNftDropdown.appendChild(noLoansOption);
    }
}

function updateLoanDictList() {
    const loanDictList = document.getElementById("loanDictList");
    loanDictList.innerHTML = ""; // Clear the list

    for (const loanId in loan_dict) {
        const loanData = loan_dict[loanId]; // Get the loan data array
        addExpandableItem(loanDictList, loanId, loanData); // Pass the Loan ID as well
    }
}

function updateNftDictList() {
    const nftDictList = document.getElementById("nftDictList");
    nftDictList.innerHTML = ""; // Clear the list
    for (const key in nft_dict) {
        const listItem = document.createElement("li");
        listItem.textContent = `${key}: ${JSON.stringify(nft_dict[key])}`;
        nftDictList.appendChild(listItem);
    }
}

function formatLoanSummary(loanId, loan) {
    return `Loan ID: ${loanId}
Amount: ${web3_ganache.utils.fromWei(loan.amount, "ether")} ETH
Borrower: ${loan.borrower.slice(0, 6)}...
Active: ${loan.active}`;
}

function formatLoanFull(loan) {
    const fields = [
        "Deadline",
        "Amount",
        "Lender",
        "Borrower",
        "Active",
        "Number of Payments",
        "Start Time",
        "Is Based on NFT",
        "NFT Contract",
        "NFT ID"
    ];

    const values = [
        loan.deadline,
        web3_ganache.utils.fromWei(loan.amount, "ether") + " ETH",
        loan.lender,
        loan.borrower,
        loan.active,
        loan.numberOfPayments,
        loan.startTime,
        loan.isBasedNFT,
        loan.nftContract,
        loan.nftId
    ];

    return fields.map((field, i) => `${field}: ${values[i]}`).join("\n");
}

function addExpandableItem(listElement, loanId, loanData) {
    const li = document.createElement('li');

    // Format the summary and full details
    const summaryText = formatLoanSummary(loanId, loanData);
    const fullText = formatLoanFull(loanData);

    // Set the initial content to the summary
    li.textContent = summaryText;
    li.dataset.full = fullText;
    li.dataset.summary = summaryText;

    // Add a click event listener to toggle between summary and full details
    li.addEventListener('click', () => {
        const isExpanded = li.classList.toggle('expanded');
        li.textContent = isExpanded ? li.dataset.full : li.dataset.summary;
    });

    // Append the item to the list
    listElement.appendChild(li);
}

window.connectMetaMask = connectMetaMask;
window.getRateEthToDex = getRateEthToDex;
window.getDexBalance = getDexBalance;
window.getEthBalance = getEthBalance;
window.listenToLoanCreation = listenToLoanCreation;

document.addEventListener("DOMContentLoaded", () => {
    // Buy DEX Button
    document.getElementById("buyDexBtn").onclick = async () => {
        const ethAmount = parseInt(prompt("Quantos ETH você quer usar para comprar DEX? (apenas número inteiro)"));
        if (!isNaN(ethAmount) && ethAmount > 0) {
            await buyDex(ethAmount);
        } else {
            alert("Valor inválido.");
        }
    };

    // Sell DEX Button
    document.getElementById("sellDexBtn").onclick = async () => {
        const dexAmount = parseInt(prompt("Quantos DEX você quer vender? (apenas número inteiro)"));
        if (!isNaN(dexAmount) && dexAmount > 0) {
            await sellDex(dexAmount);
        } else {
            alert("Valor inválido.");
        }
    };

    // Request Loan Button
    document.getElementById("requestLoanBtn").onclick = () => {
        const dexAmount = prompt("DEX amount?");
        const deadline = prompt("Deadline (timestamp)?");
        if (dexAmount && deadline) loan(dexAmount, deadline);
    };

    // Request NFT Loan Button
    document.getElementById("requestNftLoanBtn").onclick = makeLoanRequestByNft;

    // Terminate Loan Button
    document.getElementById("terminateLoanBtn").onclick = async () => {
        const loanId = prompt("Digite o ID do empréstimo (loanId) que deseja terminar:");
        if (!loanId || isNaN(loanId)) {
            alert("ID do empréstimo inválido.");
            return;
        }
        await terminateLoan(loanId);
    };

    // Make Payment Button
    document.getElementById("makePaymentBtn").onclick = async () => {
        const loanKey = document.getElementById("paymentLoanDropdown").value;
        const paymentAmount = parseFloat(document.getElementById("paymentAmountInput").value);
        if (!loanKey || isNaN(paymentAmount) || paymentAmount <= 0) {
            alert("Please select a valid loan and enter a valid payment amount.");
            return;
        }
        try {
            await makePayment(loanKey, paymentAmount);
            alert("Payment successful!");
        } catch (error) {
            alert("Error making payment. Check the console for details.");
            console.error(error);
        }
    };

    // Mint NFT Button
    document.getElementById("mintNftBtn").onclick = mintNFT;

    // Set DEX Swap Rate Button
    document.getElementById("setDexSwapRateBtn").onclick = async () => {
        const newRate = prompt("Enter the new DEX swap rate:");
        if (!newRate || isNaN(newRate) || Number(newRate) <= 0) {
            alert("Invalid swap rate. Please enter a positive number.");
            return;
        }
        try {
            await setDexSwapRate(newRate);
        } catch (error) {
            console.error("Error setting DEX swap rate:", error);
        }
    };

    // Cancel Loan Button
    document.getElementById("cancelLoanNewBtn").onclick = async () => {
        const loanDropdown = document.getElementById("loanCancelDropdown");
        const selectedLoanId = loanDropdown.value;

        if (!selectedLoanId) {
            alert("Please select a loan to cancel.");
            return;
        }

        try {
            await cancelLoan(selectedLoanId);
        } catch (error) {
            console.error("Error canceling loan:", error);
        }
    };

    // Loan by NFT Button
    document.getElementById("loanByNftNewBtn").onclick = async () => {
        const loanByNftDropdown = document.getElementById("loanByNftDropdown");
        const selectedLoanId = loanByNftDropdown.value;
        if (!selectedLoanId) {
            alert("Please select a loan to request by NFT.");
            return;
        }

        try {
            await loanByNft(selectedLoanId);
        } catch (error) {
            console.error("Error requesting loan by NFT:", error);
        }
    };

    listenToNftMinting();
    listenToLoanCreation();
});