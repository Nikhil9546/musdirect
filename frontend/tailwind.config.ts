import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mezo orange + dark base — closest brand-adjacent palette.
        mezo: {
          orange: "#FF7100",
          ink: "#0E0E0E",
          surface: "#161616",
          edge: "#262626",
          mute: "#7A7A7A",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
