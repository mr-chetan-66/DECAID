// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CredentialRegistry {
    struct Credential {
        bytes32 credentialHash;
        address issuer;
        uint64 issuedAt;
        bool revoked;
    }

    mapping(bytes32 => Credential) private credentials;

    event CredentialIssued(bytes32 indexed credentialHash, address indexed issuer, uint64 issuedAt);
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed issuer, uint64 revokedAt);

    function issue(bytes32 credentialHash) external {
        require(credentialHash != bytes32(0), "hash required");
        Credential storage c = credentials[credentialHash];
        require(c.credentialHash == bytes32(0), "already issued");

        credentials[credentialHash] = Credential({
            credentialHash: credentialHash,
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            revoked: false
        });

        emit CredentialIssued(credentialHash, msg.sender, uint64(block.timestamp));
    }

    function revoke(bytes32 credentialHash) external {
        Credential storage c = credentials[credentialHash];
        require(c.credentialHash != bytes32(0), "not found");
        require(c.issuer == msg.sender, "only issuer");
        require(!c.revoked, "already revoked");

        c.revoked = true;
        emit CredentialRevoked(credentialHash, msg.sender, uint64(block.timestamp));
    }

    function verify(bytes32 credentialHash)
        external
        view
        returns (bool exists, address issuer, uint64 issuedAt, bool revoked)
    {
        Credential storage c = credentials[credentialHash];
        exists = c.credentialHash != bytes32(0);
        issuer = c.issuer;
        issuedAt = c.issuedAt;
        revoked = c.revoked;
    }
}
