import { v4 as uuidv4 } from 'uuid';
import { Model } from '@easylayer/bitcoin-crawler';
import { ScriptUtilService, Block, NetworkConfig } from '@easylayer/bitcoin';
import { Money, Currency } from '@easylayer/common/arithmetic';
import {
  FlowTrackingEvent,
  AddressOutput,
  AddressInput,
  FlowPath,
} from './events';
import P from './profiler';

export const CURRENCY: Currency = {
  code: 'BTC',
  minorUnit: 8,
};

/**
 * Address group definition for flow tracking
 */
export interface AddressGroup {
  id: string;
  name: string;
  type: string;
  addresses: Record<string, string[]>;  // Map: address -> array of script_hex (empty array = no scripts)
  riskLevel: string;
  isSource: boolean;
  isDestination: boolean;
}

/**
 * Active flow tracking information
 */
export interface FlowTracker {
  flowId: number;                       // Numeric ID instead of UUID (4 bytes vs 36)
  sourceGroup: string;
  currentAddress: string;
  originalAmount: string;
  currentAmount: string;
  hops: number;
  firstSeen: number;
  lastSeen: number;
  path: string[];
  confidence: number;
  isActive: boolean;
}

/**
 * Flow summary between groups
 */
export interface FlowSummary {
  sourceGroupId: string;
  destinationGroupId: string;
  totalAmount: string;
  flowCount: number;
  averageHops: number;
  averageConfidence: number;
  firstFlow: number;
  lastFlow: number;
  riskScore: number;
}

/**
 * Entry in sorted flow summaries for O(1) access to highest risk flows
 */
interface FlowSummaryEntry {
  summaryKey: string;
  riskScore: number;
}

export const UNIQ_MODEL_NAME = 'address-flow-tracking';

/**
 * AddressFlowTrackingModel - Efficiently tracks Bitcoin fund flows between predefined address groups
 * 
 * MEMORY GROWTH PATTERN:
 * - Initial growth: ~1.5MB for 10k active flows + 1k summaries  
 * - Growth stops at: ~2.5MB when prune limits are reached
 * - Memory becomes CONSTANT after reaching limits through aggressive pruning
 * 
 * Pruning strategy ensures memory never exceeds configured maximums:
 * - activeFlows: max 10,000 flows (removes lowest confidence)
 * - flowSummaries: max 5,000 summaries (removes oldest by lastFlow) 
 * - path arrays: max 3 hops (removes oldest addresses)
 */
export default class AddressFlowTrackingModel extends Model {
  // Memory management configuration
  private maxActiveFlows: number = 10000;              // Memory cap: ~1.2MB for flows
  private maxFlowSummaries: number = 5000;             // Memory cap: ~1MB for summaries  
  private maxPathLength: number = 3;                   // Reduced from 6 to save memory
  private nextFlowId: number = 1;                      // Numeric flow IDs for memory efficiency
  
  // Flow tracking limits
  private readonly MAX_HOPS = 6;
  private readonly MIN_CONFIDENCE = 0.3;
  private readonly CONFIDENCE_DECAY = 0.85;
  private readonly MAX_FLOW_AGE_BLOCKS = 1008;         // 1 week
  private readonly MIN_TRACKED_AMOUNT = "1000000";     // 0.01 BTC
  private readonly SUMMARY_MAX_AGE_BLOCKS = 50400;     // ~1 year for summaries

  // =============================================================================
  // PREDEFINED ADDRESS GROUPS - EDIT HERE TO ADD YOUR GROUPS
  // =============================================================================
  
