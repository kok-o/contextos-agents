'use strict';

const crypto = require('crypto');
const { ARMS } = require('../arms/arm-definitions');
const evaluateTask = require('../evaluators/index');

/**
 * Mock LLM Provider used when real API keys are unavailable.
 * Deterministically simulates success/failure rates based on the arm's capability.
 */
class MockProvider {
  /**
   * Probability of success for each arm to simulate real-world capability differences.
   */
  static getSuccessProbability(armId) {
    switch (armId) {
      case ARMS.ARM_A_VANILLA.id: return 0.40; // 40% success
      case ARMS.ARM_B_CONCISE_CHECKLIST.id: return 0.65; // 65% success
      case ARMS.ARM_C_CONTEXTOS_CORE.id: return 0.85; // 85% success
      case ARMS.ARM_D_FULL_CONTEXTOS.id: return 0.98; // 98% success
      default: return 0.0;
    }
  }

  static async execute(task, arm) {
    const probability = this.getSuccessProbability(arm.id);
    // Use hash to deterministically seed pseudo-randomness for the mock run
    const hashInt = parseInt(task.hash.substring(7, 15), 16);
    const successThreshold = probability * 0xffffffff;
    
    // Slight artificial delay to simulate API request
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const isSuccess = hashInt <= successThreshold;
    
    return {
      success: isSuccess,
      mockedOutput: isSuccess 
        ? `Successfully generated code for ${task.id}` 
        : `Failed or hallucinated output for ${task.id}`,
      usage: {
        promptTokens: arm.tokenBudgetEstimate,
        completionTokens: 300,
        totalTokens: arm.tokenBudgetEstimate + 300
      }
    };
  }
}

/**
 * Executes a single task against a single arm.
 */
async function runTask(task, armId) {
  const arm = Object.values(ARMS).find(a => a.id === armId);
  if (!arm) throw new Error(`Unknown arm: ${armId}`);

  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  // Execute using Mock Provider (replace with real LLM client when API keys are available)
  const llmResult = await MockProvider.execute(task, arm);
  
  const durationMs = Date.now() - startTime;

  // Evaluate the output
  const evaluation = evaluateTask(task, llmResult);

  return {
    taskId: task.id,
    armId: arm.id,
    requestId,
    timestamp: new Date().toISOString(),
    durationMs,
    success: evaluation.passed,
    error: evaluation.error || null,
    usage: llmResult.usage,
    environmentProvenance: {
      nodeVersion: process.version,
      platform: process.platform,
      engine: 'mock-provider-v1'
    }
  };
}

module.exports = {
  runTask,
  MockProvider
};
