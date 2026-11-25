// Sources flattened with hardhat v2.29.2 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (utils/introspection/IERC165.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC165.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC165.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File @openzeppelin/contracts/interfaces/IERC20.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC20.sol)

pragma solidity >=0.4.16;


// File @openzeppelin/contracts/interfaces/IERC1363.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (interfaces/IERC1363.sol)

pragma solidity >=0.6.2;


/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.5.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.20;


/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        if (!_safeTransfer(token, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        if (!_safeTransferFrom(token, from, to, value, true)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _safeTransfer(token, to, value, false);
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _safeTransferFrom(token, from, to, value, false);
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        if (!_safeApprove(token, spender, value, false)) {
            if (!_safeApprove(token, spender, 0, true)) revert SafeERC20FailedOperation(address(token));
            if (!_safeApprove(token, spender, value, true)) revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that relies on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Oppositely, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity `token.transfer(to, value)` call, relaxing the requirement on the return value: the
     * return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransfer(IERC20 token, address to, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.transfer.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(to, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }

    /**
     * @dev Imitates a Solidity `token.transferFrom(from, to, value)` call, relaxing the requirement on the return
     * value: the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param from The sender of the tokens
     * @param to The recipient of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 value,
        bool bubble
    ) private returns (bool success) {
        bytes4 selector = IERC20.transferFrom.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(from, shr(96, not(0))))
            mstore(0x24, and(to, shr(96, not(0))))
            mstore(0x44, value)
            success := call(gas(), token, 0, 0x00, 0x64, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
            mstore(0x60, 0)
        }
    }

    /**
     * @dev Imitates a Solidity `token.approve(spender, value)` call, relaxing the requirement on the return value:
     * the return value is optional (but if data is returned, it must not be false).
     *
     * @param token The token targeted by the call.
     * @param spender The spender of the tokens
     * @param value The amount of token to transfer
     * @param bubble Behavior switch if the transfer call reverts: bubble the revert reason or return a false boolean.
     */
    function _safeApprove(IERC20 token, address spender, uint256 value, bool bubble) private returns (bool success) {
        bytes4 selector = IERC20.approve.selector;

        assembly ("memory-safe") {
            let fmp := mload(0x40)
            mstore(0x00, selector)
            mstore(0x04, and(spender, shr(96, not(0))))
            mstore(0x24, value)
            success := call(gas(), token, 0, 0x00, 0x44, 0x00, 0x20)
            // if call success and return is true, all is good.
            // otherwise (not success or return is not true), we need to perform further checks
            if iszero(and(success, eq(mload(0x00), 1))) {
                // if the call was a failure and bubble is enabled, bubble the error
                if and(iszero(success), bubble) {
                    returndatacopy(fmp, 0x00, returndatasize())
                    revert(fmp, returndatasize())
                }
                // if the return value is not true, then the call is only successful if:
                // - the token address has code
                // - the returndata is empty
                success := and(success, and(iszero(returndatasize()), gt(extcodesize(token), 0)))
            }
            mstore(0x40, fmp)
        }
    }
}


// File @openzeppelin/contracts/utils/StorageSlot.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.

pragma solidity ^0.8.20;

/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC-1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     // Define the slot. Alternatively, use the SlotDerivation library to derive the slot.
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(newImplementation.code.length > 0);
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * TIP: Consider using this library along with {SlotDerivation}.
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct Int256Slot {
        int256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Int256Slot` with member `value` located at `slot`.
     */
    function getInt256Slot(bytes32 slot) internal pure returns (Int256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns a `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }
}


// File @openzeppelin/contracts/utils/ReentrancyGuard.sol@v5.6.1

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)

pragma solidity ^0.8.20;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 *
 * IMPORTANT: Deprecated. This storage-based reentrancy guard will be removed and replaced
 * by the {ReentrancyGuardTransient} variant in v6.0.
 *
 * @custom:stateless
 */
abstract contract ReentrancyGuard {
    using StorageSlot for bytes32;

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev A `view` only version of {nonReentrant}. Use to block view functions
     * from being called, preventing reading from inconsistent contract state.
     *
     * CAUTION: This is a "view" modifier and does not change the reentrancy
     * status. Use it only on view functions. For payable or non-payable functions,
     * use the standard {nonReentrant} modifier instead.
     */
    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        _nonReentrantBeforeView();

        // Any calls to nonReentrant after this point will fail
        _reentrancyGuardStorageSlot().getUint256Slot().value = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _reentrancyGuardStorageSlot().getUint256Slot().value == ENTERED;
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
    }
}


// File contracts/IQorePqc.sol

// Original license: SPDX_License_Identifier: MIT
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


// File contracts/GuardianVault.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.24;




/// @title GuardianVault — the on-chain leash for an autonomous DCA agent.
/// @notice Built for the QoreChain "Build Before Q-Day" Developer Fest,
///         Post-Quantum AI Agents category.
///
///         An AI agent that holds a live key WILL eventually leak it, be
///         prompt-injected, or simply go wrong. GuardianVault is designed for
///         that day: the agent's key can do exactly ONE thing — call
///         executeDca() — and even that is fenced by rules the agent cannot
///         change, enforced by this contract on every call:
///
///           1. Per-transaction cap         (perTxCap)
///           2. Daily cap, UTC day bucket   (dailyCap, bucket = ts / 86400)
///           3. Minimum interval between executions (minIntervalSec)
///           4. Circuit-breaker: execution reverts while the AMM price has
///              moved more than breakerThresholdBps from the anchor price
///              observed at the start of the current breakerWindowSec window.
///           5. Exactly ONE venue and ONE pair: the AMM address and the
///              spend/target tokens are immutable — the agent cannot route
///              funds anywhere else, ever.
///
///         The agent holds NO owner capability: it cannot withdraw, cannot
///         change its own address, cannot un-kill itself. The only functions
///         that move funds to a human — withdraw() — and the functions that
///         change control — killSwitch() (permanent) and setAgent() — belong
///         to the owner AND additionally require a fresh ML-DSA-87 (FIPS 204)
///         signature, verified ON CHAIN by the QoreChain pqcVerify
///         precompile and bound to the owner's registered on-chain key
///         (pqcKeyStatus: registered + proof-of-possession + pubkey match),
///         over a domain-bound message with a consumed nonce and a deadline.
///         A leaked classical owner key therefore cannot drain or hijack the
///         vault either — that is the Q-Day drill property.
///
///         Worst case if the AGENT key leaks (the design scenario): the
///         attacker can keep calling executeDca() inside the same caps until
///         the owner kills the agent — bounded by dailyCap per UTC day and
///         perTxCap per call, and every "attack" buy still lands in the
///         vault as the target asset. Funds never leave the vault to the
///         attacker. See README threat model for the full accounting.
contract GuardianVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------- immutables

    address public immutable owner;
    IAmm public immutable amm;
    IERC20 public immutable spendToken;
    IERC20 public immutable targetToken;

    uint256 public immutable perTxCap;
    uint256 public immutable dailyCap;
    uint256 public immutable minIntervalSec;
    uint256 public immutable breakerThresholdBps;
    uint256 public immutable breakerWindowSec;

    IQorePqcVerify public immutable pqcVerifyPrecompile;
    IQorePqcKeyStatus public immutable pqcKeyStatusPrecompile;

    uint8 public constant MLDSA87_ALGORITHM_ID = 1;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ---------------------------------------------------------------- storage

    address public agent;
    bool public killed;

    /// @notice Anti-replay nonce for owner PQ actions; consumed by every
    ///         executed killSwitch / setAgent / withdraw.
    uint256 public pqcNonce;

    uint256 public lastExecutionAt;
    uint256 public executionCount;
    uint256 public totalSpent;
    uint256 public totalAcquired;

    /// @notice Daily accounting. The bucket is the explicit UTC day number
    ///         (block.timestamp / 86400) — not a rolling 24 h window — so the
    ///         reset moment is predictable and auditable.
    uint256 public spentDayBucket;
    uint256 public spentInDay;

    /// @notice Circuit-breaker anchor: the price observed when the current
    ///         breaker window opened, and when it opened (unix seconds).
    uint256 public anchorPrice;
    uint256 public anchorTimestamp;
    uint256 public lastPrice;

    // ----------------------------------------------------------------- events

    event Deposited(address indexed from, uint256 amount);
    event DcaExecuted(
        address indexed agent,
        uint256 amountIn,
        uint256 amountOut,
        uint256 priceE18,
        uint256 spentInDayAfter,
        uint256 dayBucket
    );
    event BreakerAnchorUpdated(uint256 priceE18, uint256 timestamp);
    event AgentKilled(address indexed owner, uint256 pqcNonceUsed);
    event AgentRotated(address indexed previousAgent, address indexed newAgent);
    event Withdrawn(address indexed owner, address indexed token, uint256 amount);

    // ----------------------------------------------------------------- errors

    error NotOwner();
    error NotAgent();
    error AgentAlreadyKilled();
    error AgentIsKilled();
    error InvalidConfig();
    error InvalidAmount();
    error PerTxCapExceeded(uint256 amount, uint256 cap);
    error DailyCapExceeded(uint256 spentAfter, uint256 cap);
    error TooSoon(uint256 nextAllowedAt);
    error InvalidPrice();
    error CircuitBreakerTripped(uint256 deviationBps, uint256 thresholdBps);
    error SignatureExpired();
    error PqcKeyNotRegistered();
    error PqcPossessionNotProven();
    error PqcWrongAlgorithm();
    error PqcPubkeyMismatch();
    error PqcBadSignature();
    error InsufficientVaultBalance();

    // ------------------------------------------------------------ constructor

    /// @param pqcVerifyAddress    pqcVerify precompile (Diana: 0x0A01).
    /// @param pqcKeyStatusAddress pqcKeyStatus precompile (Diana: 0x0A02).
    ///        Injected (instead of hard-coded) so tests can substitute MockPqc.
    /// @param ammAddress          The ONE venue the agent may trade on.
    /// @param spendTokenAddress   The ONE token the agent may spend.
    /// @param targetTokenAddress  The ONE token the agent may buy.
    constructor(
        address owner_,
        address agent_,
        address ammAddress,
        address spendTokenAddress,
        address targetTokenAddress,
        address pqcVerifyAddress,
        address pqcKeyStatusAddress,
        uint256 perTxCap_,
        uint256 dailyCap_,
        uint256 minIntervalSec_,
        uint256 breakerThresholdBps_,
        uint256 breakerWindowSec_
    ) {
        if (
            owner_ == address(0) ||
            agent_ == address(0) ||
            ammAddress == address(0) ||
            spendTokenAddress == address(0) ||
            targetTokenAddress == address(0) ||
            spendTokenAddress == targetTokenAddress ||
            pqcVerifyAddress == address(0) ||
            pqcKeyStatusAddress == address(0) ||
            perTxCap_ == 0 ||
            dailyCap_ < perTxCap_ ||
            breakerThresholdBps_ == 0 ||
            breakerThresholdBps_ > BPS_DENOMINATOR ||
            breakerWindowSec_ == 0
        ) revert InvalidConfig();

        owner = owner_;
        agent = agent_;
        amm = IAmm(ammAddress);
        spendToken = IERC20(spendTokenAddress);
        targetToken = IERC20(targetTokenAddress);
        pqcVerifyPrecompile = IQorePqcVerify(pqcVerifyAddress);
        pqcKeyStatusPrecompile = IQorePqcKeyStatus(pqcKeyStatusAddress);

        perTxCap = perTxCap_;
        dailyCap = dailyCap_;
        minIntervalSec = minIntervalSec_;
        breakerThresholdBps = breakerThresholdBps_;
        breakerWindowSec = breakerWindowSec_;
    }

    // --------------------------------------------------------------- funding

    /// @notice Fund the vault with the spend token. Anyone may deposit —
    ///         deposits only ever ADD to the owner's position, and only the
    ///         owner (with a PQ signature) can ever take funds out.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        spendToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    // ------------------------------------------------------------ agent lane

    /// @notice The agent's ONLY capability. Buys the target token with
    ///         `amountIn` of the spend token on the single allowlisted AMM,
    ///         if and only if every guard rule passes. All value stays in
    ///         the vault: spend token goes to the AMM, target token comes
    ///         back here. There is no path from this function to any other
    ///         address.
    function executeDca(uint256 amountIn) external nonReentrant returns (uint256 amountOut) {
        if (msg.sender != agent) revert NotAgent();
        if (killed) revert AgentIsKilled();
        if (amountIn == 0) revert InvalidAmount();
        if (amountIn > perTxCap) revert PerTxCapExceeded(amountIn, perTxCap);

        uint256 bucket = block.timestamp / 86400; // explicit UTC day bucket
        uint256 spent = bucket == spentDayBucket ? spentInDay : 0;
        if (spent + amountIn > dailyCap) {
            revert DailyCapExceeded(spent + amountIn, dailyCap);
        }

        if (
            lastExecutionAt != 0 &&
            block.timestamp < lastExecutionAt + minIntervalSec
        ) {
            revert TooSoon(lastExecutionAt + minIntervalSec);
        }

        uint256 price = amm.spotPrice();
        if (price == 0) revert InvalidPrice();
        _enforceBreaker(price);

        if (spendToken.balanceOf(address(this)) < amountIn) {
            revert InsufficientVaultBalance();
        }

        // Effects before interaction.
        spentDayBucket = bucket;
        spentInDay = spent + amountIn;
        lastExecutionAt = block.timestamp;
        lastPrice = price;
        executionCount += 1;
        totalSpent += amountIn;

        spendToken.forceApprove(address(amm), amountIn);
        amountOut = amm.swapExactIn(amountIn);
        if (amountOut == 0) revert InvalidPrice();
        totalAcquired += amountOut;

        emit DcaExecuted(msg.sender, amountIn, amountOut, price, spentInDay, bucket);
    }

    /// @dev Circuit-breaker. The anchor is the first price observed in the
    ///      current window. While the window is live, a move of more than
    ///      breakerThresholdBps from the anchor reverts the execution. Once
    ///      the window has elapsed, the anchor rotates to the current price:
    ///      slow drift is legitimate market movement, a violent move INSIDE
    ///      one window is the attack/manipulation scenario we refuse.
    function _enforceBreaker(uint256 price) internal {
        if (anchorPrice == 0 || block.timestamp >= anchorTimestamp + breakerWindowSec) {
            anchorPrice = price;
            anchorTimestamp = block.timestamp;
            emit BreakerAnchorUpdated(price, block.timestamp);
            return;
        }
        uint256 deviationBps = price > anchorPrice
            ? ((price - anchorPrice) * BPS_DENOMINATOR) / anchorPrice
            : ((anchorPrice - price) * BPS_DENOMINATOR) / anchorPrice;
        if (deviationBps > breakerThresholdBps) {
            revert CircuitBreakerTripped(deviationBps, breakerThresholdBps);
        }
    }

    /// @notice Live circuit-breaker status for dashboards: the current
    ///         deviation from the anchor, and whether an execution right now
    ///         would be rejected by the breaker alone.
    function breakerStatus()
        external
        view
        returns (bool tripped, uint256 deviationBps, uint256 currentPrice)
    {
        currentPrice = amm.spotPrice();
        if (anchorPrice == 0 || currentPrice == 0) return (false, 0, currentPrice);
        if (block.timestamp >= anchorTimestamp + breakerWindowSec) {
            return (false, 0, currentPrice); // anchor would rotate on next execution
        }
        deviationBps = currentPrice > anchorPrice
            ? ((currentPrice - anchorPrice) * BPS_DENOMINATOR) / anchorPrice
            : ((anchorPrice - currentPrice) * BPS_DENOMINATOR) / anchorPrice;
        tripped = deviationBps > breakerThresholdBps;
    }

    // ------------------------------------------------------- owner PQ actions

    /// @notice THE kill-switch. Owner only, and only with a fresh ML-DSA-87
    ///         signature (see _verifyPqc). Permanent and one-way: there is
    ///         deliberately no un-kill function — a compromised or misbehaving
    ///         agent generation must never come back; deploy a new vault /
    ///         rotate to a new agent key under a new mandate instead.
    function killSwitch(
        bytes calldata pubkey,
        bytes calldata signature,
        uint256 deadline
    ) external {
        if (msg.sender != owner) revert NotOwner();
        if (killed) revert AgentAlreadyKilled();
        _verifyPqc(msg.sender, "KILL_SWITCH", 0, deadline, pubkey, signature);
        killed = true;
        pqcNonce += 1;
        emit AgentKilled(msg.sender, pqcNonce - 1);
    }

    /// @notice Rotate the agent key. Owner + PQ signature binding the NEW
    ///         agent address, so a captured rotation signature cannot be
    ///         replayed to install a different key.
    function setAgent(
        address newAgent,
        bytes calldata pubkey,
        bytes calldata signature,
        uint256 deadline
    ) external {
        if (msg.sender != owner) revert NotOwner();
        if (newAgent == address(0)) revert InvalidConfig();
        _verifyPqc(
            msg.sender,
            "SET_AGENT",
            uint256(uint160(newAgent)),
            deadline,
            pubkey,
            signature
        );
        address previous = agent;
        agent = newAgent;
        pqcNonce += 1;
        emit AgentRotated(previous, newAgent);
    }

    /// @notice Withdraw vault funds to the owner. Owner + PQ signature
    ///         binding BOTH the token and the amount (extra = hash of the
    ///         pair), so a captured withdrawal signature authorises exactly
    ///         one payout of exactly one size. The agent can never call this:
    ///         msg.sender must be the owner, and the signature must come
    ///         from the owner's registered ML-DSA key.
    function withdraw(
        address token,
        uint256 amount,
        bytes calldata pubkey,
        bytes calldata signature,
        uint256 deadline
    ) external nonReentrant {
        if (msg.sender != owner) revert NotOwner();
        if (token != address(spendToken) && token != address(targetToken)) {
            revert InvalidConfig();
        }
        if (amount == 0) revert InvalidAmount();
        uint256 extra = uint256(keccak256(abi.encodePacked(token, amount)));
        _verifyPqc(msg.sender, "WITHDRAW", extra, deadline, pubkey, signature);
        if (IERC20(token).balanceOf(address(this)) < amount) {
            revert InsufficientVaultBalance();
        }
        pqcNonce += 1;
        IERC20(token).safeTransfer(owner, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    // ------------------------------------------------------------- PQC gate

    /// @notice The domain-bound message every owner PQ action must sign:
    ///         keccak256(abi.encode(vaultContract, action, extra, nonce,
    ///         deadline)). Public so wallets / the QoreChain SDK can
    ///         reproduce it byte-for-byte off chain before signing.
    /// @param action "KILL_SWITCH", "SET_AGENT" or "WITHDRAW".
    /// @param extra  Action parameter bound into the signature: new agent
    ///        address (as uint160) for SET_AGENT,
    ///        uint256(keccak256(abi.encodePacked(token, amount))) for
    ///        WITHDRAW, 0 for KILL_SWITCH.
    function actionMessage(
        string memory action,
        uint256 extra,
        uint256 nonce,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(address(this), action, extra, nonce, deadline)
            );
    }

    /// @dev Full PQ authorisation for `account` (= msg.sender at call sites):
    ///      deadline live, key registered AND possession-proven AND ML-DSA-87,
    ///      presented pubkey == registered pubkey, signature valid over the
    ///      domain-bound message carrying the CURRENT pqcNonce — every
    ///      executed action increments the nonce, so signatures are
    ///      single-use by construction.
    function _verifyPqc(
        address account,
        string memory action,
        uint256 extra,
        uint256 deadline,
        bytes calldata pubkey,
        bytes calldata signature
    ) internal view {
        if (block.timestamp > deadline) revert SignatureExpired();

        (
            bool registered,
            uint8 algorithmId,
            bytes memory onchainPubkey,
            bool possessionProven
        ) = pqcKeyStatusPrecompile.pqcKeyStatus(account);

        if (!registered) revert PqcKeyNotRegistered();
        if (!possessionProven) revert PqcPossessionNotProven();
        if (algorithmId != MLDSA87_ALGORITHM_ID) revert PqcWrongAlgorithm();
        if (keccak256(pubkey) != keccak256(onchainPubkey)) {
            revert PqcPubkeyMismatch();
        }

        bytes32 messageHash = actionMessage(action, extra, pqcNonce, deadline);
        // pqcVerify argument order: (pubkey, signature, message).
        bool ok = pqcVerifyPrecompile.pqcVerify(
            pubkey,
            signature,
            abi.encodePacked(messageHash)
        );
        if (!ok) revert PqcBadSignature();
    }

    // ----------------------------------------------------------------- views

    /// @notice Effective amount spent in the CURRENT UTC day bucket.
    function spentToday() external view returns (uint256) {
        return block.timestamp / 86400 == spentDayBucket ? spentInDay : 0;
    }

    /// @notice One-call dashboard snapshot.
    function getState()
        external
        view
        returns (
            address ownerAddress,
            address agentAddress,
            bool isKilled,
            uint256 spentTodayAmount,
            uint256 lastExecution,
            uint256 executions,
            uint256 spentTotal,
            uint256 acquiredTotal,
            uint256 anchor,
            uint256 anchorAt,
            uint256 lastSeenPrice,
            uint256 spendBalance,
            uint256 targetBalance,
            uint256 nonce
        )
    {
        return (
            owner,
            agent,
            killed,
            block.timestamp / 86400 == spentDayBucket ? spentInDay : 0,
            lastExecutionAt,
            executionCount,
            totalSpent,
            totalAcquired,
            anchorPrice,
            anchorTimestamp,
            lastPrice,
            spendToken.balanceOf(address(this)),
            targetToken.balanceOf(address(this)),
            pqcNonce
        );
    }
}