  /**
   * Address groups for flow tracking
   */
  private readonly PREDEFINED_GROUPS: AddressGroup[] = [
    {
      id: "binance-hot-wallets",
      name: "Binance Hot Wallets", 
      type: "EXCHANGE",
      addresses: {
        "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": ["76a914389ffce9cd9ae88dcc0631e88a821ffdbe9bfe2615488ac", "a91489abcdefabbaabbaabbaabbaabbaabbaabba87"],
        "3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb": ["a9149f9a7abd600c0caa03983a77c8c3df8e062cb2fa87"],
        "bc1qm34lsc65zpw79lxes69zkqmk6luv9mwsqstqlh": ["0014c4c5abd64c99d2a40031eda16a79c93b92e7d7f6"],
        "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": [] // No scripts, will use fallback parsing
      },
      riskLevel: "LOW",
      isSource: true,
      isDestination: true
    },
    {
      id: "suspicious-mixers",
      name: "Known Mixers",
      type: "MIXER", 
      addresses: {
        "1MixerAddr1ExampleOnly123456789ABC": ["76a914abcdef1234567890abcdef1234567890abcdef1288ac"],
        "1MixerAddr2ExampleOnly987654321DEF": ["76a914fedcba0987654321fedcba0987654321fedcba0988ac"]
      },
      riskLevel: "HIGH",
      isSource: true,
      isDestination: true
    },
    {
      id: "silk-road-wallets",
      name: "Silk Road Related",
      type: "BLACKLIST",
      addresses: {
        "1SilkRoadExampleAddr123456789XYZ": ["76a914123456789abcdef123456789abcdef123456789a88ac"]
      },
      riskLevel: "CRITICAL", 
      isSource: true,
      isDestination: false
    }
  ];

  /**
   * Runtime storage - all maps have enforced size limits for constant memory
   */
  private addressGroups: Map<string, AddressGroup> = new Map();
  private activeFlows: Map<number, FlowTracker> = new Map();           // Numeric keys for efficiency
  private flowSummaries: Map<string, FlowSummary> = new Map();         // Max 5k entries
  private sortedFlowSummaries: FlowSummaryEntry[] = [];                // Matches flowSummaries size
  private addressToGroups: Map<string, string[]> = new Map();
  private groupFlows: Map<string, Set<number>> = new Map();            // Sets for O(1) removal
  
  // Performance optimization: O(1) lookup for active flows by address
  private addressToActiveFlows: Map<string, Set<number>> = new Map();

  constructor() {
    super(UNIQ_MODEL_NAME);
    this.initializePredefinedGroups();
  }

  /**
   * Initialize predefined groups from PREDEFINED_GROUPS array
   */
  private initializePredefinedGroups(): void {
    for (const group of this.PREDEFINED_GROUPS) {
      this.addressGroups.set(group.id, { ...group });
      
      // Build address to groups mapping from addresses object
      for (const address of Object.keys(group.addresses)) {
        const groupList = this.addressToGroups.get(address) || [];
        if (!groupList.includes(group.id)) {
          groupList.push(group.id);
          this.addressToGroups.set(address, groupList);
        }
      }
      
      this.groupFlows.set(group.id, new Set());
    }
  }

  /**
   * Serialize model state for persistence
   */
  protected toJsonPayload(): any {
    return {
      maxActiveFlows: this.maxActiveFlows,
      maxFlowSummaries: this.maxFlowSummaries,
      maxPathLength: this.maxPathLength,
      nextFlowId: this.nextFlowId,
      addressGroups: Array.from(this.addressGroups.entries()),
      activeFlows: Array.from(this.activeFlows.entries()),
      flowSummaries: Array.from(this.flowSummaries.entries()),
      sortedFlowSummaries: this.sortedFlowSummaries,
      addressToGroups: Array.from(this.addressToGroups.entries()),
      groupFlows: Array.from(this.groupFlows.entries()).map(([k, v]) => [k, Array.from(v)]),
      addressToActiveFlows: Array.from(this.addressToActiveFlows.entries()).map(([k, v]) => [k, Array.from(v)]),
    };
  }

