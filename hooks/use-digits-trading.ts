'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useProposal,
  useBuy,
} from '@deriv/core';
import type {
  ActiveSymbol,
  Tick,
  ProposalInfo,
  ProposalParams,
  DurationLimits,
  BuyResult,
} from '@deriv/core';
import { useBaseTrading } from '@/hooks/use-base-trading';
import type { UseBaseTradingParams } from '@/hooks/use-base-trading';
import { computeDigitStats, getLastDigit } from '../lib/digit-stats';
import type { ContractMode, TradeType, DigitStats, OpenPosition, ClosedPosition } from '../lib/types';

const CONTRACT_TYPES = ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'];

interface UseDigitsTradingReturn {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  lastDigit: number | null;
  digitStats: DigitStats;
  tradeType: TradeType;
  setTradeType: (type: TradeType) => void;
  contractMode: ContractMode;
  setContractMode: (mode: ContractMode) => void;
  selectedDigit: number;
  setSelectedDigit: (digit: number) => void;
  contractsAvailable: boolean;
  pipSize: number;
  stake: string;
  setStake: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  durationLimits: DurationLimits;
  /** Soros (compounding) toggle — reinvests the previous winning return into the next stake. */
  sorosEnabled: boolean;
  setSorosEnabled: (enabled: boolean) => void;
  /** Current Soros streak level (0 = base stake, increments on each consecutive win). */
  sorosLevel: number;
  defaultStake: number;
  proposal: ProposalInfo | null;
  isProposalLoading: boolean;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;
}

export type UseDigitsTradingParams = Pick<UseBaseTradingParams, 'ws' | 'isConnected' | 'isExhausted' | 'isAuthenticated' | 'onAuthWSFailed'>;

