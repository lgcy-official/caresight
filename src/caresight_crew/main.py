from __future__ import annotations

from caresight_crew.crew import CareSightCrew


def run():
    """CrewAI AMP entrypoint for the CareSight crew."""
    inputs = {
        "location": "San Francisco, CA",
        "camera_count": 4,
        "responder_threshold": 70,
        "event_types": "traffic_collision, smoke, fire, crowd_surge, medical_emergency, infrastructure_hazard",
    }
    return CareSightCrew().crew().kickoff(inputs=inputs)


if __name__ == "__main__":
    run()