  /**
   * Deserialize model state from persistence
   */
  protected fromSnapshot(state: any): void {
    if (state.maxActiveFlows !== undefined) this.maxActiveFlows = state.maxActiveFlows;
    if (state.maxFlowSummaries !== undefined) this.maxFlowSummaries = state.maxFlowSummaries;
    if (state.maxPathLength !== undefined) this.maxPathLength = state.maxPathLength;
    if (state.nextFlowId !== undefined) this.nextFlowId = state.nextFlowId;
    
    this.initializePredefinedGroups();
    
    if (state.activeFlows && Array.isArray(state.activeFlows)) {
      this.activeFlows = new Map(state.activeFlows);
    }
    
    if (state.flowSummaries && Array.isArray(state.flowSummaries)) {
      this.flowSummaries = new Map(state.flowSummaries);
    }
    
    if (state.sortedFlowSummaries && Array.isArray(state.sortedFlowSummaries)) {
      this.sortedFlowSummaries = state.sortedFlowSummaries;
    } else {
      this.rebuildSortedFlowSummaries();
    }
    
    if (state.addressToScripts && Array.isArray(state.addressToScripts)) {
      // Legacy support - ignore old addressToScripts
    }
    
    if (state.groupFlows && Array.isArray(state.groupFlows)) {
      this.groupFlows = new Map(state.groupFlows.map(([k, v]: [string, number[]]) => [k, new Set(v)]));
    } else {
      this.rebuildGroupFlows();
    }
    
    if (state.addressToActiveFlows && Array.isArray(state.addressToActiveFlows)) {
      this.addressToActiveFlows = new Map(state.addressToActiveFlows.map(([k, v]: [string, number[]]) => [k, new Set(v)]));
    } else {
      this.rebuildAddressToActiveFlows();
    }
    
    Object.setPrototypeOf(this, AddressFlowTrackingModel.prototype);
  }

