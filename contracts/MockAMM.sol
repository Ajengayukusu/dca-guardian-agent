// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IQorePqc.sol";

/// @title MockAMM — constant-price AMM stand-in for local tests only.
/// @notice Implements the IAmm surface GuardianVault trades against:
///         spotPrice() is target-per-spend scaled by 1e18, and swapExactIn
///         pulls the spend token from the caller and pays the target token
///         out of its own inventory at that price. Tests steer the market by
///         calling setPrice() — including the violent moves that must trip
///         the vault's circuit-breaker.
/// @dev NOT a real AMM: no reserves curve, no slippage, no LP accounting.
///      On Diana the vault points at the chain's native AMM surface (see
///      docs/ABSTRACT_ACCOUNT_PLAN.md and README) — the vault only depends
///      on this two-function interface, so the venue can be swapped without
///      touching the guard rules.
contract MockAMM is IAmm {
    using SafeERC20 for IERC20;

    IERC20 public immutable spendToken;
    IERC20 public immutable targetToken;
    /// @notice 10^(targetDecimals - spendDecimals): converts the per-whole-token
    ///         price into smallest-unit amounts (fUSD 6 -> QOR 18 gives 1e12).
    uint256 public immutable unitScale;
    uint256 private _priceE18;

    event PriceSet(uint256 priceE18);
    event Swap(address indexed caller, uint256 amountIn, uint256 amountOut, uint256 priceE18);

    constructor(address spendToken_, address targetToken_, uint256 initialPriceE18) {
        spendToken = IERC20(spendToken_);
        targetToken = IERC20(targetToken_);
        uint8 sDec = IERC20Metadata(spendToken_).decimals();
        uint8 tDec = IERC20Metadata(targetToken_).decimals();
        require(tDec >= sDec, "target decimals below spend decimals");
        unitScale = 10 ** uint256(tDec - sDec);
        _priceE18 = initialPriceE18;
    }

    /// @notice Test/demo helper: move the market.
    function setPrice(uint256 priceE18) external {
        require(priceE18 > 0, "price must be positive");
        _priceE18 = priceE18;
        emit PriceSet(priceE18);
    }

    function spotPrice() external view override returns (uint256 priceE18) {
        return _priceE18;
    }

    function swapExactIn(uint256 amountIn) external override returns (uint256 amountOut) {
        require(amountIn > 0, "zero amount");
        amountOut = ((amountIn * _priceE18) / 1e18) * unitScale;
        require(amountOut > 0, "zero output");
        spendToken.safeTransferFrom(msg.sender, address(this), amountIn);
        targetToken.safeTransfer(msg.sender, amountOut);
        emit Swap(msg.sender, amountIn, amountOut, _priceE18);
    }
}
