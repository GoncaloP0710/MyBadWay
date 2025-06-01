// const web3 = new Web3(window.ethereum);
const web3_ganache = new Web3(new Web3.providers.WebsocketProvider('ws://127.0.0.1:8545'));
// the part is related to the DecentralizedFinance smart contract
const defi_contractAddress = "0x518f2C5267b877e0579Ec8555EA0c0C638A61754";
import { defi_abi } from "./abi_decentralized_finance.js";
const defi_contract = new web3_ganache.eth.Contract(defi_abi, defi_contractAddress);

// the part is related to the the SimpleNFT smart contract
const nft_contractAddress = "0x153E5cE95FF9F4e9c0AcEAb434704ec68776CA6C";
import { nft_abi } from "./abi_nft.js";
const nft_contract = new web3_ganache.eth.Contract(nft_abi, nft_contractAddress);

const loan_dict = {};
const nft_dict = {};

fetchAndPopulateLoans();
fetchAndPopulateNfts();
getEthBalance();
getUserDexBalance();
getDexBalance();
getRateEthToDex();

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
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];

    // Retrieve the loanId using the key
    if (!loanId) {
        alert("Invalid loan key selected.");
        return;
    }

    try {
        console.log("Making payment for loan ID:", loanId, "with amount:", paymentAmount);
        const paymentResult = await defi_contract.methods.makePayment(loanId).send({
            from: account,
            value: web3_ganache.utils.toWei(paymentAmount.toString(), "ether"),
            gas: 3000000 // Ajuste o limite de gás conforme necessário
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

    // Peça o valor total ao usuário
    const repayAmount = prompt("Digite o valor total (em ETH) para quitar o empréstimo (principal + taxa):");
    if (!repayAmount || isNaN(repayAmount) || Number(repayAmount) <= 0) {
        alert("Valor inválido.");
        return;
    }

    try {
        const valueWei = web3_ganache.utils.toWei(repayAmount.toString(), "ether");
        console.log("Terminating loan with ID:", loanId, "and value:", valueWei);
        const terminateResult = await defi_contract.methods.terminateLoan(loanId).send({
            from: account,
            value: valueWei,
            gas: 3000000
        });
        console.log("Loan terminated successfully:", terminateResult);
        getEthBalance();
        getUserDexBalance();
        getDexBalance();
        return terminateResult;
    } catch (error) {
        console.error("Error terminating loan:", error);
        throw error;
    }
}

// ========================================= NFT Operations =========================================

async function getEthTotalBalance() {
    // TODO: implement this
}

async function getAvailableNfts() {
    // TODO: implement this
}

async function getTotalBorrowedAndNotPaidBackEth() {
    // TODO: implement this
}

async function makeLoanRequestByNft() {
    console.log("Making loan request by NFT...");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = accounts[0];

    const nftId = document.getElementById("nftDropdown").value;
    const loanAmount = prompt("Enter the loan amount (ETH):");
    const deadlineMinutes = prompt("Enter the loan deadline in minutes:");

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
    } catch (error) {
        console.error("Error requesting loan with NFT:", error);
        alert("Error requesting loan with NFT. Check the console for details.");
    }
}

async function cancelLoanRequestByNft() {
    // TODO: implement this
}

async function loanByNft() {
    // TODO: implement this
}

async function getAllTokenURIs() {
    // TODO: implement this
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
                loan_dict[loanId] = loan;
                console.log("New loan created:", loanId, loan);
                populatePaymentDropdown();
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
        populatePaymentDropdown();
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
        populateNftDropdown();
    } catch (error) {
        console.error("Error fetching NFTs:", error);
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

const populatePaymentDropdown = () => {
    const dropdown = document.getElementById("paymentLoanDropdown");
    dropdown.innerHTML = ""; // Clear existing options
    for (const key in loan_dict) {
        const option = document.createElement("option");
        option.value = key; // Use the key as the value
        option.textContent = key; // Display the key (borrower_amount_deadline)
        dropdown.appendChild(option);
    }
};

async function populateNftDropdown() {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const account = accounts[0];

    const nftDropdown = document.getElementById("nftDropdown");
    nftDropdown.innerHTML = ""; // Clear existing options

    try {
        const totalSupply = await nft_contract.methods.tokenIdCounter().call(); // Assuming tokenIdCounter is public
        for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
            const owner = await nft_contract.methods.ownerOf(tokenId).call();
            if (owner.toLowerCase() === account.toLowerCase()) {
                const option = document.createElement("option");
                option.value = tokenId;
                option.textContent = `NFT #${tokenId}`;
                nftDropdown.appendChild(option);
            }
        }
    } catch (error) {
        console.error("Error populating NFT dropdown:", error);
    }
}

function formatLoanSummary(loanId, loanArray) {
    const [deadline, amount, lender, borrower, active] = loanArray;
    return `Loan ID: ${loanId}\nAmount: ${web3_ganache.utils.fromWei(amount, "ether")} ETH\nBorrower: ${borrower.slice(0, 6)}...\nActive: ${active}`;
}

function formatLoanFull(loanArray) {
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
    return loanArray
        .map((val, i) => `${fields[i]}: ${val}`)
        .join('\n');
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
window.buyDex = buyDex;
window.sellDex = sellDex;
window.loan = loan;
window.getEthTotalBalance = getEthTotalBalance;
window.getRateEthToDex = getRateEthToDex;
window.makeLoanRequestByNft = makeLoanRequestByNft;
window.cancelLoanRequestByNft = cancelLoanRequestByNft;
window.loanByNft = loanByNft;
// window.checkLoan = checkLoan;
window.listenToLoanCreation = listenToLoanCreation;
window.getAvailableNfts = getAvailableNfts;
window.getDexBalance = getDexBalance;
window.getEthBalance = getEthBalance;
window.terminateLoan = terminateLoan;
// windows.getTotalBorrowedAndNotPaidBackEth = getTotalBorrowedAndNotPaidBackEth;
// windows.checkLoanStatus = checkLoanStatus;
// windows.getAllTokenURIs = getAllTokenURIs;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("buyDexBtn").onclick = async () => {
        const ethAmount = parseInt(prompt("Quantos ETH você quer usar para comprar DEX? (apenas número inteiro)"));
        if (!isNaN(ethAmount) && ethAmount > 0) {
            await buyDex(ethAmount);
        } else {
            alert("Valor inválido.");
        }
    };

    document.getElementById("sellDexBtn").onclick = async () => {
        const dexAmount = parseInt(prompt("Quantos DEX você quer vender? (apenas número inteiro)"));
        if (!isNaN(dexAmount) && dexAmount > 0) {
            await sellDex(dexAmount);
        } else {
            alert("Valor inválido.");
        }
    };
    document.getElementById("requestLoanBtn").onclick = () => {
        const dexAmount = prompt("DEX amount?");
        const deadline = prompt("Deadline (timestamp)?");
        if (dexAmount && deadline) loan(dexAmount, deadline);
    };
    // document.getElementById("repayLoanBtn").onclick = () => {
    //     const key = prompt("Chave do empréstimo (ex: borrower_amount_deadline)?");
    //     const amount = prompt("Valor do pagamento?");
    //     if (key && amount) makePayment(key, amount);
    // };
    document.getElementById("checkLoanBtn").onclick = () => {
        const key = document.getElementById("loanDropdown").value;
        if (key) checkLoanStatus(key);
    };
    document.getElementById("requestNftLoanBtn").onclick = makeLoanRequestByNft;
    document.getElementById("cancelNftLoanBtn").onclick = cancelLoanRequestByNft;
    document.getElementById("repayNftLoanBtn").onclick = () => {
        alert("Função de repagamento de NFT ainda não implementada.");
    };
    document.getElementById("terminateLoanBtn").onclick = async () => {
        const loanId = prompt("Digite o ID do empréstimo (loanId) que deseja terminar:");
        if (!loanId || isNaN(loanId)) {
            alert("ID do empréstimo inválido.");
            return;
        }
        await terminateLoan(loanId);
    };
    
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
    document.getElementById("mintNftBtn").onclick = mintNFT;

    const setDexSwapRateBtn = document.getElementById("setDexSwapRateBtn");

    if (setDexSwapRateBtn) {
        setDexSwapRateBtn.onclick = setDexSwapRate;
        console.log("Set DEX Swap Rate button is bound to the function.");
    } else {
        console.error("Set DEX Swap Rate button not found in the DOM.");
    }

    updateLoanDictList();
    updateNftDictList();
    populatePaymentDropdown();
    listenToLoanCreation();
    listenToNftMinting();
    populateNftDropdown(); // Populate the dropdown with NFTs


    enableExpandableList('loanDictList');
    enableExpandableList('nftDictList');

    document.getElementById("requestNftLoanBtn").onclick = makeLoanRequestByNft;
});