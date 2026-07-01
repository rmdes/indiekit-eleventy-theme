/**
 * GitHub Activity Data
 * Fetches from Indiekit's endpoint-github public API
 * Falls back to direct GitHub API if Indiekit is unavailable
 */
import { dataLog } from "../lib/log.js";

import { cachedFetch } from "../lib/data-fetch.js";

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "";
const INDIEKIT_URL = process.env.SITE_URL || "https://example.com";

// Fallback featured repos if Indiekit API unavailable (from env: comma-separated)
const FALLBACK_FEATURED_REPOS = process.env.GITHUB_FEATURED_REPOS?.split(",").filter(Boolean) || [];

/**
 * Fetch from Indiekit's public GitHub API endpoint
 */
async function fetchFromIndiekit(endpoint) {
  try {
    const url = `${INDIEKIT_URL}/githubapi/api/${endpoint}`;
    dataLog(`[githubActivity] Fetching from Indiekit: ${url}`);
    const data = await cachedFetch(url, {
      duration: "15m",
      type: "json",
    });
    dataLog(`[githubActivity] Indiekit ${endpoint} success`);
    return data;
  } catch (error) {
    dataLog(
      `[githubActivity] Indiekit API unavailable for ${endpoint}: ${error.message}`
    );
    return null;
  }
}

/**
 * Fetch from GitHub API directly
 */
async function fetchFromGitHub(endpoint) {
  const url = `https://api.github.com${endpoint}`;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Eleventy-Site",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return await cachedFetch(url, {
    duration: "15m",
    type: "json",
    fetchOptions: { headers },
  });
}

/**
 * Truncate text with ellipsis
 */
function truncate(text, maxLength = 80) {
  if (!text || text.length <= maxLength) return text || "";
  return text.slice(0, maxLength - 1) + "...";
}

/**
 * Extract commits from push events
 */
function extractCommits(events) {
  if (!Array.isArray(events)) return [];

  return events
    .filter((event) => event.type === "PushEvent")
    .flatMap((event) =>
      (event.payload?.commits || []).map((commit) => ({
        sha: commit.sha.slice(0, 7),
        message: truncate(commit.message.split("\n")[0]),
        url: `https://github.com/${event.repo.name}/commit/${commit.sha}`,
        repo: event.repo.name,
        repoUrl: `https://github.com/${event.repo.name}`,
        date: event.created_at,
      }))
    )
    .slice(0, 10);
}

/**
 * Extract PRs/Issues from events
 */
function extractContributions(events) {
  if (!Array.isArray(events)) return [];

  return events
    .filter(
      (event) =>
        (event.type === "PullRequestEvent" || event.type === "IssuesEvent") &&
        event.payload?.action === "opened"
    )
    .map((event) => {
      const item = event.payload.pull_request || event.payload.issue;
      return {
        type: event.type === "PullRequestEvent" ? "pr" : "issue",
        title: truncate(item?.title),
        url: item?.html_url,
        repo: event.repo.name,
        repoUrl: `https://github.com/${event.repo.name}`,
        number: item?.number,
        date: event.created_at,
      };
    })
    .slice(0, 10);
}

/**
 * Format starred repos
 */
function formatStarred(repos) {
  if (!Array.isArray(repos)) return [];

  return repos.map((repo) => ({
    name: repo.full_name,
    description: truncate(repo.description, 120),
    url: repo.html_url,
    stars: repo.stargazers_count,
    language: repo.language,
    topics: repo.topics?.slice(0, 5) || [],
  }));
}

/**
 * Fetch featured repos directly from GitHub (fallback)
 */
async function fetchFeaturedFromGitHub(repoList) {
  const featured = [];

  for (const repoFullName of repoList) {
    try {
      const repo = await fetchFromGitHub(`/repos/${repoFullName}`);
      let commits = [];
      try {
        const commitsData = await fetchFromGitHub(
          `/repos/${repoFullName}/commits?per_page=5`
        );
        commits = commitsData.map((c) => ({
          sha: c.sha.slice(0, 7),
          message: truncate(c.commit.message.split("\n")[0]),
          url: c.html_url,
          date: c.commit.author.date,
        }));
      } catch (e) {
        dataLog(`[githubActivity] Could not fetch commits for ${repoFullName}`);
      }

      featured.push({
        fullName: repo.full_name,
        name: repo.name,
        description: repo.description,
        url: repo.html_url,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        isPrivate: repo.private,
        commits,
      });
    } catch (error) {
      dataLog(`[githubActivity] Could not fetch ${repoFullName}: ${error.message}`);
    }
  }

  return featured;
}

