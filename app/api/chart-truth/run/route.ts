import {
  buildPipelineErrorResponse,
  runChartTruthPipeline,
} from '../../../../lib/pipeline.ts';

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024 + 65536;

export async function POST(request: Request): Promise<Response> {
  const contentLengthHeader = request.headers.get('content-length');
  if (
    contentLengthHeader !== null &&
    Number(contentLengthHeader) > MAX_REQUEST_BODY_BYTES
  ) {
    return Response.json(
      buildPipelineErrorResponse(
        'PAYLOAD_TOO_LARGE',
        'Request payload exceeds maximum allowed size.'
      ),
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    const rawText = await request.text();
    if (Buffer.byteLength(rawText, 'utf8') > MAX_REQUEST_BODY_BYTES) {
      return Response.json(
        buildPipelineErrorResponse(
          'PAYLOAD_TOO_LARGE',
          'Request payload exceeds maximum allowed size.'
        ),
        { status: 400 }
      );
    }
    const parsed = JSON.parse(rawText) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Request body must be a JSON object.');
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json(
      buildPipelineErrorResponse(
        'INVALID_JSON',
        'Request body must be valid JSON object with csvText and prompt.'
      ),
      { status: 400 }
    );
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
