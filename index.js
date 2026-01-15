import { Fortune } from './controllers/fortuneController.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pluginRoot } from './core/path.js'
import { log } from './core/logger.js'

// 获取版本信息
const packageJson = JSON.parse(readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'))
const version = packageJson.version

// 初始化日志
const blue = '\x1b[34m'
const lightBlue = '\x1b[94m'
const reset = '\x1b[0m'
const prefix = '[daily-attendance-plugin] '

try {
  log.info(`${blue}---------^_^---------${reset}`)
  log.info(`${lightBlue}每日运势插件 v${version} 初始化成功~${reset}`)
  log.info(`${lightBlue}支持功能：运势生成、等级系统、随机一言、搞怪黄历${reset}`)
  log.info(`${blue}---------^_^---------${reset}`)
} catch (error) {
  console.log(`${prefix}每日运势插件 v${version} 初始化成功~`)
}

export { Fortune }
export default Fortune
