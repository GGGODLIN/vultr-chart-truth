import { runChartTruthPipeline } from '../../../../lib/pipeline.ts';
import type { ChartTruthRunResponse } from '../../../../lib/types.ts';

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Request body must be a JSON object.');
    }
    body = parsed as Record<string, unknown>;
  } catch {
    const errorResponse: ChartTruthRunResponse = {
      ok: false,
      status: 400,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON object with csvText and prompt.',
      },
      safetyScan: {
        safe: true,
        modelUsed: 'nemotron-3.5-content-safety',
        mode: 'fallback',
        findings: [],
      },
      stages: [],
      initialRun: null,
      repairedRun: null,
      selfHealTriggered: false,
      containersDestroyed: 0,
    };
    return Response.json(errorResponse, { status: 400 });
  }

  const csvText = typeof body.csvText === 'string' ? body.csvText : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const scenarioId =
    typeof body.scenarioId === 'string' ? body.scenarioId : undefined;
  const unitCurrency =
    typeof body.unitCurrency === 'string' ? body.unitCurrency : undefined;

  const result = await runChartTruthPipeline({
    csvText,
    prompt,
    scenarioId,
    unitCurrency,
  });

  return Response.json(result, { status: result.status });
}
