import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 常量定义
const FORTUNE_MEAN = 50
const FORTUNE_STD_DEV = 10
const RANDOM_A = 1664525
const RANDOM_C = 1013904223
const RANDOM_M = 0x100000000

// Beta分布参数（控制运势分布形状）
// alpha和beta都设为较小的值（如2），可以让分布更扁平，极端值更容易出现
const BETA_ALPHA = 2
const BETA_BETA = 2

// 配置文件缓存
const configCache = new Map()

/**
 * 加载配置文件（带缓存）
 * @param {string} configName - 配置文件名（不含扩展名）
 * @returns {Array} 配置数据
 */
function loadConfig(configName) {
  // 如果已缓存，直接返回
  if (configCache.has(configName)) {
    return configCache.get(configName)
  }
  
  try {
    const pluginRoot = path.resolve(__dirname, '..')
    const configPath = path.join(pluginRoot, 'config', `${configName}.json`)
    const data = JSON.parse(readFileSync(configPath, 'utf8'))
    // 缓存配置数据
    configCache.set(configName, data)
    return data
  } catch (error) {
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error(`加载配置文件失败: ${configName}.json`, error.message)
    } else {
      console.error(`加载配置文件失败: ${configName}.json`, error.message)
    }
    return []
  }
}

const levelData = loadConfig('levelData')
const fortuneData = loadConfig('fortuneData')
const timeGreetings = loadConfig('timeGreetings')
const thingsData = loadConfig('Things')

const levelMap = new Map()
levelData.forEach(level => {
  levelMap.set(level.exp, level)
})

/**
 * 根据经验值计算等级
 * @param {number} exp - 经验值
 * @returns {Object} 等级信息 {level, exp, name}
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
 * @param {number} fortune - 运势值 (0-100)
 * @returns {string} 运势描述
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
 * @returns {string} 问候语
 */
export function getTimeGreeting() {
  const hour = new Date().getHours()
  const greeting = timeGreetings.find(g => hour >= g.range[0] && hour < g.range[1])
  return greeting ? greeting.message : '你好'
}

/**
 * 根据用户ID和日期生成黄历（宜忌事项）
 * @param {string|number} userId - 用户ID
 * @param {string} date - 日期字符串 (YYYY-MM-DD)
 * @returns {Object} 黄历信息 {good: string, bad: string}
 */
export function getAlmanac(userId, date) {
  // 增强种子唯一性，确保不同日期产生不同结果
  const goodSeed = `${userId}_${date}_good_v3`
  const badSeed = `${userId}_${date}_bad_v3`
  
  // 如果只有一个事件，返回该事件的宜忌
  if (thingsData.length === 1) {
    const event = thingsData[0]
    return {
      good: `${event.name}——${event.good}`,
      bad: `${event.name}——${event.bad}`
    }
  }
  
  // 从Things.json中随机选择宜事件
  const goodIndex = Math.floor(seededRandom(goodSeed) * thingsData.length)
  
  // 从剩余的事件中随机选择忌事件（确保与宜事件不同）
  // 创建排除 goodIndex 的索引列表
  const availableIndices = []
  for (let i = 0; i < thingsData.length; i++) {
    if (i !== goodIndex) {
      availableIndices.push(i)
    }
  }
  
  // 从剩余索引中随机选择一个作为 badIndex
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
 * @param {string|number} seed - 种子值
 * @returns {number} 0-1之间的随机数
 */
export function seededRandom(seed) {
  let hash = 0
  const seedStr = seed.toString()
  // 使用 djb2 哈希算法的变体
  for (let i = 0; i < seedStr.length; i++) {
    const char = seedStr.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & 0xFFFFFFFF // 确保是 32 位无符号整数
  }
  
  // hash & 0xFFFFFFFF 已经确保是 0 到 2^32-1 的范围（作为无符号整数处理）
  // 但 JavaScript 中可能是负数，需要转换为正数
  // 使用 >>> 0 将负数转换为正数（无符号右移）
  const randomSeed = hash >>> 0
  
  // 使用线性同余生成器（LCG）生成随机数
  // RANDOM_A = 1664525, RANDOM_C = 1013904223, RANDOM_M = 2^32
  // 这是 Knuth 推荐的参数，周期为 2^32
  const result = (RANDOM_A * randomSeed + RANDOM_C) % RANDOM_M
  
  // 返回 0 到 1 之间的浮点数
  return result / RANDOM_M
} 

/**
 * 根据当前经验值计算下一级所需经验值
 * @param {number} exp - 当前经验值
 * @returns {number} 下一级所需经验值，如果已经是最高级则返回当前等级经验值
 */
export function getNextLevelExp(exp) {
  const currentLevel = calculateLevel(exp)
  
  // 查找下一个等级
  const nextLevel = levelData.find(level => level.exp > currentLevel.exp)
  
  // 如果有下一级，返回下一级的经验值要求；否则返回当前等级经验值
  return nextLevel ? nextLevel.exp : currentLevel.exp
} 

/**
 * 生成Beta分布的随机数（使用接受-拒绝方法）
 * @param {number} alpha - Alpha参数
 * @param {number} beta - Beta参数
 * @param {string|number} seed - 种子值
 * @returns {number} 0-1之间的Beta分布随机数
 */
function generateBeta(alpha, beta, seed) {
  // 当alpha和beta都大于1时，使用简化的变换方法
  // 对于Beta(2,2)，可以使用更简单的均匀分布的幂次变换
  let count = 0
  let u1, u2
  
  while (true) {
    u1 = seededRandom(`${seed}_beta_u1_${count}`)
    u2 = seededRandom(`${seed}_beta_u2_${count}`)
    
    // 当alpha和beta都大于1时，Beta分布可以简化为：
    // 使用两个独立的均匀随机数的幂次变换
    const x = Math.pow(u1, 1 / alpha)
    const y = Math.pow(u2, 1 / beta)
    const sum = x + y
    
    // 避免除零
    if (sum > 0.0001) {
      return x / sum
    }
    
    count++
    if (count > 100) {
      // 防止无限循环，返回一个随机值
      return seededRandom(`${seed}_beta_fallback`)
    }
  }
}

/**
 * 生成改进的运势值（使用Beta分布，让极端值更容易出现）
 * @param {string|number} seed - 种子值
 * @returns {number} 0-100之间的运势值，使用Beta分布
 */
export function generateNormalFortune(seed) {
  // 使用Beta分布生成运势值
  // Beta(2, 2) 是一个对称的分布，中间值概率较高，但极端值也有合理概率
  const betaValue = generateBeta(BETA_ALPHA, BETA_BETA, seed)
  
  // 映射到0-100范围
  let fortune = Math.round(betaValue * 100)
  
  // 确保运势值在0-100范围内
  fortune = Math.max(0, Math.min(100, fortune))
  
  return fortune
} 