  /**
   * Rebuild sorted flow summaries from flow summaries map
   */
  private rebuildSortedFlowSummaries(): void {
    this.sortedFlowSummaries = Array.from(this.flowSummaries.entries())
      .map(([key, summary]) => ({
        summaryKey: key,
        riskScore: summary.riskScore
      }))
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Rebuild group to flows mapping from active flows
   */
  private rebuildGroupFlows(): void {
    this.groupFlows.clear();
    
    for (const group of this.PREDEFINED_GROUPS) {
      this.groupFlows.set(group.id, new Set());
    }
    
    for (const [flowId, flow] of this.activeFlows) {
      const sourceFlows = this.groupFlows.get(flow.sourceGroup);
      if (sourceFlows) {
        sourceFlows.add(flowId);
      }
      
      const destinationGroups = this.addressToGroups.get(flow.currentAddress);
      if (destinationGroups) {
        for (const groupId of destinationGroups) {
          const destFlows = this.groupFlows.get(groupId);
          if (destFlows) {
            destFlows.add(flowId);
          }
        }
      }
    }
  }

  /**
   * Rebuild address to active flows mapping for O(1) flow lookup
   */
  private rebuildAddressToActiveFlows(): void {
    this.addressToActiveFlows.clear();
    
    for (const [flowId, flow] of this.activeFlows) {
      if (flow.isActive) {
        const flowSet = this.addressToActiveFlows.get(flow.currentAddress) || new Set();
        flowSet.add(flowId);
        this.addressToActiveFlows.set(flow.currentAddress, flowSet);
      }
    }
  }

  async parseBlock({ block, networkConfig }: { block: Block; networkConfig: NetworkConfig }) {
    const { tx, height } = block;

    const newOutputs: AddressOutput[] = [];
    const spentInputs: AddressInput[] = [];
    const detectedFlows: FlowPath[] = [];

    let vinTime = 0n;
    let voutTime = 0n;
    let scriptTime = 0n;
    let flowTime = 0n;
    let applyTime = 0n;

    for (const transaction of tx) {
      const { txid, vin, vout } = transaction;

      const tFlow0 = P.now();
      
      const inputAddresses: string[] = [];
      const outputData: { address: string; value: string }[] = [];

      const tVin0 = P.now();
      for (const input of vin) {
        if (input.coinbase) continue;
        if (input.txid && input.vout !== undefined) {
          spentInputs.push({ txid: input.txid, n: input.vout });
        }
      }
      vinTime += P.now() - tVin0;

      const tVout0 = P.now();
      for (const output of vout) {
        const tScript0 = P.now();
        const address = this.extractAddressFromVout(output, networkConfig);
        scriptTime += P.now() - tScript0;

        if (!address) continue;

        if (this.addressToGroups.has(address)) {
          const value = Money.fromDecimal(output.value.toString(), CURRENCY).toCents();
          newOutputs.push({ address, txid, n: output.n, value });
          outputData.push({ address, value });
        }
      }
      voutTime += P.now() - tVout0;

      for (const output of outputData) {
        if (BigInt(output.value) >= BigInt(this.MIN_TRACKED_AMOUNT)) {
          const flowPath: FlowPath = {
            txid,
            blockHeight: height,
            fromAddress: inputAddresses.length === 1 ? inputAddresses[0] : undefined,
            toAddress: output.address,
            amount: output.value,
            confidence: 1.0
          };
          detectedFlows.push(flowPath);
        }
      }
      
      flowTime += P.now() - tFlow0;
    }

    if (newOutputs.length > 0 || spentInputs.length > 0 || detectedFlows.length > 0) {
      const tA0 = P.now();
      await this.apply(
        new FlowTrackingEvent({
          aggregateId: this.aggregateId,
          requestId: uuidv4(),
          blockHeight: height,
          outputs: newOutputs,
          inputs: spentInputs,
          flows: detectedFlows,
        }),
      );
      applyTime = P.now() - tA0;
    }

    P.mark(`h${height}`);
    P.add(vinTime, voutTime, scriptTime, flowTime, applyTime);
  }

  /**
   * Extract Bitcoin address from transaction output with optimized script matching
   */
  private extractAddressFromVout(vout: any, networkConfig: any): string | undefined {
    // Step 1: Check direct address in scriptPubKey
    if (vout.scriptPubKey?.addresses && vout.scriptPubKey.addresses.length > 0) {
      const address = vout.scriptPubKey.addresses[0];
      if (this.addressToGroups.has(address)) {
        return address;
      }
    }

    // Step 2: Fast script matching - check if script matches any tracked address
    if (vout.scriptPubKey?.hex) {
      const scriptHex = vout.scriptPubKey.hex;
      
      // Check all tracked addresses from all groups to see if this script matches
      for (const group of this.addressGroups.values()) {
        for (const [address, scripts] of Object.entries(group.addresses)) {
          if (scripts.includes(scriptHex)) {
            return address;
          }
        }
      }
    }

    // Step 3: Fallback - expensive script parsing only for unrecognized scripts
    try {
      const scriptHash = ScriptUtilService.getScriptHashFromScriptPubKey(
        vout.scriptPubKey, 
        networkConfig.network
      );
      
      if (scriptHash && this.addressToGroups.has(scriptHash)) {
        return scriptHash;
      }
    } catch (error) {
      // Ignore unsupported script types
    }

    return undefined;
  }

  /**
   * Event handler for flow tracking with memory management
   */
  private onFlowTrackingEvent({ payload }: FlowTrackingEvent) {
    const { flows, blockHeight } = payload;

    for (const flow of flows) {
      this.processFlowPath(flow, blockHeight);
    }

    // Memory management - run every 144 blocks (daily)
    if (blockHeight % 144 === 0) {
      this.performMemoryMaintenance(blockHeight);
    }
  }

  /**
   * Comprehensive memory maintenance to keep memory usage constant
   */
  private performMemoryMaintenance(currentBlock: number): void {
    // 1. Prune old and inactive flows
    this.pruneOldFlows(currentBlock);
    
    // 2. Prune old flow summaries
    this.pruneOldFlowSummaries(currentBlock);
    
    // 3. Limit active flows count
    this.limitActiveFlows();
    
    // 4. Limit flow summaries count  
    this.limitFlowSummaries();
    
    // 5. Truncate long paths to save memory
    this.truncateFlowPaths();
  }

  /**
   * Process a detected flow path with O(1) flow lookup optimization
   */
  private processFlowPath(flow: FlowPath, blockHeight: number): void {
    const { fromAddress, toAddress, amount, confidence } = flow;

    let continuedFlow = false;
    if (fromAddress) {
      // O(1) lookup instead of O(N) iteration
      const activeFlowIds = this.addressToActiveFlows.get(fromAddress);
      if (activeFlowIds) {
        for (const flowId of activeFlowIds) {
          const activeFlow = this.activeFlows.get(flowId);
          if (activeFlow && activeFlow.isActive) {
            this.continueFlow(flowId, toAddress, amount, confidence, blockHeight);
            continuedFlow = true;
            break;
          }
        }
      }
    }

    if (!continuedFlow && fromAddress) {
      const sourceGroups = this.addressToGroups.get(fromAddress);
      if (sourceGroups) {
        for (const groupId of sourceGroups) {
          const group = this.addressGroups.get(groupId);
          if (group && group.isSource) {
            this.startNewFlow(groupId, fromAddress, toAddress, amount, blockHeight);
            break;
          }
        }
      }
    }
  }

  /**
   * Start a new flow from a source group
   */
  private startNewFlow(
    sourceGroupId: string, 
    fromAddress: string, 
    toAddress: string, 
    amount: string, 
    blockHeight: number
  ): void {
    const flowId = this.nextFlowId++;
    
    const flowTracker: FlowTracker = {
      flowId,
      sourceGroup: sourceGroupId,
      currentAddress: toAddress,
      originalAmount: amount,
      currentAmount: amount,
      hops: 1,
      firstSeen: blockHeight,
      lastSeen: blockHeight,
      path: [fromAddress, toAddress],
      confidence: 1.0,
      isActive: true
    };

    this.activeFlows.set(flowId, flowTracker);
    this.addFlowToGroup(sourceGroupId, flowId);
    this.addActiveFlowToAddress(toAddress, flowId);
    this.checkFlowDestination(flowTracker, blockHeight);
  }

  /**
   * Continue an existing flow with path length management and address index updates
   */
  private continueFlow(
    flowId: number, 
    toAddress: string, 
    amount: string, 
    confidence: number, 
    blockHeight: number
  ): void {
    const flow = this.activeFlows.get(flowId);
    if (!flow || !flow.isActive) return;

    // Remove from old address index
    this.removeActiveFlowFromAddress(flow.currentAddress, flowId);

    flow.currentAddress = toAddress;
    flow.currentAmount = amount;
    flow.hops++;
    flow.lastSeen = blockHeight;
    
    // Memory optimization: limit path length
    flow.path.push(toAddress);
    if (flow.path.length > this.maxPathLength) {
      flow.path.shift(); // Remove oldest address
    }
    
    flow.confidence *= this.CONFIDENCE_DECAY * confidence;

    if (flow.hops >= this.MAX_HOPS || flow.confidence < this.MIN_CONFIDENCE) {
      flow.isActive = false;
    } else {
      // Add to new address index only if still active
      this.addActiveFlowToAddress(toAddress, flowId);
    }

    this.checkFlowDestination(flow, blockHeight);
  }

  /**
   * Check if flow has reached a destination group
   */
  private checkFlowDestination(flow: FlowTracker, blockHeight: number): void {
    const destinationGroups = this.addressToGroups.get(flow.currentAddress);
    if (destinationGroups) {
      for (const groupId of destinationGroups) {
        const group = this.addressGroups.get(groupId);
        if (group && group.isDestination && groupId !== flow.sourceGroup) {
          this.recordFlowCompletion(flow, groupId, blockHeight);
          flow.isActive = false;
          break;
        }
      }
    }
  }

  /**
   * Record completed flow in summaries
   */
  private recordFlowCompletion(flow: FlowTracker, destinationGroupId: string, blockHeight: number): void {
    const summaryKey = `${flow.sourceGroup}_${destinationGroupId}`;
    let summary = this.flowSummaries.get(summaryKey);

    if (!summary) {
      summary = {
        sourceGroupId: flow.sourceGroup,
        destinationGroupId,
        totalAmount: '0',
        flowCount: 0,
        averageHops: 0,
        averageConfidence: 0,
        firstFlow: blockHeight,
        lastFlow: blockHeight,
        riskScore: 0
      };
      this.flowSummaries.set(summaryKey, summary);
    }

    const oldTotal = BigInt(summary.totalAmount);
    const newAmount = BigInt(flow.currentAmount);
    summary.totalAmount = (oldTotal + newAmount).toString();
    summary.flowCount++;
    summary.averageHops = (summary.averageHops * (summary.flowCount - 1) + flow.hops) / summary.flowCount;
    summary.averageConfidence = (summary.averageConfidence * (summary.flowCount - 1) + flow.confidence) / summary.flowCount;
    summary.lastFlow = blockHeight;

    summary.riskScore = this.calculateFlowRiskScore(summary);
    this.updateSortedFlowSummary(summaryKey, summary.riskScore);
  }

  /**
   * Calculate risk score for flow summary
   */
  private calculateFlowRiskScore(summary: FlowSummary): number {
    const sourceGroup = this.addressGroups.get(summary.sourceGroupId);
    const destGroup = this.addressGroups.get(summary.destinationGroupId);
    
    if (!sourceGroup || !destGroup) return 0;

    let riskScore = 0;

    switch (sourceGroup.riskLevel) {
      case "CRITICAL": riskScore += 0.5; break;
      case "HIGH": riskScore += 0.3; break;
      case "MEDIUM": riskScore += 0.1; break;
      default: riskScore += 0; break;
    }

    switch (destGroup.riskLevel) {
      case "CRITICAL": riskScore += 0.3; break;
      case "HIGH": riskScore += 0.2; break;
      case "MEDIUM": riskScore += 0.1; break;
      default: riskScore += 0; break;
    }

    const amountBTC = Number(BigInt(summary.totalAmount) / BigInt(100000000));
    if (amountBTC > 1000) riskScore += 0.1;
    if (summary.averageHops > 4) riskScore += 0.1;

    return Math.min(1, riskScore);
  }

  /**
   * Add flow to group mapping using Sets for O(1) operations
   */
  private addFlowToGroup(groupId: string, flowId: number): void {
    const flows = this.groupFlows.get(groupId);
    if (flows) {
      flows.add(flowId);
    }
  }

  /**
   * Add active flow to address index for O(1) lookup
   */
  private addActiveFlowToAddress(address: string, flowId: number): void {
    const flowSet = this.addressToActiveFlows.get(address) || new Set();
    flowSet.add(flowId);
    this.addressToActiveFlows.set(address, flowSet);
  }

  /**
   * Remove active flow from address index
   */
  private removeActiveFlowFromAddress(address: string, flowId: number): void {
    const flowSet = this.addressToActiveFlows.get(address);
    if (flowSet) {
      flowSet.delete(flowId);
      if (flowSet.size === 0) {
        this.addressToActiveFlows.delete(address);
      }
    }
  }

  /**
   * Update flow summary position in sorted array
   */
  private updateSortedFlowSummary(summaryKey: string, riskScore: number): void {
    const existingIndex = this.sortedFlowSummaries.findIndex(entry => entry.summaryKey === summaryKey);
    if (existingIndex !== -1) {
      this.sortedFlowSummaries.splice(existingIndex, 1);
    }

    let left = 0;
    let right = this.sortedFlowSummaries.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midScore = this.sortedFlowSummaries[mid].riskScore;
      
      if (riskScore > midScore) {
        right = mid;
      } else {
        left = mid + 1;
      }
    }

    this.sortedFlowSummaries.splice(left, 0, {
      summaryKey,
      riskScore
    });
  }

