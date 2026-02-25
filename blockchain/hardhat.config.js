import '@nomicfoundation/hardhat-toolbox';

/** @type {import('hardhat/config').HardhatUserConfig} */
const config = {
  solidity: '0.8.24',
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545'
    },
    local8546: {
      url: 'http://127.0.0.1:8546'
    },
    local8547: {
      url: 'http://127.0.0.1:8547'
    }
  }
};

export default config;
