"use client";

import { ENV } from "@/lib/env";
import { fmtAddress } from "@/lib/format";

/// Static informational card — surfaces deployment state of MUSDirectDebit.
/// When NEXT_PUBLIC_SCHEDULER_ADDRESS is unset, prompts the user to deploy.
/// When set, will eventually show the connected user's active schedules.
export function SchedulerStatusCard() {
  const deployed = ENV.scheduler !== null;

  return (
    <div className="rounded-lg border border-mezo-edge bg-mezo-surface p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Scheduler</h2>
        <p className="text-xs text-mezo-mute">
          The MUSDirectDebit contract is what holds your schedule and runs the
          CR gate on every execution.
        </p>
      </div>

      {!deployed && (
        <div className="rounded bg-mezo-edge/40 p-4 text-sm">
          <p className="font-medium text-mezo-orange">
            MUSDirectDebit not deployed.
          </p>
          <p className="mt-2 text-mezo-mute">
            Run{" "}
            <code className="rounded bg-mezo-ink px-1.5 py-0.5 font-mono text-xs">
              keeper/scripts/deploy-and-tick.sh
            </code>{" "}
            to deploy to Mezo testnet, then set{" "}
            <code className="rounded bg-mezo-ink px-1.5 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_SCHEDULER_ADDRESS
            </code>{" "}
            in your <code className="font-mono text-xs">.env.local</code>.
          </p>
        </div>
      )}

      {deployed && (
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-mezo-mute">Address</dt>
          <dd className="text-right font-mono">{fmtAddress(ENV.scheduler)}</dd>
          <dt className="text-mezo-mute">Your schedules</dt>
          <dd className="text-right font-mono text-mezo-mute">
            (fetch coming next session)
          </dd>
        </dl>
      )}
    </div>
  );
}