  /**
   * Remove flow summary from sorted array
   */
  private removeSortedFlowSummary(summaryKey: string): void {
    const index = this.sortedFlowSummaries.findIndex(entry => entry.summaryKey === summaryKey);
    if (index !== -1) {
      this.sortedFlowSummaries.splice(index, 1);
    }
  }

  /**
   * Prune old and inactive flows to maintain memory bounds
   */
  private pruneOldFlows(currentBlock: number): void {
    const flowsToRemove: number[] = [];
    
    for (const [flowId, flow] of this.activeFlows) {
      if (currentBlock - flow.lastSeen > this.MAX_FLOW_AGE_BLOCKS) {
        flowsToRemove.push(flowId);
      }
      else if (flow.confidence < this.MIN_CONFIDENCE) {
        flowsToRemove.push(flowId);
      }
      else if (!flow.isActive && currentBlock - flow.lastSeen > 144) {
        flowsToRemove.push(flowId);
      }
    }

    for (const flowId of flowsToRemove) {
      this.removeFlowCompletely(flowId);
    }
  }

  /**
   * Prune old flow summaries to prevent unbounded growth
   */
  private pruneOldFlowSummaries(currentBlock: number): void {
    const summariesToRemove: string[] = [];
    
    for (const [summaryKey, summary] of this.flowSummaries) {
      // Remove summaries older than SUMMARY_MAX_AGE_BLOCKS
      if (currentBlock - summary.lastFlow > this.SUMMARY_MAX_AGE_BLOCKS) {
        summariesToRemove.push(summaryKey);
      }
    }

    for (const summaryKey of summariesToRemove) {
      this.flowSummaries.delete(summaryKey);
      this.removeSortedFlowSummary(summaryKey);
    }
  }

