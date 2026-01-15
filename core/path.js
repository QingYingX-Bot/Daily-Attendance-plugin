import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 插件根目录
export const pluginRoot = path.resolve(__dirname, '..')

// 常用路径
export const paths = {
  // 配置目录
  config: path.join(pluginRoot, 'config'),
  
  // 数据目录
  data: path.join(pluginRoot, 'data'),
  snapshot: path.join(pluginRoot, 'data', 'snapshot'),
  userSigns: path.join(pluginRoot, 'data', 'user_signs'),
  expired: path.join(pluginRoot, 'data', 'expired'),
  
  // 资源目录
  resources: path.join(pluginRoot, 'resources'),
  templates: path.join(pluginRoot, 'resources', 'templates'),
  
  // 配置文件
  hitokotoBackup: path.join(pluginRoot, 'config', 'hitokotoBackup.json'),
  specialDates: path.join(pluginRoot, 'config', 'specialDates.json'),
  apis: path.join(pluginRoot, 'config', 'apis.json'),
  
  // 模板文件
  attendanceTemplate: path.join(pluginRoot, 'resources', 'templates', 'attendance.html'),
  attendanceSpecialTemplate: path.join(pluginRoot, 'resources', 'templates', 'attendance_special.html')
}
