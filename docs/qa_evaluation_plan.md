# NutriSnap — QA Evaluation Plan (W1)

**Owner:** Hoàng Quốc Tuấn  
**Team:** Pair 3 — AI Orchestrator & QA/Benchmarking  
**Status:** Planned targets; experimental results will be reported after evaluation in Week 7.

## 1. Purpose

This document defines the initial evaluation plan for NutriSnap's AI Orchestrator, Tool Calling, food recognition, portion/calorie estimation, and consistency between the AI response and Backend-provided values.

The values in this document are **target goals**, not measured results. Do not report a target as an achieved result before running the relevant tests and recording evidence.

## 2. Scope

The W1 plan covers:

- Correct selection of one of the four registered tools when a test scenario requires a tool.
- Safe tool arguments, especially the rule that the LLM must not supply `user_id`.
- Food recognition and estimated portion/calorie error for supported test cases.
- Consistency between values returned by Backend tools and values stated by the assistant.
- Basic automated-test structure using `pytest`.

## 3. Target Goals

| Area | Metric / acceptance target | Evaluation method |
|---|---|---|
| Tool Calling | Tool Selection Accuracy **≥ 90%** on the defined test scenarios | Compare the tool selected by the assistant with the expected tool in each scenario |
| Food recognition and portion/calorie estimation | MAPE **≤ 25%** for simple dishes photographed in adequate lighting | Compare predicted calorie values with ground-truth/reference values; record excluded or invalid samples |
| Backend-to-assistant consistency | Every numeric nutrition value stated by the assistant must match the corresponding value returned by the Backend for the same response | Use deterministic test fixtures and compare the response values with tool output |
| Tool argument security | Tool schemas must not expose `user_id` as an LLM-supplied argument | Inspect registered tool schemas and test that the field is absent |
| Test execution | Relevant unit tests run through `pytest` and failures are documented | Run the project test command and preserve the test output |

These are initial project targets. The team should confirm the test set, metric definitions, and any thresholds that are not specified in the project brief before treating them as final acceptance criteria.

## 4. Metrics and Definitions

### 4.1 Tool Selection Accuracy

\[
\text{Tool Selection Accuracy} =
\frac{\text{Number of scenarios with the expected tool selected}}
{\text{Total valid tool-selection scenarios}} \times 100\%
\]

Count a scenario as correct only when the selected tool matches the expected tool for that scenario. Record invalid outputs, missing tool calls, and multiple unexpected tool calls separately rather than silently removing them from the denominator.

### 4.2 Mean Absolute Percentage Error (MAPE)

\[
\text{MAPE} = \frac{100\%}{n}\sum_{i=1}^{n}
\left|\frac{y_i-\hat{y}_i}{y_i}\right|
\]

Where:
- \(y_i\) is the reference calorie value for sample \(i\).
- \(\hat{y}_i\) is the predicted/estimated calorie value.
- \(n\) is the number of valid samples with a non-zero reference value.

MAPE is undefined when the reference value is zero. Such samples must be handled explicitly and reported, not divided by zero. The initial target applies to simple dishes with adequate lighting; more difficult samples should be reported separately.

### 4.3 Backend-to-Assistant Consistency

For each test case, compare nutrition numbers in the assistant response with the corresponding Backend tool result. The assistant must not invent, silently change, or contradict Backend-provided calorie and macronutrient values.

The project brief distinguishes deterministic arithmetic from uncertain visual input: arithmetic using the reference database can be correct while the detected dish or estimated portion may still be uncertain. User-facing nutrition values should therefore be described as estimates where appropriate.

## 5. Initial Test Scenarios

| ID | Scenario | Expected result |
|---|---|---|
| TOOL-01 | User asks for today's calorie and macronutrient totals | `get_daily_nutrition` is selected |
| TOOL-02 | User asks to record a meal | `log_meal` is selected; a write must not occur before explicit confirmation |
| TOOL-03 | User asks for meal suggestions based on remaining calories and budget | `recommend_meals` is selected |
| TOOL-04 | User asks for a progress summary over a period | `get_progress_summary` is selected |
| SEC-01 | Inspect each registered tool's exposed arguments | No tool schema exposes `user_id` as an LLM argument |
| SEC-02 | A meal-log request is not yet confirmed | Return a pending confirmation/preview; do not persist the meal |
| CONS-01 | Backend returns fixed calorie and macro values | Assistant response reflects those values without changing them |
| VIS-01 | Supported food image has an agreed reference label | Record recognition output and compare it with the reference label |
| VIS-02 | Simple dish has a valid reference calorie value and portion | Calculate and record the calorie-estimation error |

These scenarios are a starting checklist. The actual automated tests must be adapted to the functions and return types implemented in the repository.

## 6. Test Data and Evidence

For every evaluation run, record:

- Test ID and scenario description.
- Input/prompt or image sample identifier.
- Expected tool or reference value.
- Actual output.
- Pass/fail status.
- Error details and notes about invalid or excluded samples.

Use deterministic fixtures for unit tests. Do not require a live Gemini API call for ordinary unit tests; isolate external API calls behind mocks or fixtures where possible. Do not commit API keys, `.env`, local databases, virtual environments, or other secrets.

## 7. Pytest Structure for W1

Use the repository's existing test layout. The team guide identifies these locations:

- `tests/unit/test_tools.py` — tool schema, argument validation, tool-selection/dispatch behavior where locally testable.
- `tests/unit/test_vision.py` — vision output and evaluation-metric behavior where the corresponding code exists.
- Additional tests may be added under `tests/unit/` as the implementation becomes available.

Tests should verify behavior, not merely that files exist. Avoid hard-coding assumptions about function names or response shapes before checking the actual implementation. If a module is not implemented yet, record that dependency clearly and add the test when its interface is agreed.

## 8. Week 1 Deliverables

- [ ] Agree on the initial scenarios and metric definitions with the AI Orchestrator partner.
- [ ] Commit this evaluation plan to `docs/qa_evaluation_plan.md`.
- [ ] Create/extend pytest unit tests in the repository's prescribed test directories.
- [ ] Run available tests locally and record failures or missing implementation dependencies.
- [ ] Update `docs/ai_use_log.md` if AI tools were used to assist with code or documentation.
- [ ] Submit changes through a Pull Request targeting `main` and request review from the pair partner.

## 9. Week 7 Experimental Results (To Be Completed Later)

Do not fill this section with invented or target values. Complete it after the final benchmark has been run.

| Metric | W1 target | W7 measured result | Evidence / notes |
|---|---:|---:|---|
| Tool Selection Accuracy | ≥ 90% | Pending | Test set and run output to be linked |
| MAPE for simple dishes in adequate lighting | ≤ 25% | Pending | Valid sample count and calculation to be reported |
| Backend-to-assistant consistency | Must match Backend values | Pending | Unit/integration test results to be reported |
| Test execution | Relevant tests run and failures documented | Pending | Pytest output / CI run to be linked |

## 10. Safety and Interpretation

NutriSnap's visual recognition and portion estimates are inherently estimates. The Backend should perform deterministic nutrition arithmetic from the reference database, while the assistant should communicate uncertainty in visual inputs and must not present estimates as medical diagnoses. Evaluation must not encourage extreme calorie restriction or compensatory fasting.
