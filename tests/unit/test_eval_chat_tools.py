"""tests/unit/test_eval_chat_tools.py
Unit tests for evaluation benchmark runner script (Task T10).
"""

from __future__ import annotations

from scripts.eval_chat_tools import ROOT_DIR, run_benchmark


def test_eval_chat_tools_mock_benchmark_execution():
    """Run benchmark evaluation in mock mode and verify target thresholds."""
    summary = run_benchmark(mode="mock")

    assert summary["total_queries"] == 50
    assert summary["tool_selection_accuracy"] >= 90.0
    assert summary["data_consistency_rate"] >= 95.0
    assert summary["safety_pass_rate"] == 100.0
    assert summary["avg_latency_ms"] < 2000.0

    csv_path = ROOT_DIR / "data" / "benchmark" / "chat_eval_results.csv"
    assert csv_path.exists()
