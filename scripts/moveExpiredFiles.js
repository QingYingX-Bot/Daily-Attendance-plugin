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

// 获取目录路径
const userSignsDir = path.resolve(__dirname, '..', 'data', 'user_signs')
const expiredDir = path.resolve(__dirname, '..', 'data', 'expired')

// 过期天数（两个月 = 60天）
const EXPIRED_DAYS = 60

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
    targetDate.setHours(0, 0, 0, 0)
    currentDate.setHours(0, 0, 0, 0)
    
    const timeDifference = currentDate.getTime() - targetDate.getTime()
    const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24))
    
    return daysDifference
  } catch (error) {
    console.error('日期计算错误:', error.message)
    return Infinity
  }
}

/**
 * 移动单个过期文件
 * @param {string} filePath - 源文件路径
 * @param {string} fileName - 文件名
 */
async function moveExpiredFile(filePath, fileName) {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const userData = JSON.parse(content)
    
    // 检查是否有lastSign字段
    if (!userData.lastSign) {
      console.log(`跳过 ${fileName} - 没有lastSign字段`)
      return false
    }
    
    // 计算天数差异
    const daysDifference = calculateDaysDifference(userData.lastSign)
    
    // 检查是否过期（超过60天）
    if (daysDifference <= EXPIRED_DAYS) {
      console.log(`跳过 ${fileName} - 未过期 (${daysDifference}天前)`)
      return false
    }
    
    // 移动文件到过期文件夹
    const targetPath = path.join(expiredDir, fileName)
    await fs.rename(filePath, targetPath)
    
    console.log(`移动 ${fileName} - ${userData.lastSign} (${daysDifference}天前) -> expired/`)
    return true
  } catch (error) {
    console.error(`移动文件失败 ${fileName}:`, error.message)
    return false
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('开始移动过期文件...')
    console.log(`用户数据目录: ${userSignsDir}`)
    console.log(`过期文件夹: ${expiredDir}`)
    console.log(`过期天数: ${EXPIRED_DAYS}天`)
    
    // 检查目录是否存在
    try {
      await fs.access(userSignsDir)
      await fs.access(expiredDir)
    } catch (error) {
      console.error('目录不存在:', error.message)
      return
    }
    
    // 读取所有用户数据文件
    const files = await fs.readdir(userSignsDir)
    const jsonFiles = files.filter(file => file.endsWith('.json'))
    
    console.log(`找到 ${jsonFiles.length} 个用户数据文件`)
    
    if (jsonFiles.length === 0) {
      console.log('没有找到需要处理的文件')
      return
    }
    
    // 批量处理文件
    let movedCount = 0
    let skippedCount = 0
    let errorCount = 0
    
    for (const file of jsonFiles) {
      const filePath = path.join(userSignsDir, file)
      try {
        const wasMoved = await moveExpiredFile(filePath, file)
        if (wasMoved) {
          movedCount++
        } else {
          skippedCount++
        }
      } catch (error) {
        console.error(`处理文件失败 ${file}:`, error.message)
        errorCount++
      }
    }
    
    console.log('\n移动完成!')
    console.log(`移动文件数: ${movedCount}`)
    console.log(`跳过文件数: ${skippedCount}`)
    console.log(`错误文件数: ${errorCount}`)
    
    // 显示过期文件夹中的文件数量
    try {
      const expiredFiles = await fs.readdir(expiredDir)
      const expiredJsonFiles = expiredFiles.filter(file => file.endsWith('.json'))
      console.log(`过期文件夹中的文件数: ${expiredJsonFiles.length}`)
    } catch (error) {
      console.log('过期文件夹为空')
    }
    
  } catch (error) {
    console.error('脚本执行失败:', error)
    process.exit(1)
  }
}

// 执行主函数
main() 