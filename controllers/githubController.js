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

    while (true) {
      const items = await fetchFn(page, perPage)
      if (items.length === 0) break
      allItems.push(...items)
      if (items.length < perPage) break
      page++
    }

    return allItems
  }

  static async bulkUpsert(Model, docs, uniqueField) {
    if (docs.length === 0) return []

    const operations = docs.map(doc => ({
      updateOne: {
        filter: { [uniqueField]: doc[uniqueField] },
        update: { $set: { ...doc, syncedAt: new Date() } },
        upsert: true
      }
    }))

    await Model.bulkWrite(operations)
    return docs
  }

  static async fetchOrganizations() {
    const api = await this.getApiClient()
    const orgs = await api.getOrganizations()
    const docs = orgs.map(org => ({ ...org, syncedAt: new Date() }))
    await this.bulkUpsert(GithubOrganization, docs, 'id')
    return docs
  }

  static async fetchRepos(orgName) {
    const api = await this.getApiClient()
    const repos = await api.getOrganizationRepos(orgName)
    const docs = repos.map(repo => ({ ...repo, syncedAt: new Date() }))
    await this.bulkUpsert(GithubRepo, docs, 'id')
    return docs
  }

  static async fetchCommits(owner, repoName) {
    const api = await this.getApiClient()
    const commits = await this.fetchAllPages((page, perPage) =>
      api.getRepoCommits(owner, repoName, page, perPage)
    )

    const docs = commits.map(commit => ({
      ...commit,
      repo: repoName,
      repo_full_name: `${owner}/${repoName}`,
      syncedAt: new Date()
    }))

    await this.bulkUpsert(GithubCommit, docs, 'sha')
    return docs
  }

  static async fetchPulls(owner, repoName) {
    const api = await this.getApiClient()
    const pulls = await this.fetchAllPages((page, perPage) =>
      api.getRepoPulls(owner, repoName, page, perPage)
    )

    const docs = pulls.map(pull => ({
      ...pull,
      repo: repoName,
      repo_full_name: `${owner}/${repoName}`,
      syncedAt: new Date()
    }))

    await this.bulkUpsert(GithubPull, docs, 'id')
    return docs
  }

  static async fetchIssues(owner, repoName) {
    const api = await this.getApiClient()
    const issues = await this.fetchAllPages((page, perPage) =>
      api.getRepoIssues(owner, repoName, page, perPage)
    )

    const docs = issues.map(issue => ({
      ...issue,
      repo: repoName,
      repo_full_name: `${owner}/${repoName}`,
      syncedAt: new Date()
    }))

    await this.bulkUpsert(GithubIssue, docs, 'id')

    for (const issue of issues) {
      if (issue.number) {
        await this.fetchChangelogs(owner, repoName, issue.number)
      }
    }

    return docs
  }

  static async fetchChangelogs(owner, repoName, issueNumber) {
    const api = await this.getApiClient()
    const events = await this.fetchAllPages((page, perPage) =>
      api.getIssueEvents(owner, repoName, issueNumber, page, perPage)
    )

    const docs = events.map(event => ({
      ...event,
      repo: repoName,
      repo_full_name: `${owner}/${repoName}`,
      issue_number: issueNumber,
      syncedAt: new Date()
    }))

    await this.bulkUpsert(GithubChangelog, docs, 'id')
    return docs
  }

  static async fetchUsers(orgName) {
    const api = await this.getApiClient()
    const members = await this.fetchAllPages((page, perPage) =>
      api.getOrganizationMembers(orgName, page, perPage)
    )

    const docs = members.map(member => ({
      ...member,
      organization: orgName,
      syncedAt: new Date()
    }))

    await this.bulkUpsert(GithubUser, docs, 'id')
    return docs
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

    const orgs = await this.fetchOrganizations()
    results.organizations = orgs.length

    for (const org of orgs) {
      const [repos, users] = await Promise.all([
        this.fetchRepos(org.login),
        this.fetchUsers(org.login)
      ])

      results.repos += repos.length
      results.users += users.length

      for (const repo of repos) {
        const [owner, repoName] = repo.full_name.split('/')

        const [commits, pulls, issues] = await Promise.all([
          this.fetchCommits(owner, repoName),
          this.fetchPulls(owner, repoName),
          this.fetchIssues(owner, repoName)
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