/**
 * Fetch commits directly from user's recently pushed repos
 * Fallback when events API doesn't include commit details
 */
async function fetchCommitsFromRepos(username, limit = 10) {
  try {
    const repos = await fetchFromGitHub(
      `/users/${username}/repos?sort=pushed&per_page=5`
    );

    if (!Array.isArray(repos) || repos.length === 0) {
      return [];
    }

    const allCommits = [];
    for (const repo of repos.slice(0, 5)) {
      try {
        const repoCommits = await fetchFromGitHub(
          `/repos/${repo.full_name}/commits?per_page=5`
        );
        for (const c of repoCommits) {
          allCommits.push({
            sha: c.sha.slice(0, 7),
            message: truncate(c.commit?.message?.split("\n")[0]),
            url: c.html_url,
            repo: repo.full_name,
            repoUrl: repo.html_url,
            date: c.commit?.author?.date,
          });
        }
      } catch {
        // Skip repos we can't access
      }
    }

    // Sort by date and limit
    return allCommits
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  } catch (error) {
    dataLog(`[githubActivity] Could not fetch commits from repos: ${error.message}`);
    return [];
  }
}

export default async function () {
  if (!GITHUB_USERNAME) {
    dataLog("[githubActivity] GITHUB_USERNAME unset — skipping");
    return {
      stars: [],
      commits: [],
      contributions: [],
      featured: [],
      source: "unconfigured",
    };
  }

  try {
    dataLog("[githubActivity] Fetching GitHub data...");

    // Try Indiekit public API first
    const [indiekitStars, indiekitCommits, indiekitContributions, indiekitActivity, indiekitFeatured] =
      await Promise.all([
        fetchFromIndiekit("stars"),
        fetchFromIndiekit("commits"),
        fetchFromIndiekit("contributions"),
        fetchFromIndiekit("activity"),
        fetchFromIndiekit("featured"),
      ]);

    // Check if Indiekit API is available
    const hasIndiekitData =
      indiekitStars?.stars ||
      indiekitCommits?.commits ||
      indiekitFeatured?.featured;

    if (hasIndiekitData) {
      dataLog("[githubActivity] Using Indiekit API data");
      return {
        stars: indiekitStars?.stars || [],
        commits: indiekitCommits?.commits || [],
        contributions: indiekitContributions?.contributions || [],
        activity: indiekitActivity?.activity || [],
        featured: indiekitFeatured?.featured || [],
        source: "indiekit",
      };
    }

    // Fallback to direct GitHub API
    dataLog("[githubActivity] Falling back to GitHub API");

    const [events, starred, featured] = await Promise.all([
      fetchFromGitHub(`/users/${GITHUB_USERNAME}/events/public?per_page=50`),
      fetchFromGitHub(`/users/${GITHUB_USERNAME}/starred?per_page=20&sort=created`),
      fetchFeaturedFromGitHub(FALLBACK_FEATURED_REPOS),
    ]);

    // Try to extract commits from events first
    let commits = extractCommits(events || []);

    // If events API didn't have commits, fetch directly from repos
    if (commits.length === 0 && GITHUB_USERNAME) {
      dataLog("[githubActivity] Events API returned no commits, fetching from repos");
      commits = await fetchCommitsFromRepos(GITHUB_USERNAME, 10);
    }

    return {
      stars: formatStarred(starred || []),
      commits,
      contributions: extractContributions(events || []),
      featured,
      source: "github",
    };
  } catch (error) {
    console.error("[githubActivity] Error:", error.message);
    return {
      stars: [],
      commits: [],
      contributions: [],
      featured: [],
      source: "error",
    };
  }
}
