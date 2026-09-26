"""
GitHub Scraper — Fetches profile and repo details via GitHub API.
"""

import logging
from typing import Optional

import httpx

from config import GITHUB_TOKEN

logger = logging.getLogger("vettly.context.github")

GITHUB_API_BASE = "https://api.github.com"


class GitHubScraper:
    """
    Fetches GitHub user profile, repos, and README contents
    using the GitHub REST API (no authentication needed for public repos).
    """

    def __init__(self):
        self._headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Acemate-AI/1.0",
        }
        if GITHUB_TOKEN and GITHUB_TOKEN.strip():
            self._headers["Authorization"] = f"Bearer {GITHUB_TOKEN.strip()}"

    async def _get(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: Optional[dict] = None,
        params: Optional[dict] = None,
        **kwargs,
    ) -> httpx.Response:
        """
        Execute GET request with automatic fallback:
        If GitHub returns 401 Unauthorized or 403 Forbidden due to an invalid/expired token,
        remove the Authorization header, log a warning, and retry unauthenticated for public access.
        """
        req_headers = dict(headers) if headers else dict(self._headers)
        if "User-Agent" not in req_headers:
            req_headers["User-Agent"] = "Acemate-AI/1.0"

        response = await client.get(url, headers=req_headers, params=params, **kwargs)

        if response.status_code in (401, 403) and (
            "Authorization" in req_headers
            or "authorization" in req_headers
            or "Authorization" in client.headers
            or "authorization" in client.headers
        ):
            logger.warning(
                f"GitHub API auth failed ({response.status_code}) with provided token. "
                "Stripping token and falling back to unauthenticated public API."
            )
            self._headers.pop("Authorization", None)
            self._headers.pop("authorization", None)
            req_headers.pop("Authorization", None)
            req_headers.pop("authorization", None)
            client.headers.pop("Authorization", None)
            client.headers.pop("authorization", None)
            response = await client.get(url, headers=req_headers, params=params, **kwargs)

        return response

    async def scrape_profile(
        self,
        username: str,
        repo_names: Optional[list[str]] = None,
    ) -> dict:
        """
        Scrape a GitHub user's profile and repo details.
        
        Args:
            username: GitHub username.
            repo_names: Optional list of specific repo names to fetch.
                        If None, fetches the most popular repos.
                        
        Returns:
            Dict with profile info and repo details.
        """
        async with httpx.AsyncClient(headers=self._headers, timeout=30) as client:
            # Fetch user profile
            profile = await self._fetch_profile(client, username)

            # Fetch repos
            if repo_names:
                repos = []
                for name in repo_names:
                    repo = await self._fetch_repo(client, username, name)
                    if repo:
                        repos.append(repo)
            else:
                repos = await self._fetch_top_repos(client, username)

            # Fetch READMEs and Deep Structure for each repo
            for repo in repos:
                readme = await self._fetch_readme(client, username, repo["name"])
                structure = await self._fetch_structure(client, username, repo)
                
                summary = ""
                if structure:
                    summary += f"{structure}\n\n"
                if readme:
                    summary += self._summarize_readme(readme)
                
                if summary:
                    repo["readme_summary"] = summary

            profile["repos"] = repos
            return profile

    async def fetch_user_repos(self, username: str) -> list[dict]:
        """
        Fetch a lightweight list of all public repositories for a user.
        Used for the interactive selection UI.
        """
        async with httpx.AsyncClient(headers=self._headers, timeout=15) as client:
            try:
                response = await self._get(
                    client,
                    f"{GITHUB_API_BASE}/users/{username}/repos",
                    params={"sort": "updated", "direction": "desc", "per_page": 100, "type": "owner"},
                )
                response.raise_for_status()
                repos_data = response.json()
                
                repos = []
                for repo in repos_data:
                    if not repo.get("fork", False):
                        repos.append({
                            "name": repo.get("name", ""),
                            "description": repo.get("description", ""),
                            "updated_at": repo.get("updated_at", ""),
                        })
                return repos
            except httpx.HTTPStatusError as e:
                logger.error(f"Failed to fetch repo list for {username}: {e}")
                return []

    async def _fetch_profile(self, client: httpx.AsyncClient, username: str) -> dict:
        """Fetch user profile data."""
        try:
            response = await self._get(client, f"{GITHUB_API_BASE}/users/{username}")
            response.raise_for_status()
            data = response.json()

            return {
                "username": username,
                "name": data.get("name", ""),
                "bio": data.get("bio", ""),
                "location": data.get("location", ""),
                "public_repos": data.get("public_repos", 0),
                "followers": data.get("followers", 0),
            }
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to fetch profile for {username}: {e}")
            raise ValueError(f"GitHub user '{username}' not found")

    async def _fetch_top_repos(
        self,
        client: httpx.AsyncClient,
        username: str,
        limit: int = 10,
    ) -> list[dict]:
        """Fetch the user's most popular repos."""
        try:
            response = await self._get(
                client,
                f"{GITHUB_API_BASE}/users/{username}/repos",
                params={
                    "sort": "updated",
                    "direction": "desc",
                    "per_page": limit,
                    "type": "owner",
                },
            )
            response.raise_for_status()
            repos_data = response.json()

            repos = []
            for repo in repos_data:
                if not repo.get("fork", False):  # Skip forks
                    repos.append(self._extract_repo_info(repo))

            return repos
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to fetch repos: {e}")
            return []

    async def _fetch_repo(
        self,
        client: httpx.AsyncClient,
        username: str,
        repo_name: str,
    ) -> Optional[dict]:
        """Fetch details for a specific repo."""
        try:
            response = await self._get(
                client,
                f"{GITHUB_API_BASE}/repos/{username}/{repo_name}"
            )
            response.raise_for_status()
            return self._extract_repo_info(response.json())
        except httpx.HTTPStatusError:
            logger.warning(f"Repo not found: {username}/{repo_name}")
            return None

    async def _fetch_readme(
        self,
        client: httpx.AsyncClient,
        username: str,
        repo_name: str,
    ) -> Optional[str]:
        """Fetch the README content of a repo."""
        try:
            response = await self._get(
                client,
                f"{GITHUB_API_BASE}/repos/{username}/{repo_name}/readme",
                headers={**self._headers, "Accept": "application/vnd.github.raw"},
            )
            if response.status_code == 200:
                return response.text
            return None
        except Exception:
            return None

    async def _fetch_structure(
        self,
        client: httpx.AsyncClient,
        username: str,
        repo: dict,
    ) -> Optional[str]:
        """Fetch the recursive file tree and actual source code of key files."""
        repo_name = repo["name"]
        branch = repo.get("default_branch", "main")
        
        try:
            # 1. Fetch recursive tree
            response = await self._get(
                client,
                f"{GITHUB_API_BASE}/repos/{username}/{repo_name}/git/trees/{branch}?recursive=1",
            )
            if response.status_code != 200:
                # Fallback to main/master if default is wrong
                response = await self._get(
                    client,
                    f"{GITHUB_API_BASE}/repos/{username}/{repo_name}/git/trees/master?recursive=1"
                )
                if response.status_code != 200:
                    return None
                    
            tree_data = response.json().get("tree", [])
            
            # Filter files
            important_extensions = (".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".cpp", ".c", ".h", ".cs", ".rb", ".php", ".swift", ".kt", ".rs", ".sql")
            exclude_dirs = ("/node_modules/", "/venv/", "/.venv/", "/env/", "/build/", "/dist/", "/.git/", "/__pycache__/", "/out/")
            exclude_files = ("package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock")
            
            paths = []
            source_files = []
            
            for item in tree_data:
                path = item["path"]
                # Skip junk folders entirely from the tree
                if any(ex in f"/{path}/" for ex in exclude_dirs):
                    continue
                
                # Format path with icon for tree visualization
                icon = "📁" if item["type"] == "tree" else "📄"
                paths.append(f"{icon} {path}")
                
                # Identify source code files to fetch raw content
                if item["type"] == "blob":
                    is_source = any(path.endswith(ext) for ext in important_extensions)
                    is_not_excluded = not any(path.endswith(ex) for ex in exclude_files)
                    if is_source and is_not_excluded:
                        source_files.append(path)
                        
            # Format the tree overview
            # Truncate tree list if massive
            if len(paths) > 200:
                tree_str = "### Recursive File Tree (Truncated):\n" + "\n".join(paths[:200]) + "\n... plus more"
            else:
                tree_str = "### Recursive File Tree:\n" + "\n".join(paths)
            
            # 2. Fetch content for top N files
            # Prioritize files in root or shallow directories
            source_files.sort(key=lambda x: (x.count("/"), len(x))) 
            
            char_budget = 15000  # Leave some room in the 20k budget for README and Tree
            current_chars = len(tree_str)
            code_blocks = []
            
            for file_path in source_files[:15]:  # Fetch up to top 15 key files
                if current_chars >= char_budget:
                    break
                    
                file_res = await self._get(
                    client,
                    f"{GITHUB_API_BASE}/repos/{username}/{repo_name}/contents/{file_path}",
                    headers={**self._headers, "Accept": "application/vnd.github.raw"},
                )
                
                if file_res.status_code == 200:
                    content = file_res.text
                    if len(content) > 2500:  # Truncate massive individual files
                        content = content[:2500] + "\n...[TRUNCATED]..."
                        
                    block = f"### Source File: {file_path}\n```\n{content}\n```\n"
                    code_blocks.append(block)
                    current_chars += len(block)
                    
            return tree_str + "\n\n### Extracted Code Logic:\n" + "\n".join(code_blocks)
            
        except Exception as e:
            logger.error(f"Failed deep fetch for {repo_name}: {e}")
            return None

    def _extract_repo_info(self, repo_data: dict) -> dict:
        """Extract relevant info from a repo API response."""
        return {
            "name": repo_data.get("name", ""),
            "description": repo_data.get("description", ""),
            "default_branch": repo_data.get("default_branch", "main"),
            "language": repo_data.get("language", ""),
            "stars": repo_data.get("stargazers_count", 0),
            "forks": repo_data.get("forks_count", 0),
            "topics": repo_data.get("topics", []),
            "url": repo_data.get("html_url", ""),
            "updated_at": repo_data.get("updated_at", ""),
        }

    def _summarize_readme(self, readme_text: str, max_length: int = 500) -> str:
        """
        Extract the most important parts of a README for context.
        Focuses on the description, features, and tech stack.
        """
        if not readme_text:
            return ""

        lines = readme_text.split("\n")
        important_lines = []
        skip_badges = True

        for line in lines:
            stripped = line.strip()

            # Skip empty lines and badges at the top
            if not stripped:
                skip_badges = False
                continue
            if skip_badges and (stripped.startswith("![") or stripped.startswith("[![")):
                continue
            skip_badges = False

            # Skip links-only lines
            if stripped.startswith("[") and stripped.endswith(")"):
                continue

            # Include headers and content
            important_lines.append(stripped)

            # Stop if we have enough content
            if len("\n".join(important_lines)) > max_length:
                break

        summary = "\n".join(important_lines)
        return summary[:max_length]
