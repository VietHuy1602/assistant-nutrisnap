# NutriSnap pytest scaffold (W1)

Copy `pytest.ini` to the repository root and the files in `tests/unit/` into the repository's `tests/unit/` directory. Review existing files before overwriting.

From the repository root, run:

```powershell
python -m pip install pytest
python -m pytest tests/unit -v
```

These are **scaffold tests**, not real AI or backend acceptance tests. The formula and inventory checks passing do not demonstrate Tool Selection Accuracy >=90%, Vision MAPE <=25%, zero hallucination, or backend consistency. Add implementation-bound tests after reviewing `src/ai/` APIs and collecting evaluation datasets.
