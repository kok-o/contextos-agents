'use strict';

/**
 * Evaluates the result of a task execution against the expected state.
 * Since we are using a Mock Provider, the evaluation logic is simplified
 * to just trust the provider's mocked success status. In a real system,
 * this would run ESLint, execute the generated code in a sandbox,
 * and verify the exact AST or output.
 *
 * @param {Object} task The benchmark task definition
 * @param {Object} llmResult The result from the LLM/Mock Provider
 * @returns {Object} { passed: boolean, error: string|null }
 */
function evaluateTask(task, llmResult) {
  if (llmResult.success) {
    return { passed: true, error: null };
  } else {
    return { 
      passed: false, 
      error: `Failed to meet expected state for task ${task.id}: ${llmResult.mockedOutput}` 
    };
  }
}

module.exports = evaluateTask;