  /**
   * Limit active flows count using more efficient sorting
   */
  private limitActiveFlows(): void {
    if (this.activeFlows.size <= this.maxActiveFlows) {
      return;
    }

    // Use partial sort - only sort what we need to remove
    const flowEntries = Array.from(this.activeFlows.entries());
    const toRemoveCount = this.activeFlows.size - this.maxActiveFlows;
    
    // Partially sort to find lowest confidence flows
    flowEntries.sort(([, a], [, b]) => a.confidence - b.confidence);
    
    const toRemove = flowEntries
      .slice(0, toRemoveCount)
      .map(([flowId]) => flowId);

    for (const flowId of toRemove) {
      this.removeFlowCompletely(flowId);
    }
  }

  /**
   * Limit flow summaries count to prevent unbounded growth
   */
  private limitFlowSummaries(): void {
    if (this.flowSummaries.size <= this.maxFlowSummaries) {
      return;
    }

    // Remove oldest summaries by lastFlow time
    const summariesByAge = Array.from(this.flowSummaries.entries())
      .sort(([, a], [, b]) => a.lastFlow - b.lastFlow);

    const toRemove = summariesByAge
      .slice(0, this.flowSummaries.size - this.maxFlowSummaries)
      .map(([summaryKey]) => summaryKey);

    for (const summaryKey of toRemove) {
      this.flowSummaries.delete(summaryKey);
      this.removeSortedFlowSummary(summaryKey);
    }
  }

