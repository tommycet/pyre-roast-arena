import { execSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'

const envBak = existsSync('.env') ? '.env.bak' : null
if (envBak) copyFileSync('.env', envBak)
copyFileSync('.env.bradbury', '.env')

try {
  console.log('Building bradbury variant...')
  execSync('npm run build', { stdio: 'inherit' })
} finally {
  if (envBak) copyFileSync(envBak, '.env')
  console.log('Restored studionet .env')
}
