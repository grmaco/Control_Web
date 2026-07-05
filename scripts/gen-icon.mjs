import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dir, '..', 'public')
const svg = readFileSync(join(publicDir, 'icon-source.svg'))

const icons = [
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
]

for (const { size, file } of icons) {
  await sharp(svg).resize(size, size).png().toFile(join(publicDir, file))
  console.log(`✓ ${file} (${size}×${size})`)
}
