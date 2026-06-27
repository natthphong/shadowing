import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.dailyspeaking.app',
  productName: 'Daily Speaking',
  directories: {
    buildResources: 'build',
    output: 'release'
  },
  files: [
    'out/**/*',
    '!out/**/*.map'
  ],
  extraResources: [
    {
      from: 'resources/',
      to: '.',
      filter: ['**/*']
    }
  ],
  mac: {
    category: 'public.app-category.education',
    icon: 'build/icon.icns',
    target: [
      {
        target: 'dmg',
        arch: ['arm64']
      }
    ],
    hardenedRuntime: false,
    gatekeeperAssess: false,
    identity: null
  },
  dmg: {
    title: 'Daily Speaking',
    icon: 'build/icon.icns',
    contents: [
      { x: 130, y: 220, type: 'file' },
      { x: 410, y: 220, type: 'link', path: '/Applications' }
    ],
    window: { width: 540, height: 380 }
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  },
  publish: null
}

export default config
