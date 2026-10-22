/** Tailwind preset generated from the same values as src/index.ts. */
const p = {
  navy: { DEFAULT: '#101F35', 800: '#1B2E4A', 700: '#2A4163' },
  teal: { DEFAULT: '#12B8A6', strong: '#0B7A6E', soft: '#E3F7F4' },
  background: '#F7F9FC',
  slate: { DEFAULT: '#66758C', strong: '#55637A' },
  line: { DEFAULT: '#E3E8F0', strong: '#C9D2DF' },
  positive: { DEFAULT: '#16A36A', strong: '#0F7A4F', soft: '#E5F6EE' },
  warning: { DEFAULT: '#E6A23C', strong: '#8A5A00', soft: '#FDF3E3' },
  danger: { DEFAULT: '#DC4C57', strong: '#B3303B', soft: '#FCEBEC' },
  demo: { DEFAULT: '#8A5A00', soft: '#FFF4E0' },
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: p,
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },
      boxShadow: { card: '0 1px 2px rgba(16,31,53,0.06), 0 4px 16px rgba(16,31,53,0.06)', raised: '0 8px 32px rgba(16,31,53,0.12)' },
      minHeight: { touch: '44px' },
    },
  },
};
