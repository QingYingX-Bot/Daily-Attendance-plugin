import fs from 'node:fs/promises'
import path from 'node:path'

// 路径常量
const dataRoot = path.resolve(process.cwd(), 'plugins', 'Daily-Attendance-plugin', 'data')
const userSignsDir = path.join(dataRoot, 'user_signs')
const snapshotDir = path.join(dataRoot, 'snapshot')
const expiredDir = path.join(dataRoot, 'expired')

/**
 * 标准化日期格式
 * @param {string} dateStr - 日期字符串
 * @returns {string|null} 标准化的日期字符串 (YYYY-MM-DD) 或 null
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null
  
  // 处理 YYYY/MM/DD 格式
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/')
    if (parts.length >= 3) {
      const year = parts[0]
      const month = parts[1].padStart(2, '0')
      const day = parts[2].split(' ')[0].padStart(2, '0') // 移除时间部分
      return `${year}-${month}-${day}`
    }
  }
  
  // 处理 YYYY-MM-DD 格式
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-')
    if (parts.length >= 3) {
      const year = parts[0]
      const month = parts[1].padStart(2, '0')
      const day = parts[2].split(' ')[0].padStart(2, '0') // 移除时间部分
      return `${year}-${month}-${day}`
    }
  }
  
  return null
}

/**
 * 计算连续签到天数
 * @param {string} lastSign - 最后签到日期
 * @returns {number} 连续签到天数
 */
function calculateConsecutiveDays(lastSign) {
  if (!lastSign) return 0
  
  const normalizedDate = normalizeDate(lastSign)
  if (!normalizedDate) return 0
  
  try {
    const lastSignDate = new Date(normalizedDate)
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const yesterdayStr = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    
    // 如果最后签到是今天或昨天，返回1（至少连续1天）
    if (normalizedDate === todayStr || normalizedDate === yesterdayStr) {
      return 1
    }
    
    // 否则返回0（连续签到中断）
    return 0
  } catch (error) {
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error('日期解析错误:', error)
    } else {
      console.error('日期解析错误:', error)
    }
    return 0
  }
}

/**
 * 确保目录存在
 * @param {string} dirPath - 目录路径
 * @returns {Promise<void>}
 */
export async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath)
  } catch {
    await fs.mkdir(dirPath, { recursive: true })
  }
}

/**
 * 获取用户数据文件路径
 * @param {string|number} userId - 用户ID
 * @returns {string} 文件路径
 */
export function getUserDataPath(userId) {
  return path.join(userSignsDir, `${userId}.json`)
}

/**
 * 获取快照文件路径
 * @param {string|number} userId - 用户ID
 * @param {string} date - 日期
 * @returns {string} 文件路径
 */
export function getSnapshotPath(userId, date) {
  return path.join(snapshotDir, `${userId}_${date}.json`)
}

/**
 * 检查文件是否存在
 * @param {string} filePath - 文件路径
 * @returns {Promise<boolean>} 文件是否存在
 */
export async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * 获取用户数据
 * @param {string|number} userId - 用户ID
 * @returns {Promise<Object>} 用户数据
 */
export async function getUserData(userId) {
  const filePath = getUserDataPath(userId)
  await ensureDir(userSignsDir)
  try {
    const data = await fs.readFile(filePath, 'utf8')
    const userData = JSON.parse(data)
    
    // 确保用户数据包含必要字段
    if (userData.consecutiveDays === undefined) {
      userData.consecutiveDays = calculateConsecutiveDays(userData.lastSign)
    }
    
    // 标准化日期格式
    if (userData.lastSign) {
      const normalizedDate = normalizeDate(userData.lastSign)
      if (normalizedDate && normalizedDate !== userData.lastSign) {
        userData.lastSign = normalizedDate
        await saveUserData(userId, userData)
      }
    }
    
    return userData
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 检查是否在过期文件夹中
      const restoredData = await checkAndRestoreExpiredUser(userId)
      if (restoredData) {
        return restoredData
      }
      return { exp: 0, signDays: 0, lastSign: null, consecutiveDays: 0 }
    }
    throw error
  }
}

/**
 * 保存用户数据
 * @param {string|number} userId - 用户ID
 * @param {Object} data - 用户数据
 * @returns {Promise<void>}
 */
