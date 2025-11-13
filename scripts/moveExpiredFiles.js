#!/usr/bin/env node

/**
 * 过期文件移动脚本
 * 将超过两个月的用户数据文件移动到过期文件夹
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 配置常量
const CONFIG = {
  USER_SIGNS_DIR: path.resolve(__dirname, '..', 'data', 'user_signs'),
  EXPIRED_DIR: path.resolve(__dirname, '..', 'data', 'expired'),
  EXPIRED_DAYS: 60,
  FILE_EXTENSION: '.json'
}

// 命令行参数解析
const ARGS = {
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
  help: process.argv.includes('--help') || process.argv.includes('-h'),
  dryRun: process.argv.includes('--dry-run') || process.argv.includes('-n')
}

// 统计信息类
class MigrationStats {
  constructor() {
    this.moved = 0
    this.skipped = 0
    this.errors = 0
    this.startTime = Date.now()
  }

  increment(field) {
    if (this.hasOwnProperty(field)) {
      this[field]++
    }
  }

  get duration() {
    return ((Date.now() - this.startTime) / 1000).toFixed(2)
  }

  printSummary() {
    console.log('\n移动完成!')
    console.log(`移动文件数: ${this.moved}`)
    console.log(`跳过文件数: ${this.skipped}`)
    console.log(`错误文件数: ${this.errors}`)
    console.log(`执行耗时: ${this.duration}秒`)
    
    if (ARGS.dryRun) {
      console.log('🚧 本次为试运行模式，未实际移动文件')
    }
  }
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
过期文件移动脚本

用法: node move-expired.js [选项]

选项:
  -v, --verbose   显示详细日志（包括跳过的文件）
  -n, --dry-run   试运行模式，不实际移动文件
  -h, --help      显示此帮助信息

示例:
  node move-expired.js                 # 静默模式，只显示摘要
  node move-expired.js --verbose       # 显示详细日志
  node move-expired.js --dry-run       # 试运行，不实际移动文件
  node move-expired.js -v -n           # 详细日志 + 试运行
  `)
}

/**
 * 输出日志（根据verbose参数控制）
 * @param {string} message - 日志消息
 * @param {boolean} force - 是否强制显示（忽略verbose设置）
 */
function log(message, force = false) {
  if (ARGS.verbose || force) {
    console.log(message)
  }
}

/**
 * 计算两个日期之间的天数差异
 * @param {string} dateStr - 日期字符串 (YYYY-MM-DD)
 * @returns {number} 天数差异
 */
function calculateDaysDifference(dateStr) {
  if (!dateStr) return Infinity
  
  try {
    const targetDate = new Date(dateStr)
    const currentDate = new Date()
    
    // 重置时间为00:00:00，只比较日期
    const targetTime = targetDate.setHours(0, 0, 0, 0)
    const currentTime = currentDate.setHours(0, 0, 0, 0)
    
    return Math.floor((currentTime - targetTime) / (1000 * 60 * 60 * 24))
  } catch (error) {
    console.error('日期计算错误:', error.message)
    return Infinity
  }
}

/**
 * 检查并创建目录（如果不存在）
 * @param {string} dirPath - 目录路径
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath)
  } catch {
    log(`创建目录: ${dirPath}`)
    await fs.mkdir(dirPath, { recursive: true })
  }
}

/**
 * 解析用户数据文件
 * @param {string} content - 文件内容
 * @returns {Object|null} 解析后的用户数据
 */
function parseUserData(content) {
  try {
    return JSON.parse(content)
  } catch (error) {
    throw new Error(`JSON解析失败: ${error.message}`)
  }
}

/**
 * 检查文件是否过期
 * @param {Object} userData - 用户数据
 * @returns {boolean} 是否过期
 */
function isFileExpired(userData) {
  if (!userData.lastSign) return false
  
  const daysDifference = calculateDaysDifference(userData.lastSign)
  return daysDifference > CONFIG.EXPIRED_DAYS
}

