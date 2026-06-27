import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.apogames.murdoku',
  appName: 'Murdoku',
  // Vite-Build-Output. Nach jedem `npm run build` mit `npx cap sync android`
  // in das native Projekt kopieren.
  webDir: 'dist',
}

export default config
