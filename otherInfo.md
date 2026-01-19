To create a quick disposable wallet, use this command:

```bash
cd ~/oracle
node -e "
const { ethers } = await import('ethers');
const w = ethers.Wallet.createRandom();
console.log('Address:    ', w.address);
console.log('PrivateKey: ', w.privateKey);
"
```

Copy the `PrivateKey` value into .env as `ORACLE_PRIVATE_KEY`.

Then fund it with Sepolia ETH — grab ~0.1 SepoliaETH from any faucet:

- https://www.sepoliafaucet.com

- https://www.faucets.chain.link/sepolia

