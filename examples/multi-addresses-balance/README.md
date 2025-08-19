# Multi-Address Balance Model

Efficiently tracks Bitcoin balances for a predefined set of addresses using EasyLayer framework.

## 🎯 Purpose

This aggregate tracks:
- 💰 **Total portfolio balance** across multiple Bitcoin addresses
- 📊 **Individual address balances** with transaction statistics
- 🔍 **UTXO tracking** for unspent transaction outputs
- ⚡ **Real-time balance updates** as blocks are processed

## 🔄 Algorithm Flow

```mermaid
graph TD
    A[New Block] --> B[Parse Transactions]
    
    B --> C[Extract Outputs]
    C --> D{Output belongs to<br/>tracked address?}
    D -->|YES| E[Add to Balance<br/>Store UTXO]
    D -->|NO| F[🤷 IGNORE]
    
    B --> G[Extract Inputs]
    G --> H{Input spends<br/>tracked UTXO?}
    H -->|YES| I[Subtract from Balance<br/>Remove UTXO]
    H -->|NO| J[🤷 IGNORE]
    
    E --> K[Update Running Total]
    I --> K
    K --> L[Portfolio Balance Updated]
    
    subgraph "Address Extraction (Performance Critical)"
        M[Step 1: Direct address check O(1)]
        N[Step 2: Script lookup O(1)]
        O[Step 3: Parse script O(complex)]
        M --> N --> O
    end
    
    subgraph "Memory Management"
        P[Bounded by address set]
        Q[UTXOs auto-removed when spent]
        R[Script optimization reduces parsing]
    end
```

## 📊 Step-by-Step Processing

### 1. **Address Detection (Optimized)**
```typescript
// Fast 3-step address extraction:
// Step 1: Direct address in scriptPubKey (99% of cases)
if (vout.scriptPubKey?.addresses?.[0] && this.addressBalances.has(address)) {
  return address; // O(1) - fastest path
}

// Step 2: Pre-built script lookup 
const address = this.scriptToAddress.get(scriptHex);
if (address) return address; // O(1) - fast path

// Step 3: Expensive parsing (rare fallback)
const scriptHash = ScriptUtilService.getScriptHashFromScriptPubKey(...);
```

### 2. **Balance Updates (O(1) Running Total)**
```typescript
// Add new output
addressBalance.balance = (currentBalance + valueAmount).toString();
this.totalBalance = (currentTotal + valueAmount).toString(); // Running total!

// Subtract spent input
addressBalance.balance = (currentBalance - subtraction).toString();
this.totalBalance = (currentTotal - subtraction).toString(); // Running total!
```

### 3. **UTXO Management**
```typescript
// Store significant UTXOs (>= 0.001 BTC)
if (this.isSignificantUtxo(output.value)) {
  this.utxoLookup.set(`${txid}_${vout}`, { address, value });
}

// Remove when spent (automatic memory cleanup)
this.utxoLookup.delete(utxoKey);
```

## 🎯 Portfolio Configuration

Configure your tracked addresses by editing `PORTFOLIO_CONFIG`:

```typescript
private readonly PORTFOLIO_CONFIG: Record<string, string[]> = {
  // With pre-defined scripts (faster processing)
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa": ["76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac"],
  "bc1qm34lsc65zpw79lxes69zkqmk6luv9mwsqstqlh": ["0014c4c5abd64c99d2a40031eda16a79c93b92e7d7f6"],
  
  // Without scripts (fallback parsing - slower)
  "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX": [],
  
  // Add your addresses here...
  "your-bitcoin-address": ["script1", "script2"] // or [] for fallback
};
```

## 💾 Memory Usage Analysis

### **Bounded Memory Growth**
- **Address balances**: ~120 bytes × N addresses (fixed by config)
- **UTXO lookup**: ~100 bytes × M UTXOs (bounded by spending patterns)
- **Script mappings**: ~50 bytes × S scripts (fixed by config)

### **Memory Characteristics**

| Component | Memory Pattern | Size Estimate | Bound Factor |
|-----------|----------------|---------------|--------------|
| **Address Balances** | Fixed | ~120 bytes × addresses | Config size |
| **UTXO Storage** | Dynamic | ~100 bytes × UTXOs | Spending rate |
| **Script Lookup** | Fixed | ~50 bytes × scripts | Config size |
| **Running Total** | Constant | 8 bytes | Always constant |