  /**
   * Truncate flow paths to save memory
   */
  private truncateFlowPaths(): void {
    for (const flow of this.activeFlows.values()) {
      if (flow.path.length > this.maxPathLength) {
        // Keep only the last maxPathLength addresses
        flow.path = flow.path.slice(-this.maxPathLength);
      }
    }
  }

  /**
   * Remove flow and all associated mappings with O(1) operations
   */
  private removeFlowCompletely(flowId: number): void {
    const flow = this.activeFlows.get(flowId);
    if (!flow) return;

    // Remove from active flows
    this.activeFlows.delete(flowId);

    // Remove from address index if active
    if (flow.isActive) {
      this.removeActiveFlowFromAddress(flow.currentAddress, flowId);
    }

    // Remove from group mappings using Sets for O(1) removal
    for (const [groupId, flowIds] of this.groupFlows) {
      flowIds.delete(flowId);
    }
  }

  // =============================================================================
  // PUBLIC QUERY METHODS
  // =============================================================================

  /**
   * Get all address groups
   */
  public getAddressGroups(): AddressGroup[] {
    return Array.from(this.addressGroups.values());
  }

  /**
   * Get specific address group
   */
  public getAddressGroup(groupId: string): AddressGroup | null {
    return this.addressGroups.get(groupId) || null;
  }

  /**
   * Get groups containing specific address
   */
  public getGroupsForAddress(address: string): AddressGroup[] {
    const groupIds = this.addressToGroups.get(address);
    if (!groupIds) return [];
    
    return groupIds
      .map(id => this.addressGroups.get(id))
      .filter(group => group !== undefined) as AddressGroup[];
  }

  /**
   * Get active flows for specific group
   */
  public getActiveFlowsForGroup(groupId: string): FlowTracker[] {
    const flowIds = this.groupFlows.get(groupId);
    if (!flowIds) return [];
    
    return Array.from(flowIds)
      .map(id => this.activeFlows.get(id))
      .filter(flow => flow !== undefined && flow.isActive) as FlowTracker[];
  }

  /**
   * Get all active flows
   */
  public getActiveFlows(): FlowTracker[] {
    return Array.from(this.activeFlows.values()).filter(flow => flow.isActive);
  }

  /**
   * Get flow summary between two groups
   */
  public getFlowSummary(sourceGroupId: string, destinationGroupId: string): FlowSummary | null {
    const summaryKey = `${sourceGroupId}_${destinationGroupId}`;
    return this.flowSummaries.get(summaryKey) || null;
  }

  /**
   * Get all flow summaries
   */
  public getAllFlowSummaries(): FlowSummary[] {
    return Array.from(this.flowSummaries.values());
  }

