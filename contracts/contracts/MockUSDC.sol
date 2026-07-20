// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ============================================================================
 *  MOCK USDC — uniquement pour les tests
 * ============================================================================
 *
 *  Sur Arc testnet, utilise de préférence le VRAI USDC de test de Circle
 *  (via le faucet officiel : https://faucet.circle.com).
 *
 *  Ce contrat est un plan B : si tu n'arrives pas à obtenir du USDC de
 *  test, tu peux déployer ce mock et te "minter" autant de tokens que tu
 *  veux avec la fonction faucet().
 *
 *  Comme le vrai USDC, il utilise 6 décimales (1 USDC = 1_000_000 unités).
 * ============================================================================
 */

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    /// USDC utilise 6 décimales (et non 18 comme la plupart des ERC-20).
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// N'importe qui peut se minter 1 000 USDC de test par appel.
    function faucet() external {
        _mint(msg.sender, 1_000 * 10 ** 6);
    }

    /// Mint un montant arbitraire vers une adresse (tests uniquement).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
