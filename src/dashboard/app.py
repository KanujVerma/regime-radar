"""Streamlit dashboard entry point for RegimeRadar."""
from __future__ import annotations
import sys
import os

# Ensure project root is on sys.path regardless of where streamlit is invoked from
_project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

# Load .env so FRED_API_KEY / FINNHUB_API_KEY are available in embedded mode
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_project_root, ".env"))
except ImportError:
    pass

import streamlit as st
from src.dashboard.pages import current_state, history, event_replay, model_drivers, scenario_explorer


def main() -> None:
    st.set_page_config(
        page_title="RegimeRadar",
        page_icon="📡",
        layout="wide",
    )
    pages = [
        st.Page(current_state.render, title="Current State", icon="📊", url_path="current-state"),
        st.Page(history.render, title="History", icon="📈", url_path="history"),
        st.Page(event_replay.render, title="Event Replay", icon="🔁", url_path="event-replay"),
        st.Page(model_drivers.render, title="Model Drivers", icon="🔬", url_path="model-drivers"),
        st.Page(scenario_explorer.render, title="Scenario Explorer", icon="🧪", url_path="scenario-explorer"),
    ]
    pg = st.navigation(pages)
    pg.run()


if __name__ == "__main__":
    main()
