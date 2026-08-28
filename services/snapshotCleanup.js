import fs from 'node:fs/promises'
import path from 'node:path'
import { paths } from '../core/path.js'
import { log } from '../core/logger.js'

/**
 * 清理指定目录中的文件
 */
async function cleanupDir(dir, ext) {
  try {
    await fs.access(dir)
  } catch {
    await fs.mkdir(dir, { recursive: true })
  }

  const files = await fs.readdir(dir)
  for (const file of files) {
    if (file.endsWith(ext)) {
      const filePath = path.join(dir, file)
      try {
        await fs.unlink(filePath)
        log.info(`清理文件: ${filePath}`)
      } catch (err) {
        log.error(`删除文件失败: ${filePath}`, err)
      }
    }
  }
}

/**
 * 启动快照自动清理任务
 */
export function startSnapshotCleanup() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const msToMidnight = tomorrow.getTime() - now.getTime()

  setTimeout(() => {
    cleanupDir(paths.snapshot, '.json')
    setInterval(() => {
      cleanupDir(paths.snapshot, '.json')
    }, 24 * 60 * 60 * 1000)
  }, msToMidnight)
}
