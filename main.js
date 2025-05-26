// const web3 = new Web3(window.ethereum);
const web3_ganache = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));

// the part is related to the DecentralizedFinance smart contract
const defi_contractAddress = "0x5a404632DF0C8388708cF3922c739f9f71ac988e";
import { defi_abi } from "./abi_decentralized_finance.js";
const defi_contract = new web3_ganache.eth.Contract(defi_abi, defi_contractAddress);

// the part is related to the the SimpleNFT smart contract
//const nft_contractAddress = " contract-address ";
//import { nft_abi } from "./abi_nft.js";
//const nft_contract = new web3.eth.Contract(nft_abi, nft_contractAddress);

const loan_dict = {};

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

async function buyDex() {
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
            value: web3_ganache.utils.toWei("1", "ether") // Sending 1 ETH
        });        console.log("DEX tokens bought successfully:", buyResult);
        return buyResult;
    } catch (error) {
        console.error("Error buying DEX tokens:", error);
        throw error;
    }
}

async function sellDex() {
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];
    try {
        console.log("Selling DEX tokens for account:", account);
        const sellResult = await defi_contract.methods.sellDex().send({ from: account, value: web3_ganache.utils.toWei("1", "ether") });
        console.log("DEX tokens sold successfully:", sellResult);
        return sellResult;
    } catch (error) {
        console.error("Error selling DEX tokens:", error);
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

        const loanStatus = await defi_contract.methods.checkLoan(loan_dict[loan]).send({ from: account, });
        console.log("Loan status:", loanStatus);
        return loanStatus;
    } catch (error) {
        console.error("Error checking loan status:", error);
        throw error;
    }
}

async function listenToDebugValue() {
    defi_contract.events.DebugValue({}, (error, event) => {
        if (!error) {
            console.log("Debug value:", event.returnValues.value);
        } else {
            console.error("Erro ao escutar debugValue:", error);
        }
    });
}   

async function listenToLoanCreation() {
    defi_contract.events.loanCreated({}, (error, event) => {
        if (!error) {
            const { borrower, amount, deadline, loanId } = event.returnValues;
            // Salve o loanId usando uma chave única (ex: borrower + amount + deadline)
            const key = `${borrower}_${amount}_${deadline}`;
            loan_dict[key] = loanId;
            console.log("Novo empréstimo criado:", loanId);
        } else {
            console.error("Erro ao escutar loanCreated:", error);
        }
    });
}

async function loan(dexAmount, deadline) {
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];
    try {
        console.log("Requesting loan for account:", account, "with amount:", dexAmount, "and deadline:", deadline);
        const loanResult = await defi_contract.methods.loan(dexAmount, deadline).send({ from: account });
        console.log("Loan requested successfully:", loanResult);
        return loanResult;
    } catch (error) {
        console.error("Error requesting loan:", error);
        throw error;
    }
}

async function makePayment(loan, payament_amount) {
    const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
    });
    const account = accounts[0];
    try {
        console.log("Making payment for loan:", loan, "with amount:", payament_amount);
        const paymentResult = await defi_contract.methods.makePayment(loan_dict[loan], payament_amount).send({ from: account, value: web3_ganache.utils.toWei(payament_amount.toString(), "ether") });
        console.log("Payment made successfully:", paymentResult);
        return paymentResult;
    } catch (error) {
        console.error("Error making payment:", error);
        throw error;
    }
}

async function returnLoan() {
    // TODO: implement this
}

async function getEthTotalBalance() {
    // TODO: implement this
}

async function getRateEthToDex() {
    // TODO: implement this
}

async function getAvailableNfts() {
    // TODO: implement this
}

async function getTotalBorrowedAndNotPaidBackEth() {
    // TODO: implement this
}

async function makeLoanRequestByNft() {
    // TODO: implement this
}

async function cancelLoanRequestByNft() {
    // TODO: implement this
}

async function loanByNft() {
    // TODO: implement this
}

async function checkLoan() {
    // TODO: implement this
}

async function getAllTokenURIs() {
    // TODO: implement this
}

window.connectMetaMask = connectMetaMask;
window.buyDex = buyDex;
window.sellDex = sellDex;
window.loan = loan;
window.returnLoan = returnLoan;
window.getEthTotalBalance = getEthTotalBalance;
window.getRateEthToDex = getRateEthToDex;
window.makeLoanRequestByNft = makeLoanRequestByNft;
window.cancelLoanRequestByNft = cancelLoanRequestByNft;
window.loanByNft = loanByNft;
window.checkLoan = checkLoan;
window.listenToLoanCreation = listenToLoanCreation;
window.getAvailableNfts = getAvailableNfts;
// windows.getTotalBorrowedAndNotPaidBackEth = getTotalBorrowedAndNotPaidBackEth;
// windows.checkLoanStatus = checkLoanStatus;
// windows.getAllTokenURIs = getAllTokenURIs;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("buyDexBtn").onclick = buyDex;
    document.getElementById("sellDexBtn").onclick = sellDex;
    document.getElementById("requestLoanBtn").onclick = () => {
        const dexAmount = prompt("DEX amount?");
        const deadline = prompt("Deadline (timestamp)?");
        if (dexAmount && deadline) loan(dexAmount, deadline);
    };
    document.getElementById("repayLoanBtn").onclick = () => {
        const key = prompt("Chave do empréstimo (ex: borrower_amount_deadline)?");
        const amount = prompt("Valor do pagamento?");
        if (key && amount) makePayment(key, amount);
    };
    document.getElementById("checkLoanBtn").onclick = () => {
        const key = document.getElementById("loanDropdown").value;
        if (key) checkLoanStatus(key);
    };
    document.getElementById("requestNftLoanBtn").onclick = makeLoanRequestByNft;
    document.getElementById("cancelNftLoanBtn").onclick = cancelLoanRequestByNft;
    document.getElementById("repayNftLoanBtn").onclick = () => {
        alert("Função de repagamento de NFT ainda não implementada.");
    };
});