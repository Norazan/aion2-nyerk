/**
 * The theme: Radix Colors' dark violet with a gray of the same hue, and the semantic names built on
 * them. The CSS variables for both scales are in assets/main.css.
 */
const violet = {
  1: '#0e101d',
  2: '#141528',
  3: '#1f1f4f',
  4: '#282471',
  5: '#312d81',
  6: '#3a3990',
  7: '#4645a5',
  8: '#5453c5',
  9: '#4f3cdd',
  10: '#4427cb',
  11: '#a3acff',
  12: '#dae0ff',
}

const gray = {
  1: '#0f101a',
  2: '#151621',
  3: '#1e1f2c',
  4: '#252735',
  5: '#2d2f3e',
  6: '#373948',
  7: '#474959',
  8: '#606272',
  9: '#6b6d7e',
  10: '#787b8a',
  11: '#b5b7c0',
  12: '#eaebef',
}

/** Status colours: Radix red, green, amber, blue, orange — solid (step 9) and text (step 11). */
const status = {
  red: { solid: '#e5484d', text: '#ff9592' },
  green: { solid: '#30a46c', text: '#3dd68c' },
  amber: { solid: '#ffc53d', text: '#ffca16' },
  blue: { solid: '#0090ff', text: '#70b8ff' },
  orange: { solid: '#f76b15', text: '#ffa057' },
}

/** Item grades keep the game's colours; they are what players recognise. */
const grades = {
  'grade-0': '#ffffff',
  'grade-1': '#48bb78',
  'grade-2': '#4299e1',
  'grade-3': '#ecc94b',
  'grade-4': '#f56565',
  'grade-5': '#9f7aea',
  'grade-10': '#9f7aea',
  'grade-11': '#ed64a6',
  'rarity-0': '#787b8acc',
  'rarity-1': '#787b8acc',
  'rarity-2': '#48bb78',
  'rarity-3': '#4299e1',
  'rarity-4': '#ecc94b',
  'rarity-5': '#f56565',
  'rarity-6': '#9f7aea',
  'rarity-10': '#9f7aea',
  'rarity-11': '#ed64a6',
}

/** The numeric scale, used for overlays and backdrops (`bg-900/75`). */
const steps = {
  0: gray[12],
  100: gray[11],
  500: gray[6],
  600: gray[5],
  700: gray[3],
  800: gray[2],
  900: gray[1],
  1000: '#000000',
}

/** Names whose meaning is the same wherever they are used. */
const shared = {
  ...steps,
  ...grades,
  accent: violet[9],
  'accent-hover': violet[10],
  'accent-soft': violet[3],
  'accent-text': violet[11],
  danger: status.red.solid,
  red: status.red.solid,
  green: status.green.solid,
  success: status.green.solid,
  yellow: status.amber.solid,
  warning: status.orange.solid,
  orange: status.orange.solid,
  blue: status.blue.solid,
  info: status.blue.solid,
  darkest: gray[10],
  raised: gray[3],
  white: '#ffffff',
}

module.exports = {
  theme: {
    extend: {
      /*
       * Inter, declared in assets/main.css and shipped with the renderer.
       * Tailwind's preflight puts `fontFamily.sans` on `html`, so naming it
       * here is what makes it the app's face — the overlay included, since
       * that is the same renderer on a different route.
       *
       * The fallbacks matter for the first paint of a cold start and for the
       * glyphs Inter's Latin cut does not carry: Segoe UI Variable Text is
       * Windows 11's own small-text face, and the emoji families are Tailwind's
       * defaults, kept so a symbol in an item name still renders.
       */
      fontFamily: {
        sans: [
          'Inter Variable',
          'Segoe UI Variable Text',
          'Segoe UI',
          'system-ui',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'Noto Color Emoji',
        ],
      },
      colors: shared,
      backgroundColor: {
        ...shared,
        app: violet[1],
        card: violet[2],
        darker: violet[1],
        dark: '#191b33', // violet-2 lifted by violet-a2: tiles on a card
        default: gray[3],
        light: gray[4],
        lighter: gray[5],
      },
      borderColor: {
        ...shared,
        app: violet[3],
        card: violet[3],
        dark: gray[5],
        default: gray[6],
        light: gray[6],
        lighter: gray[8],
      },
      textColor: {
        ...shared,
        default: gray[12],
        dark: violet[12],
        darker: gray[11],
        darkest: gray[10],
        accent: violet[11],
        danger: status.red.text,
        red: status.red.text,
        green: status.green.text,
        success: status.green.text,
        yellow: status.amber.text,
        warning: status.orange.text,
        orange: status.orange.text,
        blue: status.blue.text,
        info: status.blue.text,
      },
      ringColor: shared,
      fill: shared,
      boxShadow: {
        // The lift a Radix card has on a dark page: a hairline plus a soft drop.
        card: '0 0 0 1px rgb(0 0 0 / 0.15), 0 8px 24px -12px rgb(0 0 0 / 0.6)',
      },
    },
  },
}