export function useDigitsTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed }: UseDigitsTradingParams): UseDigitsTradingReturn {
  const {
    ws: tradingWs,
    isConnected: tradingIsConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    contractsAvailable,
    durationLimits,
    defaultStake,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
  } = useBaseTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed, contractTypes: CONTRACT_TYPES });

  // Digits-specific trade state
  const [tradeType, setTradeTypeRaw] = useState<TradeType>('matches-differs');
  const [contractMode, setContractMode] = useState<ContractMode>('DIGITMATCH');
  const [selectedDigit, setSelectedDigit] = useState<number>(5);
  const [stake, setStakeRaw] = useState<string>('10');
  const [duration, setDuration] = useState<number>(5);

  // ── Soros (compounding after a win) ──────────────────────────────────────
  // After a winning contract the next stake becomes the full return of that
  // contract (stake + profit). A loss resets the stake back to the base amount.
  const [sorosEnabled, setSorosEnabledState] = useState<boolean>(false);
  const [sorosLevel, setSorosLevel] = useState<number>(0);
  // The base stake the streak resets to. Manual stake edits update it; Soros
  // adjustments do not, so a reset always returns to what the user set.
  const sorosBaseRef = useRef<number>(10);
  // Contract ids we placed, and the ones we've already applied Soros for, so a
  // repeated proposal_open_contract update doesn't double-count a settlement.
  const ourContractsRef = useRef<Set<number>>(new Set());
  const settledContractsRef = useRef<Set<number>>(new Set());

  // Public stake setter — a manual edit also becomes the Soros base.
  const setStake = useCallback((value: string) => {
    setStakeRaw(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) sorosBaseRef.current = parsed;
  }, []);

  const setSorosEnabled = useCallback(
    (enabled: boolean) => {
      setSorosEnabledState(enabled);
      setSorosLevel(0);
      if (enabled) {
        const parsed = parseFloat(stake);
        if (!isNaN(parsed) && parsed > 0) sorosBaseRef.current = parsed;
      } else {
        // Turning Soros off returns the stake to the base amount.
        setStakeRaw(sorosBaseRef.current.toFixed(2));
      }
    },
    [stake]
  );

  // Reset contract mode to the first option of the selected trade type
  const setTradeType = useCallback((type: TradeType) => {
    setTradeTypeRaw(type);
    switch (type) {
      case 'matches-differs':
        setContractMode('DIGITMATCH');
        break;
      case 'over-under':
        setContractMode('DIGITOVER');
        break;
      case 'even-odd':
        setContractMode('DIGITEVEN');
        break;
    }
  }, []);

  const digitStats: DigitStats = useMemo(
    () => computeDigitStats(prices, pipSize),
    [prices, pipSize]
  );

  const lastDigit = useMemo(() => {
    if (currentTick) {
      return getLastDigit(currentTick.quote, pipSize);
    }
    if (prices.length > 0) {
      return getLastDigit(prices[prices.length - 1], pipSize);
    }
    return null;
  }, [currentTick, prices, pipSize]);

  const {
    buyContract: buyWithProposal,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
  } = useBuy(tradingWs, tradingIsConnected);

  // Null out params while a buy is in-flight — forces useProposal to unsubscribe
  // the consumed proposal ID. When isBuying flips back to false, the memo returns
  // real params and useProposal re-subscribes to get a fresh proposal.
  const proposalParams: ProposalParams | null = useMemo(() => {
    if (isBuying || !activeSymbol) return null;
    const stakeNum = parseFloat(stake);
    if (!stakeNum || stakeNum <= 0) return null;

    const needsBarrier = contractMode !== 'DIGITEVEN' && contractMode !== 'DIGITODD';

    return {
      contractType: contractMode,
      symbol: activeSymbol.underlying_symbol,
      amount: stakeNum,
      duration,
      durationUnit: 't',
      basis: 'stake' as const,
      currency: 'USD',
      ...(needsBarrier ? { barrier: selectedDigit } : {}),
    };
  }, [activeSymbol, contractMode, stake, duration, selectedDigit, isBuying]);

  const { proposal } = useProposal(tradingWs, tradingIsConnected, proposalParams);

  const buyContract = useCallback(async () => {
    if (proposal) {
      await buyWithProposal(proposal);
    }
  }, [proposal, buyWithProposal]);

  // Remember every contract we bought so the Soros settlement effect only
  // reacts to our own positions.
  useEffect(() => {
    if (buyResult?.contractId != null) {
      ourContractsRef.current.add(buyResult.contractId);
    }
  }, [buyResult]);

  // Apply Soros when one of our contracts settles: a win reinvests the full
  // return (stake + profit) into the next stake, a loss resets to the base.
  useEffect(() => {
    if (!sorosEnabled) return;
    for (const position of openPositions) {
      const id = position.contract_id;
      if (!ourContractsRef.current.has(id)) continue;
      const isClosed =
        !!position.is_sold || !!position.is_expired || position.status !== 'open';
      if (!isClosed || settledContractsRef.current.has(id)) continue;
      settledContractsRef.current.add(id);

      const profit = parseFloat(position.profit);
      const stakeUsed = parseFloat(position.buy_price);
      if (!isNaN(profit) && profit > 0 && !isNaN(stakeUsed)) {
        // Win — next entry uses the previous return (stake + profit).
        setStakeRaw((stakeUsed + profit).toFixed(2));
        setSorosLevel((level) => level + 1);
      } else {
        // Loss — back to the base stake.
        setStakeRaw(sorosBaseRef.current.toFixed(2));
        setSorosLevel(0);
      }
    }
  }, [openPositions, sorosEnabled]);

  return {
    isConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    lastDigit,
    digitStats,
    tradeType,
    setTradeType,
    contractMode,
    setContractMode,
    selectedDigit,
    setSelectedDigit,
    contractsAvailable,
    pipSize,
    stake,
    setStake,
    duration,
    setDuration,
    durationLimits,
    defaultStake,
    sorosEnabled,
    setSorosEnabled,
    sorosLevel,
    proposal,
    isProposalLoading: isConnected && proposalParams !== null && proposal === null,
    buyContract,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
  };
}
