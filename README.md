# 📅 Daily-Attendance-plugin

[![Gitee](https://gitee.com/tttfff/daily-attendance-plugin/badge/star.svg?theme=dark)](https://gitee.com/tttfff/daily-attendance-plugin) ![version](https://img.shields.io/badge/version-1.1.0-blue) ![license](https://img.shields.io/badge/license-MIT-green)

---

**✨ Yunzai-Bot 每日运势插件，支持运势生成、等级系统、随机一言、搞怪黄历等丰富功能！**

> 插件 by QingYing & AI

---

## 📦 简介
Daily-Attendance-plugin 是一个为 Yunzai-Bot 开发的每日运势插件，提供运势生成、等级系统、随机一言、搞怪黄历等功能。通过本插件，用户可以每日签到获取运势，累积经验值提升等级，享受丰富的互动体验。

---

## 🌟 功能特点
- **每日运势生成** - 基于用户ID和日期的伪随机运势，确保每日不同
- **等级系统** - 经验值累积，50个等级等你挑战
- **随机一言** - 来自一言API的精选语录
- **搞怪黄历** - 每日宜忌事项，趣味十足
- **时间问候** - 根据当前时间智能问候
- **动态背景** - 来自API的随机背景图片
- **美观渲染** - 基于HTML模板的精美展示
- **JSON配置** - 所有数据配置化，便于修改和维护
- **自动清理** - 图片文件和快照数据自动清理，节省磁盘空间

---

## 🚀 安装方法
在 Yunzai-Bot 根目录下执行以下命令：

```bash
# 使用 Git 安装
git clone https://gitee.com/tttfff/daily-attendance-plugin.git ./plugins/Daily-Attendance-plugin/
# 安装依赖
pnpm install
```

---

## 📝 使用说明

### 基础命令
- 今日运势 或 jrys —— 获取今日运势
- 运势统计 或 ystj —— 查看个人统计信息
- 运势帮助 或 ysbz —— 查看本帮助
- #运势数据 或 yssj —— 查询当前群聊今日签到情况
- #运势总数据 或 yszsj —— 查询总的今日签到情况（仅当日数据）
- 运势排行榜 或 ysphb —— 查看全局运势排行榜

---

## ⚙️ 配置说明

### 配置文件说明
插件采用 JSON 文件配置方式，所有配置数据存储在 `config/` 目录下：

- `config/levelData.json` - 等级数据配置
- `config/fortuneData.json` - 运势描述配置
- `config/timeGreetings.json` - 时间问候语配置
- `config/Things.json` - 黄历事件配置（包含宜忌事项）
- `config/apis.json` - API 地址配置
- `config/hitokotoBackup.json` - 备用一言库（自动生成，无需手动配置）

### 配置示例

#### 等级数据配置（config/levelData.json）
```json
[
  { "level": 0, "exp": 0, "name": "不知名杂鱼" },
  { "level": 1, "exp": 500, "name": "荒野漫步者" },
  { "level": 2, "exp": 1000, "name": "拓荒者" }
]
```

#### 运势描述配置（config/fortuneData.json）
```json
[
  { "range": [0, 4], "description": "走平坦的路但会摔倒的程度" },
  { "range": [5, 14], "description": "吃泡面会没有调味包的程度" }
]
```

#### API 配置（config/apis.json）
```json
{
  "HITOKOTO_API": "https://v1.hitokoto.cn/",
  "BG_API": "https://t.alcy.cc/fj"
}
```

---

## 🗂️ 项目结构

```
Daily-Attendance-plugin/
├── config/                 # 配置文件目录
│   ├── levelData.json     # 等级数据配置
│   ├── fortuneData.json   # 运势描述配置
│   ├── timeGreetings.json # 时间问候语配置
│   ├── Things.json        # 黄历事件配置
│   ├── apis.json          # API 地址配置
│   └── hitokotoBackup.json # 备用一言库（自动生成）
├── controllers/            # 控制器模块
│   └── fortuneController.js # 运势控制器
├── services/              # 服务层模块
│   ├── dataManager.js     # 数据管理服务
│   └── imageService.js    # 图片生成服务
├── core/                  # 核心功能模块
│   └── utils.js           # 工具函数
├── resources/             # 资源文件目录
│   └── templates/         # HTML 模板目录
│       └── attendance.html # 运势展示模板
├── data/                  # 数据存储目录
│   ├── temp/              # 临时图片存储
│   └── user_signs/        # 用户签到数据
├── index.js              # 插件入口文件
├── package.json          # 项目配置文件
└── README.md             # 说明文档
```

---

## 💾 数据存储说明

### 用户数据存储
- **位置**：`data/user_signs/{user_id}.json`
- **结构**：
```json
{
  "exp": 1500,
  "signDays": 10,
  "lastSign": "2024-01-01",
  "consecutiveDays": 0
}
```

### 图片存储
- **位置**：`data/temp/`
- **命名**：`{userId}_{date}.png`
- **清理**：每天00:00 定时清空

### 快照数据存储
- **位置**：`data/snapshot/`
- **命名**：`{userId}_{date}.json`
- **清理**：每天00:00 定时清空

---

## 🔧 开发说明

### 主要模块
- `fortuneController.js` - 插件主控制器，负责指令注册与主流程调度
- `dataManager.js` - 用户数据管理，负责读写用户签到数据
- `imageService.js` - 图片生成与定时清理服务
- `utils.js` - 等级、运势、问候语等业务纯函数
- `attendance.html` - 运势展示模板

### 配置修改
所有配置数据都存储在 `config/` 目录下的 JSON 文件中，修改后重启插件即可生效。

---

## 💬 问题反馈
如有任何问题，欢迎提交 [Issue](https://gitee.com/tttfff/daily-attendance-plugin/issues) 反馈。

## 📄 许可证
本项目采用 **MIT 许可证**

---

**免责声明**：本插件仅供娱乐使用，运势内容为随机生成，请勿迷信。 