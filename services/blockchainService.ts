
import { BlockchainReceipt } from "../types";

/**
 * Simulates a blockchain transaction for signing a contract.
 * In a real app, this would use ethers.js or web3.js to interact with a smart contract.
 */
export const signContractOnChain = async (
    contractId: string, 
    userEmail: string, 
    vehicleId: string
): Promise<BlockchainReceipt> => {
    // 1. Simulate Network Delay (Mining time)
    await new Promise(resolve => setTimeout(resolve, 2500));

    // 2. Generate a pseudo-random cryptographic hash
    // In reality, this is returned by the blockchain node
    const generateHash = async (input: string) => {
        const msgBuffer = new TextEncoder().encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const uniqueInput = `${contractId}-${userEmail}-${vehicleId}-${Date.now()}`;
    const txHash = await generateHash(uniqueInput);
    
    // 3. Generate Mock Contract Address
    const contractAddress = await generateHash("TeckionSmartContractRegistry_v1");

    return {
        tx_hash: txHash,
        block_number: Math.floor(18000000 + Math.random() * 100000),
        timestamp: new Date().toISOString(),
        gas_used: 21000 + Math.floor(Math.random() * 50000),
        contract_address: contractAddress.substring(0, 42) // Standard ETH address length
    };
};
