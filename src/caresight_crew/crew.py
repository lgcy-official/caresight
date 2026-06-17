from __future__ import annotations

import os
from typing import List

from crewai import Agent, Crew, LLM, Process, Task
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task


def truefoundry_llm() -> LLM:
    """Route CrewAI model calls through the TrueFoundry AI Gateway when configured."""
    return LLM(
        model=os.getenv("TRUEFOUNDRY_MODEL", "openai/openai-main/gpt-4o"),
        base_url=os.getenv("TRUEFOUNDRY_GATEWAY_BASE_URL"),
        api_key=os.getenv("TRUEFOUNDRY_API_KEY"),
    )


@CrewBase
class CareSightCrew:
    """CrewAI automation for CareSight safety event analysis and response planning."""

    agents: List[BaseAgent]
    tasks: List[Task]

    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    @agent
    def scout(self) -> Agent:
        return Agent(
            config=self.agents_config["scout"],  # type: ignore[index]
            llm=truefoundry_llm(),
            verbose=True,
        )

    @agent
    def analyzer(self) -> Agent:
        return Agent(
            config=self.agents_config["analyzer"],  # type: ignore[index]
            llm=truefoundry_llm(),
            verbose=True,
        )

    @agent
    def planner(self) -> Agent:
        return Agent(
            config=self.agents_config["planner"],  # type: ignore[index]
            llm=truefoundry_llm(),
            verbose=True,
        )

    @agent
    def audit(self) -> Agent:
        return Agent(
            config=self.agents_config["audit"],  # type: ignore[index]
            llm=truefoundry_llm(),
            verbose=True,
        )

    @task
    def scout_task(self) -> Task:
        return Task(config=self.tasks_config["scout_task"])  # type: ignore[index]

    @task
    def analyzer_task(self) -> Task:
        return Task(config=self.tasks_config["analyzer_task"])  # type: ignore[index]

    @task
    def planner_task(self) -> Task:
        return Task(config=self.tasks_config["planner_task"])  # type: ignore[index]

    @task
    def audit_task(self) -> Task:
        return Task(config=self.tasks_config["audit_task"])  # type: ignore[index]

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
