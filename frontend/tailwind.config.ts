import type { Config } from 'tailwindcss';

/**
 * Тема ссылается на CSS custom properties из `app/globals.css`, а не
 * дублирует значения (ADR-0023). Токены живут в одном месте, Tailwind —
 * только способ их адресовать: правка палитры не требует правки конфига.
 *
 * Каналы у цветов не разложены на `<alpha-value>` намеренно — палитра
 * непрозрачная, а полупрозрачные поверхности заведены отдельными
 * токенами (`surface-*`, `border-*`), чтобы прозрачность была решением
 * дизайн-системы, а не случайным `/50` в разметке.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: { 50: 'var(--cream-50)', 100: 'var(--cream-100)' },
        sand: { 200: 'var(--sand-200)', 300: 'var(--sand-300)' },
        terracotta: { 500: 'var(--terracotta-500)', 700: 'var(--terracotta-700)' },
        ink: { 950: 'var(--ink-950)', 700: 'var(--ink-700)' },
        fog: { 500: 'var(--fog-500)' },
        violet: { 500: 'var(--violet-500)', 700: 'var(--violet-700)' },
        danger: { DEFAULT: 'var(--danger)', weak: 'var(--danger-weak)', line: 'var(--danger-line)' },
        success: { DEFAULT: 'var(--success)', weak: 'var(--success-weak)', line: 'var(--success-line)' },
        warn: { DEFAULT: 'var(--warn)', weak: 'var(--warn-weak)', line: 'var(--warn-line)' },
        overlay: 'var(--overlay)',
        focus: 'var(--focus-ring)',

        // Семантические алиасы — предпочтительны в разметке: экран
        // говорит «поверхность карточки», а не «кремовый 50».
        app: 'var(--surface-app)',
        surface: {
          DEFAULT: 'var(--surface-card)',
          raised: 'var(--surface-card-strong)',
          input: 'var(--surface-input)',
          hover: 'var(--surface-hover)',
          icon: 'var(--surface-icon)',
          sticky: 'var(--surface-sticky)',
          skeleton: 'var(--surface-skeleton)',
        },
        content: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          onAccent: 'var(--text-on-accent)',
          onPhoto: 'var(--text-on-photo)',
          onPhotoMuted: 'var(--text-on-photo-muted)',
        },
        line: {
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
          photo: 'var(--border-photo)',
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
      },
      fontSize: {
        xs: ['var(--text-xs)', { lineHeight: 'var(--leading-normal)' }],
        sm: ['var(--text-sm)', { lineHeight: 'var(--leading-normal)' }],
        base: ['var(--text-base)', { lineHeight: 'var(--leading-normal)' }],
        md: ['var(--text-md)', { lineHeight: 'var(--leading-normal)' }],
        lg: ['var(--text-lg)', { lineHeight: 'var(--leading-normal)' }],
        xl: ['var(--text-xl)', { lineHeight: 'var(--leading-tight)' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--leading-tight)' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--leading-tight)' }],
        '4xl': ['var(--text-4xl)', { lineHeight: 'var(--leading-tight)' }],
        '5xl': ['var(--text-5xl)', { lineHeight: 'var(--leading-tight)' }],
      },
      fontWeight: {
        normal: 'var(--weight-regular)',
        medium: 'var(--weight-medium)',
        semibold: 'var(--weight-semibold)',
        bold: 'var(--weight-bold)',
      },
      letterSpacing: {
        tight: 'var(--tracking-tight)',
        normal: 'var(--tracking-normal)',
        wide: 'var(--tracking-wide)',
        label: 'var(--tracking-label)',
      },
      spacing: {
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
        screen: 'var(--screen-padding)',
        sidebar: 'var(--sidebar-w)',
        header: 'var(--header-h)',
        bottomnav: 'var(--bottomnav-h)',
      },
      maxWidth: {
        content: 'var(--content-max)',
        prose: 'var(--prose-max)',
        form: 'var(--form-max)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        nav: 'var(--shadow-nav)',
      },
      backgroundImage: {
        accent: 'var(--gradient-accent)',
        'app-gradient': 'var(--gradient-app)',
        'app-shell': 'var(--gradient-app-shell)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
