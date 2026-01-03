import config from '../config/app.js'

export default class AuthMiddleware {
  static checkGitHubConfig(req, res, next) {
    const hasConfig = config.github &&
      config.github.clientID &&
      config.github.clientSecret &&
      config.github.clientID !== 'undefined' &&
      config.github.clientSecret !== 'undefined'

    if (!hasConfig) {
      throw new Error('GitHub OAuth not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.')
    }
    next()
  }
}



