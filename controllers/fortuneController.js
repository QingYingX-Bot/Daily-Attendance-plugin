import plugin from '../../../lib/plugins/plugin.js'
import moment from 'moment'
import { getUserData, saveUserData, saveSignSnapshot, getSignSnapshot, getAllTodaySnapshots, getAllUserData, checkAndRestoreExpiredUser, fileExists, getUserDataPath } from '../services/dataManager.js'
import { generateImage, startAutoCleanup } from '../services/imageService.js'
import { calculateLevel, getFortuneDescription, getTimeGreeting, getAlmanac, seededRandom, getNextLevelExp, generateNormalFortune } from '../core/utils.js'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { segment } from 'oicq'

const apisConfig = JSON.parse(readFileSync('./plugins/Daily-Attendance-plugin/config/apis.json', 'utf8'))
const HITOKOTO_API = apisConfig.HITOKOTO_API
const BG_API = apisConfig.BG_API

// 常量定义
const EXP_GAIN_BASE = 100
const EXP_GAIN_MAX = 200
const CONSECUTIVE_BONUS_RATE = 0.05
const TEMPLATE_PATH = './plugins/Daily-Attendance-plugin/resources/templates/attendance.html'
const HITOKOTO_BACKUP_PATH = path.resolve(process.cwd(), 'plugins', 'Daily-Attendance-plugin', 'config', 'hitokotoBackup.json')

/**
 * 统一的日志记录函数
 * @param {string} level - 日志级别 'error' | 'info'
 * @param {...any} args - 日志参数
 */
function logMessage(level, ...args) {
  if (typeof logger !== 'undefined' && logger[level]) {
    logger[level](...args)
  } else if (Bot?.logger?.[level]) {
    Bot.logger[level](...args)
  } else {
    const method = level === 'error' ? console.error : console.log
    method(...args)
  }
}

startAutoCleanup()

export class Fortune extends plugin {
  constructor() {
    super({
      name: '每日运势',
      dsc: '获取每日运势和签到',
      event: 'message',
      priority: 1000,
      rule: [
        { reg: '^#(今日运势|jrys|孑然一身)$', fnc: 'getFortune' },
        { reg: '^#(运势统计|ystj)$', fnc: 'getStats' },
        { reg: '^#(运势帮助|ysbz)$', fnc: 'getHelp' },
        { reg: '^#(运势数据|yssj)$', fnc: 'getGroupTodayStats' },
        { reg: '^#(运势总数据|yszsj)$', fnc: 'getAllTodayStats' },
        { reg: '^#(运势排行榜|ysphb)$', fnc: 'getFortuneRanking' },
        { reg: '^#(一言统计|yytj)$', fnc: 'getHitokotoStats' }
      ]
    })
  }

  /**
   * 读取备用一言库
   * @returns {Promise<Array<{text: string, author: string}>>} 备用一言列表
   */
  async loadHitokotoBackup() {
    try {
      const data = await fs.readFile(HITOKOTO_BACKUP_PATH, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回空数组
        return []
      }
      logMessage('error', '读取备用一言库失败:', error.message)
      return []
    }
  }

  /**
   * 保存一言到备用库
   * @param {string} text - 一言内容
   * @param {string} author - 作者
   */
  async saveHitokotoToBackup(text, author) {
    try {
      // 排除作者为 QingYingX 的
      if (author === 'QingYingX') {
        return
      }

      const backupList = await this.loadHitokotoBackup()
      
      // 检查是否已存在相同的一言
      const exists = backupList.some(item => item.text === text && item.author === author)
      if (exists) {
        return
      }

      // 添加到备用库
      backupList.push({ text, author })
      
      // 保存到文件
      await fs.writeFile(HITOKOTO_BACKUP_PATH, JSON.stringify(backupList, null, 2), 'utf8')
    } catch (error) {
      logMessage('error', '保存一言到备用库失败:', error.message)
    }
  }

