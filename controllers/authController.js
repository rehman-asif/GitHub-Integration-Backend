import axios from 'axios'
import config from '../config/app.js'
import GithubIntegration from '../models/GithubIntegration.js'
import GitHubController from './githubController.js'

export default class AuthController {
  static login(req, res) {
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${config.github.clientID}&scope=user:email,read:org,repo&redirect_uri=${config.github.callbackURL}`
    res.redirect(githubAuthUrl)
  }

  static async callback(req, res) {
    const code = req.query.code

    if (!code) {
      return res.redirect('/auth/github/login')
    }

    try {
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: config.github.clientID,
          client_secret: config.github.clientSecret,
          code: code
        },
        {
          headers: { Accept: 'application/json' }
        }
      )

      const accessToken = tokenResponse.data.access_token

      if (!accessToken) {
        return res.redirect('/auth/github/login')
      }

      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      })

      const userData = userResponse.data

      const integrationData = {
        githubUserId: userData.id.toString(),
        githubUsername: userData.login,
        githubUserInfo: userData,
        oauthToken: accessToken,
        integrationStatus: 'active',
        connectionTimestamp: new Date()
      }

      await GithubIntegration.findOneAndUpdate(
        { githubUserId: integrationData.githubUserId },
        integrationData,
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



