import sys
import json
import asyncio
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.append(str(backend_dir))

from ai.context_engine import ContextEngine
from context.github_scraper import GitHubScraper

async def main():
    ce = ContextEngine()
    ce.load_context()
    
    # 1. Inject JD
    jd_data = {
        "company": "Soft System Solution",
        "title": "AI Product Engineer / Full-Stack AI Engineer",
        "details": """About Soft System Solution
Soft System Solution is an established US-headquartered digital agency and technology consultancy, with its primary corporate office in New York City (224 West 35th St, Suite 603, NY 10001) and a major offshore development center in Mohali, Punjab (Bestech Business Tower, Sector 66, Mohali).

The company builds custom software solutions, enterprise web and mobile applications (React, Next.js, Node/Python), AI automation pipelines, chatbots, and digital platforms for US and global clients.

Role & Responsibilities:
- Design, build, and deploy production-grade AI systems, LLM streaming pipelines, and Advanced RAG architectures.
- Collaborate closely with US-based product managers and engineers to understand client requirements and deliver scalable full-stack features.
- Build resilient backend microservices in Python (FastAPI/Asyncio) with connection pooling, rate limiting, and caching (Redis, PostgreSQL).
- Build clean frontend interfaces and dashboards in Next.js, React, and TypeScript.
- Optimize inference latencies, handle token budgets, and ensure 99.9% uptime with automated CI/CD workflows."""
    }
    ce.set_assignment(jd_data)
    print("JD injected successfully.")
    
    # 2. Extract GitHub and inject
    context_data = ce.get_structured_context()
    github_data = context_data.get("github", {})
    username = github_data.get("username")
    
    if username:
        print(f"Found GitHub username: {username}. Scraping...")
        try:
            scraper = GitHubScraper()
            # Fetch repos
            result = await scraper.scrape_profile(username)
            ce.set_github(result)
            print(f"GitHub projects scraped and injected! Found {len(result.get('repositories', []))} repos.")
            for repo in result.get('repositories', []):
                print(f" - {repo.get('name')}")
        except Exception as e:
            print(f"Failed to scrape GitHub: {e}")
    else:
        print("No GitHub username found in context.")

if __name__ == "__main__":
    asyncio.run(main())