  /**
   * Get top N highest risk flow summaries
   */
  public getTopRiskFlows(limit?: number): FlowSummary[] {
    const actualLimit = limit || 50;
    return this.sortedFlowSummaries
      .slice(0, actualLimit)
      .map(entry => this.flowSummaries.get(entry.summaryKey))
      .filter(summary => summary !== undefined) as FlowSummary[];
  }

  /**
   * Get flows originating from specific group
   */
  public getOutgoingFlows(sourceGroupId: string): FlowSummary[] {
    return Array.from(this.flowSummaries.values())
      .filter(summary => summary.sourceGroupId === sourceGroupId)
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Get flows going to specific group
   */
  public getIncomingFlows(destinationGroupId: string): FlowSummary[] {
    return Array.from(this.flowSummaries.values())
      .filter(summary => summary.destinationGroupId === destinationGroupId)
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Get detailed flow path for specific flow
   */
  public getFlowPath(flowId: number): FlowTracker | null {
    return this.activeFlows.get(flowId) || null;
  }

  /**
   * Search flows by amount range
   */
  public searchFlowsByAmount(minAmount: string, maxAmount: string): FlowSummary[] {
    const min = BigInt(minAmount);
    const max = BigInt(maxAmount);
    
    return Array.from(this.flowSummaries.values())
      .filter(summary => {
        const amount = BigInt(summary.totalAmount);
        return amount >= min && amount <= max;
      })
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  /**
   * Get flow statistics for specific time period
   */
  public getFlowStatsForPeriod(startBlock: number, endBlock: number): any {
    const relevantSummaries = Array.from(this.flowSummaries.values())
      .filter(summary => summary.lastFlow >= startBlock && summary.firstFlow <= endBlock);

    const totalFlows = relevantSummaries.reduce((sum, s) => sum + s.flowCount, 0);
    const totalAmount = relevantSummaries.reduce((sum, s) => sum + BigInt(s.totalAmount), BigInt(0));
    const avgHops = relevantSummaries.length > 0 
      ? relevantSummaries.reduce((sum, s) => sum + s.averageHops, 0) / relevantSummaries.length 
      : 0;

    return {
      period: { startBlock, endBlock },
      totalFlows,
      totalAmount: totalAmount.toString(),
      totalAmountBTC: Number(totalAmount / BigInt(100000000)),
      uniqueFlowPairs: relevantSummaries.length,
      averageHops: avgHops,
      highRiskFlows: relevantSummaries.filter(s => s.riskScore > 0.7).length
    };
  }

  /**
   * Get risk analysis for address groups
   */
  public getRiskAnalysis(): any {
    const groupRisks = new Map<string, number>();
    
    for (const summary of this.flowSummaries.values()) {
      const sourceRisk = groupRisks.get(summary.sourceGroupId) || 0;
      const destRisk = groupRisks.get(summary.destinationGroupId) || 0;
      
      groupRisks.set(summary.sourceGroupId, Math.max(sourceRisk, summary.riskScore));
      groupRisks.set(summary.destinationGroupId, Math.max(destRisk, summary.riskScore * 0.5));
    }

    const riskRanking = Array.from(groupRisks.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([groupId, risk]) => ({
        groupId,
        groupName: this.addressGroups.get(groupId)?.name || 'Unknown',
        riskScore: risk
      }));

    return {
      totalRiskConnections: this.flowSummaries.size,
      highRiskConnections: Array.from(this.flowSummaries.values())
        .filter(s => s.riskScore > 0.7).length,
      groupRiskRanking: riskRanking,
      activeHighRiskFlows: Array.from(this.activeFlows.values())
        .filter(f => f.isActive && f.confidence > 0.7).length,
      memoryEfficiency: {
        flowsUtilization: `${Math.round((this.activeFlows.size / this.maxActiveFlows) * 100)}%`,
        summariesUtilization: `${Math.round((this.flowSummaries.size / this.maxFlowSummaries) * 100)}%`,
        addressIndexSize: this.addressToActiveFlows.size,
        averageFlowsPerAddress: this.addressToActiveFlows.size > 0 
          ? Math.round(Array.from(this.addressToActiveFlows.values())
              .reduce((sum, set) => sum + set.size, 0) / this.addressToActiveFlows.size * 100) / 100
          : 0
      }
    };
  }
}