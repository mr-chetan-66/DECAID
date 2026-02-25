import hre from 'hardhat';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const CredentialRegistry = await hre.ethers.getContractFactory('CredentialRegistry');
  const registry = await CredentialRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log('CredentialRegistry deployed to:', address);

  const artifact = await hre.artifacts.readArtifact('CredentialRegistry');
  const out = {
    address,
    abi: artifact.abi
  };

  const outPath = path.resolve(process.cwd(), '..', 'backend', 'src', 'contract', 'CredentialRegistry.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
