import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const controller = readFileSync(new URL('../controllers/fortuneController.js', import.meta.url), 'utf8')

test('运势图片使用 Yunzai 标准渲染器', () => {
  assert.match(controller, /this\.e\.runtime\.render\('Daily-Attendance-plugin'/)
  assert.doesNotMatch(controller, /this\.render\(/)
  assert.doesNotMatch(controller, /puppeteer|generateImage|segment\.image/)
  assert.equal(existsSync(new URL('../services/imageService.js', import.meta.url)), false)
})

test('运势模板声明 Core 截图区域', () => {
  for (const name of ['attendance.html', 'attendance_special.html']) {
    const html = readFileSync(new URL(`../resources/templates/${name}`, import.meta.url), 'utf8')
    assert.match(html, /id="container"/)
  }
})