export async function saveUserData(userId, data) {
  const filePath = getUserDataPath(userId)
  await ensureDir(userSignsDir)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * 保存签到快照
 * @param {string|number} userId - 用户ID
 * @param {string} date - 日期
 * @param {Object} data - 快照数据
 * @returns {Promise<void>}
 */
export async function saveSignSnapshot(userId, date, data) {
  await ensureDir(snapshotDir)
  const filePath = getSnapshotPath(userId, date)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * 获取签到快照
 * @param {string|number} userId - 用户ID
 * @param {string} date - 日期
 * @returns {Promise<Object|null>} 快照数据或null
 */
export async function getSignSnapshot(userId, date) {
  await ensureDir(snapshotDir)
  const filePath = getSnapshotPath(userId, date)
  try {
    const data = await fs.readFile(filePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/**
 * 检查并恢复过期文件夹中的用户数据
 * @param {string|number} userId - 用户ID
 * @returns {Promise<Object|null>} 恢复的用户数据，如果不存在则返回null
 */
export async function checkAndRestoreExpiredUser(userId) {
  try {
    await ensureDir(expiredDir)
    const expiredFilePath = path.join(expiredDir, `${userId}.json`)
    
    // 检查用户是否在过期文件夹中
    try {
      await fs.access(expiredFilePath)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null // 用户不在过期文件夹中
      }
      throw error
    }
    
    // 读取过期文件夹中的用户数据
    const expiredData = await fs.readFile(expiredFilePath, 'utf8')
    const userData = JSON.parse(expiredData)
    
    // 确保用户数据包含必要字段
    if (userData.consecutiveDays === undefined) {
      userData.consecutiveDays = calculateConsecutiveDays(userData.lastSign)
    }
    
    // 标准化日期格式
    if (userData.lastSign) {
      const normalizedDate = normalizeDate(userData.lastSign)
      if (normalizedDate) {
        userData.lastSign = normalizedDate
      }
    }
    
    // 移动文件回user_signs文件夹
    const targetPath = getUserDataPath(userId)
    await ensureDir(userSignsDir)
    await fs.rename(expiredFilePath, targetPath)
    
    // 保存更新后的用户数据
    await saveUserData(userId, userData)
    
    if (typeof logger !== 'undefined' && logger.info) {
      logger.info(`恢复过期用户数据: ${userId}`)
    } else {
      console.log(`恢复过期用户数据: ${userId}`)
    }
    return userData
  } catch (error) {
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error(`恢复过期用户数据失败 ${userId}:`, error.message)
    } else {
      console.error(`恢复过期用户数据失败 ${userId}:`, error.message)
    }
    return null
  }
}

/**
 * 获取指定日期的所有签到快照（并发读取提升性能）
 * @param {string} date - 日期字符串 (YYYY-MM-DD)
 * @returns {Promise<Array<Object>>} 快照数据数组，每个元素包含 {userId, snapshot}
 */
export async function getAllTodaySnapshots(date) {
  await ensureDir(snapshotDir)
  const snapshots = []
  
  try {
    const files = await fs.readdir(snapshotDir)
    const dateSuffix = `_${date}.json`
    const targetFiles = files.filter(file => file.endsWith(dateSuffix))
    
    // 并发读取所有快照文件
    const promises = targetFiles.map(async (file) => {
      try {
        const filePath = path.join(snapshotDir, file)
        const data = await fs.readFile(filePath, 'utf8')
        const snapshot = JSON.parse(data)
        // 从文件名中提取用户ID
        const userId = file.replace(dateSuffix, '')
        return { userId, snapshot }
      } catch (error) {
        if (typeof logger !== 'undefined' && logger.error) {
          logger.error(`读取快照文件失败: ${file}`, error.message)
        } else {
          console.error(`读取快照文件失败: ${file}`, error.message)
        }
        return null
      }
    })
    
    const results = await Promise.all(promises)
    // 过滤掉失败的结果
    return results.filter(result => result !== null)
  } catch (error) {
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error('读取快照目录失败:', error.message)
    } else {
      console.error('读取快照目录失败:', error.message)
    }
    return []
  }
}

/**
 * 获取所有用户数据（并发读取提升性能）
 * @returns {Promise<Array<Object>>} 用户数据数组，每个元素包含 {userId, userData}
 */
export async function getAllUserData() {
  await ensureDir(userSignsDir)
  const userDataList = []
  
  try {
    const files = await fs.readdir(userSignsDir)
    const jsonFiles = files.filter(file => file.endsWith('.json'))
    
    // 并发读取所有用户数据
    const promises = jsonFiles.map(async (file) => {
      try {
        const userId = file.replace('.json', '')
        const userData = await getUserData(userId)
        return { userId, userData }
      } catch (error) {
        if (typeof logger !== 'undefined' && logger.error) {
          logger.error(`读取用户数据失败: ${file}`, error.message)
        } else {
          console.error(`读取用户数据失败: ${file}`, error.message)
        }
        return null
      }
    })
    
    const results = await Promise.all(promises)
    // 过滤掉失败的结果
    return results.filter(result => result !== null)
  } catch (error) {
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error('读取用户数据目录失败:', error.message)
    } else {
      console.error('读取用户数据目录失败:', error.message)
    }
    return []
  }
} 