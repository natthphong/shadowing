import { execSync } from 'child_process'
import os from 'os'

const HOMEBREW_BIN = process.arch === 'arm64' ? '/opt/homebrew/bin' : '/usr/local/bin'
const USR_LOCAL_BIN = '/usr/local/bin'

// Stable PATH for spawned child processes — includes Homebrew regardless of app-launch PATH
export const CHILD_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  PATH: [
    HOMEBREW_BIN,
    USR_LOCAL_BIN,
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    process.env.PATH || ''
  ].join(':'),
  HOME: process.env.HOME || os.homedir()
}

export const FFMPEG_PATH = `${HOMEBREW_BIN}/ffmpeg`
export const FFPROBE_PATH = `${HOMEBREW_BIN}/ffprobe`
export const YTDLP_PATH = `${HOMEBREW_BIN}/yt-dlp`
export const PYTHON3_PATH = `${HOMEBREW_BIN}/python3`
