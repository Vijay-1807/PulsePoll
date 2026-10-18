/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm paper base (matches the Pipo gradient's own #FAF9EF)
        paper: {
          50: '#FCFBF4',
          100: '#FAF9EF',
          200: '#F1EDDE',
          300: '#E4DECB',
          400: '#D5CCB2',
        },
        // Warm near-black ink ramp for type
        ink: {
          100: '#EDEAE3',
          200: '#D8D3C6',
          300: '#B5AE9C',
          400: '#948B76',
          500: '#6E6553',
          600: '#554D3F',
          700: '#3D372C',
          800: '#2E2921',
          900: '#221E18',
          950: '#191612',
        },
        // Primary: terracotta clay
        clay: {
          50: '#FBF1E9',
          100: '#F6E2D1',
          200: '#EDC4A5',
          300: '#E6B093',
          400: '#D68F60',
          500: '#C6713C',
          600: '#A85B2B',
          700: '#8A4B24',
          800: '#6E3C1F',
          900: '#4C2A17',
        },
        // Accent: cornflower blue
        cornflower: {
          50: '#EFF5FF',
          100: '#DFEAFF',
          200: '#C2D8FF',
          300: '#A3CEFF',
          400: '#6FA8F5',
          500: '#3D82E8',
          600: '#2B66C4',
          700: '#22519E',
        },
        // Success / live
        moss: {
          50: '#EFF5EC',
          100: '#DFEBD8',
          200: '#C5D9BC',
          300: '#A9C69C',
          500: '#5F8F4E',
          600: '#4A753C',
          700: '#3A5D30',
          800: '#2E4A26',
        },
        // Attention / timers
        gold: {
          50: '#FBF5E6',
          100: '#F5E9CB',
          200: '#EAD6A2',
          300: '#DDBE72',
          500: '#C9982F',
          600: '#A87D24',
          700: '#83601C',
        },
        // Danger
        brick: {
          50: '#FAEEEB',
          100: '#F3DAD4',
          200: '#E8BCB1',
          300: '#DC9C8C',
          500: '#C4503C',
          600: '#A53E2D',
          700: '#83301F',
        },
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['"Fraunces Variable"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono Variable"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(61, 55, 44, 0.05), 0 12px 32px -16px rgba(61, 55, 44, 0.22)',
        lift: '0 2px 4px rgba(61, 55, 44, 0.06), 0 20px 44px -20px rgba(61, 55, 44, 0.32)',
      },
      animation: {
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fadeIn 0.35s ease-out both',
        'bar-slide': 'barSlide 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        pop: 'pop 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        barSlide: {
          from: { width: '0%' },
        },
        pop: {
          '0%': { transform: 'scale(0.82)', opacity: '0.25' },
          '60%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
