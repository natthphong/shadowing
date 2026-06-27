/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'secondary-container': '#d5e4f8',
        'error-container': '#ffdad6',
        'surface-container-lowest': '#ffffff',
        error: '#ba1a1a',
        'tertiary-container': '#00855b',
        'on-secondary-fixed': '#0e1d2b',
        'on-secondary': '#ffffff',
        'surface-dim': '#cbdbf5',
        'surface-variant': '#d3e4fe',
        'surface-container': '#e5eeff',
        'on-tertiary-container': '#f5fff6',
        'on-error': '#ffffff',
        primary: '#0058be',
        'on-primary-fixed-variant': '#004395',
        surface: '#f8f9ff',
        'inverse-primary': '#adc6ff',
        'on-surface-variant': '#424754',
        'on-tertiary-fixed-variant': '#005236',
        'on-tertiary-fixed': '#002113',
        'on-tertiary': '#ffffff',
        tertiary: '#006947',
        'on-secondary-fixed-variant': '#3a4858',
        'on-primary-fixed': '#001a42',
        outline: '#727785',
        'on-surface': '#0b1c30',
        'on-error-container': '#93000a',
        'primary-fixed': '#d8e2ff',
        'secondary-fixed': '#d5e4f8',
        'on-primary-container': '#fefcff',
        'on-primary': '#ffffff',
        secondary: '#516070',
        'outline-variant': '#c2c6d6',
        'surface-tint': '#005ac2',
        'surface-bright': '#f8f9ff',
        'inverse-surface': '#213145',
        'tertiary-fixed': '#6ffbbe',
        'surface-container-high': '#dce9ff',
        'primary-fixed-dim': '#adc6ff',
        'surface-container-highest': '#d3e4fe',
        'secondary-fixed-dim': '#b9c8db',
        'surface-container-low': '#eff4ff',
        'tertiary-fixed-dim': '#4edea3',
        'on-secondary-container': '#576676',
        'on-background': '#0b1c30',
        background: '#f8f9ff',
        'primary-container': '#2170e4',
        'inverse-on-surface': '#eaf1ff'
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px'
      },
      fontFamily: {
        'ipa-label': ['"JetBrains Mono"', 'monospace'],
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['Inter', 'sans-serif']
      },
      fontSize: {
        'ipa-label': ['13px', { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'display-lg': ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'transcript-th': ['24px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '500' }],
        'label-sm': ['12px', { lineHeight: '1', fontWeight: '600' }],
        'transcript-en': ['18px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }]
      },
      spacing: {
        gutter: '24px',
        'stack-gap': '16px',
        'sidebar-width': '260px',
        'component-padding-x': '12px',
        'component-padding-y': '8px'
      }
    }
  },
  plugins: []
}
