import GithubIntegration from '../models/GithubIntegration.js'
import GitHubController from './githubController.js'
import models from '../config/models.js'
import Response from '../helpers/response.js'

export default class IntegrationController {
  static async getStatus(req, res) {
    const integration = await GithubIntegration.findOne({ integrationStatus: 'active' })

    if (!integration) {
      throw new Error('No active GitHub integration found')
    }

    const stats = {}
    for (const [name, Model] of Object.entries(models)) {
      stats[name] = await Model.countDocuments()
    }

    return Response.success(res, {
      status: 'connected',
      integration: {
        githubUsername: integration.githubUsername,
        integrationStatus: integration.integrationStatus,
        connectionTimestamp: integration.connectionTimestamp,
        lastSyncTimestamp: integration.lastSyncTimestamp
      },
      stats
    })
  }

  static async remove(req, res) {
    for (const Model of Object.values(models)) {
      await Model.deleteMany({})
    }
    return Response.success(res, null, 'Integration data removed successfully')
  }

  static async resync(req, res) {
    const results = await GitHubController.resyncAllData()
    return Response.success(res, results, 'Data resynced successfully')
  }
}
