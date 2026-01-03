import GitHubAPI from '../helpers/githubApi.js'
import GithubOrganization from '../models/GithubOrganization.js'
import GithubRepo from '../models/GithubRepo.js'
import GithubCommit from '../models/GithubCommit.js'
import GithubPull from '../models/GithubPull.js'
import GithubIssue from '../models/GithubIssue.js'
import GithubChangelog from '../models/GithubChangelog.js'
import GithubUser from '../models/GithubUser.js'
import GithubIntegration from '../models/GithubIntegration.js'

let apiClient = null

export default class GitHubController {
  static async getApiClient() {
    if (!apiClient) {
      const integration = await GithubIntegration.findOne({ integrationStatus: 'active' })
      if (!integration) {
        throw new Error('No active GitHub integration found')
      }
      apiClient = new GitHubAPI(integration.oauthToken)
    }
    return apiClient
  }

  static async fetchAllPages(fetchFn, perPage = 100) {
    const allItems = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const items = await fetchFn(page, perPage)
      if (items.length === 0) {
        hasMore = false
      } else {
        allItems.push(...items)
        hasMore = items.length === perPage
        page++
      }
    }

    return allItems
  }

  static async bulkUpsert(Model, docs, uniqueField) {
    if (!docs.length) return []

    const ops = docs.map(doc => ({
      updateOne: {
        filter: { [uniqueField]: doc[uniqueField] },
        update: { $set: { ...doc, syncedAt: new Date() } },
        upsert: true
      }
    }))

    await Model.bulkWrite(ops)
    return docs
  }

  static async fetchOrganizations() {
    const api = await GitHubController.getApiClient()
    const orgs = await api.getOrganizations()
    const documents = orgs.map(org => ({ ...org, syncedAt: new Date() }))
    await GitHubController.bulkUpsert(GithubOrganization, documents, 'id')
    return documents
  }

  static async fetchRepos(orgName) {
    const api = await GitHubController.getApiClient()
    const repos = await api.getOrganizationRepos(orgName)
    const documents = repos.map(repo => ({ ...repo, syncedAt: new Date() }))
    await GitHubController.bulkUpsert(GithubRepo, documents, 'id')
    return documents
  }

  static async fetchCommits(owner, repoName) {
    const api = await GitHubController.getApiClient()
    const allCommits = await GitHubController.fetchAllPages((page, perPage) =>
      api.getRepoCommits(owner, repoName, page, perPage)
    )

    const documents = allCommits.map(commit => ({
      ...commit,
      repo: repoName,
      repo_full_name: `${owner}/${repoName}`,
      syncedAt: new Date()
    }))

    await GitHubController.bulkUpsert(GithubCommit, documents, 'sha')
    return documents
  }

  static async fetchPulls(owner, repoName) {
    const api = await GitHubController.getApiClient()
    const allPulls = await GitHubController.fetchAllPages((page, perPage) =>
      api.getRepoPulls(owner, repoName, page, perPage)
    )

    const documents = allPulls.map(pull => ({
      ...pull,
      repo: repoName,
      repo_full_name: `${owner}/${repoName}`,
      syncedAt: new Date()
    }))

    await GitHubController.bulkUpsert(GithubPull, documents, 'id')
    return documents
  }

  static async fetchIssues(owner, repoName) {
    const api = await GitHubController.getApiClient()
    const allIssues = await GitHubController.fetchAllPages((page, perPage) =>
      api.getRepoIssues(owner, repoName, page, perPage)
    )

    const documents = allIssues.map(issue => ({
      ...issue,
      repo: repoName,
      repo_full_name: `${owner}/${repoName}`,
      syncedAt: new Date()
    }))

    await GitHubController.bulkUpsert(GithubIssue, documents, 'id')

    for (const issue of allIssues) {
      if (issue.number) {
        await GitHubController.fetchChangelogs(owner, repoName, issue.number)
      }
    }

    return documents
  }

  static async fetchChangelogs(owner, repoName, issueNumber) {
    const api = await GitHubController.getApiClient()
    const allEvents = await GitHubController.fetchAllPages((page, perPage) =>
      api.getIssueEvents(owner, repoName, issueNumber, page, perPage)
    )

    const documents = allEvents.map(event => ({
      ...event,
      repo: repoName,
      repo_full_name: `${owner}/${repoName}`,
      issue_number: issueNumber,
      syncedAt: new Date()
    }))

    await GitHubController.bulkUpsert(GithubChangelog, documents, 'id')
    return documents
  }

  static async fetchUsers(orgName) {
    const api = await GitHubController.getApiClient()
    const allMembers = await GitHubController.fetchAllPages((page, perPage) =>
      api.getOrganizationMembers(orgName, page, perPage)
    )

    const documents = allMembers.map(member => ({
      ...member,
      organization: orgName,
      syncedAt: new Date()
    }))

    await GitHubController.bulkUpsert(GithubUser, documents, 'id')
    return documents
  }

  static async resyncAllData() {
    const results = {
      organizations: 0,
      repos: 0,
      commits: 0,
      pulls: 0,
      issues: 0,
      changelogs: 0,
      users: 0
    }

    const orgs = await GitHubController.fetchOrganizations()
    results.organizations = orgs.length

    for (const org of orgs) {
      const orgName = org.login

      const [repos, users] = await Promise.all([
        GitHubController.fetchRepos(orgName),
        GitHubController.fetchUsers(orgName)
      ])

      results.repos += repos.length
      results.users += users.length

      for (const repo of repos) {
        const [owner, repoName] = repo.full_name.split('/')

        const [commits, pulls, issues] = await Promise.all([
          GitHubController.fetchCommits(owner, repoName),
          GitHubController.fetchPulls(owner, repoName),
          GitHubController.fetchIssues(owner, repoName)
        ])

        results.commits += commits.length
        results.pulls += pulls.length
        results.issues += issues.length
      }
    }

    const integration = await GithubIntegration.findOne({ integrationStatus: 'active' })
    if (integration) {
      integration.lastSyncTimestamp = new Date()
      await integration.save()
    }

    return results
  }
}
