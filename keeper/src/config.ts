import type { Address, Hex } from "viem";

export interface KeeperConfig {
  rpcUrl: string;
  chainId: number;
  schedulerAddress: Address;
  keeperPrivateKey: Hex;
  cronSchedule: string;
  startBlock: bigint;
  maxPerTick: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

const LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHex32(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function loadConfig(): KeeperConfig {
  const schedulerAddress = required("SCHEDULER_ADDRESS");
  if (!isAddress(schedulerAddress)) {
    throw new Error(`SCHEDULER_ADDRESS is not a valid 20-byte hex address: ${schedulerAddress}`);
  }

  const keeperPrivateKey = required("KEEPER_PRIVATE_KEY");
  if (!isHex32(keeperPrivateKey)) {
    throw new Error(`KEEPER_PRIVATE_KEY must be a 32-byte hex string`);
  }

  const logLevel = optional("LOG_LEVEL", "info");
  if (!LOG_LEVELS.has(logLevel)) {
    throw new Error(`invalid LOG_LEVEL: ${logLevel}`);
  }

  return {
    rpcUrl: required("RPC_URL"),
    chainId: Number.parseInt(required("CHAIN_ID"), 10),
    schedulerAddress,
    keeperPrivateKey,
    cronSchedule: optional("CRON_SCHEDULE", "*/1 * * * *"),
    startBlock: BigInt(optional("START_BLOCK", "0")),
    maxPerTick: Number.parseInt(optional("MAX_PER_TICK", "50"), 10),
    logLevel: logLevel as KeeperConfig["logLevel"],
  };
}