  /**
   * 获取随机一言
   * @returns {Promise<{text: string, author: string}>} 一言内容
   */
  async getRandomQuote() {
    // 默认一言备选列表
    const defaultQuotes = [
      { text: '这是一句一言', author: 'QingYingX' },
      { text: '不知道说什么', author: 'QingYingX' },
      { text: '神秘！', author: 'QingYingX' },
      { text: '啊？？？', author: 'QingYingX' }
    ]

    try {
      // 使用 AbortController 实现超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch(HITOKOTO_API, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      if (!data.hitokoto) {
        throw new Error('一言API返回数据格式错误')
      }
      
      const quote = { text: data.hitokoto, author: data.from || '未知' }
      
      // 保存到备用库（排除作者为 QingYingX 的）
      if (quote.author !== 'QingYingX') {
        await this.saveHitokotoToBackup(quote.text, quote.author)
      }
      
      return quote
    } catch (error) {
      if (error.name === 'AbortError') {
        logMessage('error', '获取一言超时')
      } else {
        logMessage('error', '获取一言失败:', error.message)
      }
      
      // 尝试从备用库中随机选择
      const backupList = await this.loadHitokotoBackup()
      if (backupList.length > 0) {
        const randomIndex = Math.floor(Math.random() * backupList.length)
        return backupList[randomIndex]
      }
      
      // 如果备用库也没有，使用默认一言
      const randomIndex = Math.floor(Math.random() * defaultQuotes.length)
      return defaultQuotes[randomIndex]
    }
  }

  /**
   * 生成运势图片
   * @param {Object} snapshotData - 快照数据
   * @param {string} userId - 用户ID
   * @param {string} date - 日期
   * @returns {Promise<string>} 图片路径
   */
  async generateFortuneImage(snapshotData, userId, date) {
    const templatePath = path.join(process.cwd(), TEMPLATE_PATH.replace('./', ''))
    let html = await fs.readFile(templatePath, 'utf8')
    const htmlData = { ...snapshotData, greeting: getTimeGreeting() }
    
    for (const [k, v] of Object.entries(htmlData)) {
      html = html.replace(new RegExp(`{{${k}}}`, 'g'), v)
    }
    
    const { generateImage } = await import('../services/imageService.js')
    return await generateImage(html, userId, date + '_' + Date.now())
  }

  /**
   * 获取用户昵称（优先从好友列表，其次从群成员列表）
   * @param {string|number} userId - 用户ID
   * @returns {Promise<string>} 用户昵称
   */
  async getUserName(userId) {
    try {
      // 优先从好友列表获取
      if (this.e.bot?.pickFriend) {
        const friend = this.e.bot.pickFriend(userId)
        if (friend) {
          const friendInfo = await friend.getInfo?.()
          if (friendInfo && friendInfo.nickname) {
            return friendInfo.nickname
          }
        }
      }
      // 如果好友列表中未找到，尝试从群成员信息获取
      if (this.e.group_id) {
        const member = this.e.group?.pickMember?.(userId)
        if (member) {
          const memberInfo = await member.getInfo?.()
          if (memberInfo) {
            return memberInfo.card || memberInfo.nickname || `用户${userId}`
          }
        }
      }
    } catch (error) {
      // 忽略获取用户信息的错误
    }
    return `用户${userId}`
  }

  /**
   * 计算经验值增益
   * @param {number} fortune - 运势值
   * @param {boolean} isConsecutive - 是否连续签到
   * @returns {number} 经验值增益
   */
  calculateExpGain(fortune, isConsecutive) {
    let expGain = Math.floor(fortune * 1.0) + EXP_GAIN_BASE
    if (expGain > EXP_GAIN_MAX) expGain = EXP_GAIN_MAX
    
    if (isConsecutive) {
      const bonusExp = Math.floor(expGain * CONSECUTIVE_BONUS_RATE)
      expGain += bonusExp
    }
    
    return expGain
  }

  /**
   * 创建快照数据
   * @param {Object} userData - 用户数据
   * @param {number} fortune - 运势值
   * @param {string} fortuneDesc - 运势描述
   * @param {Object} almanac - 黄历数据
   * @param {number} expGain - 经验值增益
   * @param {Object} quote - 一言数据
   * @param {string} userId - 用户ID
   * @returns {Object} 快照数据
   */
  createSnapshotData(userData, fortune, fortuneDesc, almanac, expGain, quote, userId) {
    const level = calculateLevel(userData.exp)
    const nextExp = getNextLevelExp(userData.exp)
    const progressPercent = Math.min(100, Math.max(0, ((userData.exp - level.exp) / (nextExp - level.exp) * 100))).toFixed(1) + '%'

    return {
      fortune,
      fortuneDesc,
      level: level.level.toString(),
      levelName: level.name,
      exp: userData.exp,
      nextExp,
      progress: progressPercent,
      almanac,
      date: moment().format('MM/DD'),
      backgroundUrl: BG_API,
      expGain,
      signDays: userData.signDays,
      avatarUrl: `http://q.qlogo.cn/headimg_dl?dst_uin=${userId}&spec=640&img_type=jpg`,
      user_name: this.e.sender.card || this.e.sender.nickname,
      expToNext: (nextExp - userData.exp).toString(),
      hitokoto: quote.text,
      hitokotoAuthor: quote.author,
      almanacGood: almanac.good,
      almanacBad: almanac.bad
    }
  }

  /**
   * 获取今日运势
   * @returns {Promise<boolean>} 是否成功
   */
  async getFortune() {
    const userId = this.e.user_id
    const date = moment().format('YYYY-MM-DD')
    const snapshot = await getSignSnapshot(userId, date)
    if (snapshot) {
      return await this.getFortuneView()
    }
    
    // 检查用户是否有签到数据
    const userDataPath = getUserDataPath(userId)
    const hasUserData = await fileExists(userDataPath)
    
    let userData
    if (!hasUserData) {
      // 用户没有签到数据，检查 expired 文件夹中是否存在
      const restoredData = await checkAndRestoreExpiredUser(userId)
      if (restoredData) {
        // 从 expired 中恢复数据
        userData = restoredData
        logMessage('info', `用户 ${userId} 从过期文件夹中恢复数据并签到`)
      } else {
        // expired 中也不存在，使用空数据直接签到
        userData = { exp: 0, signDays: 0, lastSign: null, consecutiveDays: 0 }
        logMessage('info', `用户 ${userId} 首次签到`)
      }
    } else {
      // 用户已有签到数据，直接获取
      userData = await getUserData(userId)
    }
    
    // 生成运势数据
    const fortuneSeed = `${userId}_${date}_fortune`
    const fortune = generateNormalFortune(fortuneSeed)
    const fortuneDesc = getFortuneDescription(fortune)
    const quote = await this.getRandomQuote()
    const almanac = getAlmanac(userId, date)
    
    // 计算经验值增益
    const yesterday = moment().subtract(1, 'day').format('YYYY-MM-DD')
    const isConsecutive = userData.lastSign === yesterday
    const expGain = this.calculateExpGain(fortune, isConsecutive)
    
    // 更新用户数据
    if (isConsecutive) {
      userData.consecutiveDays += 1
    } else {
      userData.consecutiveDays = 1
    }
    userData.exp += expGain
    userData.signDays += 1
    userData.lastSign = date

    // 创建快照数据
    const snapshotData = this.createSnapshotData(userData, fortune, fortuneDesc, almanac, expGain, quote, userId)
    
    // 保存数据
    await saveSignSnapshot(userId, date, snapshotData)
    await saveUserData(userId, userData)

    // 生成并发送图片
    const newImagePath = await this.generateFortuneImage(snapshotData, userId, date)
    await this.reply(segment.image(newImagePath))
    return true
  }

  /**
   * 获取运势视图
   * @returns {Promise<boolean>} 是否成功
   */
  async getFortuneView() {
    const userId = this.e.user_id
    const date = moment().format('YYYY-MM-DD')
    const snapshotData = await getSignSnapshot(userId, date)
    if (!snapshotData) {
      await this.reply('你今天还没有签到，请先签到！')
      return false
    }
    
    const quote = await this.getRandomQuote()
    snapshotData.hitokoto = quote.text
    snapshotData.hitokotoAuthor = quote.author
    
    const newImagePath = await this.generateFortuneImage(snapshotData, userId, date)
    await this.reply(segment.image(newImagePath))
    return true
  }

  /**
   * 获取统计信息
   * @returns {Promise<boolean>} 是否成功
   */
  async getStats() {
    const userId = this.e.user_id
    const userData = await getUserData(userId)
    const level = calculateLevel(userData.exp)
    const nextExp = getNextLevelExp(userData.exp)
    const progress = ((userData.exp - level.exp) / (nextExp - level.exp) * 100).toFixed(1)
    const statsText = `📊 个人统计信息\n\n👤 用户：${this.e.sender.card || this.e.sender.nickname}\n🏆 等级：${level.name} (${level.level}级)\n📈 经验：${userData.exp}/${nextExp} (${progress}%)\n📅 签到天数：${userData.signDays}天\n🕐 最后签到：${userData.lastSign || '从未签到'}\n\n💡 提示：发送 今日运势 或 jrys 获取今日运势`
    await this.reply(statsText)
    return true
  }

  /**
   * 获取帮助信息
   * @returns {Promise<void>}
   */
  async getHelp() {
    const helpMsg = [
      '【每日运势功能命令帮助】\n',
      '#今日运势 或 #jrys 或 #孑然一身 —— 获取今日运势\n',
      '#运势统计 或 #ystj —— 查看个人统计信息\n',
      '#运势帮助 或 #ysbz —— 查看本帮助\n',
      '#运势数据 或 #yssj —— 查询当前群聊今日签到情况\n',
      '#运势总数据 或 #yszsj —— 查询总的今日签到情况（仅当日数据）\n',
      '#运势排行榜 或 #ysphb —— 查看全局运势排行榜\n',
      '#一言统计 或 #yytj —— 查看备用一言库统计信息\n'
    ]
    await this.reply(helpMsg)
  }

  /**
   * 获取当前群聊今日签到情况
   * @returns {Promise<boolean>} 是否成功
   */
  async getGroupTodayStats() {
    // 检查是否在群聊中
    if (!this.e.isGroup && !this.e.group_id) {
      await this.reply('该命令仅在群聊中使用')
      return true
    }

    const date = moment().format('YYYY-MM-DD')
    const allSnapshots = await getAllTodaySnapshots(date)
    
    // 获取当前群聊的成员列表
    let groupMemberIds = new Set()
    try {
      if (this.e.group?.getMemberMap) {
        const memberMap = await this.e.group.getMemberMap()
        if (memberMap instanceof Map) {
          // 提取所有成员的用户ID
          for (const userId of memberMap.keys()) {
            groupMemberIds.add(String(userId))
          }
        }
      } else if (this.e.group?.getMemberList) {
        const memberList = await this.e.group.getMemberList()
        if (Array.isArray(memberList)) {
          for (const member of memberList) {
            if (member.user_id) {
              groupMemberIds.add(String(member.user_id))
            }
          }
        }
      }
    } catch (error) {
      logMessage('error', '获取群成员列表失败:', error.message)
    }

    // 过滤出本群成员的签到快照
    const groupSnapshots = allSnapshots.filter(({ userId }) => 
      groupMemberIds.has(String(userId))
    )
    
    if (groupSnapshots.length === 0) {
      const groupName = this.e.group_name || this.e.group?.name || '本群'
      await this.reply(`📊 ${groupName}今日签到情况\n\n📅 日期：${moment().format('YYYY年MM月DD日')}\n\n❌ 今日暂无签到数据\n\n💡 提示：发送 今日运势 或 jrys 进行签到`)
      return true
    }

    // 统计信息（仅本群成员）
    const totalCount = groupSnapshots.length
    let avgFortune = 0
    let maxFortune = 0
    let minFortune = 100

    for (const { snapshot } of groupSnapshots) {
      const fortune = snapshot.fortune || 0
      avgFortune += fortune
      if (fortune > maxFortune) maxFortune = fortune
      if (fortune < minFortune) minFortune = fortune
    }
    avgFortune = Math.round(avgFortune / totalCount)

    const groupName = this.e.group_name || this.e.group?.name || '本群'
    const statsText = [
      `📊 ${groupName} - 今日签到情况\n`,
      `📅 日期：${moment().format('YYYY年MM月DD日')}\n`,
      `👥 签到人数：${totalCount}人\n`,
      `📈 平均运势：${avgFortune}分\n`,
      `🔝 最高运势：${maxFortune}分\n`,
      `🔻 最低运势：${minFortune}分\n`,
      `\n💡 提示：发送 今日运势 或 jrys 进行签到`
    ].join('')

    await this.reply(statsText)
    return true
  }

  /**
   * 获取总的今日签到情况（仅统计当日数据）
   * @returns {Promise<boolean>} 是否成功
   */
  async getAllTodayStats() {
    const date = moment().format('YYYY-MM-DD')
    const snapshots = await getAllTodaySnapshots(date)
    
    if (snapshots.length === 0) {
      await this.reply(`📊 今日总签到数据\n\n📅 日期：${moment().format('YYYY年MM月DD日')}\n\n❌ 今日暂无签到数据\n\n💡 提示：发送 今日运势 或 jrys 进行签到`)
      return true
    }

    // 统计信息（仅统计当日数据）
    const totalCount = snapshots.length
    let avgFortune = 0
    let maxFortune = 0
    let minFortune = 100
    let totalExpGain = 0

    for (const { snapshot } of snapshots) {
      const fortune = snapshot.fortune || 0
      avgFortune += fortune
      if (fortune > maxFortune) maxFortune = fortune
      if (fortune < minFortune) minFortune = fortune
      
      // 只统计当日获得的经验
      totalExpGain += snapshot.expGain || 0
    }
    avgFortune = Math.round(avgFortune / totalCount)
    const avgExpGain = Math.round(totalExpGain / totalCount)

    const statsText = [
      `📊 今日总签到数据\n`,
      `📅 日期：${moment().format('YYYY年MM月DD日')}\n`,
      `━━━━━━━━━━━━━━━━\n`,
      `👥 签到人数：${totalCount}人\n`,
      `📈 平均运势：${avgFortune}分\n`,
      `🔝 最高运势：${maxFortune}分\n`,
      `🔻 最低运势：${minFortune}分\n`,
      `━━━━━━━━━━━━━━━━\n`,
      `💎 平均获得经验：${avgExpGain}点\n`,
      `\n💡 提示：发送 今日运势 或 jrys 进行签到`
    ].join('')

    await this.reply(statsText)
    return true
  }

  /**
   * 获取运势排行榜
   * @returns {Promise<boolean>} 是否成功
   */
  async getFortuneRanking() {
    const allUserData = await getAllUserData()
    
    if (allUserData.length === 0) {
      await this.reply('📊 运势排行榜\n\n❌ 暂无排行榜数据\n\n💡 提示：发送 今日运势 或 jrys 进行签到')
      return true
    }

    // 按经验值排序，然后按签到天数排序
    const sortedUsers = allUserData
      .map(({ userId, userData }) => ({
        userId,
        userData,
        level: calculateLevel(userData.exp || 0)
      }))
      .sort((a, b) => {
        // 先按经验值排序
        if (b.userData.exp !== a.userData.exp) {
          return b.userData.exp - a.userData.exp
        }
        // 经验值相同，按签到天数排序
        return (b.userData.signDays || 0) - (a.userData.signDays || 0)
      })

    // 获取当前用户的数据和排名
    const currentUserId = String(this.e.user_id)
    let userRank = -1
    let userData = null
    let userLevel = null
    
    for (let i = 0; i < sortedUsers.length; i++) {
      if (String(sortedUsers[i].userId) === currentUserId) {
        userRank = i + 1
        userData = sortedUsers[i].userData
        userLevel = sortedUsers[i].level
        break
      }
    }

    // 只显示前10名
    const topUsers = sortedUsers.slice(0, 10)

    // 创建合并转发消息内容（一条消息）
    let rankingContent = '📊 运势排行榜（全局）\n'
    rankingContent += '━━━━━━━━━━━━━━━━'
    
    for (let i = 0; i < topUsers.length; i++) {
      const { userId, userData: uData, level } = topUsers[i]
      const rank = i + 1
      const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`
      
      // 获取用户昵称
      const userName = await this.getUserName(userId)

      // 优化显示格式（减少空行，美化显示）
      const consecutiveText = uData.consecutiveDays > 1 ? ` | 连续${uData.consecutiveDays}天` : ''
      rankingContent += `\n${rankIcon} ${userName}\n`
      rankingContent += `   ${level.name} (${level.level}级) | ${uData.exp || 0}经验 | ${uData.signDays || 0}天${consecutiveText}`
    }

    // 显示个人排名（如果不在前10名中）
    if (userRank > 10) {
      rankingContent += '\n━━━━━━━━━━━━━━━━'
      rankingContent += '\n📌 我的排名'
      
      const userName = this.e.sender.card || this.e.sender.nickname || `用户${currentUserId}`
      const consecutiveText = userData?.consecutiveDays > 1 ? ` | 连续${userData.consecutiveDays}天` : ''
      rankingContent += `\n第${userRank}名 ${userName}`
      rankingContent += `\n${userLevel?.name || '未知'} (${userLevel?.level || 0}级) | ${userData?.exp || 0}经验 | ${userData?.signDays || 0}天${consecutiveText}`
    }

    rankingContent += '\n━━━━━━━━━━━━━━━━'
    rankingContent += '\n💡 提示：发送 今日运势 或 jrys 进行签到'

    // 创建转发节点（一条消息）
    const forwardNodes = [{
      user_id: this.e.self_id,
      nickname: '运势排行榜',
      message: rankingContent
    }]

    // 发送合并转发消息
    let forwardMsg
    if (this.e.group?.makeForwardMsg) {
      forwardMsg = this.e.group.makeForwardMsg(forwardNodes)
    } else if (this.e.friend?.makeForwardMsg) {
      forwardMsg = this.e.friend.makeForwardMsg(forwardNodes)
    } else if (Bot?.makeForwardMsg) {
      forwardMsg = Bot.makeForwardMsg(forwardNodes)
    } else {
      // 如果不支持转发消息，直接发送文本
      await this.reply(rankingContent)
      return true
    }

    await this.reply(forwardMsg)
    return true
  }

  /**
   * 获取一言统计信息
   * @returns {Promise<boolean>} 是否成功
   */
  async getHitokotoStats() {
    try {
      const backupList = await this.loadHitokotoBackup()
      const count = backupList.length
      
      const statsText = [
        '📊 一言统计信息\n',
        '━━━━━━━━━━━━━━━━\n',
        `📝 备用一言库总数：${count} 条\n`,
        '━━━━━━━━━━━━━━━━\n',
        '💡 提示：发送 #今日运势 或 #jrys 进行签到'
      ].join('')
      
      await this.reply(statsText)
      return true
    } catch (error) {
      logMessage('error', '获取一言统计失败:', error.message)
      await this.reply('❌ 获取一言统计信息失败，请稍后再试')
      return false
    }
  }
} 