import fs from 'node:fs/promises'
import path from 'node:path'

// 路径常量
const tempDir = path.resolve(process.cwd(), 'plugins', 'Daily-Attendance-plugin', 'data', 'temp')
const snapshotDir = path.resolve(process.cwd(), 'plugins', 'Daily-Attendance-plugin', 'data', 'snapshot')

/**
 * 清理指定目录中的文件
 * @param {string} dir - 目录路径
 * @param {string} ext - 文件扩展名
 * @param {Function} ensureDirFn - 确保目录存在的函数
 * @returns {Promise<void>}
 */
async function cleanupDir(dir, ext, ensureDirFn) {
  await ensureDirFn()
  const files = await fs.readdir(dir)
  for (const file of files) {
    if (file.endsWith(ext)) {
      const filePath = path.join(dir, file)
      try {
        await fs.unlink(filePath)
        if (typeof logger !== 'undefined' && logger.info) {
          logger.info(`清理文件: ${filePath}`)
        } else {
          console.log(`清理文件: ${filePath}`)
        }
      } catch (err) {
        if (typeof logger !== 'undefined' && logger.error) {
          logger.error(`删除文件失败: ${filePath}`, err)
        } else {
          console.error(`删除文件失败: ${filePath}`, err)
        }
      }
    }
  }
}

/**
 * 确保临时目录存在
 * @returns {Promise<void>}
 */
export async function ensureTempDir() {
  try {
    await fs.access(tempDir)
  } catch {
    await fs.mkdir(tempDir, { recursive: true })
  }
}

/**
 * 确保快照目录存在
 * @returns {Promise<void>}
 */
export async function ensureSnapshotDir() {
  try {
    await fs.access(snapshotDir)
  } catch {
    await fs.mkdir(snapshotDir, { recursive: true })
  }
}

/**
 * 生成运势图片
 * @param {string} html - HTML内容
 * @param {string|number} userId - 用户ID
 * @param {string} date - 日期标识
 * @returns {Promise<string>} 生成的图片路径
 */
export async function generateImage(html, userId, date) {
  await ensureTempDir()
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 600, height: 800 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const imagePath = path.join(tempDir, `${userId}_${date}.png`)
    await page.screenshot({ path: imagePath, type: 'png', fullPage: true })
    await browser.close()
    return imagePath
  } catch (error) {
    await browser.close()
    throw error
  }
}

/**
 * 清理临时图片文件
 * @returns {Promise<void>}
 */
export async function cleanupTempImages() {
  await cleanupDir(tempDir, '.png', ensureTempDir)
}

/**
 * 清理快照文件
 * @returns {Promise<void>}
 */
export async function cleanupSnapshots() {
  await cleanupDir(snapshotDir, '.json', ensureSnapshotDir)
}

/**
 * 启动自动清理任务
 * @returns {void}
 */
export function startAutoCleanup() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const msToMidnight = tomorrow.getTime() - now.getTime()
  
  setTimeout(() => {
    cleanupDir(tempDir, '.png', ensureTempDir)
    cleanupDir(snapshotDir, '.json', ensureSnapshotDir)
    setInterval(() => {
      cleanupDir(tempDir, '.png', ensureTempDir)
      cleanupDir(snapshotDir, '.json', ensureSnapshotDir)
    }, 24 * 60 * 60 * 1000)
  }, msToMidnight)
}