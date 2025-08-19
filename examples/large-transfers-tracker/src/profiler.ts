const now = () => process.hrtime.bigint();
const nsToMs = (ns: bigint) => Number(ns) / 1e6;

const P = {
  batchSize: 10_000,
  blocks: 0,
  vinNs: 0n,
  voutNs: 0n,
  scriptNs: 0n,
  applyNs: 0n,
  lastTag: '',
  anyAdditionalLogic: 0n,
  setBatchSize(n: number) { this.batchSize = Math.max(1, n | 0); },
  mark(tag: string) { this.lastTag = tag; },
  add(vin: bigint, vout: bigint, script: bigint, anyAdditionalLogic: bigint, apply: bigint) {
    this.blocks++;
    this.vinNs += vin;
    this.voutNs += vout;
    this.scriptNs += script;
    this.applyNs += apply;
    this.anyAdditionalLogic += anyAdditionalLogic;
    if (this.blocks >= this.batchSize) this.flush(this.lastTag || 'batch');
  },
  flush(tag: string) {
  if (this.blocks === 0) return;
  const vin = nsToMs(this.vinNs).toFixed(3);
  const vout = nsToMs(this.voutNs).toFixed(3);
  const script = nsToMs(this.scriptNs).toFixed(3);
  const apply = nsToMs(this.applyNs).toFixed(3);
  const anyAdditionalLogic = nsToMs(this.anyAdditionalLogic).toFixed(3);

  console.log(
    `- model tag=${tag} blocks=${this.blocks} batchSize=${this.batchSize} ` +
    `vin=${vin}ms vout=${vout}ms (script=${script}ms) anyAdditionalLogic=${anyAdditionalLogic}ms apply=${apply}ms`
  );

  this.blocks = 0;
  this.vinNs = 0n;
  this.voutNs = 0n;
  this.scriptNs = 0n;
  this.applyNs = 0n;
  this.lastTag = '';
  this.anyAdditionalLogic = 0n;
  },
  now, nsToMs,
};

export default P;
