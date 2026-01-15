import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pluginRoot } from './path.js'
import { log } from './logger.js'

// 常量定义
const RANDOM_A = 1664525
const RANDOM_C = 1013904223
const RANDOM_M = 0x100000000
const BETA_ALPHA = 2
const BETA_BETA = 2

// 配置文件缓存
const configCache = new Map()

/**
 * 加载配置文件（带缓存）
 */
function loadConfig(configName) {
  if (configCache.has(configName)) {
    return configCache.get(configName)
  }
  
  try {
    const configPath = path.join(pluginRoot, 'config', `${configName}.json`)
    const data = JSON.parse(readFileSync(configPath, 'utf8'))
    configCache.set(configName, data)
    return data
  } catch (error) {
    log.error(`加载配置文件失败: ${configName}.json`, error.message)
    return []
  }
}

const levelData = loadConfig('levelData')
const fortuneData = loadConfig('fortuneData')
const timeGreetings = loadConfig('timeGreetings')
const thingsData = loadConfig('Things')

/**
 * 根据经验值计算等级
 */
export function calculateLevel(exp) {
  let left = 0
  let right = levelData.length - 1
  let result = levelData[0]
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const currentLevel = levelData[mid]
    
    if (exp >= currentLevel.exp) {
      result = currentLevel
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  
  return result
}

/**
 * 根据运势值获取运势描述
 */
export function getFortuneDescription(fortune) {
  let left = 0
  let right = fortuneData.length - 1
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const data = fortuneData[mid]
    
    if (fortune >= data.range[0] && fortune <= data.range[1]) {
      return data.description
    } else if (fortune < data.range[0]) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }
  
  return '未知运势'
}

/**
 * 根据当前时间获取问候语
 */
export function getTimeGreeting() {
  const hour = new Date().getHours()
  const greeting = timeGreetings.find(g => hour >= g.range[0] && hour < g.range[1])
  return greeting ? greeting.message : '你好'
}

/**
 * 根据用户ID和日期生成黄历
 */
export function getAlmanac(userId, date) {
  const goodSeed = `${userId}_${date}_good_v3`
  const badSeed = `${userId}_${date}_bad_v3`
  
  if (thingsData.length === 1) {
    const event = thingsData[0]
    return {
      good: `${event.name}——${event.good}`,
      bad: `${event.name}——${event.bad}`
    }
  }
  
  const goodIndex = Math.floor(seededRandom(goodSeed) * thingsData.length)
  const availableIndices = []
  for (let i = 0; i < thingsData.length; i++) {
    if (i !== goodIndex) {
      availableIndices.push(i)
    }
  }
  
  const badIndex = availableIndices[Math.floor(seededRandom(badSeed) * availableIndices.length)]
  const goodEvent = thingsData[goodIndex] || { name: '未知事件', good: '未知宜事', bad: '未知忌事' }
  const badEvent = thingsData[badIndex] || { name: '未知事件', good: '未知宜事', bad: '未知忌事' }
  
  return {
    good: `${goodEvent.name}——${goodEvent.good}`,
    bad: `${badEvent.name}——${badEvent.bad}`
  }
}

/**
 * 基于种子的伪随机数生成器
 */
export function seededRandom(seed) {
  let hash = 0
  const seedStr = seed.toString()
  
  for (let i = 0; i < seedStr.length; i++) {
    const char = seedStr.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & 0xFFFFFFFF
  }
  
  const randomSeed = hash >>> 0
  const result = (RANDOM_A * randomSeed + RANDOM_C) % RANDOM_M
  
  return result / RANDOM_M
}

/**
 * 根据当前经验值计算下一级所需经验值
 */
export function getNextLevelExp(exp) {
  const currentLevel = calculateLevel(exp)
  const nextLevel = levelData.find(level => level.exp > currentLevel.exp)
  return nextLevel ? nextLevel.exp : currentLevel.exp
}

/**
 * 生成改进的运势值（使用Beta分布）
 */
export function generateNormalFortune(seed) {
  let count = 0
  let betaValue
  
  while (true) {
    const u1 = seededRandom(`${seed}_beta_u1_${count}`)
    const u2 = seededRandom(`${seed}_beta_u2_${count}`)
    
    const x = Math.pow(u1, 1 / BETA_ALPHA)
    const y = Math.pow(u2, 1 / BETA_BETA)
    const sum = x + y
    
    if (sum > 0.0001) {
      betaValue = x / sum
      break
    }
    
    count++
    if (count > 100) {
      betaValue = seededRandom(`${seed}_beta_fallback`)
      break
    }
  }
  
  let fortune = Math.round(betaValue * 100)
  fortune = Math.max(0, Math.min(100, fortune))
  
  return fortune
}
