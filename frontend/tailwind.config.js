/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#1a2744',
        surface: '#1e3060',
        card:    '#243570',
        border:  '#2e4a7a',
        accent:  '#00e5a0',   // verde — caminho ativo
        accent2: '#1a56ff',   // azul OpenX
        accent3: '#f85149',   // vermelho — falha
        warn:    '#f4c430',   // amarelo — backup
        muted:   '#7090b8',
      },
      fontFamily: {
        mono: ['Space Mono', 'monospace'],
        sans: ['Syne', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
