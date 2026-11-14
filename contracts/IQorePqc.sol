// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IQorePqc — interfaces for the QoreChain post-quantum precompiles.
/// @notice On QoreChain Diana testnet (chain v3.2.4+) these are two SEPARATE
///         precompiles:
///           - pqcVerify    at 0x0000000000000000000000000000000000000A01
///           - pqcKeyStatus at 0x0000000000000000000000000000000000000A02
///         GuardianVault receives both addresses via its constructor
///         (dependency injection), which also makes the contract testable
///         locally against MockPqc.
///
/// @dev ARGUMENT ORDER MATTERS. The Solidity precompile ABI is
///      pqcVerify(pubkey, signature, message) — this is NOT the same order as
///      the JavaScript SDK helper pqcVerify(publicKey, message, signature).
interface IQorePqcVerify {
    /// @param pubkey    ML-DSA-87 public key (2592 bytes on the real chain).
    /// @param signature ML-DSA-87 signature (4627 bytes on the real chain).
    /// @param message   The exact message bytes that were signed.
    /// @return valid    True iff the signature verifies for pubkey + message.
    function pqcVerify(
        bytes calldata pubkey,
        bytes calldata signature,
        bytes calldata message
    ) external view returns (bool valid);
}

interface IQorePqcKeyStatus {
    /// @notice Returns FOUR values since chain v3.2.4. Older 3-value decoders
    ///         break against the live precompile — do not "simplify" this.
    /// @return registered       The account has an ML-DSA key registered on chain.
    /// @return algorithmId      Signature algorithm id (1 = ML-DSA-87 / FIPS 204).
    /// @return pubkey           The public key actually registered on chain.
    /// @return possessionProven The account proved possession of the private key
    ///                          at registration time (MsgRegisterPQCKeyV2).
    function pqcKeyStatus(
        address account
    )
        external
        view
        returns (
            bool registered,
            uint8 algorithmId,
            bytes memory pubkey,
            bool possessionProven
        );
}

/// @title IAmm — the single AMM interface GuardianVault is allowed to trade on.
/// @notice Price convention: spotPrice() returns how much TARGET token one
///         WHOLE SPEND token buys, scaled by 1e18 (e.g. 2.5e18 = 1 fUSD
///         buys 2.5 QOR), independent of either token's decimals — the venue
///         converts between smallest units internally. swapExactIn pulls
///         `amountIn` (spend-token smallest units) from the caller (the
///         vault, which approves it) and sends the target token back to the
///         caller.
interface IAmm {
    function spotPrice() external view returns (uint256 priceE18);
    function swapExactIn(uint256 amountIn) external returns (uint256 amountOut);
}