### **Example Memory Usage**
```typescript
// For 1000 tracked addresses:
// - Address balances: 1000 × 120 = ~120KB
// - Script mappings: 2000 × 50 = ~100KB  
// - UTXOs: 5000 × 100 = ~500KB (varies by activity)
// - Total: ~720KB (reasonable and bounded)
```

## 🚀 Performance Characteristics

### **Time Complexity**
- **Block parsing**: O(T × O) where T=transactions, O=outputs
- **Address extraction**: O(1) best case (99%), O(complex) worst case (1%)
- **Balance updates**: O(1) with running total maintenance
- **UTXO operations**: O(1) lookup and storage
- **Sorting queries**: O(N log N) for address/UTXO lists

### **Critical Optimizations**
1. **Script pre-mapping**: Avoids expensive script parsing for known addresses
2. **Running total**: No O(N) recalculation on every balance change
3. **Direct address lookup**: Fast path for standard transaction formats
4. **Automatic UTXO cleanup**: Memory freed when UTXOs are spent

### **Performance Bottlenecks (Rare)**
- **Script parsing fallback**: Only for addresses without pre-defined scripts
- **Large UTXO sets**: If addresses accumulate many unspent outputs
- **Sorting operations**: When requesting sorted address/UTXO lists

## 🎯 Query Interface

### **Available Queries**
```typescript
// Basic portfolio information
const balance = model.getTotalBalance();           // "5000000000" (50 BTC)
const balanceBTC = model.getTotalBalanceBTC();     // 50.0
const stats = model.getPortfolioStats();          // Full statistics

// Address-level details
const addresses = model.getAllAddressBalances();   // Sorted by balance
const address = model.getAddressBalance(addr);     // Specific address

// UTXO information
const allUtxos = model.getAllUtxos();             // All UTXOs sorted by value
const addrUtxos = model.getUtxosForAddress(addr); // UTXOs for specific address

// Configuration
const config = model.getConfiguration();          // Tracked addresses and settings
```

### **Query Handler Usage**
```typescript
// Get basic portfolio data
const query = new GetPortfolioBalanceQuery({
  includeAddressBreakdown: false,
  includeUtxos: false
});

// Get detailed portfolio data
const detailedQuery = new GetPortfolioBalanceQuery({
  includeAddressBreakdown: true,  // Include per-address balances
  includeUtxos: true             // Include UTXO details
});

const result = await queryHandler.execute(query);
// Returns: { totalBalance, totalBalanceBTC, portfolioStats, configuration }
```

## 🎯 Use Cases & Applications

### **Portfolio Management**
- **Whale tracking**: Monitor large Bitcoin holders across multiple addresses
- **Corporate treasury**: Track company Bitcoin holdings across cold/hot wallets
- **Personal portfolio**: Monitor your own Bitcoin addresses in one place

### **Analytics & Reporting**
- **Balance distribution**: Analyze concentration risk across addresses
- **Activity monitoring**: Track transaction frequency and patterns
- **UTXO management**: Monitor unspent output consolidation opportunities

### **Integration Examples**
```typescript
// Dashboard integration
const portfolioData = await queryHandler.execute(
  new GetPortfolioBalanceQuery({ includeAddressBreakdown: true })
);

// Risk analysis
const stats = model.getPortfolioStats();
if (stats.diversificationScore < 0.3) {
  console.warn("High concentration risk - consider diversifying");
}

// Large UTXO monitoring
const largeUtxos = model.getAllUtxos().filter(utxo => 
  BigInt(utxo.value) > BigInt("100000000") // > 1 BTC
);
```

## 🚨 Limitations & Considerations

### **Known Limitations**
1. **Fixed address set**: Only tracks pre-configured addresses
2. **Script dependency**: Unknown script types may not be recognized
3. **UTXO threshold**: Small UTXOs below threshold are not stored
4. **No historical data**: Only tracks current state, not full history

### **Best Practices**
1. **Include scripts**: Pre-define scripts for faster processing
2. **Monitor memory**: Check UTXO accumulation for very active addresses  
3. **Regular updates**: Keep tracked address list current
4. **Threshold tuning**: Adjust `minimumUtxoValue` based on needs

### **Configuration Tuning**
```typescript
// Adjust minimum UTXO storage threshold
private minimumUtxoValue: string = "100000"; // 0.001 BTC

// Key factors to consider:
// - Lower threshold = more UTXOs stored = more memory usage
// - Higher threshold = less detail but better performance
// - Typical range: 0.0001 - 0.01 BTC depending on use case
```