/**
 * Daily-Attendance-plugin
 * 每日运势插件 - 提供运势生成、等级系统、随机一言等功能
 * 
 * @author TRSS-Yunzai
 * @version 1.1.1
 * @license MIT 
 */

import { Fortune } from './controllers/fortuneController.js'
import { readFileSync } from 'node:fs'

// 获取版本信息
const packageJson = JSON.parse(readFileSync('./plugins/Daily-Attendance-plugin/package.json', 'utf8'))
const version = packageJson.version

// ANSI颜色
const blue = '\x1b[34m'
const lightBlue = '\x1b[94m'
const reset = '\x1b[0m'
const prefix = '[daily-attendance-plugin] '

function logInit(msg, color = '') {
  const coloredMsg = color ? `${color}${prefix}${msg}${reset}` : `${prefix}${msg}`
  if (typeof logger !== 'undefined' && logger.info) {
    logger.info(coloredMsg)
  } else if (Bot?.logger?.info) {
    Bot.logger.info(coloredMsg)
  } else {
    console.log(coloredMsg)
  }
}

try {
  logInit('---------^_^---------', blue)
  logInit(`每日运势插件 v${version} 初始化成功~`, lightBlue)
  logInit('支持功能：运势生成、等级系统、随机一言、搞怪黄历', lightBlue)
  logInit('---------^_^---------', blue)
} catch (error) {
  console.log(`${prefix}每日运势插件 v${version} 初始化成功~`)
}

export { Fortune }
export default Fortune
