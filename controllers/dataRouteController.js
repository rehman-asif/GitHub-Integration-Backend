import GithubOrganization from '../models/GithubOrganization.js'
import GithubRepo from '../models/GithubRepo.js'
import GithubCommit from '../models/GithubCommit.js'
import GithubPull from '../models/GithubPull.js'
import GithubIssue from '../models/GithubIssue.js'
import GithubChangelog from '../models/GithubChangelog.js'
import GithubUser from '../models/GithubUser.js'
import Response from '../helpers/response.js'

const models = {
  organizations: GithubOrganization,
  repos: GithubRepo,
  commits: GithubCommit,
  pulls: GithubPull,
  issues: GithubIssue,
  changelogs: GithubChangelog,
  users: GithubUser
}

const searchFields = {
  organizations: ['login', 'name', 'description'],
  repos: ['name', 'full_name', 'description'],
  commits: ['sha'],
  pulls: ['title', 'state'],
  issues: ['title', 'state'],
  changelogs: ['event'],
  users: ['login', 'name', 'email']
}

export default class DataRouteController {
  static buildOptions(query) {
    const page = Number(query.page) || 1
    const limit = Number(query.limit) || 10
    const skip = (page - 1) * limit

    const sortField = query.sort_by || 'createdAt'
    const sortOrder = query.sort_order === 'asc' ? 1 : -1

    return {
      page,
      limit,
      skip,
      sort: { [sortField]: sortOrder }
    }
  }

  static buildFilter(query) {
    if (!query.filter) return {}

    try {
      return JSON.parse(query.filter)
    } catch (error) {
      return {}
    }
  }

  static buildSearchFilter(searchTerm, fields) {
    if (!searchTerm || !fields || fields.length === 0) return {}

    return {
      $or: fields.map(field => ({
        [field]: { $regex: searchTerm, $options: 'i' }
      }))
    }
  }

  static formatResponse(data, total, page, limit) {
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    }
  }

  static async getCollection(req, res) {
    const collection = req.params.collection
    const Model = models[collection]

    if (!Model) {
      throw new Error('Collection not found')
    }

    const options = DataRouteController.buildOptions(req.query)
    const filter = DataRouteController.buildFilter(req.query)
    const fields = searchFields[collection] || []
    const search = DataRouteController.buildSearchFilter(req.query.search, fields)

    const query = { ...filter, ...search }

    const data = await Model.find(query)
      .sort(options.sort)
      .skip(options.skip)
      .limit(options.limit)
      .lean()

    const total = await Model.countDocuments(query)
    const result = DataRouteController.formatResponse(data, total, options.page, options.limit)

    return Response.paginated(res, result.data, result.pagination)
  }

  static async search(req, res) {
    const keyword = req.query.q

    if (!keyword) {
      throw new Error('Search query missing')
    }

    const result = {}

    for (const collection in models) {
      const Model = models[collection]
      const fields = searchFields[collection]

      if (!fields) continue

      const searchQuery = DataRouteController.buildSearchFilter(keyword, fields)
      const data = await Model.find(searchQuery).limit(10).lean()

      if (data.length) {
        result[collection] = data
      }
    }

    return Response.success(res, result, 'Search done')
  }
}
