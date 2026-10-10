/** The theme is marnis-app's (Radix dark violet), copied as a preset so the two apps look alike. */
module.exports = {
  presets: [require('./tailwind.preset.cjs')],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{vue,ts}'],
  plugins: [],
}
