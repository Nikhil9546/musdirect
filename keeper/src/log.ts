type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class Logger {
  constructor(private readonly threshold: Level) {}

  private emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
    if (ORDER[level] < ORDER[this.threshold]) return;
    const ts = new Date().toISOString();
    const parts = [`[${ts}]`, `[${level}]`, msg];
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        parts.push(`${k}=${typeof v === "bigint" ? v.toString() : JSON.stringify(v)}`);
      }
    }
    const line = parts.join(" ");
    if (level === "error") console.error(line);
    else console.log(line);
  }

  debug(msg: string, fields?: Record<string, unknown>): void {
    this.emit("debug", msg, fields);
  }
  info(msg: string, fields?: Record<string, unknown>): void {
    this.emit("info", msg, fields);
  }
  warn(msg: string, fields?: Record<string, unknown>): void {
    this.emit("warn", msg, fields);
  }
  error(msg: string, fields?: Record<string, unknown>): void {
    this.emit("error", msg, fields);
  }
}
