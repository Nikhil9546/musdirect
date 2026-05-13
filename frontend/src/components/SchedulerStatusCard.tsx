"use client";

import { ENV } from "@/lib/env";
import { fmtAddress } from "@/lib/format";

export function SchedulerStatusCard() {
  const deployed = ENV.scheduler !== null;

  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="text-lg font-extrabold text-mezo-ink">Scheduler</h2>
        <p className="text-xs font-semibold text-mezo-mute">
          The MUSDirectDebit contract is what holds your schedule and runs the
          CR gate on every execution.
        </p>
      </div>

      {!deployed && (
        <div className="rounded-xl border-2 border-mezo-orange/30 bg-orange-50 p-4 text-sm">
          <p className="font-bold text-mezo-orange">
            MUSDirectDebit not deployed.
          </p>
          <p className="mt-2 text-mezo-mute">
            Run{" "}
            <code className="code-inline">
              keeper/scripts/deploy-and-tick.sh
            </code>{" "}
            to deploy to Mezo testnet, then set{" "}
            <code className="code-inline">
              NEXT_PUBLIC_SCHEDULER_ADDRESS
            </code>{" "}
            in your <code className="code-inline">.env.local</code>.
          </p>
        </div>
      )}

      {deployed && (
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="font-semibold text-mezo-mute">Address</dt>
          <dd className="text-right">
            <a
              href={`${ENV.explorerUrl}/address/${ENV.scheduler}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-bold text-mezo-orange underline decoration-mezo-orange/30 hover:decoration-mezo-orange"
            >
              {fmtAddress(ENV.scheduler)}
            </a>
          </dd>
          <dt className="font-semibold text-mezo-mute">Your schedules</dt>
          <dd className="text-right font-mono text-mezo-mute">
            (fetch coming next session)
          </dd>
        </dl>
      )}
    </div>
  );
}
