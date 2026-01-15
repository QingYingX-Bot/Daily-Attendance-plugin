import fs from 'node:fs/promises'
import path from 'node:path'
import { paths } from '../core/path.js'
import { log } from '../core/logger.js'

/**
 * 标准化日期格式
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null
  
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/')
    if (parts.length >= 3) {
      const year = parts[0]
      const month = parts[1].padStart(2, '0')
      const day = parts[2].split(' ')[0].padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }
  
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-')
    if (parts.length >= 3) {
      const year = parts[0]
      const month = parts[1].padStart(2, '0')
      const day = parts[2].split(' ')[0].padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }
  
  return null
}

/**
 * 计算连续签到天数
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
    
    if (normalizedDate === todayStr || normalizedDate === yesterdayStr) {
      return 1
    }
    
    return 0
  } catch (error) {
    log.error('日期解析错误:', error)
    return 0
  }
}

/**
 * 确保目录存在
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
 */
export function getUserDataPath(userId) {
  return path.join(paths.userSigns, `${userId}.json`)
}

/**
 * 获取快照文件路径
 */
export function getSnapshotPath(userId, date) {
  return path.join(paths.snapshot, `${userId}_${date}.json`)
}

/**
 * 检查文件是否存在
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
 */
export async function getUserData(userId) {
  const filePath = getUserDataPath(userId)
  await ensureDir(paths.userSigns)
  
  try {
    const data = await fs.readFile(filePath, 'utf8')
    const userData = JSON.parse(data)
    
    if (userData.consecutiveDays === undefined) {
      userData.consecutiveDays = calculateConsecutiveDays(userData.lastSign)
    }
    
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
 */
export async function saveUserData(userId, data) {
  const filePath = getUserDataPath(userId)
  await ensureDir(paths.userSigns)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * 保存签到快照
 */
export async function saveSignSnapshot(userId, date, data) {
  await ensureDir(paths.snapshot)
  const filePath = getSnapshotPath(userId, date)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * 获取签到快照
 */
export async function getSignSnapshot(userId, date) {
  await ensureDir(paths.snapshot)
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
 */
export async function checkAndRestoreExpiredUser(userId) {
  try {
    await ensureDir(paths.expired)
    const expiredFilePath = path.join(paths.expired, `${userId}.json`)
    
    try {
      await fs.access(expiredFilePath)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    }
    
    const expiredData = await fs.readFile(expiredFilePath, 'utf8')
    const userData = JSON.parse(expiredData)
    
    if (userData.consecutiveDays === undefined) {
      userData.consecutiveDays = calculateConsecutiveDays(userData.lastSign)
    }
    
    if (userData.lastSign) {
      const normalizedDate = normalizeDate(userData.lastSign)
      if (normalizedDate) {
        userData.lastSign = normalizedDate
      }
    }
    
    const targetPath = getUserDataPath(userId)
    await ensureDir(paths.userSigns)
    await fs.rename(expiredFilePath, targetPath)
    await saveUserData(userId, userData)
    
    log.info(`恢复过期用户数据: ${userId}`)
    return userData
  } catch (error) {
    log.error(`恢复过期用户数据失败 ${userId}:`, error.message)
    return null
  }
}

/**
 * 获取指定日期的所有签到快照
 */
export async function getAllTodaySnapshots(date) {
  await ensureDir(paths.snapshot)
  const snapshots = []
  
  try {
    const files = await fs.readdir(paths.snapshot)
    const dateSuffix = `_${date}.json`
    const targetFiles = files.filter(file => file.endsWith(dateSuffix))
    
    const promises = targetFiles.map(async (file) => {
      try {
        const filePath = path.join(paths.snapshot, file)
        const data = await fs.readFile(filePath, 'utf8')
        const snapshot = JSON.parse(data)
        const userId = file.replace(dateSuffix, '')
        return { userId, snapshot }
      } catch (error) {
        log.error(`读取快照文件失败: ${file}`, error.message)
        return null
      }
    })
    
    const results = await Promise.all(promises)
    return results.filter(result => result !== null)
  } catch (error) {
    log.error('读取快照目录失败:', error.message)
    return []
  }
}

/**
 * 获取所有用户数据
 */
export async function getAllUserData() {
  await ensureDir(paths.userSigns)
  const userDataList = []
  
  try {
    const files = await fs.readdir(paths.userSigns)
    const jsonFiles = files.filter(file => file.endsWith('.json'))
    
    const promises = jsonFiles.map(async (file) => {
      try {
        const userId = file.replace('.json', '')
        const userData = await getUserData(userId)
        return { userId, userData }
      } catch (error) {
        log.error(`读取用户数据失败: ${file}`, error.message)
        return null
      }
    })
    
    const results = await Promise.all(promises)
    return results.filter(result => result !== null)
  } catch (error) {
    log.error('读取用户数据目录失败:', error.message)
    return []
  }
}
