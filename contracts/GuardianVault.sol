// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IQorePqc.sol";

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
