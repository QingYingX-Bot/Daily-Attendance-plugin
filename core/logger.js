/**
 * 统一的日志工具
 */
export const log = {
  /**
   * 记录信息日志
   * @param {...any} args - 日志参数
   */
  info(...args) {
    if (typeof logger !== 'undefined' && logger.info) {
      logger.info(...args)
    } else if (Bot?.logger?.info) {
      Bot.logger.info(...args)
    } else {
      console.log(...args)
    }
  },

  /**
   * 记录警告日志
   * @param {...any} args - 日志参数
   */
  warn(...args) {
    if (typeof logger !== 'undefined' && logger.warn) {
      logger.warn(...args)
    } else if (Bot?.logger?.warn) {
      Bot.logger.warn(...args)
    } else {
      console.warn(...args)
    }
  },

  /**
   * 记录错误日志
   * @param {...any} args - 日志参数
   */
  error(...args) {
    if (typeof logger !== 'undefined' && logger.error) {
      logger.error(...args)
    } else if (Bot?.logger?.error) {
      Bot.logger.error(...args)
    } else {
      console.error(...args)
    }
  },

  /**
   * 记录调试日志
   * @param {...any} args - 日志参数
   */
  debug(...args) {
    if (typeof logger !== 'undefined' && logger.debug) {
      logger.debug(...args)
    } else if (Bot?.logger?.debug) {
      Bot.logger.debug(...args)
    }
    // 调试日志默认不输出，避免过多日志
  }
}