/**
 * 移动单个过期文件
 * @param {string} filePath - 源文件路径
 * @param {string} fileName - 文件名
 * @returns {boolean} 是否成功移动
 */
async function moveExpiredFile(filePath, fileName) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const userData = parseUserData(content)
    
    if (!userData.lastSign) {
      log(`跳过 ${fileName} - 没有lastSign字段`)
      return false
    }
    
    const daysDifference = calculateDaysDifference(userData.lastSign)
    
    if (!isFileExpired(userData)) {
      log(`跳过 ${fileName} - 未过期 (${daysDifference}天前)`)
      return false
    }
    
    if (ARGS.dryRun) {
      log(`[试运行] 移动 ${fileName} - ${userData.lastSign} (${daysDifference}天前) -> expired/`)
      return true
    }
    
    const targetPath = path.join(CONFIG.EXPIRED_DIR, fileName)
    await fs.rename(filePath, targetPath)
    
    log(`移动 ${fileName} - ${userData.lastSign} (${daysDifference}天前) -> expired/`)
    return true
  } catch (error) {
    console.error(`移动文件失败 ${fileName}:`, error.message)
    throw error
  }
}

/**
 * 获取过期文件夹中的文件数量
 */
async function getExpiredFileCount() {
  try {
    const expiredFiles = await fs.readdir(CONFIG.EXPIRED_DIR)
    return expiredFiles.filter(file => file.endsWith(CONFIG.FILE_EXTENSION)).length
  } catch {
    return 0
  }
}

/**
 * 批量处理文件移动
 * @param {string[]} files - 文件列表
 * @param {MigrationStats} stats - 统计信息
 */
async function processFiles(files, stats) {
  const processPromises = files.map(async (file) => {
    if (!file.endsWith(CONFIG.FILE_EXTENSION)) return
    
    const filePath = path.join(CONFIG.USER_SIGNS_DIR, file)
    
    try {
      const wasMoved = await moveExpiredFile(filePath, file)
      stats.increment(wasMoved ? 'moved' : 'skipped')
    } catch {
      stats.increment('errors')
    }
  })
  
  await Promise.allSettled(processPromises)
}

/**
 * 主函数
 */
async function main() {
  if (ARGS.help) {
    showHelp()
    return
  }
  
  const stats = new MigrationStats()
  
  try {
    console.log('开始移动过期文件...')
    console.log(`用户数据目录: ${CONFIG.USER_SIGNS_DIR}`)
    console.log(`过期文件夹: ${CONFIG.EXPIRED_DIR}`)
    console.log(`过期天数: ${CONFIG.EXPIRED_DAYS}天`)
    
    if (ARGS.verbose) {
      console.log('📝 详细日志模式已开启')
    }
    if (ARGS.dryRun) {
      console.log('🚧 试运行模式已开启，不会实际移动文件')
    }
    
    // 确保目录存在
    await ensureDirectoryExists(CONFIG.USER_SIGNS_DIR)
    await ensureDirectoryExists(CONFIG.EXPIRED_DIR)
    
    // 读取并处理文件
    const files = await fs.readdir(CONFIG.USER_SIGNS_DIR)
    const jsonFiles = files.filter(file => file.endsWith(CONFIG.FILE_EXTENSION))
    
    console.log(`找到 ${jsonFiles.length} 个用户数据文件`)
    
    if (jsonFiles.length === 0) {
      console.log('没有找到需要处理的文件')
      return
    }
    
    await processFiles(jsonFiles, stats)
    
    // 输出结果
    stats.printSummary()
    
    // 显示过期文件夹统计
    const expiredCount = await getExpiredFileCount()
    console.log(`过期文件夹中的文件数: ${expiredCount}`)
    
  } catch (error) {
    console.error('脚本执行失败:', error)
    process.exit(1)
  }
}

// 执行主函数
main().catch(error => {
  console.error('未处理的错误:', error)
  process.exit(1)
})