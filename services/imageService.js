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
 * 生成图片（返回 base64 格式）
 * @param {string} html - HTML 内容
 * @param {string} userId - 用户ID（用于日志）
 * @param {string} date - 日期（用于日志）
 * @returns {Promise<string|false>} base64 格式的图片字符串，失败返回 false
 */
export async function generateImage(html, userId, date) {
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.default.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  })
  
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 600, height: 800 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    
    // 直接获取 base64 格式的图片，不保存文件
    const base64String = await page.screenshot({ 
      type: 'png', 
      fullPage: true,
      encoding: 'base64'
    })
    
    await browser.close()
    
    if (base64String) {
      // 返回 base64:// 格式的字符串
      return `base64://${base64String}`
    } else {
      log.error(`[imageService] 图片生成失败: 未获取到 base64 数据`)
      return false
    }
  } catch (error) {
    await browser.close()
    log.error(`[imageService] 生成图片时出错: ${error.message}`, error)
    return false
  }
}

/**
 * 启动自动清理任务（仅清理快照文件，不再清理图片文件）
 */
export function startAutoCleanup() {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const msToMidnight = tomorrow.getTime() - now.getTime()
  
  setTimeout(() => {
    // 只清理快照文件，图片不再存储所以不需要清理
    cleanupDir(paths.snapshot, '.json')
    setInterval(() => {
      cleanupDir(paths.snapshot, '.json')
    }, 24 * 60 * 60 * 1000)
  }, msToMidnight)
}
