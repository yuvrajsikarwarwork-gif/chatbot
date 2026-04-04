import { NextFunction, Response } from "express";

import { AuthRequest } from "../middleware/authMiddleware";
import { previewExtraction, suggestFieldDescription } from "../services/aiService";
import { NodeOptimizationService } from "../services/NodeOptimizationService";

function normalizeExtractionVariables(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

export async function previewExtractionCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const nodeData = req.body?.nodeData ?? req.body?.node_data ?? req.body?.data ?? {};
    const testInput = String(req.body?.testInput ?? req.body?.test_input ?? "").trim();
    const variables = normalizeExtractionVariables(req.body?.variables ?? req.body?.context ?? {});

    if (!nodeData || typeof nodeData !== "object") {
      return res.status(400).json({ error: "nodeData is required" });
    }
    if (!testInput) {
      return res.status(400).json({ error: "testInput is required" });
    }

    const result = await previewExtraction(nodeData, testInput, variables);
    return res.json({
      success: true,
      data: {
        extracted: result.extractedData,
        confidence: result.confidence,
        missingRequired: result.missingRequired,
        rawOutput: result.rawOutput,
        timestamp: new Date().toISOString(),
        parsedOutput: result.parsedOutput,
        isComplete: result.isComplete,
        meetsConfidence: result.meetsConfidence,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function suggestFieldDescriptionCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const key = String(req.body?.key ?? req.body?.fieldKey ?? "").trim();
    const type = String(req.body?.type ?? "string").trim();

    if (!key) {
      return res.status(400).json({ error: "key is required" });
    }

    const suggestion = await suggestFieldDescription(key, type);
    return res.json({ success: true, suggestion });
  } catch (error) {
    next(error);
  }
}

export async function optimizeNodeCtrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const nodeData = req.body?.nodeData ?? req.body?.node_data ?? req.body?.data ?? {};
    const sampleInputsRaw = req.body?.sampleInputs ?? req.body?.sample_inputs ?? [];
    const reasonBucket = String(req.body?.reasonBucket ?? req.body?.reason_bucket ?? "").trim();

    if (!nodeData || typeof nodeData !== "object") {
      return res.status(400).json({ error: "nodeData is required" });
    }
    if (!Array.isArray(sampleInputsRaw)) {
      return res.status(400).json({ error: "sampleInputs must be an array" });
    }
    if (!reasonBucket) {
      return res.status(400).json({ error: "reasonBucket is required" });
    }

    const data = await NodeOptimizationService.generateOptimizationSuggestion({
      nodeData,
      sampleInputs: sampleInputsRaw.map((value: any) => String(value || "").trim()).filter(Boolean),
      reasonBucket,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}
