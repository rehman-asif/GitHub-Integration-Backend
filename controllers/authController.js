import axios from 'axios'
import config from '../config/app.js'
import GithubIntegration from '../models/GithubIntegration.js'
import GitHubController from './githubController.js'

export default class AuthController {
  static login(req, res) {
    const url = `https://github.com/login/oauth/authorize?client_id=${config.github.clientID}&scope=user:email,read:org,repo&redirect_uri=${config.github.callbackURL}`
    res.redirect(url)
  }

  static async callback(req, res) {
    const code = req.query.code
    if (!code) {
      return res.redirect('/auth/github/login')
    }

    try {
      const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: config.github.clientID,
        client_secret: config.github.clientSecret,
        code: code
      }, {
        headers: { Accept: 'application/json' }
      })

      const token = tokenRes.data.access_token
      if (!token) {
        return res.redirect('/auth/github/login')
      }

      const userRes = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      })

      const user = userRes.data

      await GithubIntegration.findOneAndUpdate(
        { githubUserId: user.id.toString() },
        {
          githubUserId: user.id.toString(),
          githubUsername: user.login,
          githubUserInfo: user,
          oauthToken: token,
          integrationStatus: 'active',
          connectionTimestamp: new Date()
        },
        { upsert: true, new: true }
      )

      await GitHubController.resyncAllData()
      res.redirect('/integration/status')
    } catch (error) {
      console.error('OAuth error:', error)
      res.redirect('/auth/github/login')
    }
  }
}



