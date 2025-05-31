import Web3 from "web3";

const web3_ganache = new Web3(new Web3.providers.WebsocketProvider('ws://127.0.0.1:8545'));
// the part is related to the DecentralizedFinance smart contract
const defi_contractAddress = "0x4E91C79af26D2229B3aA53e8D024B4726f1FbCFE";
import { defi_abi } from "./abi_decentralized_finance.js";
const defi_contract = new web3_ganache.eth.Contract(defi_abi, defi_contractAddress);

// Function to check loan
async function checkLoans() {
    try {
        const accounts = await web3_ganache.eth.getAccounts();
        const sender = accounts[0]; // Suponha que o borrower seja este

        const loanCount = await defi_contract.methods.loanCount().call();
        console.log("Total de empréstimos:", loanCount);

        for (let i = 0; i < loanCount; i++) {
            try {
                const loan = await defi_contract.methods.getLoanDetails(i).call();
                if (loan.borrower.toLowerCase() === sender.toLowerCase()) {
                    console.log(`Verificando empréstimo ${i} do borrower ${sender}`);
                    await defi_contract.methods.checkLoan(i).send({ from: sender });
                }
            } catch (innerErr) {
                console.error(`Erro ao verificar o empréstimo ${i}:`, innerErr);
            }
        }

    } catch (error) {
        console.error("Error checking loans:", error);
    }
}

setInterval(async () => {
    await checkLoans();
}, 10 * 60 * 1000);