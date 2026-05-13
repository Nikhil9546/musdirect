import Image from "next/image";

export function WalrusMascot({ className }: { className?: string }) {
  return (
    <Image
      src="/walrus.png"
      alt="MUSDirect walrus mascot"
      width={400}
      height={400}
      priority
      className={className}
    />
  );
}
